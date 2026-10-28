"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { timeAgo } from "@/src/lib/utils";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "Application received — awaiting AI review",
  AI_REVIEWED: "AI reviewed your resume — awaiting recruiter decision",
  INTERVIEW_APPROVED: "Approved for interview",
  INTERVIEW_INVITED: "Interview invitation sent — check your email",
  INTERVIEW_COMPLETED: "Interview completed — awaiting decision",
  HIRED: "Congratulations — moving forward!",
  REJECTED: "Not selected for this role",
};

export function PortalApplicationsClient() {
  const trpc = useTRPC();
  const { data: applications, isLoading } = useQuery(
    trpc.candidates.getMyApplications.queryOptions()
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
        <p className="text-sm text-gray-500 mt-1">Track the status of every job you've applied to.</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-gray-500">Loading...</div>
      ) : applications && applications.length > 0 ? (
        <div className="space-y-3">
          {applications.map((app) => (
            <Card key={app.id}>
              <CardContent className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{app.job.title}</h3>
                    <Badge status={app.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {app.job.department ?? "General"}
                    {app.job.location && ` · ${app.job.location}`}
                    <span className="mx-1">·</span>
                    Applied {timeAgo(app.createdAt)}
                  </p>
                  <p className="text-sm text-gray-600 mt-2">{STATUS_LABELS[app.status] ?? app.status}</p>
                </div>
                {app.status === "INTERVIEW_INVITED" && (
                  <Link href={`/portal/interview/${app.id}`}>
                    <Button>Start Interview</Button>
                  </Link>
                )}
                {app.status === "INTERVIEW_COMPLETED" && app.calls[0] && (
                  <Link href={`/portal/interview/${app.id}`}>
                    <Button variant="secondary">View Interview</Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-sm text-gray-500">
          You haven't applied to any jobs yet.{" "}
          <Link href="/portal/jobs" className="text-primary-600 font-medium hover:underline">
            Browse open positions
          </Link>
        </div>
      )}
    </div>
  );
}
