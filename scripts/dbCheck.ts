// scripts/dbCheck.ts
// Checks that the Supabase keys work and that both tables exist.
// Run it with
//   npm run db:check

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
    console.log('Both QuoteDesk tables are reachable. Run npm run test:integration to verify the full save workflow.');
  } else {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Could not reach Supabase.');
  console.error(error);
  process.exit(1);
});
