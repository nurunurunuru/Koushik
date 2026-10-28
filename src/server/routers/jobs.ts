import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, baseProcedure, adminProcedure } from "@/src/server/trpc";
import { generateJobPost, generateInterviewQuestions } from "@/src/lib/gemini";

// Throws unless the job exists and belongs to the logged-in admin.
async function assertOwnsJob(
  ctx: { prisma: typeof import("@/src/server/db").prisma; user: { id: string } },
  jobId: string
) {
  const job = await ctx.prisma.job.findFirst({
    where: { id: jobId, adminId: ctx.user.id },
    select: { id: true },
  });
  if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
}

export const jobsRouter = createTRPCRouter({
  // Admin: all jobs regardless of status
  getAll: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.job.findMany({
      where: { adminId: ctx.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { candidates: true },
        },
      },
    });
  }),

  // Candidate portal: only ACTIVE jobs are visible to applicants
  getAllPublic: baseProcedure.query(async ({ ctx }) => {
    return ctx.prisma.job.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.job.findFirst({
        where: { id: input.id, adminId: ctx.user.id },
        include: {
          candidates: {
            orderBy: { createdAt: "desc" },
          },
          _count: {
            select: { candidates: true },
          },
        },
      });
    }),

  // Admin: ask Gemini to draft a full job post from just a title (+ optional dept/location)
  generateWithAI: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        department: z.string().optional(),
        location: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return generateJobPost(input);
    }),

  // Admin: ask Gemini to draft the voice-interview question set for this role
  generateQuestionsWithAI: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        requirements: z.string().optional(),
        skills: z.string().optional(),
        count: z.number().min(3).max(12).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const questions = await generateInterviewQuestions({
        jobTitle: input.title,
        jobDescription: input.description,
        jobRequirements: input.requirements,
        jobSkills: input.skills,
        count: input.count,
      });
      return { questions };
    }),

  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        requirements: z.string().optional(),
        responsibilities: z.string().optional(),
        skills: z.string().optional(),
        employmentType: z.string().optional(),
        experienceLevel: z.string().optional(),
        salaryRange: z.string().optional(),
        department: z.string().optional(),
        location: z.string().optional(),
        status: z.enum(["ACTIVE", "CLOSED", "DRAFT"]).default("ACTIVE"),
        aiGenerated: z.boolean().optional(),
        interviewQuestions: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { interviewQuestions, ...rest } = input;
      return ctx.prisma.job.create({
        data: {
          ...rest,
          adminId: ctx.user.id,
          interviewQuestions: interviewQuestions
            ? JSON.stringify(interviewQuestions)
            : undefined,
        },
      });
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        requirements: z.string().optional(),
        responsibilities: z.string().optional(),
        skills: z.string().optional(),
        employmentType: z.string().optional(),
        experienceLevel: z.string().optional(),
        salaryRange: z.string().optional(),
        department: z.string().optional(),
        location: z.string().optional(),
        status: z.enum(["ACTIVE", "CLOSED", "DRAFT"]).optional(),
        interviewQuestions: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, interviewQuestions, ...rest } = input;
      await assertOwnsJob(ctx, id);
      return ctx.prisma.job.update({
        where: { id },
        data: {
          ...rest,
          ...(interviewQuestions
            ? { interviewQuestions: JSON.stringify(interviewQuestions) }
            : {}),
        },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsJob(ctx, input.id);
      return ctx.prisma.job.delete({
        where: { id: input.id },
      });
    }),

  getStats: adminProcedure.query(async ({ ctx }) => {
    const adminId = ctx.user.id;
    const [active, total, candidates, pendingReview, interviewsDone] = await Promise.all([
      ctx.prisma.job.count({ where: { adminId, status: "ACTIVE" } }),
      ctx.prisma.job.count({ where: { adminId } }),
      ctx.prisma.candidate.count({ where: { job: { adminId } } }),
      ctx.prisma.candidate.count({ where: { job: { adminId }, status: "AI_REVIEWED" } }),
      ctx.prisma.candidate.count({ where: { job: { adminId }, status: "INTERVIEW_COMPLETED" } }),
    ]);
    return { active, total, candidates, pendingReview, interviewsDone };
  }),
});
