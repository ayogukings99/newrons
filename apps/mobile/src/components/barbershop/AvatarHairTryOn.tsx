/**
 * AvatarHairTryOn — Full 3D haircut preview on living avatar (Phase 4)
 *
 * The cultural centrepiece of the Barbershop Layer:
 * Customers browse a barber's cut catalogue, tap any style, and see it
 * rendered on their own avatar before booking. The avatar rotates 360° so
 * they can inspect from every angle.
 *
 * Architecture:
 *  - Avatar + hair overlays are rendered in a WebView using Three.js
 *  - The platform hosts hair mesh .glb files in R2 (one per style)
 *  - The JS bridge lets the RN layer send commands (rotate, swap style, zoom)
 *  - The barber sees which styles were tried on their cuts (analytics)
 *
 * Flow:
 *   1. Load user's base avatar .glb (head + face geometry)
 *   2. Fetch barber's cut catalogue
 *   3. User taps a style → WebView swaps the hair overlay mesh
 *   4. User can rotate / zoom the 3D preview
 *   5. "Book this cut" → pre-fills booking with selected style
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator, Alert, Animated,
} from 'react-native'
import WebView from 'react-native-webview'
import { apiClient } from '../../utils/apiClient'

const { width: SCREEN_W } = Dimensions.get('window')
const VIEWER_H = Math.round(SCREEN_W * 1.05)

// ── Types ─────────────────────────────────────────────────────────────────────

interface HairStyle {
  id:           string
  name:         string
  description:  string
  thumbnail_url: string
  mesh_url:     string       // .glb hair overlay
  category:     string       // fade | locs | braids | natural | coloring | shape-up
  barber_name:  string
  barber_id:    string
  price:        number
  currency:     string
  try_on_count: number
}

interface AvatarHairTryOnProps {
  barberId?: string          // if provided, show only this barber's styles
  onBook?:   (style: HairStyle) => void
  onClose?:  () => void
}

const CATEGORIES = ['All', 'Fade', 'Locs', 'Braids', 'Natural', 'Coloring', 'Shape-up']

// ── Three.js viewer HTML ───────────────────────────────────────────────────────

function buildViewerHtml(avatarUrl: string, hairUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0A0A0F; overflow:hidden; touch-action:none; }
  canvas { display:block; width:100vw; height:100vh; }
  #loading {
    position:fixed; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; background:#0A0A0F;
    color:#6C47FF; font-family:sans-serif; gap:12px; font-size:14px;
  }
  .spinner {
    width:36px; height:36px; border:3px solid #1E1E2E;
    border-top-color:#6C47FF; border-radius:50%;
    animation:spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><span>Loading avatar…</span></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
const AVATAR_URL = "${avatarUrl}";
const HAIR_URL   = "${hairUrl}";

let scene, camera, renderer, avatarMesh, hairMesh, animId;
let isDragging = false, prevX = 0, prevY = 0;
let autoRotate = true;

async function loadGLTF(url) {
  const r = await fetch(url);
  const buf = await r.arrayBuffer();
  // Minimal GLB parser — extract first mesh geometry
  const view = new DataView(buf);
  const jsonLen = view.getUint32(12, true);
  const jsonStr = new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen));
  const gltf    = JSON.parse(jsonStr);
  const binOff  = 20 + jsonLen + 8;
  const binBuf  = buf.slice(binOff);

  const meshIdx = gltf.meshes?.[0];
  if (!meshIdx) return null;
  const prim   = meshIdx.primitives[0];
  const posAcc = gltf.accessors[prim.attributes.POSITION];
  const bufView = gltf.bufferViews[posAcc.bufferView];
  const posData = new Float32Array(binBuf, (bufView.byteOffset ?? 0), bufView.byteLength / 4);
  const geo  = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(posData.slice(), 3));
  if (prim.indices !== undefined) {
    const idxAcc  = gltf.accessors[prim.indices];
    const idxView = gltf.bufferViews[idxAcc.bufferView];
    const idxData = new Uint16Array(binBuf, (idxView.byteOffset ?? 0), idxView.byteLength / 2);
    geo.setIndex(new THREE.BufferAttribute(idxData.slice(), 1));
  }
  geo.computeVertexNormals();
  return geo;
}

async function init() {
  scene    = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0A0F);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
  camera.position.set(0, 0.1, 0.6);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(1, 2, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x6C47FF, 0.4);
  fill.position.set(-1, 0, 1);
  scene.add(fill);

  // Pivot group for rotation
  const pivot = new THREE.Group();
  scene.add(pivot);

  try {
    // Avatar
    const avatarGeo = await loadGLTF(AVATAR_URL);
    if (avatarGeo) {
      avatarMesh = new THREE.Mesh(avatarGeo, new THREE.MeshStandardMaterial({
        color: 0xC68642, roughness: 0.7, metalness: 0.0,
      }));
      avatarGeo.computeBoundingBox();
      const box = avatarGeo.boundingBox;
      const center = new THREE.Vector3();
      box.getCenter(center);
      avatarMesh.position.sub(center);
      pivot.add(avatarMesh);
    }

    // Hair overlay
    const hairGeo = await loadGLTF(HAIR_URL);
    if (hairGeo) {
      hairMesh = new THREE.Mesh(hairGeo, new THREE.MeshStandardMaterial({
        color: 0x1A1A1A, roughness: 0.9, metalness: 0.1,
      }));
      pivot.add(hairMesh);
    }

    document.getElementById('loading').style.display = 'none';
  } catch(e) {
    document.getElementById('loading').innerText = 'Preview unavailable';
  }

  // Touch controls
  renderer.domElement.addEventListener('touchstart', e => {
    isDragging = true; autoRotate = false;
    prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
  });
  renderer.domElement.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - prevX;
    const dy = e.touches[0].clientY - prevY;
    pivot.rotation.y += dx * 0.01;
    pivot.rotation.x += dy * 0.005;
    prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
  });
  renderer.domElement.addEventListener('touchend', () => { isDragging = false; });

  animate();
}

function animate() {
  animId = requestAnimationFrame(animate);
  if (autoRotate) pivot.rotation.y += 0.004;
  renderer.render(scene, camera);
}

// Bridge: receive commands from React Native
window.swapHair = async function(url, colorHex) {
  if (!scene) return;
  const pivot = scene.children.find(c => c.isGroup);
  if (!pivot) return;
  if (hairMesh) { pivot.remove(hairMesh); hairMesh.geometry.dispose(); }
  const geo = await loadGLTF(url);
  if (geo) {
    const col = parseInt(colorHex?.replace('#','') ?? '1A1A1A', 16);
    hairMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, roughness: 0.9, metalness: 0.1,
    }));
    pivot.add(hairMesh);
  }
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type:'swap_done' }));
};

window.setRotate = function(v) { autoRotate = v; };

init();
</script>
</body>
</html>`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AvatarHairTryOn({ barberId, onBook, onClose }: AvatarHairTryOnProps) {
  const [styles_,    setStyles]       = useState<HairStyle[]>([])
  const [filtered,   setFiltered]     = useState<HairStyle[]>([])
  const [activeStyle, setActiveStyle] = useState<HairStyle | null>(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [avatarUrl,  setAvatarUrl]    = useState('')
  const [loading,    setLoading]      = useState(true)
  const [swapping,   setSwapping]     = useState(false)
  const webRef                        = useRef<WebView>(null)
  const slideAnim                     = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Promise.all([fetchAvatar(), fetchStyles()])
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const f = activeCategory === 'All'
      ? styles_
      : styles_.filter(s => s.category.toLowerCase() === activeCategory.toLowerCase())
    setFiltered(f)
  }, [styles_, activeCategory])

  async function fetchAvatar() {
    try {
      const data = await apiClient.get('/avatar/mesh')
      setAvatarUrl(data.meshUrl ?? '')
    } catch {}
  }

  async function fetchStyles() {
    try {
      const endpoint = barberId ? `/barbershops/${barberId}/cuts` : '/barbershops/cuts/public'
      const data = await apiClient.get(endpoint)
      setStyles(data)
      if (data[0]) applyStyle(data[0])
    } catch {}
  }

  const applyStyle = useCallback((style: HairStyle) => {
    setActiveStyle(style)
    setSwapping(true)

    // Inject JS to swap the hair mesh in the 3D viewer
    webRef.current?.injectJavaScript(`
      window.swapHair("${style.mesh_url}", "#1A1A1A");
      true;
    `)

    // Track try-on analytics
    apiClient.post(`/barbershops/cuts/${style.id}/try-on`, {}).catch(() => {})

    // Slide style info panel in
    Animated.spring(slideAnim, {
      toValue: 1, useNativeDriver: true, tension: 80, friction: 10,
    }).start()
  }, [])

  function handleWebViewMessage(event: any) {
    try {
      const msg = JSON.parse(event.nativeEvent.data)
      if (msg.type === 'swap_done') setSwapping(false)
    } catch {}
  }

  const viewerHtml = avatarUrl
    ? buildViewerHtml(avatarUrl, activeStyle?.mesh_url ?? '')
    : buildViewerHtml(
        `${process.env.EXPO_PUBLIC_API_URL}/static/default-avatar.glb`,
        `${process.env.EXPO_PUBLIC_API_URL}/static/default-hair.glb`
      )

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#6C47FF" size="large" />
        <Text style={s.loadingText}>Loading avatar…</Text>
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        )}
        <Text style={s.headerTitle}>Hair Try-On</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* 3D Viewer */}
      <View style={[s.viewer, { height: VIEWER_H }]}>
        <WebView
          ref={webRef}
          source={{ html: viewerHtml }}
          style={{ flex: 1, backgroundColor: '#0A0A0F' }}
          onMessage={handleWebViewMessage}
          javaScriptEnabled
          scrollEnabled={false}
          originWhitelist={['*']}
        />
        {swapping && (
          <View style={s.swapOverlay}>
            <ActivityIndicator color="#6C47FF" />
            <Text style={s.swapText}>Applying style…</Text>
          </View>
        )}
        {/* Rotate hint */}
        <View style={s.rotateTip}>
          <Text style={s.rotateTipText}>↺ Drag to rotate</Text>
        </View>
      </View>

      {/* Active style info */}
      {activeStyle && (
        <Animated.View style={[s.styleInfo, {
          transform: [{ translateY: slideAnim.interpolate({ inputRange: [0,1], outputRange: [40, 0] }) }],
          opacity: slideAnim,
        }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.styleName}>{activeStyle.name}</Text>
            <Text style={s.styleBarber}>by {activeStyle.barber_name}</Text>
          </View>
          <View style={s.styleRight}>
            <Text style={s.stylePrice}>
              {activeStyle.price > 0 ? `₦${activeStyle.price.toLocaleString()}` : 'Free consultation'}
            </Text>
            {onBook && (
              <TouchableOpacity style={s.bookBtn} onPress={() => onBook(activeStyle)}>
                <Text style={s.bookBtnText}>Book →</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>
      )}

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.categoryScroll}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.catChip, activeCategory === cat && s.catChipActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[s.catChipText, activeCategory === cat && s.catChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Style grid */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.styleGrid}>
        {filtered.length === 0 ? (
          <View style={s.emptyStyles}>
            <Text style={s.emptyEmoji}>✂️</Text>
            <Text style={s.emptyText}>No styles in this category yet</Text>
          </View>
        ) : (
          filtered.map(style => (
            <TouchableOpacity
              key={style.id}
              style={[s.styleCard, activeStyle?.id === style.id && s.styleCardActive]}
              onPress={() => applyStyle(style)}
            >
              <View style={s.styleThumbnail}>
                {/* Thumbnail placeholder — replace with <Image> when assets exist */}
                <Text style={s.styleThumbnailEmoji}>✂️</Text>
              </View>
              <Text style={s.styleCardName} numberOfLines={2}>{style.name}</Text>
              <Text style={s.styleCardTryOns}>{style.try_on_count} try-ons</Text>
              {activeStyle?.id === style.id && (
                <View style={s.activeIndicator} />
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0A0A0F' },
  center:              { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F', gap: 12 },
  loadingText:         { color: '#888', fontSize: 14 },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56 },
  headerTitle:         { color: '#fff', fontSize: 17, fontWeight: '700' },
  closeBtn:            { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:        { color: '#aaa', fontSize: 14 },
  viewer:              { marginHorizontal: 0, backgroundColor: '#0A0A0F', position: 'relative' },
  swapOverlay:         { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F99', gap: 8 },
  swapText:            { color: '#6C47FF', fontSize: 13 },
  rotateTip:           { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
  rotateTipText:       { color: '#44444488', fontSize: 12 },
  styleInfo:           { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderTopWidth: 1, borderTopColor: '#1E1E2E', padding: 12, paddingHorizontal: 16 },
  styleName:           { color: '#fff', fontSize: 15, fontWeight: '700' },
  styleBarber:         { color: '#888', fontSize: 12, marginTop: 2 },
  styleRight:          { alignItems: 'flex-end', gap: 6 },
  stylePrice:          { color: '#6C47FF', fontSize: 14, fontWeight: '700' },
  bookBtn:             { backgroundColor: '#6C47FF', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  bookBtnText:         { color: '#fff', fontSize: 13, fontWeight: '700' },
  categoryScroll:      { maxHeight: 44, marginVertical: 8 },
  catChip:             { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#12121A', borderWidth: 1, borderColor: '#1E1E2E' },
  catChipActive:       { backgroundColor: '#6C47FF', borderColor: '#6C47FF' },
  catChipText:         { color: '#888', fontSize: 13, fontWeight: '500' },
  catChipTextActive:   { color: '#fff' },
  styleGrid:           { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  styleCard:           { width: (SCREEN_W - 44) / 3, backgroundColor: '#12121A', borderRadius: 10, borderWidth: 1, borderColor: '#1E1E2E', overflow: 'hidden', alignItems: 'center', paddingBottom: 8 },
  styleCardActive:     { borderColor: '#6C47FF', backgroundColor: '#1E1A3A' },
  styleThumbnail:      { width: '100%', aspectRatio: 1, backgroundColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center' },
  styleThumbnailEmoji: { fontSize: 28 },
  styleCardName:       { color: '#ddd', fontSize: 11, fontWeight: '600', textAlign: 'center', paddingHorizontal: 6, marginTop: 6 },
  styleCardTryOns:     { color: '#555', fontSize: 10, marginTop: 2 },
  activeIndicator:     { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#6C47FF' },
  emptyStyles:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8, width: '100%' },
  emptyEmoji:          { fontSize: 36 },
  emptyText:           { color: '#888', fontSize: 14 },
})
