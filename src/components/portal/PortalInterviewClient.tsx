"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { RecruiterVoiceAgent } from "@/src/components/voice/RecruiterVoiceAgent";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import Link from "next/link";

export function PortalInterviewClient({ candidateId }: { candidateId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [callId, setCallId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { data: application, isLoading } = useQuery(
    trpc.candidates.getMyApplicationById.queryOptions({ id: candidateId })
  );

  const startCall = useMutation(trpc.calls.start.mutationOptions());

  const submitTranscript = useMutation(
    trpc.calls.submitTranscript.mutationOptions({
      onSuccess: () => {
        setSubmitted(true);
        queryClient.invalidateQueries({ queryKey: trpc.candidates.getMyApplicationById.queryKey() });
      },
    })
  );

  const cancelCall = useMutation(trpc.calls.cancel.mutationOptions());

  const handleCallStart = async () => {
    const call = await startCall.mutateAsync({ candidateId });
    setCallId(call.id);
  };

  const handleSecurityViolation = async (reason: string) => {
    if (!callId) return;

    try {
      await cancelCall.mutateAsync({
        callId,
        reason,
      });

      queryClient.invalidateQueries({
        queryKey: trpc.candidates.getMyApplicationById.queryKey(),
      });
    } catch (error) {
      console.error("Failed to mark interrupted interview as failed:", error);
    }
  };

  const handleCallComplete = (
  transcript: string,
  videoUrl?: string
) => {
  if (!callId) return;

  submitTranscript.mutate({
    callId,
    transcript,
    videoUrl,
  });
};

  if (isLoading) {
    return <div className="text-center py-12 text-sm text-gray-500">Loading...</div>;
  }

  if (!application) {
    return <div className="text-center py-12 text-sm text-gray-500">Application not found.</div>;
  }

  const alreadyCompleted =
    application.status === "INTERVIEW_COMPLETED" ||
    application.calls.some((call) => call.status === "COMPLETED");

  const interviewCancelled = application.calls.some(
    (call) => call.status === "FAILED"
  );

  let jobQuestions: string[] = [];
  try {
    const parsed = application.job.interviewQuestions ? JSON.parse(application.job.interviewQuestions) : [];
    if (Array.isArray(parsed)) jobQuestions = parsed;
  } catch {
    jobQuestions = [];
  }

  if (!application.interviewApproved) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 space-y-3">
        <p className="text-sm text-gray-500">
          You haven't been approved for an interview for this role yet.
        </p>
        <Link href="/portal/applications" className="text-primary-600 text-sm font-medium hover:underline">
          Back to my applications
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Interview — {application.job.title}</h1>
        <p className="text-sm text-gray-500 mt-1">
          Find a quiet spot with a working microphone. This should take about 10-15 minutes.
        </p>
      </div>

      {interviewCancelled ? (
        <Card>
          <CardContent className="text-center py-10 space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Interview Cancelled</h3>
            <p className="text-sm text-gray-500">
              This interview was cancelled because the interview page was left or another browser tab/window was opened. This interview cannot be resumed.
            </p>
            <Link href="/portal/applications">
              <Button variant="secondary">Back to my applications</Button>
            </Link>
          </CardContent>
        </Card>
      ) : alreadyCompleted || submitted ? (
        <Card>
          <CardContent className="text-center py-10 space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Interview Completed</h3>
            <p className="text-sm text-gray-500">
              Thanks for completing your interview! The hiring team will review your results and follow up soon.
            </p>
            <Link href="/portal/applications">
              <Button variant="secondary">Back to my applications</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <RecruiterVoiceAgent
          candidateName={application.name}
          
          jobTitle={application.job.title}
          questions={jobQuestions}
          onCallStart={handleCallStart}
          onCallComplete={handleCallComplete}
          onSecurityViolation={handleSecurityViolation}
        />
      )}

      {submitTranscript.isPending && (
        <p className="text-sm text-gray-500 text-center">Saving your interview and generating your report...</p>
      )}

      {cancelCall.isPending && (
        <p className="text-sm text-red-600 text-center">Cancelling the interview...</p>
      )}
    </div>
  );
}
