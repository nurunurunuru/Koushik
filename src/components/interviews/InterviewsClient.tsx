"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/src/server/routers/_app";
import { useTRPC } from "@/src/trpc/client";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { cn, formatDateTime } from "@/src/lib/utils";
import { AI_WEIGHT, BOARD_WEIGHT, MAX_BOARD_MARK, computeFinalScore, type BoardEntry } from "@/src/lib/scoring";
import { BoardInterviewSession } from "./BoardInterviewSession";
import { InterviewRecord } from "./InterviewRecord";

type Cand = inferRouterOutputs<AppRouter>["candidates"]["getAll"][number];

type Tab = "schedule" | "live" | "review" | "results";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "schedule", label: "1. Select & Schedule", hint: "Pick the best candidates and give the interview date/time" },
  { id: "live", label: "2. Live Interview", hint: "Call candidates one by one and interview them" },
  { id: "review", label: "3. Board Review", hint: "Read the candidates' replies to the board's questions and give a mark" },
  { id: "results", label: "4. Results & Decision", hint: "Final marks, Q&A records and hiring decision" },
];

function MatchBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-xs text-gray-400">Not analyzed</span>;
  const color =
    score >= 75 ? "text-green-700 bg-green-50" : score >= 50 ? "text-yellow-700 bg-yellow-50" : "text-red-700 bg-red-50";
  return <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", color)}>{score}% match</span>;
}

function analysisSummary(c: Cand): string {
  if (!c.aiAnalysis) return "";
  try {
    return JSON.parse(c.aiAnalysis).summary ?? "";
  } catch {
    return "";
  }
}

// datetime-local value
function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* 1. SELECT & SCHEDULE                                                */
/* ------------------------------------------------------------------ */

