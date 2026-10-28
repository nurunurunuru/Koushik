import { initTRPC, TRPCError } from "@trpc/server";
import { cache } from "react";
import superjson from "superjson";
import { prisma } from "./db";
import { getAuthServer } from "@/src/lib/authoption";
import { Session } from "next-auth";

export const createTRPCContext = cache(async () => {
  return {
    prisma,
  };
});

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

export const authProcedure = baseProcedure.use(async ({ next }) => {
  const session: Session | null = await getAuthServer();
  if (!session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { user: session.user } });
});

// Only logged-in ADMIN users may call these procedures
export const adminProcedure = baseProcedure.use(async ({ next }) => {
  const session: Session | null = await getAuthServer();
  if (!session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (session.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx: { user: session.user } });
});

// Only logged-in CANDIDATE users may call these procedures
export const candidateProcedure = baseProcedure.use(async ({ next }) => {
  const session: Session | null = await getAuthServer();
  if (!session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (session.user.role !== "CANDIDATE") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Candidate access required" });
  }
  return next({ ctx: { user: session.user } });
});
