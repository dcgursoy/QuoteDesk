import { getQuote, getSupabaseServer } from '@/lib/supabaseServer';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const joinToken = body?.joinToken;
  const row = await getQuote(id);
  if (!row || row.join_token !== joinToken) return Response.json({ error: 'Invalid quote link' }, { status: 403 });
  if (body.version !== row.version) return Response.json({ error: 'Quote changed. Review the updated prices before approving.' }, { status: 409 });
  const approvedAt = new Date().toISOString();
  const { data, error } = await getSupabaseServer().from('quotes').update({ status: 'approved', approved_at: approvedAt, version: row.version + 1 }).eq('id', id).eq('status', 'quoted').eq('version', row.version).select().maybeSingle();
  if (error || !data) return Response.json({ error: 'Only a current provisional quote can be approved' }, { status: 409 });
  return Response.json(data);
}
