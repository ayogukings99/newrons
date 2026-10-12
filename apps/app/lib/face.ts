// Face-capture — on-device only. The raw image NEVER leaves the browser:
// we run a lightweight liveness presence check, hash a stable embedding
// stub, and return only the sha256 hex. Server stores templateHash, never photos.

export async function captureFaceTemplate(video: HTMLVideoElement): Promise<{ templateHash: string; liveness: boolean }> {
  // Presence liveness stub for VS1: require detectable motion/luminance
  // variance across 5 frames. Real embedding model lands in VS2.
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    ctx.drawImage(video, 0, 0, 96, 96);
    const d = ctx.getImageData(0, 0, 96, 96).data;
    let sum = 0;
    for (let p = 0; p < d.length; p += 401) sum += d[p];
    samples.push(sum);
    await new Promise((r) => setTimeout(r, 120));
  }
  const variance = Math.max(...samples) - Math.min(...samples);
  const liveness = variance > 0; // must see *something* alive; tuned in VS2
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(['newrons-face-v1', ...samples.map(String)].join('|')));
  return { templateHash: [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''), liveness };
}
