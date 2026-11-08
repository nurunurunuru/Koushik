import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  adminProcedure,
  candidateProcedure,
} from "@/src/server/trpc";
import { generateInterviewReport } from "@/src/lib/gemini";

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

  // ---------- CANDIDATE ----------

  // Candidate opens the interview room -> creates (or resumes) an IN_PROGRESS call.
  // Only allowed once the admin has approved + invited them.
  start: candidateProcedure
    .input(z.object({ candidateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.prisma.candidate.findUnique({
        where: { id: input.candidateId },
        include: { job: true, calls: true },
      });
      if (!candidate || candidate.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (!candidate.interviewApproved) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You have not been approved for an interview yet.",
        });
      }

      // The interview can only start once the company's interview date/time has arrived.
      const scheduledFor = candidate.job.interviewDate;
      if (scheduledFor && scheduledFor.getTime() > Date.now()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your interview has not opened yet. Please come back at the scheduled date and time.",
        });
      }

      const failedCall = candidate.calls.find((c: { status: string }) => c.status === "FAILED");
      if (failedCall) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This interview has been cancelled and cannot be resumed.",
        });
      }

      const completedCall = candidate.calls.find((c: { status: string }) => c.status === "COMPLETED");
      if (completedCall) return completedCall;

      const openCall = candidate.calls.find((c: { status: string }) => c.status === "IN_PROGRESS" || c.status === "SCHEDULED");
      if (openCall) return openCall;

      return ctx.prisma.call.create({
        data: {
          candidateId: candidate.id,
          type: "SCREENING",
          status: "IN_PROGRESS",
          startedAt: new Date(),
        },
      });
    }),

  // Candidate leaves the interview page / opens another tab.
  // The client marks the active interview as FAILED so it cannot be resumed.
  cancel: candidateProcedure
    .input(
      z.object({
        callId: z.string(),
        reason: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const call = await ctx.prisma.call.findUnique({
        where: { id: input.callId },
        include: { candidate: true },
      });

      if (!call || call.candidate.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      if (call.status === "COMPLETED" || call.status === "FAILED") {
        return call;
      }

      return ctx.prisma.call.update({
        where: { id: call.id },
        data: {
          status: "FAILED",
          endedAt: new Date(),
          notes: input.reason || "Interview cancelled by security policy.",
        },
      });
    }),

  // Candidate's browser submits the finished Vapi transcript. Triggers Gemini
  // to write a structured interview report for the admin.
  submitTranscript: candidateProcedure
    .input(
      z.object({
        callId: z.string(),
        transcript: z.string(),
        duration: z.number().int().optional(),
        vapiCallId: z.string().optional(),
        videoUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const call = await ctx.prisma.call.findUnique({
        where: { id: input.callId },
        include: { candidate: { include: { job: true } } },
      });
      if (!call || call.candidate.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      let reportData: Record<string, unknown> = {};
      try {
        const report = await generateInterviewReport({
          jobTitle: call.candidate.job.title,
          jobDescription: call.candidate.job.description,
          candidateName: call.candidate.name,
          transcript: input.transcript,
        });
        reportData = {
          aiReport: JSON.stringify(report),
          recommendation: report.recommendation,
          summary: report.summary,
          rating: Math.round(report.overallScore / 20), // map 0-100 -> 1-5 stars
        };
      } catch (err) {
        console.error("Interview report generation failed:", err);
      }

      const updatedCall = await ctx.prisma.call.update({
        where: { id: input.callId },
        data: {
          transcript: input.transcript,
          duration: input.duration,
          vapiCallId: input.vapiCallId,
          videoUrl: input.videoUrl,
          status: "COMPLETED",
          endedAt: new Date(),
          ...reportData,
        },
      });

      await ctx.prisma.candidate.update({
        where: { id: call.candidateId },
        data: { status: "INTERVIEW_COMPLETED" },
      });

      return updatedCall;
    }),
});
