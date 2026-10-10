// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';
import type { BuyerPriceRequest, QuoteRow } from './types';

// Server code only. This uses the secret key, which can read and write
// everything. Never import this file from a component that runs in the browser.
export function getSupabaseServer() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SECRET_KEY is not set');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// Returns one quote, or null when there is no quote with that id.
export async function getQuote(id: string): Promise<QuoteRow | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from('quotes').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.error('getQuote failed', error.message);
    return null;
  }
  return data as QuoteRow | null;
}

export const createServerSupabase = getSupabaseServer;

export async function getQuoteWithPriceRequests(id: string): Promise<QuoteRow | null> {
  const row = await getQuote(id);
  if (!row) return null;
  const { data, error } = await getSupabaseServer().from('quote_events').select('payload').eq('quote_id', id);
  if (error) throw new Error('Could not load buyer price requests');
  const priceRequests: BuyerPriceRequest[] = (data || []).flatMap(event => {
    const request = event.payload?.result?.priceRequest;
    return !event.payload?.pending && request ? [request] : [];
  });
  priceRequests.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return { ...row, priceRequests };
}
