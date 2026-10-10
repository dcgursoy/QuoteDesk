// scripts/extract.ts
// Runs the extraction once from the terminal and prints the result.
// Run it with
//   npm run test:extract

import { readFileSync } from 'node:fs';
import { DEMO_EMAIL } from '../lib/demo';
import { extractSpec } from '../lib/extract';
import { FIELD_ORDER, findMissing } from '../lib/gaps';
import fixture from '../fixtures/quote.clarifying.json';

async function main() {
  const pdfBase64 = readFileSync('public/demo/bracket.pdf').toString('base64');

  console.log('Sending the email and the drawing to Gemini...');
  const started = Date.now();
  const spec = await extractSpec(DEMO_EMAIL, pdfBase64);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(JSON.stringify(spec, null, 2));

  const missing = findMissing(spec);
  console.log('');
  console.log('Took ' + seconds + ' seconds');
  console.log('Missing fields: ' + missing.join(', '));
  console.log('');

  // Compare each value with the result we expect for the demo drawing.
  let failures = 0;
  for (const name of FIELD_ORDER) {
    const expected = fixture.spec[name].value;
    const actual = spec[name].value;
    if (expected === actual) {
      console.log('PASS  ' + name + ' = ' + actual);
    } else {
      failures = failures + 1;
      console.log('FAIL  ' + name + ' expected ' + expected + ' but got ' + actual);
    }
  }

  console.log('');
  if (failures === 0) {
    console.log('All 10 fields match the expected result.');
  } else {
    console.log(failures + ' field(s) do not match. Compare the printed values and evidence with fixtures/quote.clarifying.json.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Extraction failed.');
  console.error(error);
  process.exit(1);
});
