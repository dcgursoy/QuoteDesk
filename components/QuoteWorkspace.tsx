"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { QuoteRow, QuoteSpec } from "@/lib/types";
import BuyerInvite from "./BuyerInvite";

const labels: Record<keyof QuoteSpec, string> = {
  partNumber: "Part number", revision: "Revision", lengthMm: "Length", widthMm: "Width",
  thicknessMm: "Thickness", holeCount: "Hole count", generalToleranceMm: "General tolerance",
  materialGrade: "Material grade", quantity: "Quantity", finish: "Finish",
};
const names: Record<string, string> = {
  AL6061: "6061 aluminum", AL7075: "7075 aluminum", SS304: "304 stainless steel",
  AS_MACHINED: "As machined", ANODIZE_CLEAR: "Clear anodize", ANODIZE_BLACK: "Black anodize",
};
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function QuoteWorkspace({ initialRow, cached, baseUrl }: {
  initialRow: QuoteRow; cached: boolean; baseUrl: string;
}) {
  const [row, setRow] = useState(initialRow);
  const [elapsed, setElapsed] = useState(0);
  const [connectionError, setConnectionError] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");

  // Puts this quote back to the moment right after intake, ready for the next demo run.
  // It keeps what was read from the email and drawing and clears what the buyer said.
  async function resetQuote() {
    setResetting(true);
    setResetError("");
    try {
      const response = await fetch(`/api/quotes/${row.id}/reset`, { method: "POST" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Reset failed");
      setRow({ ...next, priceRequests: [] });
      setConfirmReset(false);
    } catch (error) { setResetError(error instanceof Error ? error.message : "Reset failed"); }
    finally { setResetting(false); }
  }

  async function approve() {
    setApproving(true);
    setApprovalError("");
    try {
      const response = await fetch(`/api/quotes/${row.id}/approve`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinToken: row.join_token, version: row.version }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Approval failed");
      setRow(current => next.version >= current.version ? { ...next, priceRequests: next.priceRequests ?? current.priceRequests } : current);
    } catch (error) { setApprovalError(error instanceof Error ? error.message : "Approval failed"); }
    finally { setApproving(false); }
  }

  useEffect(() => {
    const id = initialRow.id;
    let active = true;
    let loading = false;
    const accept = (next: QuoteRow) => {
      if (active && next.id === id) setRow(current => next.version >= current.version ? { ...next, priceRequests: next.priceRequests ?? current.priceRequests } : current);
    };
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch(`/api/quotes/${id}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not refresh quote");
        accept(await response.json());
        if (active) setConnectionError(false);
      } catch { if (active) setConnectionError(true); }
      finally { loading = false; }
    }
    const poll = setInterval(() => void load(), 2000);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const supabase = url && key ? createClient(url, key) : null;
    const channel = supabase?.channel(`quote-screen:${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quotes", filter: `id=eq.${id}` }, payload => accept(payload.new as QuoteRow))
      .subscribe();
    return () => { active = false; clearInterval(poll); if (channel) void supabase?.removeChannel(channel); };
  }, [initialRow.id]);

  useEffect(() => {
    const update = () => setElapsed(Math.max(0, ((row.quoted_at ? Date.parse(row.quoted_at) : Date.now()) - Date.parse(row.intake_at)) / 1000));
    update();
    const timer = setInterval(update, 100);
    return () => clearInterval(timer);
  }, [row.intake_at, row.quoted_at]);

  const callUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/call/${encodeURIComponent(row.id)}?t=${encodeURIComponent(row.join_token)}` : "";
  const completed = Object.values(row.spec).filter(field => field.value !== null).length;

  return <main className="desk-shell">
    <header className="desk-header"><Link className="wordmark" href="/">Quote<span>Desk</span><i /></Link><Link className="secondary-button" href="/">New request</Link></header>
    <div className="page-heading"><div><p className="overline">QUOTE / {row.id.slice(0,8).toUpperCase()}</p><h1>{row.spec.partNumber.value || "Part request"}<span className="ml-3 text-xl text-[var(--muted)]">Rev {row.spec.revision.value || "—"}</span></h1><p className="subheading">{row.missing.length ? `${row.missing.length} details needed from the buyer` : "All required details collected"}</p></div><div className="flex flex-wrap gap-2">{cached && <span className="tag amber">Cached extraction</span>}<span className={`tag ${row.status === "approved" ? "" : "amber"}`}>{row.status === "approved" ? "Approved" : row.status === "quoted" ? "Provisional quote" : "Awaiting clarification"}</span></div></div>
    {connectionError && <p className="notice error mb-6" role="status">Connection interrupted. Showing the last saved quote; retrying automatically.</p>}
    <div className="workspace-grid">
      <div className="stack">
        <section className="panel"><div className="panel-heading"><h2>Part specification</h2><span className="field-help">{completed} / 10 details collected</span></div>
          {(Object.keys(labels) as (keyof QuoteSpec)[]).map(key => {
            const field = row.spec[key];
            const display = field.value === null ? "Needs buyer answer" : names[String(field.value)] || `${field.value}${key.endsWith("Mm") ? " mm" : ""}`;
            return <div className="spec-row" key={key}><span>{labels[key]}</span><div><span className={`spec-value ${field.value === null ? "missing-value" : ""}`}>{display}</span>{field.note && <p className="field-help text-amber-800">{field.note}</p>}{field.evidence && field.source !== "buyer_call" && <p className="field-help">Read from the {field.source === "email" ? "email" : "drawing"}: “{field.evidence}”</p>}</div><span className="spec-source" title={field.evidence}>{field.status === "missing" ? "Missing" : field.source === "buyer_call" ? "Buyer confirmed" : "Extracted"}</span></div>;
          })}
        </section>
        <section className="panel"><div className="panel-heading"><h2>Price & delivery options</h2><span className="overline">03 / REVIEW</span></div>
          {!!row.priceRequests?.length && <div className="panel-content notice" role="status">
            <h3 className="font-semibold">Buyer requested a lower price — vendor review needed</h3>
            <p className="field-help mt-2">These requests are not accepted discounts. Offered prices remain unchanged.</p>
            {row.priceRequests.map((request, index) => <article className="mt-4" key={`${request.recordedAt}-${index}`}>
              <p className="whitespace-pre-wrap break-words">“{request.heard}”</p>
              {request.requestedAmountCents !== null && <p className="mt-1 text-sm">Requested: {money(request.requestedAmountCents)} {request.basis === 'per_part' ? 'per part' : 'total'}{request.lowestOfferedCents !== null && ` · Lowest offered at request: ${money(request.lowestOfferedCents)}`}</p>}
              <p className="field-help mt-1">{request.belowLowest === true ? 'Below all offered options · ' : ''}For vendor review · {new Date(request.recordedAt).toLocaleString()}</p>
            </article>)}
          </div>}
          {row.options?.length ? <div className="price-grid">{row.options.map(option => <article className={`price-card ${option.id === "standard" ? "featured" : ""}`} key={option.id}><h3>{option.id}</h3><p className="price-total">{money(option.totalCents)}</p><p className="field-help">{money(option.unitCents)} / part</p><p className="mt-4 text-sm font-medium">{option.businessDays} business days</p></article>)}</div> : <div className="empty-state"><p className="font-medium text-[var(--foreground)]">Ready when the details are.</p><p>Pricing options will appear here after the buyer’s answers are validated and saved.</p></div>}
          <div className="panel-content border-t border-[var(--line)] field-help">{row.approved_at ? `Approved ${new Date(row.approved_at).toLocaleString()}` : "Prices are provisional until reviewed and approved by the estimator."}</div>
          {row.status === "quoted" && <div className="panel-content"><button className="primary-button" disabled={approving} onClick={() => void approve()}>{approving ? "Approving…" : "Approve quote"}</button></div>}
          {approvalError && <p className="panel-content notice error" role="alert">{approvalError}</p>}
        </section>
        <details className="panel"><summary className="panel-heading cursor-pointer font-semibold text-sm">Original buyer request</summary><div className="panel-content email-preview">{row.email_text}</div></details>
      </div>
      <aside className="stack"><BuyerInvite callUrl={callUrl} /><section className="panel"><div className="panel-content"><p className="overline">INTAKE TO DRAFT</p><p className="timer mt-3">{Math.floor(elapsed / 60).toString().padStart(2,"0")}:{(elapsed % 60).toFixed(1).padStart(4,"0")}</p><p className="field-help mt-2">{row.quoted_at ? "Stopped when the draft was priced." : "Elapsed time since this request arrived."}</p></div></section><section className="panel"><div className="panel-heading"><h2>Buyer’s drawing</h2><a className="field-help underline" href="/demo/bracket.pdf" target="_blank" rel="noreferrer">Open ↗</a></div><div className="panel-content field-help">Demo bracket reference · PDF<br />QD-1001 / revision B</div></section>
        <div className="flex flex-wrap items-center gap-2">
          {confirmReset ? <>
            <span className="field-help basis-full">Clear the buyer&apos;s answers and prices on this quote?</span>
            <button className="secondary-button" disabled={resetting} onClick={() => void resetQuote()}>{resetting ? "Resetting…" : "Yes, reset"}</button>
            <button className="secondary-button" disabled={resetting} onClick={() => setConfirmReset(false)}>Cancel</button>
          </> : <button className="secondary-button" onClick={() => setConfirmReset(true)}>Reset for the next demo</button>}
          {resetError && <p className="field-help basis-full" role="alert">{resetError}</p>}
        </div>
      </aside>
    </div>
  </main>;
}
