"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { timeAgo, formatDateTime } from "@/src/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  APPLIED: "Application received — awaiting AI review",
  AI_REVIEWED: "Your resume is being reviewed by the company",
  SHORTLISTED: "Shortlisted! Your resume matched the job. The company will email you if you are selected for the interview",
  INTERVIEW_SCHEDULED: "You are selected for the interview! Please attend in person at the date and time below (details were emailed to you)",
  INTERVIEW_COMPLETED: "Interview completed — the company will announce the decision",
  HIRED: "Congratulations — you got the job!",
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
                  {app.status === "INTERVIEW_SCHEDULED" && app.interviewAt && (
                    <p className="text-sm font-medium text-primary-700 mt-1">
                      Interview: {formatDateTime(app.interviewAt)}
                      {app.interviewOrder ? ` · Your number: ${app.interviewOrder}` : ""}
                    </p>
                  )}
                  {app.status === "INTERVIEW_SCHEDULED" && app.interviewLink && (
                    <a
                      href={app.interviewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-sm font-medium text-primary-600 underline"
                    >
                      Open interview link
                    </a>
                  )}
                </div>
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
