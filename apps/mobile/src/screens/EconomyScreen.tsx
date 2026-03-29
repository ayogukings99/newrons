/**
 * EconomyScreen
 *
 * The economic layer home screen — entry point to supply chain features within neurons.app.
 * Shows node identity (DID), sync status, quick stats, and action shortcuts.
 *
 * Architecture:
 *   - Part of the unified neurons.app mobile app
 *   - Sits alongside Social, LOGOS, Flight Logs, Security, etc.
 *   - Dark theme: bg-gray-950, teal accent for on-chain items
 */

import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'

interface DIDIdentity {
  did: string
  publicKeyHex: string
  nodeType: 'member' | 'operator' | 'auditor'
}

interface QuickStats {
  openPOs: number
  stockAlerts: number
  activeRoutes: number
  pendingTasks: number
}

interface RecentEvent {
  id: string
  type: 'receipt' | 'shipment' | 'task' | 'transfer'
  label: string
  timestamp: string
}

interface EconomyScreenProps {
  userId?: number
  apiBaseUrl?: string
  userToken?: string
}

export function EconomyScreen({
  userId,
  apiBaseUrl = 'https://api.neurons.app/api/v1',
  userToken,
}: EconomyScreenProps) {
  const [did, setDid] = useState<DIDIdentity | null>(null)
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('offline')
  const [stats, setStats] = useState<QuickStats>({
    openPOs: 0,
    stockAlerts: 0,
    activeRoutes: 0,
    pendingTasks: 0,
  })
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Load economy data on mount
  useEffect(() => {
    loadEconomyData()
  }, [userId])

  const loadEconomyData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Simulate loading DID and stats from backend
      // In production, fetch from /integration/identity
      await new Promise(r => setTimeout(r, 500))

      // Mock data for now
      setDid({
        did: 'did:scn:5J7q3K9mP2L8vX4nR6sT7yZ9aB1cD3eF5gH7j',
        publicKeyHex: '5J7q3K9mP2L8vX4nR6sT7yZ9aB1cD3eF5gH7jKm',
        nodeType: 'operator',
      })

      setStats({
        openPOs: 3,
        stockAlerts: 1,
        activeRoutes: 2,
        pendingTasks: 5,
      })

      setRecentEvents([
        {
          id: '1',
          type: 'receipt',
          label: 'PO-2024-001 received',
          timestamp: '2024-03-29T14:30:00Z',
        },
        {
          id: '2',
          type: 'task',
          label: 'Pick task completed',
          timestamp: '2024-03-29T13:15:00Z',
        },
        {
          id: '3',
          type: 'shipment',
          label: 'Route RTE-042 shipped',
          timestamp: '2024-03-29T12:00:00Z',
        },
        {
          id: '4',
          type: 'transfer',
          label: 'Transfer to BIN-B2',
          timestamp: '2024-03-29T11:45:00Z',
        },
        {
          id: '5',
          type: 'receipt',
          label: 'Stock count sync',
          timestamp: '2024-03-29T10:30:00Z',
        },
      ])

      setSyncStatus('synced')
    } catch (err: any) {
      console.error('Failed to load economy data:', err.message)
      setSyncStatus('offline')
    } finally {
      setIsLoading(false)
    }
  }, [apiBaseUrl, userToken])

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await loadEconomyData()
    setIsRefreshing(false)
  }, [loadEconomyData])

  const handleCopyDID = () => {
    if (did) {
      Alert.alert('DID Copied', `${did.did.substring(0, 20)}...`)
    }
  }

  const handleConnectPeer = () => {
    Alert.alert('QR Scanner', 'Open camera to scan peer DID')
    // In production: navigate to QR scanner screen
  }

  const getEventIcon = (type: RecentEvent['type']) => {
    switch (type) {
      case 'receipt':
        return '📦'
      case 'shipment':
        return '🚚'
      case 'task':
        return '✓'
      case 'transfer':
        return '↔️'
      default:
        return '●'
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2dd4bf" />
          <Text style={styles.loadingText}>Loading economy mode...</Text>
        </View>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* Node DID Card */}
      {did && (
        <View style={styles.didCard}>
          <View style={styles.didHeader}>
            <Text style={styles.didLabel}>Node Identity</Text>
            <View style={[styles.syncBadge, { backgroundColor: syncStatus === 'synced' ? '#10b981' : syncStatus === 'syncing' ? '#f59e0b' : '#ef4444' }]}>
              <Text style={styles.syncDot}>●</Text>
              <Text style={styles.syncText}>
                {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing' : 'Offline'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleCopyDID} style={styles.didValue}>
            <Text style={styles.didText}>{did.did.substring(0, 20)}...</Text>
            <Text style={styles.didSubtext}>{did.nodeType}</Text>
          </TouchableOpacity>
          <Text style={styles.didHint}>Tap to copy full DID</Text>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.openPOs}</Text>
          <Text style={styles.statLabel}>Open POs</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.stockAlerts}</Text>
          <Text style={styles.statLabel}>Stock Alerts</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.activeRoutes}</Text>
          <Text style={styles.statLabel}>Active Routes</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.pendingTasks}</Text>
          <Text style={styles.statLabel}>Pending Tasks</Text>
        </View>
      </View>

      {/* Quick Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>📲</Text>
          <Text style={styles.actionText}>Scan Bin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>📋</Text>
          <Text style={styles.actionText}>New PO</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>🗺️</Text>
          <Text style={styles.actionText}>View Routes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Text style={styles.actionIcon}>✓</Text>
          <Text style={styles.actionText}>Inspect</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Chain Events */}
      <View style={styles.eventsSection}>
        <View style={styles.eventsHeader}>
          <Text style={styles.eventsTitle}>Recent Events</Text>
          <TouchableOpacity onPress={handleConnectPeer}>
            <Text style={styles.connectPeerText}>Connect Peer</Text>
          </TouchableOpacity>
        </View>

        {recentEvents.length > 0 ? (
          <View style={styles.eventsList}>
            {recentEvents.map(event => (
              <View key={event.id} style={styles.eventItem}>
                <Text style={styles.eventIcon}>{getEventIcon(event.type)}</Text>
                <View style={styles.eventContent}>
                  <Text style={styles.eventLabel}>{event.label}</Text>
                  <Text style={styles.eventTime}>{formatTime(event.timestamp)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyEvents}>
            <Text style={styles.emptyEventsText}>No recent events</Text>
          </View>
        )}
      </View>

      {/* Footer spacer */}
      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
  },

  // DID Card
  didCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 20,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  didHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  didLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  syncDot: {
    fontSize: 6,
    color: '#fff',
  },
  syncText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  didValue: {
    marginBottom: 8,
  },
  didText: {
    color: '#2dd4bf',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  didSubtext: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
  didHint: {
    color: '#4b5563',
    fontSize: 11,
    fontStyle: 'italic',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
  },
  statNumber: {
    color: '#2dd4bf',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },

  // Actions
  actionsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    fontSize: 24,
  },
  actionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Recent Events
  eventsSection: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  eventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventsTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
  },
  connectPeerText: {
    color: '#2dd4bf',
    fontSize: 12,
    fontWeight: '600',
  },
  eventsList: {
    gap: 8,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  eventIcon: {
    fontSize: 18,
  },
  eventContent: {
    flex: 1,
  },
  eventLabel: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '500',
  },
  eventTime: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 2,
  },
  emptyEvents: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyEventsText: {
    color: '#6b7280',
    fontSize: 13,
  },
})
