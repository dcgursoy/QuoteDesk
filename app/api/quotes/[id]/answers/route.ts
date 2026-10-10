import { getQuote, getSupabaseServer } from '@/lib/supabaseServer';
import { applyAnswers } from '@/lib/applyAnswers';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const { joinToken, callId, tool, args } = body;
  if (typeof callId !== 'string' || !callId || typeof tool !== 'string' || !args || typeof args !== 'object' || Array.isArray(args)) return Response.json({ error: 'Invalid tool request' }, { status: 400 });
  const supabase = getSupabaseServer();
  const original = await getQuote(id);
  if (!original || typeof joinToken !== 'string' || original.join_token !== joinToken) return Response.json({ error: 'Invalid or expired buyer link' }, { status: 403 });
  const { data: previous, error: readError } = await supabase.from('quote_events').select('payload').eq('quote_id', id).eq('call_id', callId).maybeSingle();
  if (readError) return Response.json({ error: 'Could not read answer history' }, { status: 500 });
  if (previous?.payload?.result && !previous.payload.pending) return Response.json(previous.payload.result);
  if (previous?.payload?.pending) {
    // Recover a retry if the quote save succeeded but the history write was interrupted.
    const payload = previous.payload;
    if (payload.result && payload.targetVersion === original.version && JSON.stringify(payload.targetSpec) === JSON.stringify(original.spec)) {
      const { error } = await supabase.from('quote_events').update({ payload: { ...payload, pending: false } }).eq('quote_id', id).eq('call_id', callId);
      if (!error) return Response.json(payload.result);
    }
    return Response.json({ error: 'Answer is still processing. Retry with the same call ID.' }, { status: 409 });
  }
  let applied;
  try { applied = applyAnswers(original, tool, args); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid answer' }, { status: 400 }); }
  const { row, result, changed } = applied;
  // Reserve this call ID before applying it. The database has a unique constraint.
  const { error: eventError } = await supabase.from('quote_events').insert({ quote_id: id, call_id: callId, kind: tool === 'note_unsupported' ? 'unsupported' : result.rejected.length ? 'rejected' : 'answer', payload: { args, before: original.spec, pending: true, result, targetVersion: row.version, targetSpec: row.spec } });
  if (eventError) return Response.json({ error: eventError.code === '23505' ? 'Answer is already processing; retry with the same call ID' : 'Could not save answer history' }, { status: eventError.code === '23505' ? 409 : 500 });
  if (changed) {
    const { data, error } = await supabase.from('quotes').update({ spec: row.spec, missing: row.missing, options: row.options, status: row.status, version: row.version, quoted_at: row.quoted_at, approved_at: row.approved_at }).eq('id', id).eq('version', original.version).eq('join_token', joinToken).select('id').maybeSingle();
    if (error || !data) {
      await supabase.from('quote_events').delete().eq('quote_id', id).eq('call_id', callId);
      return Response.json({ error: 'Quote changed while saving. Retry this answer.' }, { status: 409 });
    }
  }
  const { error: historyError } = await supabase.from('quote_events').update({ payload: { args, before: original.spec, result }, kind: tool === 'note_unsupported' ? 'unsupported' : result.rejected.length ? 'rejected' : 'answer' }).eq('quote_id', id).eq('call_id', callId);
  if (historyError) return Response.json({ error: 'Answer saved, but history could not finish. Refresh the quote before retrying.' }, { status: 500 });
  return Response.json(result);
}
