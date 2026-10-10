"use client";

import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { MicrophoneCapture, PcmPlayer } from "@/lib/audio";

type Props = { quoteId: string; joinToken: string };
type Status = "ready" | "connecting" | "listening" | "ended" | "error";

const fakeAnswerResult = {
  accepted: {},
  rejected: [],
  missing: ["materialGrade", "quantity", "finish"],
  status: "clarifying",
  options: null,
};

export default function CallClient({ quoteId, joinToken }: Props) {
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>(["Ready. Tap Start call."]);
  const sessionRef = useRef<Session | null>(null);
  const microphoneRef = useRef<MicrophoneCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

  const log = useCallback((message: string) => {
    setLogs((current) => [
      ...current.slice(-19),
      `${new Date().toLocaleTimeString()}  ${message}`,
    ]);
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    try {
      session?.sendRealtimeInput({ audioStreamEnd: true });
      session?.close();
    } catch {
      // The session may already be closed.
    }
    await microphoneRef.current?.stop();
    await playerRef.current?.stop();
    microphoneRef.current = null;
    playerRef.current = null;
    setStatus("ended");
    log("Call ended.");
  }, [log]);

  useEffect(
    () => () => {
      void microphoneRef.current?.stop();
      void playerRef.current?.stop();
      try {
        sessionRef.current?.close();
      } catch {
        // The session may already be closed.
      }
    },
    [],
  );

  async function start() {
    if (status === "connecting" || status === "listening") return;
    setError("");
    setStatus("connecting");
    log("Requesting microphone and a short-lived token...");

    try {
      const microphone = new MicrophoneCapture();
      const player = new PcmPlayer();
      microphoneRef.current = microphone;
      playerRef.current = player;
      await player.start();

      const tokenResponse = await fetch(
        `/api/quotes/${quoteId}/voice-token`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ joinToken }),
        },
      );
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(tokenData.error ?? "Token request failed");
      }

      const ai = new GoogleGenAI({ apiKey: tokenData.token });
      const session: Session = await ai.live.connect({
        model: tokenData.model,
        config: { responseModalities: [Modality.AUDIO] },
        callbacks: {
          onopen: () => log("Gemini Live connected."),
          onmessage: (message) => {
            if (message.serverContent?.interrupted) player.clear();
            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) player.enqueue(part.inlineData.data);
            }
            if (message.toolCall?.functionCalls?.length) {
              const functionResponses = message.toolCall.functionCalls.map(
                (call) => {
                  log(`TOOL ${call.name}: ${JSON.stringify(call.args)}`);
                  return {
                    id: call.id,
                    name: call.name,
                    response: {
                      ...fakeAnswerResult,
                      accepted:
                        call.name === "record_answers" ? call.args ?? {} : {},
                    },
                  };
                },
              );
              session.sendToolResponse({ functionResponses });
            }
          },
          onerror: (event) => {
            setError(event.message || "Gemini connection error");
            setStatus("error");
            log(`ERROR ${event.message}`);
          },
          onclose: (event) => {
            log(
              `Gemini connection closed: ${event.reason || "no reason provided"}`,
            );
            setStatus((current) =>
              current === "error" ? current : "ended",
            );
          },
        },
      });

      sessionRef.current = session;
      await microphone.start((base64, sampleRate) => {
        session.sendRealtimeInput({
          audio: {
            data: base64,
            mimeType: `audio/pcm;rate=${sampleRate}`,
          },
        });
      });
      setStatus("listening");
      log("Microphone streaming. Say your material, quantity, and finish.");
      session.sendRealtimeInput({
        text: "The buyer just joined. Greet them and ask for all missing quote details.",
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Could not start the call";
      setError(message);
      setStatus("error");
      log(`ERROR ${message}`);
      await microphoneRef.current?.stop();
      await playerRef.current?.stop();
    }
  }

  const statusText = {
    ready: "Ready to start",
    connecting: "Connecting...",
    listening: "Live — speak naturally",
    ended: "Call ended",
    error: "Could not connect",
  }[status];

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-zinc-950">
      <section className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-7 shadow-xl sm:p-12">
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-700">
          Quote Desk · BRKT-104 Rev B
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Answer three quote questions.
        </h1>
        <p className="mt-5 text-lg leading-8 text-zinc-600">
          Try: “6061 aluminum, 50 pieces, clear anodize.” Watch the log for a
          structured <code>record_answers</code> call.
        </p>

        <div className="my-6 flex items-center gap-3 rounded-2xl bg-zinc-100 px-4 py-4 font-semibold">
          <span
            className={`h-3 w-3 rounded-full ${status === "listening" ? "bg-emerald-500 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]" : "bg-zinc-400"}`}
          />
          {statusText}
        </div>

        {error ? <p className="mb-5 text-red-700">{error}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-13 rounded-full bg-emerald-700 px-6 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={start}
            disabled={status === "connecting" || status === "listening"}
          >
            {status === "ended" || status === "error"
              ? "Try again"
              : "Start call"}
          </button>
          <button
            className="min-h-13 rounded-full bg-zinc-200 px-6 font-bold disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void stop()}
            disabled={status !== "listening"}
          >
            End call
          </button>
        </div>

        <div
          className="mt-6 min-h-40 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-zinc-950 p-4 font-mono text-xs leading-6 text-emerald-200"
          aria-live="polite"
        >
          {logs.join("\n")}
        </div>
      </section>
    </main>
  );
}
