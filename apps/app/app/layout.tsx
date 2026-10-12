import type { Metadata, Viewport } from 'next';
import RegisterSW from '../components/RegisterSW';

export const metadata: Metadata = {
  title: 'Newrons Rhythmic OS — testnet',
  description: 'Phase-1 playground. Testnet only, no real value.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b0b10',
};

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#0b0b10', color: '#f2efe6', fontFamily: 'system-ui', margin: 0 }}>
        <RegisterSW />
        <style>{`a[href="#main"]:focus{left:8px !important;top:8px !important;background:#c9a227;color:#000;padding:8px 12px;border-radius:8px;z-index:99}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #c9a227;outline-offset:2px}`}</style>
        <a href="#main" style={{ position: 'absolute', left: -9999 }}>Skip to content</a>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: 20 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>NEWRONS · rhythmic os</strong>
            <span style={{ fontSize: 12, border: '1px solid #6b5f2a', borderRadius: 999, padding: '2px 10px' }}>TESTNET</span>
          </header>
          <main id="main" style={{ marginTop: 24 }}>{children}</main>
        </div>
      </body>
    </html>
  );
}
