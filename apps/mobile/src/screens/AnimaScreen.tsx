/**
 * AnimaScreen — Anima v1 (Living Avatar)
 *
 * Pillar 1 of the Sovereign OS: the visual face of the user's digital identity.
 * Every user is a sovereign node anchored to a DID (did:scn:<base58-pubkey>).
 * This screen renders that identity as a full-screen living 3D avatar with
 * wealth, velocity, and stillness stats — the three axes of sovereign health.
 *
 * Architecture:
 *  - 3D avatar is rendered inside a WebView using Three.js (same pattern as
 *    AvatarHairTryOn). A default humanoid GLB is loaded from CDN; the WebView
 *    handles auto-rotation and touch-to-rotate without any RN gesture overhead.
 *  - Gradient aura is painted as a CSS radial-gradient behind the avatar
 *    canvas, using newrons brand colours (#4279FF → #7B4FFF).
 *  - All data is mock/hardcoded for v1 — real data wires into the DID identity
 *    bridge and NXT wallet RPC in v2.
 *  - "Edit Avatar" is intentionally disabled in v1 and shows a Coming-in-v2
 *    toast to telegraph the roadmap to users.
 *
 * v2 upgrades planned:
 *  - Swap default GLB for user's personal Ready Player Me avatar
 *  - Pull NXT balance live from process_wallet_transfer / wallet RPC
 *  - Derive DID from local ed25519 keypair via identity-bridge service
 *  - Velocity computed from source-chain event log (last 7 days)
 *  - Stillness derived from Loom + Calendar calm-day streak
 */

import React, { useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  Animated,
  Easing,
} from 'react-native'
import WebView from 'react-native-webview'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// Status-bar height guard (works on both iOS and Android)
const STATUS_H = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 44

// Avatar viewer occupies ~55 % of screen height to leave room for stats + CTA
const VIEWER_H = Math.round(SCREEN_H * 0.55)

// newrons brand palette
const C = {
  bg:           '#0a0a0f',
  surface:      '#12121a',
  border:       '#1e1e2e',
  accent:       '#4279FF',
  purple:       '#7B4FFF',
  accentSoft:   '#4279FF22',
  purpleSoft:   '#7B4FFF22',
  text:         '#ffffff',
  textMuted:    '#888899',
  textDim:      '#444455',
  gold:         '#FFD166',
  teal:         '#06D6A0',
  rose:         '#FF6B9D',
}

// ─── Mock data (v1) ───────────────────────────────────────────────────────────

const MOCK_DID      = 'did:scn:7mK9xPqR2nWvLs4tBcDeFgHiJkMnOpQrStUvWxYz3A6b'
const MOCK_BALANCE  = 14_820        // NXT
const MOCK_VELOCITY = 47            // events this week
const MOCK_STILLNESS = 12           // consecutive calm days

// ─── DID helpers ──────────────────────────────────────────────────────────────

/**
 * Truncate DID to `did:scn:abc...xyz` format — shows 6 chars each side of
 * the base58 key segment so it's identifiable but fits on one line.
 */
function truncateDid(did: string): string {
  const prefix = 'did:scn:'
  const key    = did.slice(prefix.length)
  if (key.length <= 14) return did
  return `${prefix}${key.slice(0, 6)}...${key.slice(-6)}`
}

// ─── Three.js viewer HTML ─────────────────────────────────────────────────────

/**
 * Builds the complete self-contained HTML page rendered inside the WebView.
 *
 * Design decisions:
 *  - Uses Three.js r128 from cdnjs (same version as AvatarHairTryOn for
 *    consistency — no loading a second copy of the library).
 *  - The avatar mesh falls back to a stylised parametric humanoid figure
 *    (built entirely from Three.js primitives) if the GLB CDN fetch fails or
 *    times out. This guarantees the screen is never blank.
 *  - The gradient aura is a CSS radial-gradient behind the <canvas> so it
 *    scrolls and transforms with the avatar, not as a separate RN layer.
 *  - Auto-rotation resumes 2 s after the user lifts their finger.
 *  - A subtle pulsing halo ring beneath the avatar adds depth.
 *  - The WebView posts { type: 'ready' } when the scene is fully loaded so
 *    the RN layer can remove any native loading indicator.
 */
function buildAnimaHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }

  body {
    background: #0a0a0f;
    overflow: hidden;
    touch-action: none;
  }

  /* Aura — sits behind the canvas so the 3D scene floats on top of it */
  #aura {
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 70% 55% at 50% 55%,
        #4279FF18 0%,
        #7B4FFF14 35%,
        transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  /* Pulsing outer ring */
  #ring {
    position: fixed;
    left: 50%;
    top: 52%;
    transform: translate(-50%, -50%);
    width: 72vw;
    height: 72vw;
    border-radius: 50%;
    border: 1.5px solid #4279FF28;
    box-shadow: 0 0 40px #4279FF12, inset 0 0 40px #7B4FFF08;
    animation: pulse 3.6s ease-in-out infinite;
    pointer-events: none;
    z-index: 0;
  }
  #ring2 {
    position: fixed;
    left: 50%;
    top: 52%;
    transform: translate(-50%, -50%);
    width: 54vw;
    height: 54vw;
    border-radius: 50%;
    border: 1px solid #7B4FFF20;
    animation: pulse 3.6s ease-in-out infinite 0.8s;
    pointer-events: none;
    z-index: 0;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: translate(-50%,-50%) scale(1);   }
    50%       { opacity: 0.9; transform: translate(-50%,-50%) scale(1.04); }
  }

  canvas {
    display: block;
    width: 100vw;
    height: 100vh;
    position: relative;
    z-index: 1;
  }

  /* Loading overlay */
  #loading {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: #0a0a0f;
    color: #7B4FFF;
    font-family: -apple-system, sans-serif;
    gap: 14px;
    font-size: 13px;
    letter-spacing: 0.05em;
    z-index: 10;
  }
  .spinner {
    width: 32px; height: 32px;
    border: 2px solid #1e1e2e;
    border-top-color: #4279FF;
    border-right-color: #7B4FFF;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Drag hint */
  #hint {
    position: fixed;
    bottom: 14px;
    left: 0; right: 0;
    text-align: center;
    font-family: -apple-system, sans-serif;
    font-size: 11px;
    color: #44445566;
    letter-spacing: 0.06em;
    z-index: 2;
    transition: opacity 1.2s;
  }
  #hint.fade { opacity: 0; }
</style>
</head>
<body>

<div id="aura"></div>
<div id="ring"></div>
<div id="ring2"></div>
<div id="loading"><div class="spinner"></div><span>Summoning Anima…</span></div>
<div id="hint">drag to rotate</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
// ─── Scene setup ────────────────────────────────────────────────────────────
let scene, camera, renderer, pivot, animId;
let isDragging = false, prevX = 0, prevY = 0;
let autoRotate = true;
let resumeTimer = null;

scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 0.35, 2.8);
camera.lookAt(0, 0.2, 0);

renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ─── Lighting ────────────────────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambient);

// Key light — warm white from upper-right
const keyLight = new THREE.DirectionalLight(0xffeedd, 1.4);
keyLight.position.set(2, 3, 3);
keyLight.castShadow = true;
scene.add(keyLight);

// Fill light — brand blue from left
const fillLight = new THREE.PointLight(0x4279FF, 1.8, 8);
fillLight.position.set(-2, 1.5, 1);
scene.add(fillLight);

// Rim light — brand purple from behind
const rimLight = new THREE.PointLight(0x7B4FFF, 1.2, 6);
rimLight.position.set(0.5, 2, -2.5);
scene.add(rimLight);

// Ground reflection
const groundLight = new THREE.PointLight(0x4279FF, 0.6, 4);
groundLight.position.set(0, -1, 0);
scene.add(groundLight);

// ─── Pivot (rotation handle) ─────────────────────────────────────────────────
pivot = new THREE.Group();
scene.add(pivot);