function SchedulePanel({
  candidates,
  defaultDate,
}: {
  candidates: Cand[];
  defaultDate: Date | string | null | undefined;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Best resume match first
  const pool = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "SHORTLISTED" || c.status === "AI_REVIEWED")
        .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0)),
    [candidates]
  );
  const scheduled = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "INTERVIEW_SCHEDULED")
        .sort((a, b) => (a.interviewOrder ?? 0) - (b.interviewOrder ?? 0)),
    [candidates]
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [topN, setTopN] = useState(10);
  const [interviewAt, setInterviewAt] = useState(toLocalInput(defaultDate));
  const [venue, setVenue] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [notice, setNotice] = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.candidates.getAll.queryKey() });

  const schedule = useMutation(
    trpc.candidates.scheduleInterviews.mutationOptions({
      onSuccess: (data) => {
        invalidate();
        setSelected(new Set());
        if (data.emailFailed.length > 0) {
          setNotice({
            type: "warn",
            text: `${data.scheduled} candidate(s) scheduled, but the email failed for: ${data.emailFailed.join(
              ", "
            )}. Check GMAIL_USER / GMAIL_APP_PASSWORD in .env.`,
          });
        } else {
          setNotice({ type: "ok", text: `${data.scheduled} candidate(s) scheduled and emailed.` });
        }
      },
      onError: (err) => setNotice({ type: "error", text: err.message || "Failed to schedule interviews." }),
    })
  );
  const reject = useMutation(
    trpc.candidates.rejectApplication.mutationOptions({
      onSuccess: invalidate,
      onError: (err) => setNotice({ type: "error", text: err.message || "Failed to reject." }),
    })
  );

  const selectTop = (n: number) => setSelected(new Set(pool.slice(0, n).map((c) => c.id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSchedule = () => {
    if (!interviewAt) {
      setNotice({ type: "error", text: "Please choose the interview date and time." });
      return;
    }
    // keep ranking order (best match first)
    const ids = pool.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Schedule ${ids.length} candidate(s) and send them the interview email?`)) return;
    setNotice(null);
    schedule.mutate({
      candidateIds: ids,
      interviewAt: new Date(interviewAt),
      venue: venue.trim() || undefined,
      meetingLink: meetingLink.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            notice.type === "ok" && "border-green-200 bg-green-50 text-green-800",
            notice.type === "warn" && "border-yellow-200 bg-yellow-50 text-yellow-800",
            notice.type === "error" && "border-red-200 bg-red-50 text-red-700"
          )}
        >
          {notice.text}
        </div>
      )}

      <Card>
        <CardContent className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Shortlisted candidates ({pool.length})
            </p>
            <p className="text-xs text-gray-500">
              These candidates matched 50% or more with the job. They are sorted by resume match, best first.
              Select the ones you want to interview.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => selectTop(10)}>
              Top 10
            </Button>
            <Button size="sm" variant="secondary" onClick={() => selectTop(15)}>
              Top 15
            </Button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={topN}
                onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              />
              <Button size="sm" variant="secondary" onClick={() => selectTop(topN)}>
                Select top {topN}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <span className="ml-auto text-sm font-medium text-primary-700">{selected.size} selected</span>
          </div>

          {pool.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No shortlisted candidates for this job yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {pool.map((c, index) => {
                const open = expanded === c.id;
                return (
                  <div key={c.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        className="h-4 w-4"
                      />
                      <span className="w-6 text-xs font-bold text-gray-400">#{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : c.id)}
                            className="text-sm font-semibold text-gray-900 hover:text-primary-700"
                          >
                            {c.name}
                          </button>
                          <MatchBadge score={c.matchScore} />
                        </div>
                        <p className="text-xs text-gray-500">{c.email}</p>
                      </div>
                      {c.resumeUrl && (
                        <a
                          href={c.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary-600 hover:underline"
                        >
                          CV
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (window.confirm(`Reject ${c.name} and send a rejection email?`)) {
                            reject.mutate({ id: c.id });
                          }
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                    {open && (
                      <p className="mt-2 ml-14 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                        {analysisSummary(c) || "No AI summary available."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-6 py-5 space-y-4">
          <p className="text-sm font-semibold text-gray-900">Interview date &amp; time for the selected candidates</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Interview Date & Time"
              type="datetime-local"
              value={interviewAt}
              onChange={(e) => setInterviewAt(e.target.value)}
            />
            <Input
              label="Venue (optional)"
              placeholder="e.g. Head office, Room 301"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
            />
            <Input
              label="Interview link (optional)"
              type="url"
              placeholder="https://..."
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
            />
          </div>
          <p className="text-xs text-gray-500">
            Each selected candidate gets an email with this date/time, their interview number (1, 2, 3...
            in the order of the list above) and a link to see the interview details in their account.
            If you add an interview link it is included in the email and shown in the account too.
          </p>
          <Button onClick={handleSchedule} isLoading={schedule.isPending} disabled={selected.size === 0}>
            Schedule &amp; email {selected.size > 0 ? `${selected.size} candidate${selected.size > 1 ? "s" : ""}` : ""}
          </Button>
        </CardContent>
      </Card>

      {scheduled.length > 0 && (
        <Card>
          <CardContent className="px-6 py-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Already scheduled ({scheduled.length})</p>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {scheduled.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>
                    <span className="mr-2 font-bold text-gray-400">#{c.interviewOrder}</span>
                    <span className="font-medium text-gray-900">{c.name}</span>
                  </span>
                  <span className="text-xs text-gray-500">{formatDateTime(c.interviewAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. LIVE INTERVIEW                                                   */
/* ------------------------------------------------------------------ */

function LivePanel({ candidates }: { candidates: Cand[] }) {
  const queue = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "INTERVIEW_SCHEDULED")
        .sort(
          (a, b) =>
            new Date(a.interviewAt ?? 0).getTime() - new Date(b.interviewAt ?? 0).getTime() ||
            (a.interviewOrder ?? 0) - (b.interviewOrder ?? 0)
        ),
    [candidates]
  );
  const done = useMemo(
    () => candidates.filter((c) => c.interviewAt && c.status !== "INTERVIEW_SCHEDULED" && c.finalScore != null),
    [candidates]
  );

  const [calledId, setCalledId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const called = queue.find((c) => c.id === calledId) ?? null;
  const active = candidates.find((c) => c.id === activeId) ?? null;

  // Click on a name -> the candidate is called (spoken aloud + shown big on screen)
  const callCandidate = (c: Cand) => {
    setCalledId(c.id);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        `Candidate number ${c.interviewOrder ?? ""}, ${c.name}. Please come to the interview board.`
      );
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  if (active) {
    return (
      <BoardInterviewSession
        key={active.id}
        candidateId={active.id}
        candidateName={active.name}
        jobTitle={active.job.title}
        onClose={() => {
          setActiveId(null);
          setCalledId(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {called && (
        <Card className="ring-2 ring-primary-500">
          <CardContent className="px-6 py-8 text-center space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">Now calling</p>
            <p className="text-sm text-gray-500">Candidate number {called.interviewOrder}</p>
            <p className="text-4xl font-bold text-gray-900">{called.name}</p>
            <p className="text-sm text-gray-500">Please come to the interview board.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="secondary" onClick={() => callCandidate(called)}>
                🔊 Call again
              </Button>
              <Button onClick={() => setActiveId(called.id)}>Start Interview</Button>
              <Button variant="ghost" onClick={() => setCalledId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="px-6 py-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Waiting for interview ({queue.length})</p>
            <p className="text-xs text-gray-500">
              Click a candidate&apos;s name to call them. Then press Start Interview.
            </p>
          </div>
          {queue.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No candidates are waiting. Schedule candidates in step 1.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {queue.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => callCandidate(c)}
                  className={cn(
                    "flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-primary-50/50",
                    calledId === c.id && "bg-primary-50"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                      {c.interviewOrder}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{c.name}</span>
                      <span className="block text-xs text-gray-500">{formatDateTime(c.interviewAt)}</span>
                    </span>
                  </span>
                  <span className="text-xs font-medium text-primary-600">Click to call</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {done.length > 0 && (
        <Card>
          <CardContent className="px-6 py-5 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Interviewed ({done.length})</p>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {done.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-medium text-gray-900">{c.name}</span>
                  <span className="text-xs text-gray-500">Final score: {c.finalScore}/100</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. BOARD REVIEW                                                     */
/* ------------------------------------------------------------------ */

function parseEntries(value: string | null | undefined): BoardEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ReviewCard({ c }: { c: Cand }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const call = c.calls?.[0];
  const entries = parseEntries(call?.boardEntries);

  const [open, setOpen] = useState(c.boardScore == null);
  const [showFull, setShowFull] = useState(false);
  const [mark, setMark] = useState<string>(c.boardScore != null ? String(c.boardScore) : "");
  const [comment, setComment] = useState(call?.boardComment ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation(
    trpc.calls.saveBoardMark.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.candidates.getAll.queryKey() });
        setMsg({ ok: true, text: "Board mark saved." });
      },
      onError: (err) => setMsg({ ok: false, text: err.message || "Failed to save the mark." }),
    })
  );

  const markNumber = mark === "" ? null : Math.max(0, Math.min(MAX_BOARD_MARK, Math.round(Number(mark))));
  const preview = markNumber == null ? null : computeFinalScore(c.aiScore, markNumber);

  const submit = () => {
    if (!call || markNumber == null || Number.isNaN(markNumber)) {
      setMsg({ ok: false, text: `Enter a mark between 0 and ${MAX_BOARD_MARK}.` });
      return;
    }
    setMsg(null);
    save.mutate({ callId: call.id, mark: markNumber, comment: comment.trim() || undefined });
  };

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <span className="block text-sm font-semibold text-gray-900">{c.name}</span>
          <span className="block text-xs text-gray-500">
            AI mark {c.aiScore ?? "—"} · {entries.length} board question{entries.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-primary-600">{open ? "Hide" : "Open"}</span>
          </span>
        </button>
        {c.boardScore != null ? (
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            Board mark {c.boardScore}
          </span>
        ) : (
          <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
            Waiting for board mark
          </span>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-900">
              Board members&apos; questions &amp; the candidate&apos;s replies
            </p>
            {entries.length === 0 ? (
              <p className="text-sm text-gray-400">No board question was asked for this candidate.</p>
            ) : (
              <div className="space-y-2">
                {entries.map((e, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-sm font-medium text-gray-900">
                      Q{i + 1}. {e.question}
                    </p>
                    <p className="mt-1 whitespace-pre-line rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {e.answer || "— no reply recorded —"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">Board&apos;s mark for these replies</p>
            <div className="grid gap-3 sm:grid-cols-12">
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-gray-600">Mark (0–{MAX_BOARD_MARK})</label>
                <input
                  type="number"
                  min={0}
                  max={MAX_BOARD_MARK}
                  value={mark}
                  onChange={(e) => setMark(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div className="sm:col-span-9">
                <label className="mb-1 block text-xs font-medium text-gray-600">Comment (optional)</label>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Short comment from the board"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
            <p className="text-xs text-gray-600">
              AI mark {c.aiScore ?? "—"} + board mark {markNumber ?? "—"} → final mark{" "}
              <strong>{preview ?? "—"}</strong> ({Math.round(AI_WEIGHT * 100)}% AI + {Math.round(BOARD_WEIGHT * 100)}% board)
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={submit} isLoading={save.isPending}>
                {c.boardScore != null ? "Update board mark" : "Save board mark"}
              </Button>
              {msg && <span className={cn("text-xs", msg.ok ? "text-green-700" : "text-red-600")}>{msg.text}</span>}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowFull(!showFull)}
            className="text-xs font-medium text-primary-600 hover:underline"
          >
            {showFull ? "Hide" : "Show"} the full AI interview record
          </button>
          {showFull && (
            <InterviewRecord call={call} aiScore={c.aiScore} boardScore={c.boardScore} finalScore={c.finalScore} />
          )}
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ candidates }: { candidates: Cand[] }) {
  const list = useMemo(
    () =>
      candidates
        .filter((c) => c.status === "INTERVIEW_COMPLETED" && c.calls?.length)
        .sort((a, b) => Number(a.boardScore != null) - Number(b.boardScore != null)),
    [candidates]
  );
  const pending = list.filter((c) => c.boardScore == null).length;

  return (
    <Card>
      <CardContent className="px-6 py-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Board review ({list.length}) {pending > 0 && <span className="text-yellow-700">· {pending} waiting for a mark</span>}
          </p>
          <p className="text-xs text-gray-500">
            The candidates&apos; replies to the board&apos;s questions are not marked automatically. Read the replies here
            and give your own mark. It is added to the AI mark to make the final mark.
          </p>
        </div>
        {list.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No interview is waiting for the board&apos;s review.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {list.map((c) => (
              <ReviewCard key={c.id} c={c} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 4. RESULTS & DECISION                                               */
/* ------------------------------------------------------------------ */

function ResultsPanel({ candidates }: { candidates: Cand[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState("");

  const ranked = useMemo(
    () =>
      candidates
        .filter((c) => c.interviewAt && ["INTERVIEW_COMPLETED", "HIRED", "REJECTED"].includes(c.status) && c.calls?.length)
        .sort((a, b) => (b.finalScore ?? -1) - (a.finalScore ?? -1)),
    [candidates]
  );

  const decide = useMutation(
    trpc.candidates.finalDecision.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.candidates.getAll.queryKey() }),
      onError: (err) => setError(err.message || "Failed to save the decision."),
    })
  );

  return (
    <Card>
      <CardContent className="px-6 py-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">Interview results ({ranked.length})</p>
          <p className="text-xs text-gray-500">
            Final mark = {Math.round(AI_WEIGHT * 100)}% AI mark + {Math.round(BOARD_WEIGHT * 100)}% board mark. The
            board decides who gets the job. The candidate gets an email with the decision.
          </p>
        </div>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

        {ranked.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No interview has been completed yet.</p>
        ) : (
          <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {ranked.map((c, index) => {
              const open = expanded === c.id;
              return (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-6 text-sm font-bold text-gray-400">#{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : c.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block text-sm font-semibold text-gray-900">{c.name}</span>
                      <span className="block text-xs text-gray-500">
                        AI mark {c.aiScore ?? "—"} · Board mark {c.boardScore ?? "—"} ·{" "}
                        <span className="text-primary-600">{open ? "Hide record" : "View Q&A record"}</span>
                      </span>
                    </button>
                    <span className="rounded-full bg-primary-600 px-3 py-1 text-sm font-bold text-white">
                      {c.finalScore ?? "—"}
                      {c.finalScore != null && "/100"}
                    </span>
                    {c.status === "INTERVIEW_COMPLETED" && c.boardScore == null ? (
                      <span className="rounded-full bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700">
                        Waiting for board mark
                      </span>
                    ) : c.status === "INTERVIEW_COMPLETED" ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Hire ${c.name}? A congratulation email will be sent.`)) {
                              setError("");
                              decide.mutate({ id: c.id, decision: "HIRED" });
                            }
                          }}
                          isLoading={decide.isPending}
                        >
                          Hire
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            if (window.confirm(`Reject ${c.name}? A rejection email will be sent.`)) {
                              setError("");
                              decide.mutate({ id: c.id, decision: "REJECTED" });
                            }
                          }}
                          isLoading={decide.isPending}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Badge status={c.status} />
                    )}
                  </div>
                  {open && (
                    <div className="mt-3 ml-9">
                      <InterviewRecord
                        call={c.calls[0]}
                        aiScore={c.aiScore}
                        boardScore={c.boardScore}
                        finalScore={c.finalScore}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* PAGE                                                                */
/* ------------------------------------------------------------------ */

export function InterviewsClient() {
  const trpc = useTRPC();
  const { data: jobs, isLoading: jobsLoading } = useQuery(trpc.jobs.getAll.queryOptions());
  const { data: candidates, isLoading: candLoading } = useQuery(trpc.candidates.getAll.queryOptions());

  const [jobId, setJobId] = useState("");
  const [tab, setTab] = useState<Tab>("schedule");

  const selectedJobId = jobId || jobs?.[0]?.id || "";
  const job = jobs?.find((j) => j.id === selectedJobId);
  const jobCandidates = useMemo(
    () => (candidates ?? []).filter((c) => c.job.id === selectedJobId),
    [candidates, selectedJobId]
  );

  if (jobsLoading || candLoading) {
    return <div className="py-12 text-center text-sm text-gray-500">Loading interviews...</div>;
  }

  if (!jobs || jobs.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="py-12 text-center text-sm text-gray-500">Create a job first, then candidates can apply.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Interviews</h1>
          <p className="mt-1 text-sm text-gray-500">
            Shortlist, schedule and run the live board interview, then decide who gets the job.
          </p>
        </div>
        <Select
          label="Job"
          value={selectedJobId}
          onChange={(e) => setJobId(e.target.value)}
          options={jobs.map((j) => ({ value: j.id, label: j.title }))}
          className="sm:w-72"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.id
                ? "border-primary-600 text-primary-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedule" && (
        <SchedulePanel key={selectedJobId} candidates={jobCandidates} defaultDate={job?.interviewDate} />
      )}
      {tab === "live" && <LivePanel key={selectedJobId} candidates={jobCandidates} />}
      {tab === "review" && <ReviewPanel key={selectedJobId} candidates={jobCandidates} />}
      {tab === "results" && <ResultsPanel key={selectedJobId} candidates={jobCandidates} />}
    </div>
  );
}
