"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/src/trpc/client";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import {
  AI_WEIGHT,
  BOARD_WEIGHT,
  type BoardEntry,
} from "@/src/lib/scoring";

// Live board interview for ONE candidate (company side).
// - the AI interviewer (Gemini Live) asks questions and listens through the laptop speaker / mic
// - after the AI interview is saved, board members ask questions that appear for the candidate at the bottom;
//   the candidate replies. Those replies are NOT marked here: the board reads them later in
//   "Board Review" and gives one mark, which is added to the AI mark.
// No camera and no video recording is used.

const GEMINI_MODEL = "gemini-3.1-flash-live-preview";
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

interface TranscriptItem {
  speaker: "candidate" | "ai";
  text: string;
}

type Phase = "idle" | "connecting" | "live" | "aiDone" | "saving" | "saved";

const arrayBufferToBase64 = (buffer: ArrayBufferLike): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
};

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

const float32To16BitPCM = (input: Float32Array): Int16Array => {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

const resampleTo16k = (input: Float32Array, rate: number): Float32Array => {
  if (rate === INPUT_SAMPLE_RATE) return input;
  const ratio = rate / INPUT_SAMPLE_RATE;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
};

interface Props {
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  onClose: () => void; // back to the queue
}

export function BoardInterviewSession({ candidateId, candidateName, jobTitle, onClose }: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const startInterview = useMutation(trpc.calls.startBoardInterview.mutationOptions());
  const completeInterview = useMutation(trpc.calls.completeBoardInterview.mutationOptions());
  const cancelInterview = useMutation(trpc.calls.cancelBoardInterview.mutationOptions());
  const updateBoard = useMutation(trpc.calls.updateBoardEntries.mutationOptions());

  const [phase, setPhase] = useState<Phase>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [result, setResult] = useState<{
    aiScore: number | null;
    boardScore: number | null;
    finalScore: number | null;
  } | null>(null);

  // Board members' box
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [qText, setQText] = useState("");
  const [qAnswer, setQAnswer] = useState("");
  const [currentQ, setCurrentQ] = useState<string | null>(null); // question now shown to the candidate
  const [readAloud, setReadAloud] = useState(true);
  const [paused, setPaused] = useState(false);
  const [dictating, setDictating] = useState(false);
  const [dictLang, setDictLang] = useState("en-US");

  const callIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const playingRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const liveRef = useRef(false);
  const transcriptRef = useRef<TranscriptItem[]>([]);
  const inputBufRef = useRef("");
  const outputBufRef = useRef("");
  const entriesRef = useRef<BoardEntry[]>([]);
  const pausedRef = useRef(false);
  const finishingRef = useRef(false);
  const savingRef = useRef(false);
  const busyAtRef = useRef(0);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const pushTranscript = useCallback((speaker: TranscriptItem["speaker"], text: string) => {
    const clean = text.trim();
    if (!clean) return;
    transcriptRef.current = [...transcriptRef.current, { speaker, text: clean }];
    setTranscript(transcriptRef.current);
  }, []);

  const flushBuffers = useCallback(() => {
    pushTranscript("candidate", inputBufRef.current);
    pushTranscript("ai", outputBufRef.current);
    inputBufRef.current = "";
    outputBufRef.current = "";
  }, [pushTranscript]);

  const stopPlayback = useCallback(() => {
    playingRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
      try {
        src.disconnect();
      } catch {}
    });
    playingRef.current.clear();
    nextPlayTimeRef.current = outputCtxRef.current?.currentTime ?? 0;
    setIsSpeaking(false);
  }, []);

  const releaseAudio = useCallback(() => {
    stopPlayback();
    const processor = processorRef.current;
    if (processor) {
      try {
        processor.onaudioprocess = null;
        processor.disconnect();
      } catch {}
    }
    processorRef.current = null;
    try {
      inputSourceRef.current?.disconnect();
    } catch {}
    inputSourceRef.current = null;
    void inputCtxRef.current?.close().catch(() => {});
    inputCtxRef.current = null;
    void outputCtxRef.current?.close().catch(() => {});
    outputCtxRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {}
    });
    micStreamRef.current = null;
    nextPlayTimeRef.current = 0;
  }, [stopPlayback]);

  // Stops the AI part (connection + mic + speaker). Board questions can follow afterwards.
  const endAi = useCallback(() => {
    if (!liveRef.current) return;
    liveRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close();
      } catch {}
    }
    flushBuffers();
    releaseAudio();
    setPhase((p) => (p === "live" || p === "connecting" ? "aiDone" : p));
  }, [flushBuffers, releaseAudio]);

  const playAudio = useCallback(async (base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx || !base64) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      const pcm = new Int16Array(base64ToArrayBuffer(base64));
      if (!pcm.length) return;
      const buffer = ctx.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startAt + buffer.duration;
      playingRef.current.add(src);
      setIsSpeaking(true);
      src.onended = () => {
        playingRef.current.delete(src);
        try {
          src.disconnect();
        } catch {}
        if (playingRef.current.size === 0) setIsSpeaking(false);
      };
      src.start(startAt);
    } catch (e) {
      console.error("Audio playback error:", e);
    }
  }, []);

  const startMic = useCallback(() => {
    const stream = micStreamRef.current;
    if (!stream) throw new Error("Microphone is not available.");
    const ctx = new AudioContext();
    inputCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    inputSourceRef.current = source;
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (event) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !liveRef.current) return;
      if (pausedRef.current) return; // board member is asking: the AI does not listen
      try {
        const input = event.inputBuffer.getChannelData(0);
        const pcm = float32To16BitPCM(resampleTo16k(input, ctx.sampleRate));
        ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: { mimeType: "audio/pcm;rate=16000", data: arrayBufferToBase64(pcm.buffer) },
            },
          })
        );
      } catch (e) {
        console.error("Mic streaming error:", e);
      }
    };
    source.connect(processor);
    processor.connect(ctx.destination);
  }, []);

  // The AI said the closing sentence / called end_interview -> wait until its last words have
  // finished playing, then end the call and save automatically.
  const autoFinish = useCallback(() => {
    if (finishingRef.current || !liveRef.current) return;
    finishingRef.current = true;
    busyAtRef.current = Date.now();
    const startedWaiting = Date.now();
    const timer = window.setInterval(() => {
      if (playingRef.current.size > 0) busyAtRef.current = Date.now();
      const quietFor = Date.now() - busyAtRef.current;
      if (quietFor > 1200 || Date.now() - startedWaiting > 20000) {
        window.clearInterval(timer);
        void saveRef.current();
      }
    }, 400);
  }, []);

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        let raw: string;
        if (typeof event.data === "string") raw = event.data;
        else if (event.data instanceof Blob) raw = await event.data.text();
        else if (event.data instanceof ArrayBuffer) raw = new TextDecoder().decode(event.data);
        else return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const message: any = JSON.parse(raw);

        if (message.setupComplete) {
          try {
            startMic();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not start the microphone.");
            endAi();
            return;
          }
          setPhase("live");
          window.setTimeout(() => {
            const ws = wsRef.current;
            if (!liveRef.current || !ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(
              JSON.stringify({
                realtimeInput: {
                  text: `Start the interview now. Candidate: ${candidateName}. Position: ${jobTitle}. Greet the candidate by name, tell them the board is present, and ask the first question.`,
                },
              })
            );
          }, 300);
          return;
        }

        if (message.error) {
          setError(
            typeof message.error?.message === "string" ? message.error.message : "Gemini Live error."
          );
          endAi();
          return;
        }

        // The AI calls end_interview after the closing sentence
        const calls = message.toolCall?.functionCalls;
        if (Array.isArray(calls) && calls.length > 0) {
          const ws = wsRef.current;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                toolResponse: {
                  functionResponses: calls.map((c: { id?: string; name?: string }) => ({
                    id: c.id,
                    name: c.name,
                    response: { result: "ok" },
                  })),
                },
              })
            );
          }
          if (calls.some((c: { name?: string }) => c.name === "end_interview")) autoFinish();
          return;
        }

        const sc = message.serverContent;
        if (!sc) return;

        if (sc.interrupted) {
          stopPlayback();
          outputBufRef.current = "";
        }

        if (Array.isArray(sc.modelTurn?.parts)) {
          for (const part of sc.modelTurn.parts) {
            const inline = part.inlineData;
            if (
              inline &&
              typeof inline.data === "string" &&
              String(inline.mimeType || "").startsWith("audio/")
            ) {
              await playAudio(inline.data);
            }
          }
        }

        if (typeof sc.inputTranscription?.text === "string") {
          inputBufRef.current += sc.inputTranscription.text;
        }
        if (typeof sc.outputTranscription?.text === "string") {
          outputBufRef.current += sc.outputTranscription.text;
          // fallback in case the function call does not arrive
          if (/concludes the ai interview/i.test(outputBufRef.current)) autoFinish();
        }

        if (sc.turnComplete) {
          flushBuffers();
        }
      } catch (e) {
        console.error("Failed to process Gemini message:", e);
      }
    },
    [candidateName, jobTitle, endAi, autoFinish, flushBuffers, playAudio, startMic, stopPlayback]
  );

  const handleStart = async () => {
    setError(null);
    setResult(null);
    transcriptRef.current = [];
    setTranscript([]);
    inputBufRef.current = "";
    outputBufRef.current = "";
    finishingRef.current = false;
    savingRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setPhase("connecting");

    try {
      // 1) create the interview record + get the (hidden) questions
      const session = await startInterview.mutateAsync({ candidateId });
      callIdRef.current = session.callId;

      // 2) microphone
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone access.");
      }
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      // 3) short-lived Gemini token (admin only)
      const tokenRes = await fetch("/api/gemini-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: session.candidateName,
          jobTitle: session.jobTitle,
          questions: session.questions,
        }),
        cache: "no-store",
      });
      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokenData.success || !tokenData.token) {
        throw new Error(tokenData.error || "Failed to create the AI interview session.");
      }

      // 4) speaker output
      const outCtx = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
      outputCtxRef.current = outCtx;
      if (outCtx.state === "suspended") await outCtx.resume();

      // 5) connect Gemini Live
      liveRef.current = true;
      startedAtRef.current = Date.now();
      const ws = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(
          tokenData.token
        )}`
      );
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: { model: `models/${GEMINI_MODEL}` } }));
      };
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        setError("Connection to the AI interviewer failed.");
        endAi();
      };
      ws.onclose = (ev) => {
        if (liveRef.current) {
          setError(ev.reason || "The AI connection was closed.");
          endAi();
        }
      };
    } catch (e) {
      console.error("Failed to start interview:", e);
      liveRef.current = false;
      releaseAudio();
      setError(e instanceof Error ? e.message : "Failed to start the interview.");
      setPhase(callIdRef.current ? "aiDone" : "idle");
    }
  };

  const setAiPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPaused(value);
    const ws = wsRef.current;
    if (value && ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } catch {}
    }
  }, []);

  const stopDictation = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    setDictating(false);
  }, []);

  // Browser speech-to-text (Chrome / Edge) so the candidate's answer to a board question is typed automatically
  const startDictation = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setError("Voice dictation needs Chrome or Edge. You can also type the answer.");
      return;
    }
    setError(null);
    const base = qAnswer ? qAnswer.trim() + " " : "";
    const rec = new SR();
    rec.lang = dictLang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript + " ";
      setQAnswer(base + text.trim());
    };
    rec.onerror = () => setDictating(false);
    rec.onend = () => setDictating(false);
    recognitionRef.current = rec;
    setDictating(true);
    rec.start();
  };

  // Saves the board entries to the database every time they change (nothing is lost)
  const persistEntries = async (next: BoardEntry[]) => {
    setEntries(next);
    entriesRef.current = next;
    if (!callIdRef.current) return;
    setError(null);
    try {
      const res = await updateBoard.mutateAsync({ callId: callIdRef.current, boardEntries: next });
      setResult(res);
      queryClient.invalidateQueries({ queryKey: trpc.candidates.getAll.queryKey() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the reply.");
    }
  };

  // Board member types a question -> it is shown to the candidate at the bottom of this page
  const askQuestion = () => {
    const question = qText.trim();
    if (!question) return;
    stopDictation();
    setCurrentQ(question);
    setQText("");
    setQAnswer("");
    if (readAloud && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(question));
    }
  };

  // Candidate has replied -> question + reply are saved (the board marks them later in Board Review)
  const saveAnswer = async () => {
    if (!currentQ) return;
    stopDictation();
    const entry: BoardEntry = { question: currentQ, answer: qAnswer.trim() || undefined };
    setCurrentQ(null);
    setQAnswer("");
    await persistEntries([...entriesRef.current, entry]);
  };

  const removeEntry = (index: number) =>
    persistEntries(entriesRef.current.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!callIdRef.current || savingRef.current) return;
    savingRef.current = true;
    stopDictation();
    setAiPaused(false);
    endAi(); // make sure the AI part is stopped and the last words are in the transcript
    setPhase("saving");
    setError(null);
    const text = transcriptRef.current
      .map((t) => `${t.speaker === "ai" ? "AI Interviewer" : "Candidate"}: ${t.text}`)
      .join("\n");
    try {
      const res = await completeInterview.mutateAsync({
        callId: callIdRef.current,
        transcript: text,
        duration: startedAtRef.current
          ? Math.round((Date.now() - startedAtRef.current) / 1000)
          : undefined,
        boardEntries: entriesRef.current,
      });
      setResult({ aiScore: res.aiScore, boardScore: res.boardScore, finalScore: res.finalScore });
      setPhase("saved");
      queryClient.invalidateQueries({ queryKey: trpc.candidates.getAll.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.calls.getAll.queryKey() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the interview.");
      savingRef.current = false;
      finishingRef.current = false;
      setPhase("aiDone");
    }
  };
  saveRef.current = handleSave;

  const handleCancel = async () => {
    endAi();
    if (callIdRef.current && phase !== "saved") {
      await cancelInterview.mutateAsync({ callId: callIdRef.current }).catch(() => {});
    }
    onClose();
  };

  // Warn before leaving while the interview is running
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (liveRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      liveRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {}
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        ws?.close();
      } catch {}
      releaseAudio();
    };
  }, [releaseAudio]);

  const running = phase === "live" || phase === "connecting";
  const statusText =
    phase === "connecting"
      ? "Connecting..."
      : phase === "live"
      ? isSpeaking
        ? "AI is speaking"
        : "Listening"
      : phase === "aiDone"
      ? "AI interview finished"
      : phase === "saving"
      ? "Saving..."
      : phase === "saved"
      ? "Saved"
      : "Ready";

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                Live board interview
              </p>
              <h2 className="text-2xl font-bold text-gray-900">{candidateName}</h2>
              <p className="text-sm text-gray-500">{jobTitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  phase === "live"
                    ? "bg-emerald-50 text-emerald-700"
                    : phase === "connecting" || phase === "saving"
                    ? "bg-yellow-50 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    phase === "live" ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                  }`}
                />
                {statusText}
              </span>

              {phase === "idle" && (
                <Button onClick={handleStart} isLoading={startInterview.isPending}>
                  Start AI Interview
                </Button>
              )}
              {phase === "live" && (
                <Button variant="danger" onClick={endAi}>
                  End AI Interview
                </Button>
              )}
              {phase !== "saved" && phase !== "saving" && (
                <Button variant="secondary" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI interview: live status + transcript */}
      <Card>
        <CardContent className="px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">AI Interviewer · Question &amp; Answer</p>
            <p className="text-xs text-gray-400">
              {transcript.length} turn{transcript.length !== 1 ? "s" : ""}
            </p>
          </div>

          {phase === "live" && (
            <div className="flex h-10 items-center justify-center gap-1.5 overflow-hidden rounded-lg bg-primary-50">
              {Array.from({ length: 28 }).map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 rounded-full transition-all ${
                    isSpeaking ? "animate-pulse bg-primary-500" : "bg-gray-300"
                  }`}
                  style={{
                    height: isSpeaking ? `${10 + ((i * 17) % 25)}px` : "5px",
                    animationDelay: `${i * 0.04}s`,
                  }}
                />
              ))}
            </div>
          )}

          {phase === "idle" && (
            <p className="text-sm text-gray-500">
              Press <strong>Start AI Interview</strong> when {candidateName} is seated. Allow the
              microphone when the browser asks. The AI will greet the candidate and start asking
              questions through the speaker. The questions are not shown on the screen.
            </p>
          )}

          {transcript.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
              {transcript.map((t, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-2.5 text-sm ${
                    t.speaker === "ai"
                      ? "border-indigo-100 bg-indigo-50"
                      : "border-blue-100 bg-white"
                  }`}
                >
                  <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    {t.speaker === "ai" ? "AI Interviewer" : "Candidate"}
                  </p>
                  <p className="text-gray-700">{t.text}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Board members' questions (after the AI interview) */}
      <Card>
        <CardContent className="px-6 py-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-gray-900">Board Members&apos; Questions</p>
              <p className="text-xs text-gray-500">
                After the AI interview is finished, a board member types a question here. It appears at the
                bottom of this page for the candidate, who replies. The board reads all replies later in the Board Review section and gives its mark.
              </p>
            </div>
            <div className="rounded-lg bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary-700">
              Replies saved: {entries.length}
            </div>
          </div>

          {phase !== "saved" ? (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
              The board&apos;s questions start after the AI interview is finished and saved.
            </p>
          ) : (
            <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label className="block text-xs font-medium text-gray-600">Board member&apos;s question</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={qText}
                  onChange={(e) => setQText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      askQuestion();
                    }
                  }}
                  placeholder="e.g. How do you handle a tight deadline?"
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <Button onClick={askQuestion} disabled={!qText.trim() || !!currentQ}>
                  Ask candidate
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={readAloud}
                  onChange={(e) => setReadAloud(e.target.checked)}
                />
                Read the question aloud
              </label>
              {currentQ && (
                <p className="text-xs text-primary-700">
                  A question is waiting for the candidate&apos;s reply (see the bottom of the page).
                </p>
              )}
            </div>
          )}

          {entries.length > 0 && (
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {entries.map((entry, i) => (
                <div key={i} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {i + 1}. {entry.question}
                    </p>
                    {entry.answer && (
                      <p className="mt-1 rounded bg-white px-2 py-1 text-xs text-gray-600">
                        <strong>Reply:</strong> {entry.answer}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void removeEntry(i)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom of the page: the board's question for the candidate + the candidate's reply */}
      {currentQ && (
        <Card className="ring-2 ring-primary-500">
          <CardContent className="px-6 py-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                Question for {candidateName}
              </p>
              <p className="mt-2 text-2xl font-semibold text-gray-900">{currentQ}</p>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Candidate&apos;s reply</label>
                <div className="flex items-center gap-2">
                  <select
                    value={dictLang}
                    onChange={(e) => setDictLang(e.target.value)}
                    disabled={dictating}
                    className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
                  >
                    <option value="en-US">English</option>
                    <option value="bn-BD">বাংলা</option>
                  </select>
                  <button
                    type="button"
                    onClick={dictating ? stopDictation : startDictation}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      dictating ? "bg-red-600 text-white" : "bg-primary-600 text-white hover:bg-primary-700"
                    }`}
                  >
                    {dictating ? "⏹ Stop" : "🎤 Speak your reply"}
                  </button>
                </div>
              </div>
              <textarea
                value={qAnswer}
                onChange={(e) => setQAnswer(e.target.value)}
                rows={4}
                placeholder="Speak your reply (it is typed automatically) or type it here"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <Button onClick={() => void saveAnswer()} isLoading={updateBoard.isPending}>
                Save reply
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  stopDictation();
                  setCurrentQ(null);
                  setQAnswer("");
                }}
              >
                Skip question
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Finish */}
      {phase !== "saved" ? (
        <Card>
          <CardContent className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Automatic finish</p>
              <p className="text-xs text-gray-500">
                When the AI finishes its interview the call ends and the AI mark is saved automatically.
                Then the board asks its questions.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void handleSave()}
              isLoading={phase === "saving"}
              disabled={phase === "idle" || phase === "connecting"}
            >
              {running ? "End & Save Now" : "Save AI Interview"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 px-6 py-6 text-center">
            <p className="text-sm font-semibold text-emerald-700">
              AI interview ended and saved for {candidateName}
            </p>
            <div className="mx-auto grid max-w-md grid-cols-2 gap-3">
              <ScoreBox label="AI mark" value={result?.aiScore} />
              <ScoreBox label="Board mark" value={result?.boardScore} pending="Given in Board Review" />
            </div>
            <p className="text-xs text-gray-500">
              The candidate&apos;s replies to the board&apos;s questions are not marked automatically. Open the
              <strong> Board Review</strong> tab: the board reads the replies and gives one mark. Final mark =
              {" "}{Math.round(AI_WEIGHT * 100)}% AI mark + {Math.round(BOARD_WEIGHT * 100)}% board mark.
            </p>
            <Button onClick={onClose} disabled={!!currentQ}>
              Finish · back to interview queue
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreBox({
  label,
  value,
  highlight,
  pending,
}: {
  label: string;
  value: number | null | undefined;
  highlight?: boolean;
  pending?: string;
}) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-primary-600 text-white" : "bg-gray-50 text-gray-900"}`}>
      <p className="text-2xl font-bold">{value ?? "—"}</p>
      <p className={`text-xs ${highlight ? "text-primary-100" : "text-gray-500"}`}>
        {value == null && pending ? pending : label}
      </p>
    </div>
  );
}
