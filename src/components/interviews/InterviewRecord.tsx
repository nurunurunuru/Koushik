"use client";

import type { BoardEntry } from "@/src/lib/scoring";

// Text record of one finished interview (what the admin reads later):
// scores, the AI's Q&A transcript, the AI summary and the board members' questions/points.

interface CallLike {
  transcript?: string | null;
  boardEntries?: string | null;
  aiReport?: string | null;
  boardComment?: string | null;
  summary?: string | null;
}

interface Props {
  call: CallLike | null | undefined;
  aiScore?: number | null;
  boardScore?: number | null;
  finalScore?: number | null;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function InterviewRecord({ call, aiScore, boardScore, finalScore }: Props) {
  if (!call) {
    return <p className="text-sm text-gray-400">No interview record yet.</p>;
  }

  const entries = parseJson<BoardEntry[]>(call.boardEntries, []);
  const report = parseJson<{
    summary?: string;
    strengths?: string[];
    concerns?: string[];
    recommendation?: string;
  } | null>(call.aiReport, null);

  const lines = (call.transcript ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const idx = l.indexOf(":");
      return idx > 0
        ? { speaker: l.slice(0, idx), text: l.slice(idx + 1).trim() }
        : { speaker: "", text: l };
    });

  return (
    <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ["AI mark", aiScore],
          ["Board mark", boardScore],
          ["Final mark", finalScore],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg bg-gray-50 p-3">
            <p className="text-xl font-bold text-gray-900">{(value as number | null | undefined) ?? "—"}</p>
            <p className="text-xs text-gray-500">{label as string}</p>
          </div>
        ))}
      </div>

      {report?.summary && (
        <div className="rounded-lg bg-accent-50/50 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">AI summary</p>
          <p className="text-sm text-gray-700">{report.summary}</p>
          {report.strengths && report.strengths.length > 0 && (
            <p className="text-xs text-green-700">
              <strong>Strengths:</strong> {report.strengths.join("; ")}
            </p>
          )}
          {report.concerns && report.concerns.length > 0 && (
            <p className="text-xs text-red-700">
              <strong>Concerns:</strong> {report.concerns.join("; ")}
            </p>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">AI interview · questions &amp; answers</p>
        {lines.length > 0 ? (
          <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-3">
            {lines.map((line, i) => (
              <div
                key={i}
                className={`rounded-lg border p-2.5 text-sm ${
                  line.speaker === "AI Interviewer"
                    ? "border-indigo-100 bg-indigo-50"
                    : "border-blue-100 bg-white"
                }`}
              >
                {line.speaker && (
                  <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    {line.speaker}
                  </p>
                )}
                <p className="text-gray-700">{line.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No transcript was recorded.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-900">Board members&apos; questions &amp; candidate&apos;s replies</p>
        {entries.length > 0 ? (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {entries.map((e, i) => (
              <div key={i} className="px-3 py-2.5">
                <p className="text-sm font-medium text-gray-900">
                  {i + 1}. {e.question}
                </p>
                <p className="mt-0.5 rounded bg-gray-50 px-2 py-1 text-xs text-gray-600">
                  <strong>Reply:</strong> {e.answer || "— no reply recorded —"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">The board did not ask any question.</p>
        )}
        {call.boardComment && (
          <p className="mt-2 rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
            <strong>Board comment:</strong> {call.boardComment}
          </p>
        )}
      </div>
    </div>
  );
}
