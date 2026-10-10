// app/api/quotes/route.ts
import { randomBytes } from 'node:crypto';
import fixture from '@/fixtures/quote.clarifying.json';
import { extractSpec } from '@/lib/extract';
import { findMissing } from '@/lib/gaps';
import { getSupabaseServer } from '@/lib/supabaseServer';
import type { QuoteSpec } from '@/lib/types';

// Give the model up to 60 seconds before the server gives up.
export const maxDuration = 60;

const MAX_PDF_BYTES = 4 * 1024 * 1024;
const BUYER_FIELD_NAMES = ['materialGrade', 'quantity', 'finish'];

// POST /api/quotes
// Takes form data with emailText and pdf. Creates one quote and returns
// { id, status, missing, origin }.
export async function POST(request: Request) {
  // Note the time first, so the timer on the screen includes the reading time.
  const intakeAt = new Date().toISOString();

  const form = await request.formData();
  const emailText = String(form.get('emailText') ?? '').trim();
  const pdf = form.get('pdf');
  const useSaved = form.get('useSaved') === '1';

  if (emailText === '') {
    return Response.json({ error: 'Paste the request email first.' }, { status: 400 });
  }

  let spec: QuoteSpec;
  let origin: 'live' | 'saved';

  if (useSaved) {
    // Fallback path. Skips the model and uses the saved result for the demo drawing.
    spec = fixture.spec as QuoteSpec;
    origin = 'saved';
  } else {
    if (!(pdf instanceof File) || pdf.size === 0) {
      return Response.json({ error: 'Attach the drawing as a PDF file.' }, { status: 400 });
    }
    if (pdf.type !== 'application/pdf') {
      return Response.json({ error: 'The drawing must be a PDF file.' }, { status: 400 });
    }
    if (pdf.size > MAX_PDF_BYTES) {
      return Response.json({ error: 'The PDF is larger than 4 MB.' }, { status: 400 });
    }

    try {
      const pdfBase64 = Buffer.from(await pdf.arrayBuffer()).toString('base64');
      spec = await extractSpec(emailText, pdfBase64);
      origin = 'live';
    } catch (error) {
      console.error('Extraction failed', error);
      return Response.json(
        { error: 'The model could not read this request. Try again, or load the saved result.' },
        { status: 502 }
      );
    }
  }

  const missing = findMissing(spec);

  // The voice call can only ask about material, quantity and finish.
  // If a drawing fact such as thickness is missing, stop here and say so.
  const drawingGaps = missing.filter((name) => !BUYER_FIELD_NAMES.includes(name));
  if (drawingGaps.length > 0) {
    return Response.json(
      { error: 'The drawing does not state ' + drawingGaps.join(', ') + '.', missing: missing },
      { status: 422 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseServer();
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'The Supabase keys are not set on the server.' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('quotes')
    .insert({
      join_token: randomBytes(6).toString('hex'),
      status: 'clarifying',
      email_text: emailText,
      spec: spec,
      missing: missing,
      intake_at: intakeAt,
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Insert failed', error);
    return Response.json(
      { error: 'Could not save the quote. ' + (error ? error.message : '') },
      { status: 500 }
    );
  }

  // Keep a record of how this spec was produced. A failure here is not fatal.
  const eventResult = await supabase.from('quote_events').insert({
    quote_id: data.id,
    kind: 'extracted',
    payload: { origin: origin, missing: missing },
  });
  if (eventResult.error) {
    console.error('Could not log the event', eventResult.error.message);
  }

  return Response.json({ id: data.id, status: data.status, missing: data.missing, origin: origin });
}