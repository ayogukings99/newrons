import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, Dimensions, PanResponder, Animated, Alert,
} from 'react-native'
import { usePost } from '../../hooks/useApi'

const { width } = Dimensions.get('window')

interface WorldScan {
  id: string
  name: string
  type: string
  thumbnail_url?: string
}

type PlacementContext = 'avatar_space' | 'virtual_building' | 'journal_bg' | 'marketplace' | 'public_world'

interface PlacedAsset {
  scanId: string
  scan: WorldScan
  x: number
  y: number
  scale: number
  rotation: number
}

interface Props {
  availableScans: WorldScan[]
  context: PlacementContext
  contextId: string
  onPlacementSaved?: () => void
}

const CONTEXT_LABELS: Record<PlacementContext, string> = {
  avatar_space: 'Avatar Space',
  virtual_building: 'Virtual Building',
  journal_bg: 'Journal Background',
  marketplace: 'Marketplace',
  public_world: 'World Map',
}

export default function WorldAssetPlacer({
  availableScans,
  context,
  contextId,
  onPlacementSaved,
}: Props) {
  const [placedAssets, setPlacedAssets] = useState<PlacedAsset[]>([])
  const [selectedScan, setSelectedScan] = useState<WorldScan | null>(null)
  const [saving, setSaving] = useState(false)

  const { post } = usePost()

  // Drop zone interaction — when user taps a position on the canvas
  const handleCanvasTap = useCallback((evt: any) => {
    if (!selectedScan) return

    const { locationX, locationY } = evt.nativeEvent
    const newPlacement: PlacedAsset = {
      scanId: selectedScan.id,
      scan: selectedScan,
      x: locationX,
      y: locationY,
      scale: 1,
      rotation: 0,
    }

    setPlacedAssets(prev => [...prev, newPlacement])
    setSelectedScan(null)
  }, [selectedScan])

  const removePlacement = (index: number) => {
    setPlacedAssets(prev => prev.filter((_, i) => i !== index))
  }

  const savePlacements = async () => {
    if (placedAssets.length === 0) return

    setSaving(true)
    let successCount = 0

    try {
      for (const placed of placedAssets) {
        await post(`/world-scans/${placed.scanId}/place`, {
          context: {
            type: context,
            contextId,
            position: { x: placed.x, y: placed.y, z: 0 },
            rotation: { rx: 0, ry: placed.rotation, rz: 0 },
            scale: { sx: placed.scale, sy: placed.scale, sz: placed.scale },
          },
        })
        successCount++
      }

      Alert.alert(
        'Placements saved!',
        `${successCount} asset${successCount !== 1 ? 's' : ''} placed in your ${CONTEXT_LABELS[context]}.`
      )
      setPlacedAssets([])
      onPlacementSaved?.()
    } catch (err: any) {
      Alert.alert('Error', `Saved ${successCount} of ${placedAssets.length}. ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Place in {CONTEXT_LABELS[context]}</Text>
        <Text style={styles.headerSub}>
          {selectedScan
            ? `Tap to place "${selectedScan.name}"`
            : 'Select an asset from the tray below'}
        </Text>
      </View>

      {/* Canvas / placement area */}
      <TouchableOpacity
        style={styles.canvas}
        onPress={handleCanvasTap}
        activeOpacity={1}
      >
        <View style={styles.canvasGrid} pointerEvents="none">
          {/* Grid lines for visual guidance */}
          {[...Array(5)].map((_, i) => (
            <View key={`h${i}`} style={[styles.gridLine, styles.gridLineH, { top: `${(i + 1) * 16.66}%` }]} />
          ))}
          {[...Array(5)].map((_, i) => (
            <View key={`v${i}`} style={[styles.gridLine, styles.gridLineV, { left: `${(i + 1) * 16.66}%` }]} />
          ))}
        </View>

        {/* Placed assets */}
        {placedAssets.map((placed, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.placedAsset,
              {
                left: placed.x - 30,
                top: placed.y - 30,
                transform: [{ scale: placed.scale }, { rotate: `${placed.rotation}deg` }],
              },
            ]}
            onLongPress={() => removePlacement(i)}
          >
            {placed.scan.thumbnail_url ? (
              <Image source={{ uri: placed.scan.thumbnail_url }} style={styles.placedThumb} />
            ) : (
              <View style={[styles.placedThumb, styles.placedThumbFallback]}>
                <Text style={{ fontSize: 24 }}>
                  {placed.scan.type === 'object' ? '📦' : placed.scan.type === 'sculpture' ? '🗿' : '🎨'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Drop target hint */}
        {selectedScan && (
          <View style={styles.dropHint} pointerEvents="none">
            <Text style={styles.dropHintText}>Tap anywhere to place</Text>
          </View>
        )}

        {/* Empty state */}
        {placedAssets.length === 0 && !selectedScan && (
          <View style={styles.canvasEmpty} pointerEvents="none">
            <Text style={styles.canvasEmptyIcon}>📐</Text>
            <Text style={styles.canvasEmptyText}>
              Select an asset below,{'\n'}then tap here to place it
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Hint */}
      {placedAssets.length > 0 && (
        <Text style={styles.longPressHint}>Long-press a placed asset to remove it</Text>
      )}

      {/* Asset tray */}
      <View style={styles.tray}>
        <Text style={styles.trayTitle}>Your Assets</Text>
        <FlatList
          data={availableScans}
          horizontal
          keyExtractor={s => s.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trayScroll}
          renderItem={({ item: scan }) => (
            <TouchableOpacity
              style={[
                styles.trayItem,
                selectedScan?.id === scan.id && styles.trayItemSelected,
              ]}
              onPress={() => setSelectedScan(prev => prev?.id === scan.id ? null : scan)}
            >
              {scan.thumbnail_url ? (
                <Image source={{ uri: scan.thumbnail_url }} style={styles.trayThumb} />
              ) : (
                <View style={[styles.trayThumb, { backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' }]}>
                  <Text style={{ fontSize: 24 }}>
                    {scan.type === 'object' ? '📦' : scan.type === 'sculpture' ? '🗿' : scan.type === 'art' ? '🎨' : '🏛️'}
                  </Text>
                </View>
              )}
              <Text style={styles.trayLabel} numberOfLines={1}>{scan.name}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Save button */}
      {placedAssets.length > 0 && (
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={savePlacements}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving...' : `Save ${placedAssets.length} Placement${placedAssets.length !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 4 },

  canvas: {
    flex: 1, margin: 16, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden', position: 'relative',
  },
  canvasGrid: { ...StyleSheet.absoluteFillObject },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.04)' },
  gridLineH: { left: 0, right: 0, height: 1 },
  gridLineV: { top: 0, bottom: 0, width: 1 },

  placedAsset: {
    position: 'absolute', width: 60, height: 60, borderRadius: 8, overflow: 'hidden',
    borderWidth: 2, borderColor: '#F5A623',
  },
  placedThumb: { width: '100%', height: '100%' },
  placedThumbFallback: { backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },

  dropHint: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    backgroundColor: 'rgba(245,166,35,0.2)', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: '#F5A623',
  },
  dropHintText: { color: '#F5A623', fontWeight: '600', fontSize: 13 },

  canvasEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  canvasEmptyIcon: { fontSize: 40, marginBottom: 12 },
  canvasEmptyText: { color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center', lineHeight: 20 },

  longPressHint: {
    color: 'rgba(255,255,255,0.3)', fontSize: 11,
    textAlign: 'center', marginTop: -4, marginBottom: 4,
  },

  tray: { paddingTop: 12, paddingBottom: 8 },
  trayTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', paddingHorizontal: 20, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  trayScroll: { paddingHorizontal: 16, gap: 10 },
  trayItem: {
    width: 80, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    padding: 6, borderWidth: 1.5, borderColor: 'transparent',
    alignItems: 'center',
  },
  trayItemSelected: { borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.12)' },
  trayThumb: { width: 60, height: 60, borderRadius: 8, marginBottom: 4 },
  trayLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, textAlign: 'center' },

  saveBtn: {
    margin: 16, marginTop: 4,
    backgroundColor: '#F5A623',
    paddingVertical: 14, borderRadius: 10, alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
})
