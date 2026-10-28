"use client";

import { Suspense, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Modal } from "@/src/components/ui/modal";
import { timeAgo, cn } from "@/src/lib/utils";

const STATUS_FILTERS = [
  { value: "ALL", label: "All Statuses" },
  { value: "APPLIED", label: "Applied" },
  { value: "AI_REVIEWED", label: "AI Reviewed" },
  { value: "INTERVIEW_APPROVED", label: "Interview Approved" },
  { value: "INTERVIEW_INVITED", label: "Interview Invited" },
  { value: "INTERVIEW_COMPLETED", label: "Interview Completed" },
  { value: "HIRED", label: "Hired" },
  { value: "REJECTED", label: "Rejected" },
];

interface ResumeAnalysis {
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendation: string;
}

interface InterviewReport {
  overallScore: number;
  recommendation: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  skillAssessment: { skill: string; rating: number; note: string }[];
  communicationScore: number;
  technicalScore: number;
}

function MatchScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-gray-400">Not analyzed</span>;
  const color =
    score >= 75 ? "text-green-700 bg-green-50" : score >= 50 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", color)}>{score}% match</span>
  );
}

function CandidatesContent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobIdFilter = searchParams.get("jobId");

  const { data: candidates, isLoading } = useQuery(trpc.candidates.getAll.queryOptions());

  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionNotice, setActionNotice] = useState<{ type: "error" | "warning"; message: string } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: trpc.candidates.getAll.queryKey() });
  };

  const approveForInterview = useMutation(
    trpc.candidates.approveForInterview.mutationOptions({
      onSuccess: (data: any) => {
        invalidate();
        if (data?.emailSent === false) {
          setActionNotice({
            type: "warning",
            message: "Candidate approved, but the invitation email failed to send. Check your GMAIL_USER / GMAIL_APP_PASSWORD in .env and the server terminal for details.",
          });
        } else {
          setActionNotice(null);
        }
      },
      onError: (err) => setActionNotice({ type: "error", message: err.message || "Failed to approve candidate." }),
    })
  );
  const rejectApplication = useMutation(
    trpc.candidates.rejectApplication.mutationOptions({
      onSuccess: invalidate,
      onError: (err) => setActionNotice({ type: "error", message: err.message || "Failed to reject candidate." }),
    })
  );
  const finalDecision = useMutation(
    trpc.candidates.finalDecision.mutationOptions({
      onSuccess: invalidate,
      onError: (err) => setActionNotice({ type: "error", message: err.message || "Failed to update decision." }),
    })
  );

  const filteredCandidates = useMemo(() => {
    if (!candidates) return [];
    return candidates.filter((c) => {
      const matchesJob = !jobIdFilter || c.job.id === jobIdFilter;
      const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesJob && matchesStatus && matchesSearch;
    });
  }, [candidates, jobIdFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Candidates</h1>
        <p className="text-sm text-gray-500 mt-1">
          {jobIdFilter ? "Applicants for a specific position" : "Review AI-scored applications and interview reports"}
        </p>
      </div>

      {actionNotice && (
        <div
          className={cn(
            "px-4 py-3 rounded-lg border text-sm flex items-start justify-between gap-4",
            actionNotice.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-yellow-50 border-yellow-200 text-yellow-800"
          )}
        >
          <span>{actionNotice.message}</span>
          <button onClick={() => setActionNotice(null)} className="text-xs underline flex-shrink-0">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search candidates by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} options={STATUS_FILTERS} className="w-48" />
        {jobIdFilter && (
          <Button variant="secondary" size="sm" onClick={() => router.push("/candidates")}>
            Clear filter
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card>
          <CardContent>
            <div className="py-12 text-center text-sm text-gray-500">Loading candidates...</div>
          </CardContent>
        </Card>
      ) : filteredCandidates.length > 0 ? (
        <div className="grid grid-cols-1 gap-4">
          {filteredCandidates.map((candidate) => {
            const analysis: ResumeAnalysis | null = candidate.aiAnalysis
              ? JSON.parse(candidate.aiAnalysis)
              : null;
            const expanded = selectedCandidate === candidate.id;
            return (
              <Card
                key={candidate.id}
                hover
                className={cn("cursor-pointer transition-all", expanded && "ring-2 ring-primary-500")}
                onClick={() => setSelectedCandidate(expanded ? null : candidate.id)}
              >
                <CardContent className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                        {candidate.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{candidate.name}</p>
                          <MatchScoreBadge score={candidate.matchScore} />
                        </div>
                        <p className="text-xs text-gray-500">
                          {candidate.email}
                          {candidate.phone && ` · ${candidate.phone}`}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Applied for <span className="font-medium text-gray-600">{candidate.job.title}</span>
                          {candidate.job.department && ` · ${candidate.job.department}`}
                          <span className="mx-1">·</span>
                          {timeAgo(candidate.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {candidate._count.calls} call{candidate._count.calls !== 1 ? "s" : ""}
                      </span>
                      <Badge status={candidate.status} />
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                      {candidate.resumeUrl && (
  <div className="flex items-center gap-3">
    <a
      href={candidate.resumeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="
        inline-flex
        items-center
        gap-2
        rounded-lg
        bg-primary-600
        px-4
        py-2
        text-sm
        font-medium
        text-white
        hover:bg-primary-700
        transition
      "
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 21h10a2 2 0 002-2V7.828a2 2 0 00-.586-1.414l-4.828-4.828A2 2 0 0012.172 1H7a2 2 0 00-2 2v16a2 2 0 002 2z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 2v6h6M9 13h6M9 17h6"
        />
      </svg>

      View CV PDF
    </a>

    <span className="text-xs text-gray-400">
      Original uploaded resume
    </span>
  </div>
)}
                      {candidate.resumeText && (
                        <details className="text-sm">
                          <summary className="cursor-pointer font-medium text-gray-700">Resume text</summary>
                          <p className="mt-2 whitespace-pre-wrap text-gray-600 text-xs bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto">
                            {candidate.resumeText}
                          </p>
                        </details>
                      )}

                      {analysis && (
                        <div className="bg-primary-50/50 rounded-lg p-4 space-y-2">
                          <p className="text-sm font-semibold text-gray-900">AI Resume Analysis</p>
                          <p className="text-sm text-gray-700">{analysis.summary}</p>
                          {analysis.strengths?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-green-700">Strengths</p>
                              <ul className="text-xs text-gray-600 list-disc list-inside">
                                {analysis.strengths.map((s, i) => (
                                  <li key={i}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {analysis.gaps?.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-red-700">Gaps</p>
                              <ul className="text-xs text-gray-600 list-disc list-inside">
                                {analysis.gaps.map((g, i) => (
                                  <li key={i}>{g}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {candidate.calls?.[0]?.aiReport && (
                        <InterviewReportView report={JSON.parse(candidate.calls[0].aiReport)} />
                      )}
                      {candidate.calls?.[0]?.videoUrl && (
  <div
    className="rounded-lg border border-gray-200 bg-gray-50 p-4"
    onClick={(e) => e.stopPropagation()}
  >
    <div className="mb-3">
      <p className="text-sm font-semibold text-gray-900">
        Interview Recording
      </p>
      <p className="mt-1 text-xs text-gray-500">
        Recorded video of the AI interview
      </p>
    </div>

    <video
      controls
      preload="metadata"
      src={candidate.calls[0].videoUrl}
      className="w-full max-w-3xl rounded-lg bg-black"
    >
      Your browser does not support video playback.
    </video>
  </div>
)}

                      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {(candidate.status === "APPLIED" || candidate.status === "AI_REVIEWED") && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveForInterview.mutate({ id: candidate.id })}
                              isLoading={approveForInterview.isPending}
                            >
                              Approve & Send Interview Invite
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => rejectApplication.mutate({ id: candidate.id })}
                              isLoading={rejectApplication.isPending}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        {candidate.status === "INTERVIEW_COMPLETED" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => finalDecision.mutate({ id: candidate.id, decision: "HIRED" })}
                              isLoading={finalDecision.isPending}
                            >
                              Move to Office Interview
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => finalDecision.mutate({ id: candidate.id, decision: "REJECTED" })}
                              isLoading={finalDecision.isPending}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent>
            <div className="py-12 text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <p className="text-sm font-medium text-gray-500">No candidates found</p>
              <p className="text-xs text-gray-400 mt-1">
                {jobIdFilter ? "No one has applied for this position yet" : "Candidates will appear here once they apply from the portal"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InterviewReportView({ report }: { report: InterviewReport }) {
  const recColor =
    {
      STRONG_YES: "text-green-700 bg-green-50",
      YES: "text-lime-700 bg-lime-50",
      MAYBE: "text-yellow-700 bg-yellow-50",
      NO: "text-red-700 bg-red-50",
    }[report.recommendation] ?? "text-gray-700 bg-gray-50";

  return (
    <div className="bg-accent-50/50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">AI Interview Report</p>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", recColor)}>
          {report.recommendation?.replace("_", " ")} · {report.overallScore}/100
        </span>
      </div>
      <p className="text-sm text-gray-700">{report.summary}</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white rounded-lg p-2 text-center">
          <p className="font-semibold text-gray-900">{report.communicationScore}</p>
          <p className="text-gray-500">Communication</p>
        </div>
        <div className="bg-white rounded-lg p-2 text-center">
          <p className="font-semibold text-gray-900">{report.technicalScore}</p>
          <p className="text-gray-500">Technical</p>
        </div>
      </div>
      {report.strengths?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-green-700">Strengths</p>
          <ul className="text-xs text-gray-600 list-disc list-inside">
            {report.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {report.concerns?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-red-700">Concerns</p>
          <ul className="text-xs text-gray-600 list-disc list-inside">
            {report.concerns.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
      {report.skillAssessment?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1">Skill Assessment</p>
          <div className="space-y-1">
            {report.skillAssessment.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-white rounded-lg px-2 py-1">
                <span className="text-gray-700">{s.skill}</span>
                <span className="text-gray-500">{"★".repeat(s.rating)}{"☆".repeat(5 - s.rating)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function CandidatesClient() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-gray-500">Loading candidates...</div>}>
      <CandidatesContent />
    </Suspense>
  );
}
