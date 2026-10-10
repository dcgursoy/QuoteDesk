// components/IntakePanel.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { DEMO_EMAIL, DEMO_PDF_URL } from '@/lib/demo';

// Change this to true once Teammate C's screen at /q/[id] exists.
// Until then the panel shows the result here so you can test alone.
const OPEN_SCREEN_AUTOMATICALLY = true;

type Result = {
  id: string;
  status: string;
  missing: string[];
  origin: 'live' | 'saved';
};

function screenUrl(result: Result) {
  // cached=1 lets the screen show a label when the saved result was used.
  return '/q/' + result.id + (result.origin === 'saved' ? '?cached=1' : '');
}

// Turns a field name from the code into words a person would say.
function plainName(field: string) {
  if (field === 'materialGrade') return 'material grade';
  return field; // quantity and finish already read fine
}

export default function IntakePanel() {
  const [emailText, setEmailText] = useState(DEMO_EMAIL);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(DEMO_PDF_URL);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const startedAt = useRef(0);

  // While a request is running, update the seconds counter ten times a second.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => {
      setSeconds((Date.now() - startedAt.current) / 1000);
    }, 100);
    return () => clearInterval(timer);
  }, [busy]);

  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
    setPreviewUrl(chosen ? URL.createObjectURL(chosen) : DEMO_PDF_URL);
  }

  async function start(useSaved: boolean) {
    setBusy(true);
    setError('');
    setResult(null);
    setSeconds(0);
    startedAt.current = Date.now();

    try {
      const form = new FormData();
      form.append('emailText', emailText);

      if (useSaved) {
        form.append('useSaved', '1');
      } else if (file) {
        form.append('pdf', file);
      } else {
        // No file was chosen, so send the demo drawing.
        const pdfResponse = await fetch(DEMO_PDF_URL);
        const blob = await pdfResponse.blob();
        form.append('pdf', new File([blob], 'bracket.pdf', { type: 'application/pdf' }));
      }

      const response = await fetch('/api/quotes', { method: 'POST', body: form });
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? 'Something went wrong.');
        return;
      }

      setResult(body);
      if (OPEN_SCREEN_AUTOMATICALLY) {
        window.location.href = screenUrl(body);
      }
    } catch {
      setError('Could not reach the server. Check the connection and try again.');
    } finally {
      setSeconds((Date.now() - startedAt.current) / 1000);
      setBusy(false);
    }
  }

  return (
    <div className="intake-grid">
      <section className="panel"><div className="panel-heading"><h2>Request details</h2><span className="overline">INPUT</span></div><div className="panel-content">
        <label className="field-label" htmlFor="email">
          Step 1. Email from the buyer
        </label>
        <p className="field-help">The message a customer sent to the shop asking for a price.</p>
        <textarea
          id="email"
          className="desk-input mt-3"
          value={emailText}
          onChange={(event) => setEmailText(event.target.value)}
        />

        <label className="field-label mt-6" htmlFor="pdf">
          Step 2. Drawing the buyer attached
        </label>
        <input id="pdf" className="upload-zone w-full text-sm" type="file" accept="application/pdf" onChange={chooseFile} />
        <p className="field-help">
          {file ? 'Using ' + file.name : 'No file chosen, so the demo drawing will be used.'}
        </p>

        <p className="mt-4 text-sm font-medium">Step 3. Have Quote Desk read both</p>
        <p className="field-help">
          It pulls out the part details and lists anything the buyer forgot to say.
        </p>
        <button
          className="primary-button mt-4 w-full"
          disabled={busy}
          onClick={() => start(false)}
        >
          {busy ? 'Reading the request ' + seconds.toFixed(1) + ' s' : 'Start quote'}
        </button>

        {error !== '' && (
          <div className="notice error">
            <p>{error}</p>
            <div className="mt-2 flex gap-4">
              <button className="underline" disabled={busy} onClick={() => start(false)}>
                Try again
              </button>
              <button className="underline" disabled={busy} onClick={() => start(true)}>
                Load saved result
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="notice">
            <p className="font-medium">
              Quote created in {seconds.toFixed(1)} s
              {result.origin === 'saved' ? ' from the saved result' : ''}
            </p>
            <p className="mt-1">The buyer did not say the {result.missing.map(plainName).join(', ')}.</p>
            <p className="mt-1">The voice call will ask the buyer for these.</p>
            <p className="mt-2 flex gap-4">
              <a className="underline" href={screenUrl(result)}>
                Open the quote screen
              </a>
              <a className="underline" href={'/api/quotes/' + result.id} target="_blank">
                View the saved row
              </a>
            </p>
          </div>
        )}
      </div></section>

      <section className="panel">
        <div className="panel-heading"><h2>Attached drawing</h2><a className="field-help underline" href={previewUrl} target="_blank">Open PDF ↗</a></div><div className="panel-content pb-0">
        <p className="field-help">The dimensions and specifications supplied by your buyer.</p></div>
        <object
          className="drawing-frame"
          data={previewUrl + '#toolbar=0&view=FitH'}
          type="application/pdf"
          aria-label="Drawing preview"
        >
          <a className="block p-3 underline" href={previewUrl} target="_blank">
            Open the drawing
          </a>
        </object>
      </section>
    </div>
  );
}