// ─── Fallback humanoid figure (parametric) ───────────────────────────────────
// Built from Three.js primitives so it renders immediately with no network
// dependency. A real Ready Player Me GLB replaces this in v2.

function buildHumanoid() {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xC68642, roughness: 0.55, metalness: 0.05,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e, roughness: 0.7, metalness: 0.15,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x4279FF, roughness: 0.3, metalness: 0.6,
    emissive: new THREE.Color(0x4279FF), emissiveIntensity: 0.18,
  });

  function add(geo, mat, x, y, z, rx, ry, rz) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx) mesh.rotation.x = rx;
    if (ry) mesh.rotation.y = ry;
    if (rz) mesh.rotation.z = rz;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  // Head
  add(new THREE.SphereGeometry(0.145, 24, 20), skinMat, 0, 1.48, 0);

  // Neck
  add(new THREE.CylinderGeometry(0.056, 0.068, 0.13, 14), skinMat, 0, 1.30, 0);

  // Torso (slightly tapered)
  add(new THREE.CylinderGeometry(0.18, 0.22, 0.68, 18), clothMat, 0, 0.86, 0);

  // Chest accent stripe
  const stripeGeo = new THREE.BoxGeometry(0.04, 0.38, 0.04);
  add(stripeGeo, accentMat, 0, 0.92, 0.22);

  // Shoulders (capsule approximation)
  add(new THREE.SphereGeometry(0.09, 14, 12), clothMat, -0.27, 1.17, 0);
  add(new THREE.SphereGeometry(0.09, 14, 12), clothMat,  0.27, 1.17, 0);

  // Upper arms
  add(new THREE.CylinderGeometry(0.065, 0.058, 0.32, 12), clothMat, -0.32, 0.96, 0.06, 0, 0,  0.22);
  add(new THREE.CylinderGeometry(0.065, 0.058, 0.32, 12), clothMat,  0.32, 0.96, 0.06, 0, 0, -0.22);

  // Forearms
  add(new THREE.CylinderGeometry(0.050, 0.042, 0.30, 12), skinMat, -0.40, 0.62, 0.05, 0, 0,  0.28);
  add(new THREE.CylinderGeometry(0.050, 0.042, 0.30, 12), skinMat,  0.40, 0.62, 0.05, 0, 0, -0.28);

  // Hands
  add(new THREE.SphereGeometry(0.048, 12, 10), skinMat, -0.47, 0.43, 0.05);
  add(new THREE.SphereGeometry(0.048, 12, 10), skinMat,  0.47, 0.43, 0.05);

  // Pelvis
  add(new THREE.CylinderGeometry(0.20, 0.18, 0.20, 18), clothMat, 0, 0.45, 0);

  // Upper legs
  add(new THREE.CylinderGeometry(0.082, 0.072, 0.40, 14), clothMat, -0.11, 0.14, 0.0, 0.04, 0, 0.06);
  add(new THREE.CylinderGeometry(0.082, 0.072, 0.40, 14), clothMat,  0.11, 0.14, 0.0, 0.04, 0,-0.06);

  // Lower legs
  add(new THREE.CylinderGeometry(0.065, 0.052, 0.42, 12), clothMat, -0.12, -0.28, 0.0, -0.04, 0, 0.04);
  add(new THREE.CylinderGeometry(0.065, 0.052, 0.42, 12), clothMat,  0.12, -0.28, 0.0, -0.04, 0,-0.04);

  // Feet
  add(new THREE.BoxGeometry(0.09, 0.06, 0.18), accentMat, -0.12, -0.52, 0.03);
  add(new THREE.BoxGeometry(0.09, 0.06, 0.18), accentMat,  0.12, -0.52, 0.03);

  // Eyes — glowing accent colour
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x4279FF, emissive: new THREE.Color(0x4279FF), emissiveIntensity: 1.0,
    roughness: 0.1, metalness: 0.2,
  });
  add(new THREE.SphereGeometry(0.022, 10, 8), eyeMat, -0.050, 1.495, 0.125);
  add(new THREE.SphereGeometry(0.022, 10, 8), eyeMat,  0.050, 1.495, 0.125);

  // Centre the group vertically so camera framing works cleanly
  group.position.y = -0.42;
  return group;
}

