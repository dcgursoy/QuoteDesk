// lib/supabaseServer.ts
import { createClient } from '@supabase/supabase-js';
import type { QuoteRow } from './types';

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