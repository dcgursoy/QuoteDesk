"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function BuyerInvite({ callUrl }: { callUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(callUrl);
      setCopied(true);
      setError("");
    } catch {
      setError("Copy unavailable. Open the buyer page and copy its address.");
    }
  }

  return <section className="panel qr-panel">
    <div className="panel-heading"><h2>Invite the buyer</h2><span className="overline text-white/60">02 / CLARIFY</span></div>
    <div className="panel-content">
      <p className="text-lg font-medium">Scan. Tap. Talk.</p>
      <p className="field-help mt-2">The buyer scans this code on their phone to answer the missing details.</p>
      {callUrl ? <><div className="qr-paper"><QRCodeSVG value={callUrl} size={192} level="M" marginSize={2} title="Scan to open this quote’s buyer call" /></div>
        <div className="flex gap-2"><button className="secondary-button flex-1" onClick={() => void copy()}>{copied ? "Link copied" : "Copy link"}</button><a className="secondary-button flex-1" href={callUrl} target="_blank" rel="noreferrer">Open call ↗</a></div>
      </> : <p className="field-help mt-4">Set NEXT_PUBLIC_APP_URL to the deployed HTTPS address to enable phone calls.</p>}
      {error && <p className="field-help mt-3" role="alert">{error}</p>}
      <p className="field-help mt-4">Microphone access is optional. Typed answers are available on the same page.</p>
    </div>
  </section>;
}
