// Creates and deletes only its own temporary test quote in the configured Supabase project.
// Run: node --env-file=.env.local --import tsx scripts/test-answers-integration.ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import fixture from '../fixtures/quote.clarifying.json';

async function main() {
  const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
  const id = randomUUID();
  const joinToken = randomUUID();
  const base = process.env.TEST_APP_URL || 'http://localhost:3000';
  const { error } = await db.from('quotes').insert({ ...fixture, id, join_token: joinToken, intake_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  async function post(path: string, body: object, expected = 200) {
    const response = await fetch(`${base}/api/quotes/${id}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  try {
    const body = { joinToken, callId: randomUUID(), tool: 'record_answers', args: { materialGrade: 'AL6061', quantity: 50, finish: 'ANODIZE_CLEAR' } };
    await post('answers', { ...body, joinToken: 'wrong' }, 403);
    const saved = await post('answers', body);
    assert.equal(saved.status, 'quoted');
    assert.equal(saved.options[1].totalCents, 71650);
    assert.deepEqual(await post('answers', body), saved);
    const read = await db.from('quotes').select().eq('id', id).single();
    assert.equal(read.data.version, 1);
    await post('approve', { joinToken, version: 0 }, 409);
    const approved = await post('approve', { joinToken, version: read.data.version });
    assert.equal(approved.status, 'approved');
    const corrected = await post('answers', { ...body, callId: randomUUID(), args: { quantity: 75 } });
    assert.equal(corrected.status, 'quoted');
    const current = await db.from('quotes').select().eq('id', id).single();
    assert.equal(current.data.spec.quantity.value, 75);
    assert.equal(current.data.approved_at, null);
    const titanium = await post('answers', { ...body, callId: randomUUID(), tool: 'note_unsupported', args: { field: 'materialGrade', heard: 'titanium' } });
    assert.equal(titanium.rejected.length, 1);
    const events = await db.from('quote_events').select('call_id').eq('quote_id', id);
    assert.equal(events.data?.length, 3);
    await post('answers', { ...body, callId: randomUUID(), args: { finish: 'AS_MACHINED', quantity: 0 } });
    console.log('PASS: real Supabase save, denied bad token, duplicate-call safety, pricing, approval, correction, unsupported material, event history.');
  } finally {
    const events = await db.from('quote_events').delete().eq('quote_id', id);
    const quote = await db.from('quotes').delete().eq('id', id);
    if (events.error || quote.error) throw new Error('Temporary test data cleanup failed');
    console.log('Temporary integration-test quote and events removed.');
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
