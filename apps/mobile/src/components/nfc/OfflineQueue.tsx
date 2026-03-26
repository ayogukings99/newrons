import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'

interface QueuedTap {
  nfcUid: string
  amount: number
  currency: string
  offlineCreatedAt: string
  idempotencyKey: string
}

interface Props {
  apiBaseUrl: string
  userToken: string
}

export default function OfflineQueue({ apiBaseUrl, userToken }: Props) {
  const [queue, setQueue] = useState<QueuedTap[]>([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { loadQueue() }, [])

  const loadQueue = () => {
    // In production: read from MMKV storage
    // const raw = storage.getString('nfc_offline_queue')
    // setQueue(raw ? JSON.parse(raw) : [])
    setQueue([]) // placeholder
  }

  const syncAll = async () => {
    if (queue.length === 0) return
    setSyncing(true)
    try {
      const res = await fetch(`${apiBaseUrl}/nfc-payments/sync-offline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ taps: queue }),
      })
      const { data } = await res.json()
      Alert.alert('Sync Complete', `${data.syncedCount} payments synced, ${data.failedCount} failed`)
      if (data.syncedCount > 0) {
        // Clear synced items from MMKV
        setQueue(prev => prev.slice(data.syncedCount))
      }
    } catch (e) {
      Alert.alert('Sync Failed', 'Check your connection and try again')
    } finally {
      setSyncing(false)
    }
  }

  const totalAmount = queue.reduce((sum, t) => sum + t.amount, 0)

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Offline Queue</Text>
        <Text style={styles.subtitle}>{queue.length} payment{queue.length !== 1 ? 's' : ''} pending sync</Text>
      </View>

      {queue.length > 0 && (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>Total: ₦{totalAmount.toLocaleString()}</Text>
          <TouchableOpacity style={styles.syncButton} onPress={syncAll} disabled={syncing}>
            {syncing ? <ActivityIndicator color="#000" size="small" /> : <Text style={styles.syncButtonText}>Sync Now</Text>}
          </TouchableOpacity>
        </View>
      )}

      {queue.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyText}>All payments are synced</Text>
        </View>
      ) : (
        <FlatList
          data={queue}
          keyExtractor={t => t.idempotencyKey}
          renderItem={({ item }) => (
            <View style={styles.tapItem}>
              <View>
                <Text style={styles.tapAmount}>₦{item.amount.toLocaleString()}</Text>
                <Text style={styles.tapTime}>{new Date(item.offlineCreatedAt).toLocaleString()}</Text>
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { padding: 24, paddingTop: 60 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 14, marginTop: 4 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', margin: 16, backgroundColor: '#1A1A1A', padding: 16, borderRadius: 14 },
  summaryText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  syncButton: { backgroundColor: '#00C853', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  syncButtonText: { color: '#000', fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyIcon: { fontSize: 50 },
  emptyText: { color: '#666', fontSize: 16 },
  tapItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A1A1A', margin: 12, marginBottom: 0, padding: 16, borderRadius: 12 },
  tapAmount: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  tapTime: { color: '#666', fontSize: 12, marginTop: 4 },
  pendingBadge: { backgroundColor: '#2A1A00', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  pendingText: { color: '#FF9800', fontSize: 12, fontWeight: '600' },
})
