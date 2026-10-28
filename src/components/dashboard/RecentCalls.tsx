"use client";

import { Card, CardHeader, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { formatDuration, timeAgo } from "@/src/lib/utils";
import { useTRPC } from "@/src/trpc/client";
import { useQuery } from "@tanstack/react-query";

export function RecentCalls() {
  const trpc = useTRPC();
  const { data: calls, isLoading } = useQuery(
    trpc.calls.getAll.queryOptions()
  );

  const recentCalls = calls?.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Recent Calls</h3>
          {!isLoading && calls && (
            <span className="text-sm text-gray-500">
              {calls.length} total
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            Loading calls...
          </div>
        ) : recentCalls && recentCalls.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {recentCalls.map((call) => (
              <div
                key={call.id}
                className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-primary-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {call.candidate.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {call.candidate.job.title}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {timeAgo(call.createdAt)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatDuration(call.duration)}
                    </p>
                  </div>
                  <Badge status={call.status} />
                </div>
              </div>
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
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <p className="text-sm text-gray-500">No calls yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Start your first screening call from the candidates page
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
