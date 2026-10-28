"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { formatDate, formatDuration, timeAgo } from "@/src/lib/utils";

export function CallsClient() {
  const trpc = useTRPC();
  const { data: calls, isLoading } = useQuery(trpc.calls.getAll.queryOptions());
  const { data: stats } = useQuery(trpc.calls.getStats.queryOptions());
  const [selectedCall, setSelectedCall] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  const filteredCalls = calls?.filter(
    (c) => filter === "ALL" || c.status === filter,
  );
  const selectedCallData = selectedCall
    ? calls?.find((c) => c.id === selectedCall)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Call History</h1>
        <p className="text-sm text-gray-500 mt-1">
          Track all AI voice agent screening calls and interviews
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {stats?.total ?? 0}
            </p>
            <p className="text-xs text-gray-500">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {stats?.scheduled ?? 0}
            </p>
            <p className="text-xs text-gray-500">Scheduled</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-2xl font-bold text-yellow-600">
              {stats?.inProgress ?? 0}
            </p>
            <p className="text-xs text-gray-500">In Progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-2xl font-bold text-green-600">
              {stats?.completed ?? 0}
            </p>
            <p className="text-xs text-gray-500">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-3 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {stats?.totalDurationMinutes ?? 0}m
            </p>
            <p className="text-xs text-gray-500">Total Duration</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        {["ALL", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "primary" : "secondary"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f === "ALL"
              ? "All"
              : f.charAt(0) + f.slice(1).toLowerCase().replace("_", " ")}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              Loading call history...
            </div>
          ) : filteredCalls && filteredCalls.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {filteredCalls.map((call) => (
                <div
                  key={call.id}
                  className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => setSelectedCall(call.id)}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${call.status === "COMPLETED" ? "bg-green-100" : call.status === "FAILED" ? "bg-red-100" : call.status === "IN_PROGRESS" ? "bg-yellow-100" : "bg-blue-100"}`}
                    >
                      <svg
                        className={`w-5 h-5 ${call.status === "COMPLETED" ? "text-green-600" : call.status === "FAILED" ? "text-red-600" : call.status === "IN_PROGRESS" ? "text-yellow-600" : "text-blue-600"}`}
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
                      <p className="text-sm font-medium text-gray-900">
                        {call.candidate.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {call.candidate.job.title}
                        <span className="mx-1">·</span>
                        {call.type.charAt(0) +
                          call.type.slice(1).toLowerCase().replace("_", " ")}
                      </p>
                      <p className="text-xs text-gray-400">
                        {timeAgo(call.createdAt)}
                        {call.duration && ` · ${formatDuration(call.duration)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {call.rating && (
                      <div className="flex items-center gap-1">
                        {Array.from({ length: call.rating }).map((_, i) => (
                          <svg
                            key={i}
                            className="w-3.5 h-3.5 text-yellow-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                        ))}
                      </div>
                    )}
                    <Badge status={call.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <svg
                className="w-12 h-12 text-gray-300 mx-auto mb-3"
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
              <p className="text-sm font-medium text-gray-500">
                No calls recorded
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Start a screening call from the candidates page
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={selectedCall !== null}
        onClose={() => setSelectedCall(null)}
        title={
          selectedCallData
            ? `Call with ${selectedCallData.candidate.name}`
            : "Call Details"
        }
        size="lg"
      >
        {selectedCallData && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Candidate
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {selectedCallData.candidate.name}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Position
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {selectedCallData.candidate.job.title}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Type
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {selectedCallData.type.charAt(0) +
                    selectedCallData.type
                      .slice(1)
                      .toLowerCase()
                      .replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Status
                </p>
                <div className="mt-1">
                  <Badge status={selectedCallData.status} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Duration
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {formatDuration(selectedCallData.duration)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Date
                </p>
                <p className="text-sm font-medium text-gray-900 mt-1">
                  {formatDate(selectedCallData.createdAt)}
                </p>
              </div>
            </div>
            {selectedCallData.summary && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Summary
                </p>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {selectedCallData.summary}
                  </p>
                </div>
              </div>
            )}
            {selectedCallData.aiReport && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  AI Interview Report
                </p>
                {(() => {
                  const report = JSON.parse(selectedCallData.aiReport);
                  const recColor: Record<string, string> =
                    {
                      STRONG_YES: "text-green-700 bg-green-50",
                      YES: "text-lime-700 bg-lime-50",
                      MAYBE: "text-yellow-700 bg-yellow-50",
                      NO: "text-red-700 bg-red-50",
                    };
                  return (
                    <div className="p-4 bg-accent-50/50 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${recColor[report.recommendation] ?? "text-gray-700 bg-gray-100"}`}
                        >
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
                            {report.strengths.map((s: string, i: number) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {report.concerns?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-red-700">Concerns</p>
                          <ul className="text-xs text-gray-600 list-disc list-inside">
                            {report.concerns.map((c: string, i: number) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {selectedCallData.transcript ? (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Transcript
                </p>
                <div className="p-3 bg-gray-50 rounded-lg max-h-64 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                    {selectedCallData.transcript}
                  </p>
                </div>
              </div>
            ) : selectedCallData.status === "COMPLETED" ? (
              <div className="p-4 bg-yellow-50 rounded-lg text-center">
                <p className="text-sm text-yellow-800">
                  No transcript available for this call.
                </p>
              </div>
            ) : null}
            {selectedCallData.notes && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Notes
                </p>
                <p className="text-sm text-gray-700">
                  {selectedCallData.notes}
                </p>
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedCall(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
