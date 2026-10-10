// app/page.tsx
import IntakePanel from '@/components/IntakePanel';

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">Quote Desk</h1>
      <p className="mt-1 text-zinc-500">Paste a quote request, attach the drawing and start.</p>
      <IntakePanel />
    </main>
  );
}