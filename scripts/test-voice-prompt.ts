import assert from 'node:assert/strict';
import fixture from '../fixtures/quote.clarifying.json';
import { buildInstruction } from '../lib/voicePrompt';
import type { QuoteRow } from '../lib/types';

const prompt = buildInstruction(fixture as QuoteRow);
assert.match(prompt, /Would a quick explanation of the material or finish options help/);
assert.match(prompt, /Do not repeat these offers every turn/);
assert.match(prompt, /pause data collection and explain/);
assert.match(prompt, /do not call note_unsupported just because they need an explanation/);
assert.match(prompt, /Do not choose a material or finish for the buyer/);
assert.match(prompt, /leave the field missing until they explicitly choose/);
assert.match(prompt, /6061 aluminum \(AL6061\)/);
assert.match(prompt, /note_price_request/);
assert.match(prompt, /Never calculate or invent prices yourself/);
console.log('PASS: proactive explanations, plain-language options, no guessed choices, existing price safeguards.');
