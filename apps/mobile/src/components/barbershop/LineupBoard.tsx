import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'

interface LineupEntry {
  id: string
  position: number
  serviceRequested: string
  status: 'waiting' | 'in_chair' | 'completed'
  estimatedWaitMins: number
  client: { id: string; displayName: string; avatarUrl?: string }
}

interface Props {
  shopId: string
  apiBaseUrl: string
  userToken: string
  isBarber?: boolean   // barber sees controls to advance queue
  myUserId?: string
}

export default function LineupBoard({ shopId, apiBaseUrl, userToken, isBarber, myUserId }: Props) {
  const [lineup, setLineup] = useState<LineupEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchLineup = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/barbershops/${shopId}/lineup`, {
        headers: { Authorization: `Bearer ${userToken}` },
      })
      const { data } = await res.json()
      setLineup(data ?? [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [shopId, apiBaseUrl, userToken])

  useEffect(() => {
    fetchLineup()
    // Poll every 30 seconds for live queue updates
    const interval = setInterval(fetchLineup, 30000)
    return () => clearInterval(interval)
  }, [fetchLineup])

  const updateStatus = async (lineupId: string, status: string) => {
    await fetch(`${apiBaseUrl}/barbershops/${shopId}/lineup/${lineupId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    fetchLineup()
  }

  const myPosition = lineup.findIndex(e => e.client?.id === myUserId) + 1
  const inChair = lineup.find(e => e.status === 'in_chair')
  const waiting = lineup.filter(e => e.status === 'waiting')

  const renderEntry = ({ item, index }: { item: LineupEntry; index: number }) => {
    const isMe = item.client?.id === myUserId
    const isFirst = item.status === 'in_chair'

    return (
      <View style={[styles.entry, isFirst && styles.entryInChair, isMe && styles.entryMine]}>
        <View style={styles.entryPosition}>
          <Text style={[styles.positionNum, isFirst && { color: '#00C853' }]}>
            {isFirst ? '✂️' : item.position}
          </Text>
        </View>
        <View style={styles.entryInfo}>
          <Text style={styles.entryName}>
            {item.client?.displayName ?? 'Client'} {isMe && '(You)'}
          </Text>
          <Text style={styles.entryService}>{item.serviceRequested}</Text>
          {!isFirst && (
            <Text style={styles.entryWait}>~{item.estimatedWaitMins} min wait</Text>
          )}
        </View>
        {isBarber && (
          <View style={styles.barberActions}>
            {item.status === 'waiting' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => updateStatus(item.id, 'in_chair')}>
                <Text style={styles.actionBtnText}>Start ✂️</Text>
              </TouchableOpacity>
            )}
            {item.status === 'in_chair' && (
              <TouchableOpacity style={[styles.actionBtn, styles.doneBtn]} onPress={() => updateStatus(item.id, 'completed')}>
                <Text style={styles.actionBtnText}>Done ✓</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    )
  }

  if (loading) return <ActivityIndicator color="#00C853" style={{ marginTop: 60 }} />

  return (
    <View style={styles.container}>
      {!isBarber && myPosition > 0 && (
        <View style={styles.myPositionBanner}>
          <Text style={styles.myPositionText}>
            You're #{myPosition} · ~{lineup[myPosition - 1]?.estimatedWaitMins ?? 0} min wait
          </Text>
        </View>
      )}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{waiting.length}</Text>
          <Text style={styles.statLbl}>Waiting</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statVal}>{inChair ? '1' : '0'}</Text>
          <Text style={styles.statLbl}>In Chair</Text>
        </View>
      </View>

      <FlatList
        data={lineup}
        keyExtractor={e => e.id}
        renderItem={renderEntry}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLineup() }} tintColor="#00C853" />}
        ListEmptyComponent={<Text style={styles.empty}>Queue is empty — walk right in! 🟢</Text>}
        contentContainerStyle={{ paddingBottom: 80 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  myPositionBanner: { backgroundColor: '#003D1A', padding: 14, margin: 16, borderRadius: 12 },
  myPositionText: { color: '#00C853', fontWeight: '700', textAlign: 'center', fontSize: 15 },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: 40, padding: 16 },
  stat: { alignItems: 'center' },
  statVal: { color: '#FFF', fontSize: 28, fontWeight: '700' },
  statLbl: { color: '#666', fontSize: 12 },
  divider: { width: 1, backgroundColor: '#2A2A2A' },
  entry: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14 },
  entryInChair: { backgroundColor: '#0A2A14', borderWidth: 1, borderColor: '#00C853' },
  entryMine: { borderWidth: 1, borderColor: '#4A9EFF' },
  entryPosition: { width: 36, alignItems: 'center' },
  positionNum: { color: '#888', fontSize: 20, fontWeight: '700' },
  entryInfo: { flex: 1, marginLeft: 12 },
  entryName: { color: '#FFF', fontWeight: '600', fontSize: 15 },
  entryService: { color: '#888', fontSize: 13, marginTop: 2 },
  entryWait: { color: '#666', fontSize: 12, marginTop: 2 },
  barberActions: { gap: 6 },
  actionBtn: { backgroundColor: '#003D1A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  doneBtn: { backgroundColor: '#1A3A00' },
  actionBtnText: { color: '#00C853', fontSize: 12, fontWeight: '600' },
  empty: { color: '#666', textAlign: 'center', marginTop: 60, fontSize: 16 },
})
