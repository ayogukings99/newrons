// The Mirror placeholder (Layer 6): single-HTML shader-style twin.
// VS1 shows live counts only; Three.js + scanning arrive Phase 3.
export default function Mirror() {
  return (
    <div>
      <h2>Mirror · testnet</h2>
      <div style={{ border: '1px solid #2a2a35', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>◉</div>
        <p>Escrows: 0 · Credit base: 50 · Nodes present: 1 (you)</p>
        <p style={{ fontSize: 12, opacity: 0.6 }}>Live Three.js twin + scanned world plug in here (Phase 3). Every escrow event already emits MirrorDatum.</p>
      </div>
    </div>
  );
}