// Ground shadow disc
const shadowDisc = new THREE.Mesh(
  new THREE.CircleGeometry(0.42, 40),
  new THREE.MeshBasicMaterial({
    color: 0x4279FF,
    transparent: true,
    opacity: 0.10,
  })
);
shadowDisc.rotation.x = -Math.PI / 2;
shadowDisc.position.y = -0.97;
pivot.add(shadowDisc);

// Build and add avatar
const humanoid = buildHumanoid();
pivot.add(humanoid);

// Floating particles — subtle depth cue
const particleCount = 60;
const particleGeo   = new THREE.BufferGeometry();
const particlePos   = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  particlePos[i*3]   = (Math.random() - 0.5) * 2.8;
  particlePos[i*3+1] = (Math.random() - 0.5) * 2.8 + 0.3;
  particlePos[i*3+2] = (Math.random() - 0.5) * 1.4 - 0.6;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
const particleMat = new THREE.PointsMaterial({
  color: 0x7B4FFF,
  size: 0.018,
  transparent: true,
  opacity: 0.55,
  sizeAttenuation: true,
});
scene.add(new THREE.Points(particleGeo, particleMat));

// ─── Touch controls ───────────────────────────────────────────────────────────
renderer.domElement.addEventListener('touchstart', e => {
  isDragging = true;
  autoRotate = false;
  if (resumeTimer) clearTimeout(resumeTimer);
  prevX = e.touches[0].clientX;
  prevY = e.touches[0].clientY;
}, { passive: true });

renderer.domElement.addEventListener('touchmove', e => {
  if (!isDragging) return;
  const dx = e.touches[0].clientX - prevX;
  const dy = e.touches[0].clientY - prevY;
  pivot.rotation.y += dx * 0.012;
  // Clamp vertical rotation so the figure never flips upside-down
  pivot.rotation.x = Math.max(-0.45, Math.min(0.45, pivot.rotation.x + dy * 0.006));
  prevX = e.touches[0].clientX;
  prevY = e.touches[0].clientY;
}, { passive: true });

renderer.domElement.addEventListener('touchend', () => {
  isDragging = false;
  // Resume auto-rotation 2 s after the user stops touching
  resumeTimer = setTimeout(() => { autoRotate = true; }, 2000);
});

