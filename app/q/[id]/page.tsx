import { notFound } from "next/navigation";
import { getQuoteWithPriceRequests } from "@/lib/supabaseServer";
import QuoteWorkspace from "@/components/QuoteWorkspace";

export default async function QuotePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cached?: string }>;
}) {
  const { id } = await params;
  const row = await getQuoteWithPriceRequests(id);
  if (!row) notFound();
  const { cached } = await searchParams;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  return <QuoteWorkspace initialRow={row} cached={cached === "1"} baseUrl={baseUrl} />;
}
