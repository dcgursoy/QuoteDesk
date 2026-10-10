import CallClient from "./CallClient";

export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t = "" } = await searchParams;
  return <CallClient quoteId={id} joinToken={t} />;
}
