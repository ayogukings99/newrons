import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Newrons Rhythmic OS — testnet',
  description: 'Phase-1 playground. Testnet only, no real value.',
  manifest: '/manifest.webmanifest',
};

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#0b0b10', color: '#f2efe6', fontFamily: 'system-ui', margin: 0 }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>NEWRONS · rhythmic os</strong>
            <span style={{ fontSize: 12, border: '1px solid #6b5f2a', borderRadius: 999, padding: '2px 10px' }}>TESTNET</span>
          </header>
          <main style={{ marginTop: 24 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
