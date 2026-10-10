// app/api/quotes/[id]/route.ts
import { getQuoteWithPriceRequests } from '@/lib/supabaseServer';

// GET /api/quotes/:id
// Returns the whole quote row as JSON.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const row = await getQuoteWithPriceRequests(id);
  if (!row) {
    return Response.json({ error: 'Quote not found' }, { status: 404 });
  }

  // no-store tells the browser to ask the server every time.
  return Response.json(row, { headers: { 'Cache-Control': 'no-store' } });
}
