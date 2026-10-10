"use client";

import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { MicrophoneCapture, PcmPlayer } from "@/lib/audio";
import Link from "next/link";

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
  const [typedAnswer, setTypedAnswer] = useState("");
  const [textOnly, setTextOnly] = useState(false);
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

  async function start(useTextOnly = false) {
    if (status === "connecting" || status === "listening") return;
    setError("");
    setTextOnly(useTextOnly);
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
      if (!useTextOnly) {
        try {
          await microphone.start((base64, sampleRate) => {
            if (sessionRef.current !== session) return;
            session.sendRealtimeInput({
              audio: {
                data: base64,
                mimeType: `audio/pcm;rate=${sampleRate}`,
              },
            });
          });
        } catch {
          await microphone.stop();
          microphoneRef.current = null;
          setTextOnly(true);
          log("Microphone unavailable. Type your answers below; Gemini can still reply aloud.");
        }
      }
      setStatus("listening");
      log("Conversation ready. Speak or type your material, quantity, and finish.");
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
      try { sessionRef.current?.close(); } catch { /* already closed */ }
      sessionRef.current = null;
    }
  }

  function sendTypedAnswer() {
    const text = typedAnswer.trim();
    const session = sessionRef.current;
    if (!text || !session || status !== "listening") return;
    try {
      playerRef.current?.clear();
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      });
      log(`BUYER (typed): ${text}`);
      setTypedAnswer("");
    } catch {
      setError("Your answer could not be sent. Restart the call and try again.");
    }
  }

  const statusText = {
    ready: "Ready to start",
    connecting: "Connecting...",
    listening: textOnly ? "Live — type your answers below" : "Live — speak or type",
    ended: "Call ended",
    error: "Could not connect",
  }[status];

  return (
    <main className="call-shell"><header className="desk-header"><Link className="wordmark" href="/">Quote<span>Desk</span><i /></Link><span className="header-note">BUYER CALL</span></header>
      <section className="panel call-card"><div className="call-intro">
        <p className="overline">
          A FEW DETAILS TO FINISH YOUR QUOTE
        </p>
        <h1 className="">
          Let’s clarify your request.
        </h1>
        <p className="subheading">
          Talk with our assistant about material, quantity, and finish. You can also type your answers below.
        </p>

        <div className="call-status">
          <span
            className={`status-dot ${status === "listening" ? "live" : ""}`}
          />
          {statusText}
        </div>

        {error ? <p className="mb-5 text-red-700">{error}</p> : null}

        <div className="call-actions">
          <button
            className="primary-button"
            onClick={() => void start()}
            disabled={status === "connecting" || status === "listening"}
          >
            {status === "ended" || status === "error"
              ? "Try again"
              : "Start call"}
          </button>
          <button
            className="secondary-button"
            onClick={() => void start(true)}
            disabled={status === "connecting" || status === "listening"}
          >
            Start with typing
          </button>
          <button
            className="secondary-button"
            onClick={() => void stop()}
            disabled={status !== "listening"}
          >
            End call
          </button>
        </div>

        </div><form
          className="answer-form"
          onSubmit={(event) => {
            event.preventDefault();
            sendTypedAnswer();
          }}
        >
          <label htmlFor="buyer-answer" className="field-label">
            Or type your answer
          </label>
          <p id="answer-help" className="field-help">
            {status === "listening"
              ? "Gemini will reply aloud and process this just like a spoken answer."
              : "Start a call or choose Start with typing first."}
          </p>
          <div className="answer-controls">
            <input
              id="buyer-answer"
              aria-describedby="answer-help"
              className="desk-input"
              value={typedAnswer}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="Actually, make that 75 pieces"
              disabled={status !== "listening"}
            />
            <button
              type="submit"
              className="primary-button"
              disabled={status !== "listening" || !typedAnswer.trim()}
            >
              Send
            </button>
          </div>
        </form>

      </section><details className="debug-panel"><summary>Connection details</summary><div className="debug-log" aria-live="polite">{logs.join("\n")}</div></details>
    </main>
  );
}
