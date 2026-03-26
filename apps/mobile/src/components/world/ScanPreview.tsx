import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  Share, Alert, ScrollView, ActivityIndicator,
} from 'react-native'
import { WebView } from 'react-native-webview'

const { width, height } = Dimensions.get('window')

const PLACEMENT_CONTEXTS = [
  { key: 'avatar_space',    label: 'Avatar Space',     icon: '👤' },
  { key: 'virtual_building', label: 'Virtual Building', icon: '🏢' },
  { key: 'journal_bg',      label: 'Journal Background', icon: '📔' },
  { key: 'marketplace',     label: 'Marketplace',      icon: '🏪' },
  { key: 'public_world',    label: 'World Map',        icon: '🌍' },
] as const

type PlacementContext = typeof PLACEMENT_CONTEXTS[number]['key']

interface WorldScan {
  id: string
  name: string
  type: string
  mesh_url?: string
  thumbnail_url?: string
  quality_score?: number
  style_tags?: string[]
  visibility: string
  download_count: number
}

interface Props {
  scan: WorldScan
  onClose?: () => void
  onPlace?: (scanId: string, context: PlacementContext, contextId: string) => void
}

// Inline HTML/JS viewer for .glb files using model-viewer web component
const buildModelViewerHTML = (meshUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
  <style>
    body { margin: 0; background: #111; overflow: hidden; }
    model-viewer {
      width: 100vw; height: 100vh;
      --progress-bar-color: #F5A623;
    }
  </style>
</head>
<body>
  <model-viewer
    src="${meshUrl}"
    alt="3D scan"
    camera-controls
    auto-rotate
    auto-rotate-delay="500"
    shadow-intensity="1"
    environment-image="neutral"
    exposure="0.8"
    loading="lazy"
  >
    <div slot="progress-bar" style="
      position: absolute; bottom: 0; left: 0; width: 100%; height: 4px;
      background: #222;
    ">
      <div style="height: 100%; background: #F5A623; width: var(--progress-bar-width, 0%)"></div>
    </div>
  </model-viewer>
</body>
</html>
`

export default function ScanPreview({ scan, onClose, onPlace }: Props) {
  const [viewerReady, setViewerReady] = useState(false)
  const [showPlaceSheet, setShowPlaceSheet] = useState(false)
  const [selectedContext, setSelectedContext] = useState<PlacementContext>('avatar_space')

  const handleShare = async () => {
    await Share.share({
      message: `Check out this 3D scan on NEXUS: ${scan.name}`,
      url: scan.thumbnail_url ?? '',
    })
  }

  const handlePlace = () => {
    if (!onPlace) return
    // In production, show a context selector modal for contextId
    onPlace(scan.id, selectedContext, 'default')
    setShowPlaceSheet(false)
    Alert.alert('Placed!', `${scan.name} has been added to your ${
      PLACEMENT_CONTEXTS.find(c => c.key === selectedContext)?.label
    }.`)
  }

  return (
    <View style={styles.container}>
      {/* 3D Viewer */}
      <View style={styles.viewer}>
        {scan.mesh_url ? (
          <>
            {!viewerReady && (
              <View style={styles.viewerLoading}>
                <ActivityIndicator size="large" color="#F5A623" />
                <Text style={styles.viewerLoadingText}>Loading 3D model...</Text>
              </View>
            )}
            <WebView
              source={{ html: buildModelViewerHTML(scan.mesh_url) }}
              style={[styles.webview, !viewerReady && { opacity: 0, height: 0 }]}
              onLoadEnd={() => setViewerReady(true)}
              scrollEnabled={false}
              allowsInlineMediaPlayback
            />
          </>
        ) : (
          <View style={[styles.viewerLoading, { backgroundColor: '#111' }]}>
            <Text style={{ fontSize: 64 }}>
              {scan.type === 'object' ? '📦' : scan.type === 'sculpture' ? '🗿' : scan.type === 'art' ? '🎨' : '🏛️'}
            </Text>
            <Text style={styles.viewerLoadingText}>3D model is still being reconstructed</Text>
          </View>
        )}

        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Rotate hint */}
        {viewerReady && (
          <View style={styles.rotateHint}>
            <Text style={styles.rotateHintText}>↻ Drag to rotate · Pinch to zoom</Text>
          </View>
        )}
      </View>

      {/* Info panel */}
      <ScrollView style={styles.infoPanel} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Name + stats */}
        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanName}>{scan.name}</Text>
            <Text style={styles.scanType}>{scan.type}</Text>
          </View>
          {scan.quality_score != null && (
            <View style={styles.qualityPill}>
              <Text style={styles.qualityText}>⭐ {scan.quality_score.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Style tags */}
        {scan.style_tags && scan.style_tags.length > 0 && (
          <View style={styles.tagsRow}>
            {scan.style_tags.map(tag => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.stat}>↓ Downloaded {scan.download_count} time{scan.download_count !== 1 ? 's' : ''}</Text>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.placeBtn} onPress={() => setShowPlaceSheet(true)}>
            <Text style={styles.placeBtnText}>📌 Place in NEXUS</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>↗ Share</Text>
          </TouchableOpacity>
        </View>

        {/* Placement context selector */}
        {showPlaceSheet && (
          <View style={styles.placeSheet}>
            <Text style={styles.placeSheetTitle}>Where do you want to place this?</Text>
            {PLACEMENT_CONTEXTS.map(ctx => (
              <TouchableOpacity
                key={ctx.key}
                style={[
                  styles.contextOption,
                  selectedContext === ctx.key && styles.contextOptionActive,
                ]}
                onPress={() => setSelectedContext(ctx.key)}
              >
                <Text style={styles.contextIcon}>{ctx.icon}</Text>
                <Text style={styles.contextLabel}>{ctx.label}</Text>
                {selectedContext === ctx.key && <Text style={styles.contextCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.confirmPlaceBtn} onPress={handlePlace}>
              <Text style={styles.confirmPlaceBtnText}>Confirm Placement</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  viewer: { height: height * 0.5, position: 'relative' },
  webview: { flex: 1, backgroundColor: '#111' },
  viewerLoading: {
    position: 'absolute', inset: 0,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#111', gap: 12,
  },
  viewerLoadingText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  closeBtn: {
    position: 'absolute', top: 48, left: 20,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16 },

  rotateHint: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
  },
  rotateHintText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  infoPanel: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  scanName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  scanType: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  qualityPill: {
    backgroundColor: 'rgba(245,166,35,0.15)', borderWidth: 1, borderColor: '#F5A623',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16,
  },
  qualityText: { color: '#F5A623', fontSize: 13, fontWeight: '700' },

  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tag: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tagText: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },

  stat: { color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 20 },

  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  placeBtn: {
    flex: 1, backgroundColor: '#F5A623',
    paddingVertical: 13, borderRadius: 10, alignItems: 'center',
  },
  placeBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  shareBtn: {
    paddingHorizontal: 20, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  placeSheet: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, padding: 16,
  },
  placeSheetTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginBottom: 16 },
  contextOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  contextOptionActive: { backgroundColor: 'rgba(245,166,35,0.12)', borderWidth: 1, borderColor: '#F5A623' },
  contextIcon: { fontSize: 22, width: 30 },
  contextLabel: { flex: 1, color: '#fff', fontSize: 15 },
  contextCheck: { color: '#F5A623', fontWeight: '800', fontSize: 16 },
  confirmPlaceBtn: {
    backgroundColor: '#F5A623', paddingVertical: 13,
    borderRadius: 10, alignItems: 'center', marginTop: 8,
  },
  confirmPlaceBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
})
