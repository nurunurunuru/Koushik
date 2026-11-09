import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "@/src/server/trpc";
import { generateInterviewReport } from "@/src/lib/gemini";
import { computeFinalScore, MAX_BOARD_MARK } from "@/src/lib/scoring";

// Throws unless the call belongs to a candidate of a job owned by the logged-in admin.
async function assertOwnsCall(
  ctx: { prisma: typeof import("@/src/server/db").prisma; user: { id: string } },
  callId: string
) {
  const call = await ctx.prisma.call.findFirst({
    where: { id: callId, candidate: { job: { adminId: ctx.user.id } } },
    select: { id: true },
  });
  if (!call) throw new TRPCError({ code: "NOT_FOUND", message: "Call not found" });
}

export const callsRouter = createTRPCRouter({
  // ---------- ADMIN ----------
  getAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.call.findMany({
      where: { candidate: { job: { adminId: ctx.user.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            job: {
              select: { id: true, title: true },
            },
          },
        },
      },
    });
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.call.findFirst({
        where: { id: input.id, candidate: { job: { adminId: ctx.user.id } } },
        include: {
          candidate: {
            include: {
              job: true,
            },
          },
        },
      });
    }),

  getByCandidate: adminProcedure
    .input(z.object({ candidateId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.call.findMany({
        where: {
          candidateId: input.candidateId,
          candidate: { job: { adminId: ctx.user.id } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z
          .enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED"])
          .optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertOwnsCall(ctx, id);
      return ctx.prisma.call.update({
        where: { id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsCall(ctx, input.id);
      return ctx.prisma.call.delete({
        where: { id: input.id },
      });
    }),

  getStats: adminProcedure.query(async ({ ctx }) => {
    const owned = { candidate: { job: { adminId: ctx.user.id } } };
    const [scheduled, inProgress, completed, failed, totalDuration] =
      await Promise.all([
        ctx.prisma.call.count({ where: { ...owned, status: "SCHEDULED" } }),
        ctx.prisma.call.count({ where: { ...owned, status: "IN_PROGRESS" } }),
        ctx.prisma.call.count({ where: { ...owned, status: "COMPLETED" } }),
        ctx.prisma.call.count({ where: { ...owned, status: "FAILED" } }),
        ctx.prisma.call.aggregate({
          where: owned,
          _sum: { duration: true },
        }),
      ]);
    return {
      scheduled,
      inProgress,
      completed,
      failed,
      total: scheduled + inProgress + completed + failed,
      totalDurationMinutes: Math.round((totalDuration._sum.duration ?? 0) / 60),
    };
  }),

  // ---------- LIVE BOARD INTERVIEW (admin / company side) ----------

  // The board clicks a scheduled candidate's name -> a new live interview (call) is created.
  // Returns the job's interview questions for the AI interviewer (never shown on screen).
  startBoardInterview: adminProcedure
    .input(z.object({ candidateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.prisma.candidate.findFirst({
        where: { id: input.candidateId, job: { adminId: ctx.user.id } },
        include: { job: true },
      });
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND" });
      if (candidate.status !== "INTERVIEW_SCHEDULED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This candidate is not waiting for an interview.",
        });
      }

      // An interview that was abandoned half way is closed, the candidate can be interviewed again.
      await ctx.prisma.call.updateMany({
        where: { candidateId: candidate.id, status: "IN_PROGRESS" },
        data: { status: "FAILED", endedAt: new Date(), notes: "Interview was not finished." },
      });

      const call = await ctx.prisma.call.create({
        data: {
          candidateId: candidate.id,
          type: "BOARD_INTERVIEW",
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });

      let questions: string[] = [];
      try {
        const parsed = candidate.job.interviewQuestions
          ? JSON.parse(candidate.job.interviewQuestions)
          : [];
        if (Array.isArray(parsed)) questions = parsed.filter((q) => typeof q === "string");
      } catch {
        questions = [];
      }

      return {
        callId: call.id,
        candidateName: candidate.name,
        jobTitle: candidate.job.title,
        questions,
      };
    }),

  // Board closes the interview: saves the Q&A transcript + the board's own questions/points,
  // asks Gemini to score the AI-asked questions, and computes the final score.
  completeBoardInterview: adminProcedure
    .input(
      z.object({
        callId: z.string(),
        transcript: z.string(),
        duration: z.number().int().optional(),
        boardEntries: z
          .array(
            z.object({
              question: z.string().min(1).max(500),
              answer: z.string().max(4000).optional(),
            })
          )
          .max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsCall(ctx, input.callId);
      const call = await ctx.prisma.call.findUnique({
        where: { id: input.callId },
        include: { candidate: { include: { job: true } } },
      });
      if (!call) throw new TRPCError({ code: "NOT_FOUND" });

      // AI score for the AI-asked questions
      let aiScore: number | null = null;
      let reportData: Record<string, unknown> = {};
      if (input.transcript.trim().length > 20) {
        try {
          const report = await generateInterviewReport({
            jobTitle: call.candidate.job.title,
            jobDescription: call.candidate.job.description,
            candidateName: call.candidate.name,
            transcript: input.transcript,
          });
          aiScore = Math.max(0, Math.min(100, Math.round(report.overallScore)));
          reportData = {
            aiReport: JSON.stringify(report),
            recommendation: report.recommendation,
            summary: report.summary,
            rating: Math.round(report.overallScore / 20),
          };
        } catch (err) {
          console.error("Interview report generation failed:", err);
        }
      }

      // The board's mark is given later (Board Review). Until then the final mark is the AI mark.
      const boardScore = null;
      const finalScore = computeFinalScore(aiScore, boardScore);

      const updatedCall = await ctx.prisma.call.update({
        where: { id: input.callId },
        data: {
          transcript: input.transcript,
          duration: input.duration,
          boardEntries: JSON.stringify(input.boardEntries),
          status: "COMPLETED",
          endedAt: new Date(),
          ...reportData,
        },
      });

      await ctx.prisma.candidate.update({
        where: { id: call.candidateId },
        data: { status: "INTERVIEW_COMPLETED", aiScore, boardScore, finalScore },
      });

      return { call: updatedCall, aiScore, boardScore, finalScore };
    }),

  // Saves the board members' questions + the candidate's replies (no marks here).
  updateBoardEntries: adminProcedure
    .input(
      z.object({
        callId: z.string(),
        boardEntries: z
          .array(
            z.object({
              question: z.string().min(1).max(500),
              answer: z.string().max(4000).optional(),
            })
          )
          .max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsCall(ctx, input.callId);
      const call = await ctx.prisma.call.findUnique({
        where: { id: input.callId },
        include: { candidate: true },
      });
      if (!call) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.prisma.call.update({
        where: { id: input.callId },
        data: { boardEntries: JSON.stringify(input.boardEntries) },
      });

      return {
        aiScore: call.candidate.aiScore,
        boardScore: call.candidate.boardScore,
        finalScore: call.candidate.finalScore,
      };
    }),

  // Board Review: after reading the candidate's replies to the board's questions the board gives
  // ONE mark. It is added to the AI mark to make the final mark.
  saveBoardMark: adminProcedure
    .input(
      z.object({
        callId: z.string(),
        mark: z.number().int().min(0).max(MAX_BOARD_MARK),
        comment: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnsCall(ctx, input.callId);
      const call = await ctx.prisma.call.findUnique({
        where: { id: input.callId },
        include: { candidate: true },
      });
      if (!call) throw new TRPCError({ code: "NOT_FOUND" });

      const finalScore = computeFinalScore(call.candidate.aiScore, input.mark);

      await ctx.prisma.call.update({
        where: { id: input.callId },
        data: { boardComment: input.comment?.trim() || null },
      });
      await ctx.prisma.candidate.update({
        where: { id: call.candidateId },
        data: { boardScore: input.mark, finalScore },
      });

      return { aiScore: call.candidate.aiScore, boardScore: input.mark, finalScore };
    }),

  // Board stops an interview without saving (e.g. technical problem).
  cancelBoardInterview: adminProcedure
    .input(z.object({ callId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsCall(ctx, input.callId);
      return ctx.prisma.call.update({
        where: { id: input.callId },
        data: { status: "FAILED", endedAt: new Date(), notes: "Interview cancelled by the board." },
      });
    }),
});
