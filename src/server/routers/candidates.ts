import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  adminProcedure,
  candidateProcedure,
} from "@/src/server/trpc";
import { analyzeResumeLocally } from "@/src/lib/resumeAI";
import { sendInterviewScheduleEmail, sendRejectionEmail, sendHiredEmail } from "@/src/lib/mailer";

// Throws unless the candidate applied to a job owned by the logged-in admin.
async function assertOwnsCandidate(
  ctx: { prisma: typeof import("@/src/server/db").prisma; user: { id: string } },
  candidateId: string
) {
  const c = await ctx.prisma.candidate.findFirst({
    where: { id: candidateId, job: { adminId: ctx.user.id } },
    select: { id: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
}

type Db = typeof import("@/src/server/db").prisma;
type CandidateWithJob = {
  id: string;
  name: string;
  email: string;
  matchScore: number | null;
  job: { title: string };
};

// Minimum AI resume-match score (%) for a candidate to be SHORTLISTED.
// Anything below is auto-rejected. Override with AUTO_SCREEN_THRESHOLD in .env.
const AUTO_SCREEN_THRESHOLD = Number(process.env.AUTO_SCREEN_THRESHOLD ?? 50);

// Sends the rejection email and moves the candidate to REJECTED.
async function rejectCandidate(prisma: Db, candidate: CandidateWithJob) {
  await sendRejectionEmail({
    to: candidate.email,
    candidateName: candidate.name,
    jobTitle: candidate.job.title,
  }).catch((e) => console.error("Failed to send rejection email:", e));

  return prisma.candidate.update({
    where: { id: candidate.id },
    data: { status: "REJECTED" },
  });
}

export const candidatesRouter = createTRPCRouter({
  // ---------- ADMIN ----------
  getAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.candidate.findMany({
      where: { job: { adminId: ctx.user.id } },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          select: { id: true, title: true, department: true },
        },
        calls: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: { calls: true },
        },
      },
    });
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.candidate.findFirst({
        where: { id: input.id, job: { adminId: ctx.user.id } },
        include: {
          job: true,
          calls: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }),

  getByJob: adminProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.candidate.findMany({
        where: { jobId: input.jobId, job: { adminId: ctx.user.id } },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { calls: true },
          },
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        status: z
          .enum([
            "APPLIED",
            "AI_REVIEWED",
            "SHORTLISTED",
            "INTERVIEW_SCHEDULED",
            "INTERVIEW_COMPLETED",
            "HIRED",
            "REJECTED",
          ])
          .optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await assertOwnsCandidate(ctx, id);
      return ctx.prisma.candidate.update({
        where: { id },
        data,
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsCandidate(ctx, input.id);
      return ctx.prisma.candidate.delete({
        where: { id: input.id },
      });
    }),

  // The company picks the candidates it wants (top 10 / top 15 / any it likes) from the
  // shortlisted ones and gives them one interview date + time. Each selected candidate gets
  // an email with the schedule and an interview number (the order they are called in).
  scheduleInterviews: adminProcedure
    .input(
      z.object({
        candidateIds: z.array(z.string()).min(1).max(100),
        interviewAt: z.date(),
        venue: z.string().max(200).optional(),
        meetingLink: z.string().url("Please enter a valid link (https://...)").max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const candidates = await ctx.prisma.candidate.findMany({
        where: { id: { in: input.candidateIds }, job: { adminId: ctx.user.id } },
        include: { job: true },
      });
      if (candidates.length === 0) throw new TRPCError({ code: "NOT_FOUND" });

      const byId = new Map(candidates.map((c) => [c.id, c]));
      const emailFailed: string[] = [];
      let order = 0;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";
      // Candidate logs in and lands on My Applications, where the interview details are shown.
      const portalUrl = `${appUrl}/login?callbackUrl=${encodeURIComponent("/portal/applications")}`;

      // Keep the order the admin selected them in (best candidate first).
      for (const id of input.candidateIds) {
        const c = byId.get(id);
        if (!c) continue;
        if (["REJECTED", "HIRED", "INTERVIEW_COMPLETED"].includes(c.status)) continue;
        order += 1;

        try {
          await sendInterviewScheduleEmail({
            to: c.email,
            candidateName: c.name,
            jobTitle: c.job.title,
            interviewAt: input.interviewAt,
            order,
            venue: input.venue,
            portalUrl,
            meetingLink: input.meetingLink,
          });
        } catch (e) {
          emailFailed.push(c.name);
          console.error("Failed to send interview schedule email:", e);
        }

        await ctx.prisma.candidate.update({
          where: { id: c.id },
          data: {
            status: "INTERVIEW_SCHEDULED",
            interviewAt: input.interviewAt,
            interviewOrder: order,
            interviewLink: input.meetingLink ?? null,
            invitedAt: new Date(),
          },
        });
      }

      return { scheduled: order, emailFailed };
    }),

  // Admin rejects at the resume-review stage (before interview)
  rejectApplication: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.prisma.candidate.findFirst({
        where: { id: input.id, job: { adminId: ctx.user.id } },
        include: { job: true },
      });
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND" });

      return rejectCandidate(ctx.prisma, candidate);
    }),

  // Admin's final decision after reading the AI interview report
  finalDecision: adminProcedure
    .input(z.object({ id: z.string(), decision: z.enum(["HIRED", "REJECTED"]) }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.prisma.candidate.findFirst({
        where: { id: input.id, job: { adminId: ctx.user.id } },
        include: { job: true },
      });
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.decision === "HIRED") {
        await sendHiredEmail({
          to: candidate.email,
          candidateName: candidate.name,
          jobTitle: candidate.job.title,
        }).catch((e) => console.error("Failed to send hired email:", e));
      } else {
        await sendRejectionEmail({
          to: candidate.email,
          candidateName: candidate.name,
          jobTitle: candidate.job.title,
        }).catch((e) => console.error("Failed to send rejection email:", e));
      }

      return ctx.prisma.candidate.update({
        where: { id: input.id },
        data: { status: input.decision },
      });
    }),

  getStats: adminProcedure.query(async ({ ctx }) => {
    const job = { adminId: ctx.user.id };
    const count = (status: string) => ctx.prisma.candidate.count({ where: { job, status } });
    const [applied, aiReviewed, shortlisted, interviewScheduled, interviewCompleted, hired, rejected] =
      await Promise.all([
        count("APPLIED"),
        count("AI_REVIEWED"),
        count("SHORTLISTED"),
        count("INTERVIEW_SCHEDULED"),
        count("INTERVIEW_COMPLETED"),
        count("HIRED"),
        count("REJECTED"),
      ]);
    const total =
      applied + aiReviewed + shortlisted + interviewScheduled + interviewCompleted + hired + rejected;
    return {
      applied,
      aiReviewed,
      shortlisted,
      interviewScheduled,
      interviewCompleted,
      hired,
      rejected,
      total,
    };
  }),

  // ---------- CANDIDATE ----------

  // Candidate applies to a job. Resume text is analyzed by Gemini immediately.
 submitApplication: candidateProcedure
  .input(
    z.object({
      jobId: z.string(),
      phone: z.string().optional(),
      resumeText: z.string().min(
        30,
        "Please paste a more complete resume."
      ),
      resumeUrl: z.string().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    console.log("=================================");
    console.log("📥 New Job Application");
    console.log("User:", ctx.user.email);
    console.log("Job ID:", input.jobId);
    console.log("Resume Length:", input.resumeText.length);
    console.log("=================================");

    const job = await ctx.prisma.job.findUnique({
      where: {
        id: input.jobId,
      },
    });

    if (!job) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Job not found",
      });
    }

    const existing =
      await ctx.prisma.candidate.findUnique({
        where: {
          jobId_userId: {
            jobId: input.jobId,
            userId: ctx.user.id,
          },
        },
      });

    if (existing) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "You already applied to this job.",
      });
    }

    // First save candidate
    const candidate =
      await ctx.prisma.candidate.create({
        data: {
          name: ctx.user.name,
          email: ctx.user.email,
          phone: input.phone,
          resumeText: input.resumeText,
          resumeUrl: input.resumeUrl,
          jobId: input.jobId,
          userId: ctx.user.id,
          status: "APPLIED",
        },
      });

    console.log(
      "✅ Candidate saved:",
      candidate.id
    );

    // AI Resume Analysis
    try {
      console.log(
        "🤖 Starting Gemini Resume Analysis..."
      );

      const analysis = await analyzeResumeLocally({
  jobTitle: job.title,
  jobDescription: job.description,
  requirements: job.requirements ?? undefined,
  skills: job.skills ?? undefined,
  responsibilities: job.responsibilities ?? undefined,
  experienceLevel: job.experienceLevel ?? undefined,
  resumeText: input.resumeText,
});

      console.log(
        "✅ Gemini Analysis Result:",
        JSON.stringify(analysis, null, 2)
      );

      const updatedCandidate =
        await ctx.prisma.candidate.update({
          where: {
            id: candidate.id,
          },

          data: {
            matchScore: analysis.matchScore,
            aiAnalysis: JSON.stringify(analysis),
            status: "AI_REVIEWED",
          },
        });

      console.log(
        `🎯 Candidate Match Score: ${analysis.matchScore}%`
      );

      // Auto-screening: score >= threshold -> SHORTLISTED (the company picks who gets
      // interviewed later), otherwise rejected by email.
      // If anything fails here the candidate stays AI_REVIEWED for manual review.
      try {
        if (analysis.matchScore >= AUTO_SCREEN_THRESHOLD) {
          const shortlisted = await ctx.prisma.candidate.update({
            where: { id: candidate.id },
            data: { status: "SHORTLISTED" },
          });
          return { ...shortlisted, decision: "SHORTLISTED" as const };
        }
        const rejected = await rejectCandidate(ctx.prisma, { ...updatedCandidate, job });
        return { ...rejected, decision: "REJECTED" as const };
      } catch (autoErr) {
        console.error("Auto-screening failed, left for manual review:", autoErr);
        return { ...updatedCandidate, decision: null };
      }

    } catch (err) {
      console.error("=================================");
      console.error("❌ RESUME AI ANALYSIS FAILED");
      console.error("Candidate ID:", candidate.id);
      console.error(err);
      console.error("=================================");

      // Candidate is still saved
      return { ...candidate, decision: null };
    }
  }),

  // Candidate account is only used to apply and to follow the application status.
  getMyApplications: candidateProcedure.query(async ({ ctx }) => {
    return ctx.prisma.candidate.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            location: true,
            imageUrl: true,
          },
        },
      },
    });
  }),
});
