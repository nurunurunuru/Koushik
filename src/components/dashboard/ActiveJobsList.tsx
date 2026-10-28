"use client";

import { Card, CardHeader, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { useTRPC } from "@/src/trpc/client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

export function ActiveJobsList() {
  const trpc = useTRPC();
  const { data: jobs, isLoading } = useQuery(
    trpc.jobs.getAll.queryOptions()
  );

  const activeJobs = jobs?.filter((j) => j.status === "ACTIVE") ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            Active Positions
          </h3>
          <Link
            href="/jobs"
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            Loading jobs...
          </div>
        ) : activeJobs.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {activeJobs.slice(0, 5).map((job) => (
              <Link
                key={job.id}
                href={`/candidates?jobId=${job.id}`}
                className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
                    {job.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {job.department ?? "General"}
                    {job.location && ` · ${job.location}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {job._count.candidates}
                  </span>
                  <Badge status={job.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center">
            <svg
              className="w-10 h-10 text-gray-300 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-gray-500">No active positions</p>
            <p className="text-xs text-gray-400 mt-1">
              Create your first job posting to start recruiting
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
