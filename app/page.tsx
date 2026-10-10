// app/page.tsx
import IntakePanel from '@/components/IntakePanel';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="desk-shell">
      <header className="desk-header"><Link className="wordmark" href="/">Quote<span>Desk</span><i /></Link><span className="header-note">ESTIMATOR WORKSPACE</span></header>
      <div className="page-heading"><div><p className="overline">01 / NEW REQUEST</p><h1>From drawing to decision.</h1><p className="subheading">Read the request. Clarify the details. Review the quote.</p></div><span className="tag">Human approval, always</span></div>
      <IntakePanel />
    </main>
  );
}
