import Link from 'next/link';
import GhostToggle from '../components/GhostToggle';
import LanguagePicker from '../components/LanguagePicker';

export default function Home() {
  return (
    <div>
      <h1>One human. One node.</h1>
      <p style={{ opacity: 0.8 }}>Register your sovereign node, lock your face template on-device, and enter the rhythm. No doomscroll. No illusion.</p>
      <div style={{ display: 'flex', gap: 12, margin: '16px 0', flexWrap: 'wrap' }}>
        <Link href="/register"><button>Register →</button></Link>
        <Link href="/avatar"><button>Avatar</button></Link>
        <Link href="/escrow/new"><button>Escrow</button></Link>
        <Link href="/transfer/tap"><button>Tap</button></Link>
        <Link href="/credit"><button>Credit</button></Link>
        <Link href="/mirror"><button>Mirror</button></Link>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <GhostToggle /> <LanguagePicker />
      </div>
    </div>
  );
}
