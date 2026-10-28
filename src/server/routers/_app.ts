import { createTRPCRouter } from "@/src/server/trpc";
import { jobsRouter } from "./jobs";
import { candidatesRouter } from "./candidates";
import { callsRouter } from "./calls";
import { authRouter } from "./auth";

export const appRouter = createTRPCRouter({
  jobs: jobsRouter,
  candidates: candidatesRouter,
  calls: callsRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
