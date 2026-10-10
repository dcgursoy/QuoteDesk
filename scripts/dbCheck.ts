// scripts/dbcheck.ts
// Checks that the Supabase keys work and that both tables exist.
// Run it with
//   npx tsx --env-file=.env.local scripts/dbcheck.ts

import { getSupabaseServer } from '../lib/supabaseServer';

async function checkTable(name: string) {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from(name).select('id').limit(1);

  if (error) {
    console.log('FAIL  ' + name + '  ' + error.message);
    return false;
  }
  console.log('PASS  ' + name + '  reachable, ' + data.length + ' row(s) returned');
  return true;
}

async function main() {
  const quotesOk = await checkTable('quotes');
  const eventsOk = await checkTable('quote_events');

  if (quotesOk && eventsOk) {
    console.log('The database is ready for Step 17.');
  } else {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Could not reach Supabase.');
  console.error(error);
  process.exit(1);
});