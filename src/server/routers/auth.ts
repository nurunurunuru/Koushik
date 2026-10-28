import { z } from "zod";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, baseProcedure } from "@/src/server/trpc";

export const authRouter = createTRPCRouter({
  // Public self-registration. The user picks CANDIDATE (applies to jobs) or
  // ADMIN (recruiter: posts jobs, reviews their own applicants).
  register: baseProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        phone: z.string().optional(),
        role: z.enum(["CANDIDATE", "ADMIN"]).default("CANDIDATE"),
        adminCode: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Admin signup is protected by a secret code (ADMIN_SIGNUP_CODE in .env).
      // If the variable is not set, admin signup is disabled entirely.
      if (input.role === "ADMIN") {
        const expected = process.env.ADMIN_SIGNUP_CODE;
        if (!expected) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Admin signup is disabled.",
          });
        }
        const a = Buffer.from(input.adminCode ?? "");
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Invalid admin signup code.",
          });
        }
      }

      const existing = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An account with this email already exists.",
        });
      }

      const hashed = await bcrypt.hash(input.password, 10);
      const user = await ctx.prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashed,
          phone: input.phone,
          role: input.role,
        },
      });

      return { id: user.id, email: user.email, name: user.name, role: user.role };
    }),
});
