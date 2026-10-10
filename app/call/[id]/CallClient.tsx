"use client";

import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { useCallback, useEffect, useRef, useState } from "react";
import { MicrophoneCapture, PcmPlayer } from "@/lib/audio";
import Link from "next/link";

type Props = { quoteId: string; joinToken: string };
type Status = "ready" | "connecting" | "listening" | "ended" | "error";

// One entry in the readable conversation.
// "note" and "problem" are short messages about what the server saved.
type Line = {
  speaker: "assistant" | "buyer" | "note" | "problem";
  text: string;
  done: boolean; // false while more words may still arrive for this line
};

const valueNames: Record<string, string> = {
  AL6061: "6061 aluminum",
  AL7075: "7075 aluminum",
  SS304: "304 stainless steel",
  AS_MACHINED: "as machined",
  ANODIZE_CLEAR: "clear anodize",
  ANODIZE_BLACK: "black anodize",
};

// Turns the saved result from the server into short sentences a person can read.
function describeResult(result: Record<string, unknown>): string[] {
  const notes: string[] = [];
  const accepted = (result.accepted ?? {}) as Record<string, string | number>;

  const saved: string[] = [];
  if (accepted.materialGrade !== undefined) {
    saved.push(valueNames[String(accepted.materialGrade)] ?? String(accepted.materialGrade));
  }
  if (accepted.quantity !== undefined) {
    saved.push(`${accepted.quantity} ${Number(accepted.quantity) === 1 ? "piece" : "pieces"}`);
  }
  if (accepted.finish !== undefined) {
    saved.push(valueNames[String(accepted.finish)] ?? String(accepted.finish));
  }
  if (saved.length > 0) notes.push(`Saved to the quote: ${saved.join(", ")}`);

  const rejected = (result.rejected ?? []) as { field: string; reason: string }[];
  for (const item of rejected) notes.push(`Not saved: ${item.reason}`);

  if (result.priceRequest) notes.push("Price request passed to the estimator for review");
  if (result.status === "quoted" && saved.length > 0) {
    notes.push("All details are in. The quote is priced.");
  }
  return notes;
}

export default function CallClient({ quoteId, joinToken }: Props) {
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [textOnly, setTextOnly] = useState(false);
  const [logs, setLogs] = useState<string[]>(["Ready. Tap Start call."]);
  const [lines, setLines] = useState<Line[]>([]);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const microphoneRef = useRef<MicrophoneCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

  const log = useCallback((message: string) => {
    setLogs((current) => [
      ...current.slice(-19),
      `${new Date().toLocaleTimeString()}  ${message}`,
    ]);
  }, []);

  // Speech arrives a few words at a time. Join each piece onto the line that
  // speaker is still saying, or start a new line for them.
  const addSpeech = useCallback((speaker: "assistant" | "buyer", piece: string) => {
    if (!piece) return;
    setLines((current) => {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        if (current[i].speaker === speaker && !current[i].done) {
          const next = [...current];
          next[i] = { ...current[i], text: current[i].text + piece };
          return next;
        }
      }
      return [...current, { speaker, text: piece.trimStart(), done: false }];
    });
  }, []);

  // Adds a finished line, such as a typed answer or a note about a save.
  const addLine = useCallback((speaker: Line["speaker"], text: string) => {
    setLines((current) => [...current, { speaker, text, done: true }]);
  }, []);

  // Called when a turn ends, so the next words start a new line.
  const finishLines = useCallback(() => {
    setLines((current) =>
      current.some((line) => !line.done)
        ? current.map((line) => (line.done ? line : { ...line, done: true }))
        : current,
    );
  }, []);

  // Keep the newest line in view.
  useEffect(() => {
    const box = conversationRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lines]);

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
    setLines([]);
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
          onmessage: async (message) => {
            if (message.serverContent?.interrupted) player.clear();
            for (const part of message.serverContent?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) player.enqueue(part.inlineData.data);
            }
            // Gemini also sends the words of both speakers as text.
            addSpeech("buyer", message.serverContent?.inputTranscription?.text ?? "");
            addSpeech("assistant", message.serverContent?.outputTranscription?.text ?? "");
            if (message.serverContent?.turnComplete || message.serverContent?.interrupted) {
              finishLines();
            }
            if (message.toolCall?.functionCalls?.length) {
              const functionResponses = [];
              for (const call of message.toolCall.functionCalls) {
                  log(`TOOL ${call.name}: ${JSON.stringify(call.args)}`);
                  const callId = call.id || crypto.randomUUID();
                  let result: Record<string, unknown>;
                  try {
                    let response: Response | undefined;
                    for (let attempt = 0; attempt < 3; attempt++) {
                      response = await fetch(`/api/quotes/${quoteId}/answers`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ joinToken, callId, tool: call.name, args: call.args ?? {} }),
                      });
                      if (response.status !== 409) break;
                      await new Promise(resolve => setTimeout(resolve, 400));
                    }
                    result = await response!.json();
                    if (!response!.ok) throw new Error(String(result.error || "Answer could not be saved"));
                    log(`SAVED ${JSON.stringify(result)}`);
                    for (const note of describeResult(result)) {
                      addLine(note.startsWith("Not saved") ? "problem" : "note", note);
                    }
                  } catch (caught) {
                    const detail = caught instanceof Error ? caught.message : "Answer could not be saved";
                    setError(detail);
                    log(`SAVE ERROR ${detail}`);
                    addLine("problem", `Not saved: ${detail}`);
                    result = { error: detail, saved: false, instruction: "Do not claim this answer was saved or invent prices. Ask the buyer to retry." };
                  }
                  functionResponses.push({
                    id: call.id,
                    name: call.name,
                    response: result,
                  });
              }
              if (sessionRef.current === session) session.sendToolResponse({ functionResponses });
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
      finishLines();
      addLine("buyer", text);
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

        </div>
        <div className="conversation" ref={conversationRef} aria-live="polite">
          {lines.length === 0 ? (
            <p className="field-help">The conversation appears here once the call starts.</p>
          ) : (
            lines.map((line, index) =>
              line.speaker === "note" || line.speaker === "problem" ? (
                <p className={`conversation-note ${line.speaker === "problem" ? "problem" : ""}`} key={index}>
                  {line.text}
                </p>
              ) : (
                <div className={`conversation-line ${line.speaker}`} key={index}>
                  <span className="conversation-speaker">{line.speaker === "assistant" ? "Quote Desk" : "You"}</span>
                  <p>{line.text}</p>
                </div>
              ),
            )
          )}
        </div>
        <form
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
