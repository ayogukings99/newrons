import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, RefreshControl, ActivityIndicator, Alert, Dimensions,
} from 'react-native'
import { useGet, usePost } from '../../hooks/useApi'

const { width } = Dimensions.get('window')
const CARD_WIDTH = (width - 48) / 2

type ScanStatus = 'pending' | 'processing' | 'ready' | 'failed'
type Visibility = 'private' | 'marketplace' | 'public_world'

interface WorldScan {
  id: string
  name: string
  type: string
  thumbnail_url?: string
  mesh_url?: string
  visibility: Visibility
  processing_status: ScanStatus
  quality_score?: number
  download_count: number
  style_tags?: string[]
  created_at: string
}

const STATUS_CONFIG: Record<ScanStatus, { label: string; color: string; icon: string }> = {
  pending:    { label: 'Queued',       color: '#888',    icon: '⏳' },
  processing: { label: 'Reconstructing', color: '#F5A623', icon: '🔄' },
  ready:      { label: 'Ready',        color: '#4CAF50', icon: '✅' },
  failed:     { label: 'Failed',       color: '#F44336', icon: '❌' },
}

const VISIBILITY_CONFIG: Record<Visibility, { label: string; icon: string }> = {
  private:      { label: 'Private',    icon: '🔒' },
  marketplace:  { label: 'For Sale',   icon: '🏪' },
  public_world: { label: 'On World Map', icon: '🌍' },
}

interface Props {
  onSelectScan?: (scan: WorldScan) => void
  onNewScan?: () => void
}

export default function WorldAssetLibrary({ onSelectScan, onNewScan }: Props) {
  const [scans, setScans] = useState<WorldScan[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<ScanStatus | 'all'>('all')

  const { get } = useGet()
  const { post } = usePost()

  const loadScans = useCallback(async () => {
    try {
      const data = await get('/world-scans/mine')
      setScans(data ?? [])
    } catch (err: any) {
      Alert.alert('Error', 'Failed to load your scans')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadScans()

    // Auto-refresh while any scan is processing
    const interval = setInterval(() => {
      const hasProcessing = scans.some(
        s => s.processing_status === 'processing' || s.processing_status === 'pending'
      )
      if (hasProcessing) loadScans()
    }, 15000)

    return () => clearInterval(interval)
  }, [scans.length])

  const submitForApproval = async (scanId: string) => {
    try {
      await post(`/world-scans/${scanId}/submit-approval`, {})
      Alert.alert('Submitted!', 'Your scan will appear on the world map after review.')
      loadScans()
    } catch (err: any) {
      Alert.alert('Error', err.message)
    }
  }

  const filteredScans = filter === 'all'
    ? scans
    : scans.filter(s => s.processing_status === filter)

  const renderScan = ({ item: scan }: { item: WorldScan }) => {
    const status = STATUS_CONFIG[scan.processing_status]
    const visibility = VISIBILITY_CONFIG[scan.visibility]

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => scan.processing_status === 'ready' && onSelectScan?.(scan)}
        activeOpacity={0.8}
      >
        {/* Thumbnail */}
        <View style={styles.thumbnail}>
          {scan.thumbnail_url ? (
            <Image source={{ uri: scan.thumbnail_url }} style={styles.thumbnailImg} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Text style={styles.thumbnailIcon}>
                {scan.type === 'object' ? '📦'
                  : scan.type === 'sculpture' ? '🗿'
                  : scan.type === 'art' ? '🎨' : '🏛️'}
              </Text>
            </View>
          )}

          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: status.color + '22' }]}>
            <Text style={styles.statusIcon}>{status.icon}</Text>
            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
          </View>

          {/* Quality score */}
          {scan.quality_score != null && (
            <View style={styles.qualityBadge}>
              <Text style={styles.qualityText}>⭐ {scan.quality_score.toFixed(1)}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{scan.name}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>{visibility.icon} {visibility.label}</Text>
            {scan.download_count > 0 && (
              <Text style={styles.cardMetaText}>↓ {scan.download_count}</Text>
            )}
          </View>

          {/* Actions for ready scans */}
          {scan.processing_status === 'ready' && scan.visibility === 'private' && (
            <TouchableOpacity
              style={styles.approvalBtn}
              onPress={() => submitForApproval(scan.id)}
            >
              <Text style={styles.approvalBtnText}>+ Add to World Map</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Your 3D Library</Text>
          <Text style={styles.headerSub}>{scans.length} scan{scans.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={styles.newScanBtn} onPress={onNewScan}>
          <Text style={styles.newScanBtnText}>+ New Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={styles.filters}>
        {(['all', 'ready', 'processing', 'pending', 'failed'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'All' : STATUS_CONFIG[f]?.label ?? f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      ) : filteredScans.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🌍</Text>
          <Text style={styles.emptyTitle}>No scans yet</Text>
          <Text style={styles.emptyBody}>
            Scan objects, art, or spaces around you.{'\n'}
            They become permanent 3D assets in the NEXUS world.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={onNewScan}>
            <Text style={styles.emptyBtnText}>Start Your First Scan</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredScans}
          renderItem={renderScan}
          keyExtractor={s => s.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadScans() }}
              tintColor="#F5A623"
            />
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 },
  newScanBtn: { backgroundColor: '#F5A623', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  newScanBtnText: { color: '#000', fontWeight: '700', fontSize: 14 },

  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'transparent',
  },
  filterChipActive: { borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.12)' },
  filterChipText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  filterChipTextActive: { color: '#F5A623', fontWeight: '600' },

  grid: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { gap: 12, marginBottom: 12 },

  card: {
    width: CARD_WIDTH,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  thumbnail: { width: '100%', aspectRatio: 1, position: 'relative' },
  thumbnailImg: { width: '100%', height: '100%' },
  thumbnailPlaceholder: {
    width: '100%', height: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
  },
  thumbnailIcon: { fontSize: 48 },
  statusBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  statusIcon: { fontSize: 11 },
  statusLabel: { fontSize: 11, fontWeight: '600' },
  qualityBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  qualityText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  cardBody: { padding: 10 },
  cardName: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  cardMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardMetaText: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  approvalBtn: {
    backgroundColor: 'rgba(76,175,80,0.2)', borderWidth: 1, borderColor: '#4CAF50',
    paddingVertical: 6, borderRadius: 6, alignItems: 'center',
  },
  approvalBtnText: { color: '#4CAF50', fontSize: 11, fontWeight: '600' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  emptyBody: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { backgroundColor: '#F5A623', paddingHorizontal: 28, paddingVertical: 13, borderRadius: 10 },
  emptyBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
})
