// components/IntakePanel.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { DEMO_EMAIL, DEMO_PDF_URL } from '@/lib/demo';

// Change this to true once Teammate C's screen at /q/[id] exists.
// Until then the panel shows the result here so you can test alone.
const OPEN_SCREEN_AUTOMATICALLY = false;

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
    <div className="mt-6 grid gap-6 md:grid-cols-2">
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Request email
        </label>
        <textarea
          id="email"
          className="mt-1 h-64 w-full rounded border border-zinc-300 bg-white p-3 font-mono text-sm text-black"
          value={emailText}
          onChange={(event) => setEmailText(event.target.value)}
        />

        <label className="mt-4 block text-sm font-medium" htmlFor="pdf">
          Drawing PDF
        </label>
        <input id="pdf" className="mt-1 block text-sm" type="file" accept="application/pdf" onChange={chooseFile} />
        <p className="mt-1 text-sm text-zinc-500">
          {file ? 'Using ' + file.name : 'No file chosen, so the demo drawing will be used.'}
        </p>

        <button
          className="mt-4 rounded bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => start(false)}
        >
          {busy ? 'Reading the request ' + seconds.toFixed(1) + ' s' : 'Start quote'}
        </button>

        {error !== '' && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
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
          <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900">
            <p className="font-medium">
              Quote created in {seconds.toFixed(1)} s
              {result.origin === 'saved' ? ' from the saved result' : ''}
            </p>
            <p className="mt-1">Still missing {result.missing.join(', ')}</p>
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
      </div>

      <div>
        <p className="text-sm font-medium">Drawing</p>
        <object
          className="mt-1 h-[28rem] w-full rounded border border-zinc-300 bg-white"
          data={previewUrl + '#toolbar=0&view=FitH'}
          type="application/pdf"
          aria-label="Drawing preview"
        >
          <a className="block p-3 underline" href={previewUrl} target="_blank">
            Open the drawing
          </a>
        </object>
      </div>
    </div>
  );
}