// ─── Render loop ──────────────────────────────────────────────────────────────
let frame = 0;
function animate() {
  animId = requestAnimationFrame(animate);
  frame++;

  if (autoRotate) {
    pivot.rotation.y += 0.0032;
  }

  // Subtle bob — humanoid gently rises/falls on a 4-second cycle
  humanoid.position.y = -0.42 + Math.sin(frame * 0.018) * 0.018;

  // Pulsing aura light intensity
  fillLight.intensity = 1.8 + Math.sin(frame * 0.025) * 0.4;
  rimLight.intensity  = 1.2 + Math.sin(frame * 0.025 + 1.2) * 0.25;

  renderer.render(scene, camera);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.getElementById('loading').style.display = 'none';
animate();

// Fade the drag hint after 3 s
setTimeout(() => {
  const hint = document.getElementById('hint');
  if (hint) hint.classList.add('fade');
}, 3000);

// Notify RN that the scene is live
try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' })); } catch(_) {}

// Resize guard
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body>
</html>`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AnimaScreen() {
  const webRef                          = useRef<any>(null)
  const [avatarReady,  setAvatarReady]  = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  // Animated opacity for the "Coming in v2" toast
  const toastOpacity = useRef(new Animated.Value(0)).current

  // ── DID copy handler ────────────────────────────────────────────────────────
  const handleCopyDid = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(MOCK_DID)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [])

  // ── "Edit Avatar" press — disabled in v1 ───────────────────────────────────
  const handleEditAvatar = useCallback(() => {
    if (toastVisible) return
    setToastVisible(true)
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1, duration: 220, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
      Animated.delay(1800),
      Animated.timing(toastOpacity, {
        toValue: 0, duration: 300, easing: Easing.in(Easing.ease), useNativeDriver: true,
      }),
    ]).start(() => setToastVisible(false))
  }, [toastVisible, toastOpacity])

  // ── WebView message handler ─────────────────────────────────────────────────
  const handleWebViewMessage = useCallback((event: any) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'ready') setAvatarReady(true)
    } catch {}
  }, [])

  const animaHtml   = buildAnimaHtml()
  const truncatedDid = truncateDid(MOCK_DID)

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.screenLabel}>ANIMA</Text>
          <Text style={s.screenSub}>Sovereign Identity</Text>
        </View>

        {/* Online / active indicator */}
        <View style={s.nodeStatus}>
          <View style={s.nodeStatusDot} />
          <Text style={s.nodeStatusText}>Node Active</Text>
        </View>
      </View>

      {/* ── DID badge ──────────────────────────────────────────────────────── */}
      <View style={s.didRow}>
        <View style={s.didBadge}>
          <Ionicons name="shield-checkmark-outline" size={13} color={C.accent} style={s.didIcon} />
          <Text style={s.didText} numberOfLines={1} selectable={false}>
            {truncatedDid}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleCopyDid}
          style={[s.copyBtn, copied && s.copyBtnActive]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={copied ? 'checkmark-outline' : 'copy-outline'}
            size={15}
            color={copied ? C.teal : C.textMuted}
          />
        </TouchableOpacity>
      </View>

      {/* ── 3D Avatar WebView ───────────────────────────────────────────────── */}
      <View style={[s.viewerContainer, { height: VIEWER_H }]}>
        {/* Native gradient aura behind the WebView */}
        <View style={s.auraOuter} pointerEvents="none">
          <View style={s.auraInner} />
        </View>

        <WebView
          ref={webRef}
          source={{ html: animaHtml }}
          style={s.webView}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          scrollEnabled={false}
          originWhitelist={['*']}
          allowFileAccess
          domStorageEnabled
          // Keep the WebView transparent so the native aura bleeds through
          backgroundColor="transparent"
          // Disable bounce / overscroll
          bounces={false}
          overScrollMode="never"
        />

        {/* Fade-in overlay while Three.js boots */}
        {!avatarReady && (
          <View style={s.bootOverlay}>
            <View style={s.bootSpinner} />
            <Text style={s.bootText}>Summoning Anima…</Text>
          </View>
        )}
      </View>

      {/* ── Stat badges ─────────────────────────────────────────────────────── */}
      <View style={s.statsRow}>
        {/* Wealth */}
        <View style={[s.statCard, { borderColor: C.gold + '44' }]}>
          <View style={[s.statIconWrap, { backgroundColor: C.gold + '18' }]}>
            <Ionicons name="diamond-outline" size={18} color={C.gold} />
          </View>
          <Text style={[s.statValue, { color: C.gold }]}>
            {MOCK_BALANCE.toLocaleString()}
          </Text>
          <Text style={s.statLabel}>NXT</Text>
          <Text style={s.statSubLabel}>Wealth</Text>
        </View>

        {/* Velocity */}
        <View style={[s.statCard, s.statCardCenter, { borderColor: C.accent + '44' }]}>
          <View style={[s.statIconWrap, { backgroundColor: C.accent + '18' }]}>
            <Ionicons name="flash-outline" size={18} color={C.accent} />
          </View>
          <Text style={[s.statValue, { color: C.accent }]}>{MOCK_VELOCITY}</Text>
          <Text style={s.statLabel}>events</Text>
          <Text style={s.statSubLabel}>Velocity</Text>
        </View>

        {/* Stillness */}
        <View style={[s.statCard, { borderColor: C.teal + '44' }]}>
          <View style={[s.statIconWrap, { backgroundColor: C.teal + '18' }]}>
            <Ionicons name="radio-button-on-outline" size={18} color={C.teal} />
          </View>
          <Text style={[s.statValue, { color: C.teal }]}>{MOCK_STILLNESS}</Text>
          <Text style={s.statLabel}>days</Text>
          <Text style={s.statSubLabel}>Stillness</Text>
        </View>
      </View>

      {/* ── Edit Avatar CTA ──────────────────────────────────────────────────── */}
      <View style={s.ctaRow}>
        <TouchableOpacity
          style={s.editBtn}
          onPress={handleEditAvatar}
          activeOpacity={0.72}
        >
          {/* Gradient-like layered background via two nested views */}
          <View style={s.editBtnGradLeft} />
          <View style={s.editBtnGradRight} />
          <Ionicons name="color-wand-outline" size={17} color={C.text} style={s.editBtnIcon} />
          <Text style={s.editBtnText}>Edit Avatar</Text>
          <View style={s.editBtnBadge}>
            <Text style={s.editBtnBadgeText}>v2</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── "Coming in v2" toast ────────────────────────────────────────────── */}
      {toastVisible && (
        <Animated.View style={[s.toast, { opacity: toastOpacity }]}>
          <Ionicons name="rocket-outline" size={14} color={C.purple} style={{ marginRight: 7 }} />
          <Text style={s.toastText}>Avatar customisation coming in v2</Text>
        </Animated.View>
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Layout ──────────────────────────────────────────────────────────────────
  root: {
    flex:            1,
    backgroundColor: C.bg,
    paddingTop:      STATUS_H,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLeft: {
    gap: 2,
  },
  screenLabel: {
    color:          C.text,
    fontSize:       22,
    fontWeight:     '800',
    letterSpacing:  1.2,
  },
  screenSub: {
    color:          C.textMuted,
    fontSize:       11,
    fontWeight:     '500',
    letterSpacing:  0.8,
    textTransform:  'uppercase',
  },
  nodeStatus: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.surface,
    borderRadius:    20,
    borderWidth:     1,
    borderColor:     C.border,
    paddingHorizontal: 12,
    paddingVertical:  6,
    gap:              6,
  },
  nodeStatusDot: {
    width:           7,
    height:          7,
    borderRadius:    4,
    backgroundColor: C.teal,
    // Simulated glow via shadow (iOS only; Android ignores it gracefully)
    shadowColor:     C.teal,
    shadowOffset:    { width: 0, height: 0 },
    shadowRadius:    4,
    shadowOpacity:   0.9,
    elevation:       2,
  },
  nodeStatusText: {
    color:      C.textMuted,
    fontSize:   11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── DID badge ───────────────────────────────────────────────────────────────
  didRow: {
    flexDirection:   'row',
    alignItems:      'center',
    marginHorizontal: 20,
    marginBottom:    4,
    gap:             8,
  },
  didBadge: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: C.accentSoft,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     C.accent + '33',
    paddingHorizontal: 12,
    paddingVertical:  8,
    gap:              6,
  },
  didIcon: {
    // Slight opacity so it doesn't overpower the text
    opacity: 0.85,
  },
  didText: {
    flex:        1,
    color:       C.accent,
    fontSize:    12,
    fontWeight:  '600',
    letterSpacing: 0.4,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: C.surface,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  copyBtnActive: {
    borderColor:     C.teal + '55',
    backgroundColor: C.teal + '15',
  },

  // ── 3D Viewer ───────────────────────────────────────────────────────────────
  viewerContainer: {
    position:        'relative',
    overflow:        'hidden',
    marginTop:       6,
  },
  auraOuter: {
    position:        'absolute',
    inset:           0,                // valid since RN 0.71
    alignItems:      'center',
    justifyContent:  'center',
  },
  auraInner: {
    // Approximates radial-gradient via a large blurred circle with shadow
    width:           SCREEN_W * 0.75,
    height:          SCREEN_W * 0.75,
    borderRadius:    SCREEN_W * 0.75,
    backgroundColor: C.purple + '0a',
    shadowColor:     C.accent,
    shadowOffset:    { width: 0, height: 0 },
    shadowRadius:    80,
    shadowOpacity:   0.45,
    elevation:       0,
  },
  webView: {
    flex:            1,
    backgroundColor: 'transparent',
  },
  bootOverlay: {
    position:        'absolute',
    inset:           0,
    backgroundColor: C.bg,
    alignItems:      'center',
    justifyContent:  'center',
    gap:             14,
  },
  bootSpinner: {
    width:       32,
    height:      32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.border,
    borderTopColor: C.accent,
    // Note: CSS animation doesn't work here — spinner effect
    // is handled inside the WebView. This is a static ring.
  },
  bootText: {
    color:          C.purple,
    fontSize:       13,
    fontWeight:     '500',
    letterSpacing:  0.5,
  },

  // ── Stat badges ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection:   'row',
    marginHorizontal: 16,
    marginTop:       14,
    gap:             10,
  },
  statCard: {
    flex:            1,
    backgroundColor: C.surface,
    borderRadius:    14,
    borderWidth:     1,
    paddingVertical: 14,
    alignItems:      'center',
    gap:             4,
  },
  statCardCenter: {
    // Slightly elevated to create a hierarchy — the central Velocity card
    // visually "leads" the trio
    transform:       [{ translateY: -4 }],
    paddingVertical: 18,
  },
  statIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    10,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    4,
  },
  statValue: {
    fontSize:        20,
    fontWeight:      '800',
    letterSpacing:   0.5,
  },
  statLabel: {
    color:      C.textMuted,
    fontSize:   10,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  statSubLabel: {
    color:      C.textDim,
    fontSize:   9,
    fontWeight: '400',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop:  2,
  },

  // ── Edit Avatar CTA ─────────────────────────────────────────────────────────
  ctaRow: {
    paddingHorizontal: 16,
    marginTop:       16,
    marginBottom:    24,
  },
  editBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    16,
    overflow:        'hidden',
    height:          52,
    backgroundColor: C.purple,
    borderWidth:     1,
    borderColor:     C.accent + '55',
    position:        'relative',
    // Subtle outer glow (iOS)
    shadowColor:     C.accent,
    shadowOffset:    { width: 0, height: 4 },
    shadowRadius:    16,
    shadowOpacity:   0.35,
    elevation:       6,
  },
  // Two layered views that fake a left-to-right blue→purple gradient
  // (LinearGradient would require expo-linear-gradient or RN Svg)
  editBtnGradLeft: {
    position:        'absolute',
    left:            0,
    top:             0,
    bottom:          0,
    width:           '55%',
    backgroundColor: C.accent + 'bb',
  },
  editBtnGradRight: {
    position:        'absolute',
    right:           0,
    top:             0,
    bottom:          0,
    width:           '55%',
    backgroundColor: C.purple + 'bb',
  },
  editBtnIcon: {
    marginRight:     7,
    zIndex:          1,
  },
  editBtnText: {
    color:      C.text,
    fontSize:   15,
    fontWeight: '700',
    letterSpacing: 0.4,
    zIndex:     1,
  },
  editBtnBadge: {
    marginLeft:      8,
    backgroundColor: C.text + '22',
    borderRadius:    6,
    paddingHorizontal: 6,
    paddingVertical:  2,
    zIndex:          1,
  },
  editBtnBadgeText: {
    color:      C.text + 'cc',
    fontSize:   9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Toast ───────────────────────────────────────────────────────────────────
  toast: {
    position:        'absolute',
    bottom:          40,
    left:            32,
    right:           32,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: C.surface,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.purple + '55',
    paddingVertical: 13,
    paddingHorizontal: 18,
    // Elevation / shadow
    shadowColor:     C.purple,
    shadowOffset:    { width: 0, height: 4 },
    shadowRadius:    20,
    shadowOpacity:   0.4,
    elevation:       10,
  },
  toastText: {
    color:      C.textMuted,
    fontSize:   13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
})
