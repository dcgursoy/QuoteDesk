// app/api/quotes/[id]/reset/route.ts
import { randomBytes } from 'node:crypto';
import { FIELD_ORDER, findMissing } from '@/lib/gaps';
import { getQuote, getSupabaseServer } from '@/lib/supabaseServer';
import type { QuoteSpec, SpecField } from '@/lib/types';

// POST /api/quotes/:id/reset
// Puts a quote back to the moment right after intake, ready for the next judge.
// It keeps what was read from the email and drawing and forgets what the buyer said.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = await getQuote(id);
  if (!row) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Copy the spec, clearing every field that came from the call or was never filled.
  const spec = {} as Record<string, SpecField<unknown>>;
  for (const name of FIELD_ORDER) {
    const field = row.spec[name];
    if (field.source === 'buyer_call' || field.status !== 'extracted') {
      spec[name] = { value: null, status: 'missing', source: null };
    } else {
      spec[name] = field;
    }
  }
  const cleanSpec = spec as unknown as QuoteSpec;

  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from('quotes')
    .update({
      spec: cleanSpec,
      missing: findMissing(cleanSpec),
      status: 'clarifying',
      options: null,
      quoted_at: null,
      approved_at: null,
      intake_at: new Date().toISOString(), // restarts the timer
      join_token: randomBytes(6).toString('hex'), // the old QR link stops working
      version: row.version + 1, // must go up, or the screen ignores the update
    })
    .eq('id', id)
    .select()
    .single();

  if (error || !data) {
    console.error('Reset failed', error);
    return Response.json({ error: 'Could not reset the quote.' }, { status: 500 });
  }

  // Forget the old call history for this quote.
  await supabase.from('quote_events').delete().eq('quote_id', id);

  return Response.json(data);
}