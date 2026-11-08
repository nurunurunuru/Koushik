import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  adminProcedure,
  candidateProcedure,
} from "@/src/server/trpc";
import { analyzeResumeLocally } from "@/src/lib/resumeAI";
import { sendInterviewInvitationEmail, sendRejectionEmail, sendHiredEmail } from "@/src/lib/mailer";

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
  job: { title: string; interviewDate?: Date | null };
};

// Minimum AI match score (%) for a candidate to be auto-invited to interview.
// Anything below is auto-rejected. Override with AUTO_SCREEN_THRESHOLD in .env.
const AUTO_SCREEN_THRESHOLD = Number(process.env.AUTO_SCREEN_THRESHOLD ?? 50);

// Sends the interview invite email and moves the candidate to INTERVIEW_INVITED.
async function inviteCandidate(prisma: Db, candidate: CandidateWithJob) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const interviewUrl = `${appUrl}/login?callbackUrl=${encodeURIComponent(
    `/portal/interview/${candidate.id}`
  )}`;

  let emailSent = true;
  try {
    await sendInterviewInvitationEmail({
      to: candidate.email,
      candidateName: candidate.name,
      jobTitle: candidate.job.title,
      interviewUrl,
      matchScore: candidate.matchScore ?? 0,
      interviewDate: candidate.job.interviewDate ?? null,
    });
  } catch (e) {
    emailSent = false;
    console.error("Failed to send interview invitation email:", e);
  }

  const updated = await prisma.candidate.update({
    where: { id: candidate.id },
    data: {
      interviewApproved: true,
      status: "INTERVIEW_INVITED",
      invitedAt: new Date(),
    },
  });
  return { ...updated, emailSent };
}

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
            "INTERVIEW_APPROVED",
            "INTERVIEW_INVITED",
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

  // Admin gives permission -> AI emails the candidate an interview invitation link
  approveForInterview: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const candidate = await ctx.prisma.candidate.findFirst({
        where: { id: input.id, job: { adminId: ctx.user.id } },
        include: { job: true },
      });
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND" });

      return inviteCandidate(ctx.prisma, candidate);
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
    const [applied, aiReviewed, interviewInvited, interviewCompleted, hired, rejected] =
      await Promise.all([
        ctx.prisma.candidate.count({ where: { job, status: "APPLIED" } }),
        ctx.prisma.candidate.count({ where: { job, status: "AI_REVIEWED" } }),
        ctx.prisma.candidate.count({ where: { job, status: "INTERVIEW_INVITED" } }),
        ctx.prisma.candidate.count({ where: { job, status: "INTERVIEW_COMPLETED" } }),
        ctx.prisma.candidate.count({ where: { job, status: "HIRED" } }),
        ctx.prisma.candidate.count({ where: { job, status: "REJECTED" } }),
      ]);
    const total = applied + aiReviewed + interviewInvited + interviewCompleted + hired + rejected;
    return { applied, aiReviewed, interviewInvited, interviewCompleted, hired, rejected, total };
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

      // Auto-screening: score >= threshold -> invite to interview, else reject.
      // If anything fails here the candidate stays AI_REVIEWED for manual review.
      try {
        const withJob = { ...updatedCandidate, job };
        if (analysis.matchScore >= AUTO_SCREEN_THRESHOLD) {
          const invited = await inviteCandidate(ctx.prisma, withJob);
          return {
            ...invited,
            decision: "INVITED" as const,
            interviewDate: job.interviewDate,
          };
        }
        const rejected = await rejectCandidate(ctx.prisma, withJob);
        return {
          ...rejected,
          decision: "REJECTED" as const,
          interviewDate: job.interviewDate,
        };
      } catch (autoErr) {
        console.error("Auto-screening failed, left for manual review:", autoErr);
        return { ...updatedCandidate, decision: null, interviewDate: job.interviewDate };
      }

    } catch (err) {
      console.error("=================================");
      console.error("❌ RESUME AI ANALYSIS FAILED");
      console.error("Candidate ID:", candidate.id);
      console.error(err);
      console.error("=================================");

      // Candidate is still saved
      return { ...candidate, decision: null, interviewDate: job.interviewDate };
    }
  }),

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
            interviewDate: true,
          },
        },
        calls: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  }),

  // Candidate loads their own application to enter the interview room
  getMyApplicationById: candidateProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const candidate = await ctx.prisma.candidate.findUnique({
        where: { id: input.id },
        include: { job: true, calls: { orderBy: { createdAt: "desc" } } },
      });
      if (!candidate || candidate.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Interview questions stay hidden until the candidate has actually been approved.
      if (!candidate.interviewApproved) {
        return { ...candidate, job: { ...candidate.job, interviewQuestions: null } };
      }
      return candidate;
    }),
});
