"use client";

import { StatsCard } from "@/src/components/dashboard/StatsCard";
import { RecentCalls } from "@/src/components/dashboard/RecentCalls";
import { ActiveJobsList } from "@/src/components/dashboard/ActiveJobsList";
import { RecruiterVoiceAgent } from "@/src/components/voice/RecruiterVoiceAgent";
import { useTRPC } from "@/src/trpc/client";
import { useQuery } from "@tanstack/react-query";

export function DashboardClient() {
  const trpc = useTRPC();
  const { data: callStats } = useQuery(trpc.calls.getStats.queryOptions());
  const { data: candidateStats } = useQuery(
    trpc.candidates.getStats.queryOptions()
  );
  const { data: jobStats } = useQuery(trpc.jobs.getStats.queryOptions());

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Overview of your recruitment pipeline and AI voice agent activity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Active Jobs"
          value={jobStats?.active ?? 0}
          description={`${jobStats?.total ?? 0} total positions`}
          accent="primary"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Candidates"
          value={candidateStats?.total ?? 0}
          description={`${candidateStats?.aiReviewed ?? 0} awaiting review`}
          accent="blue"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Total Calls"
          value={callStats?.total ?? 0}
          description={`${callStats?.completed ?? 0} completed`}
          accent="accent"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
          }
        />
        <StatsCard
          title="Hired"
          value={candidateStats?.hired ?? 0}
          description={
            candidateStats && candidateStats.total > 0
              ? `${Math.round(
                  (candidateStats.hired / candidateStats.total) * 100
                )}% hire rate`
              : "No candidates yet"
          }
          accent="purple"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentCalls />
        <ActiveJobsList />
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          AI Voice Agent
        </h2>
        <RecruiterVoiceAgent
          candidateName="Demo Candidate"
          jobTitle="Software Engineer"
        />
      </div>
    </div>
  );
}
