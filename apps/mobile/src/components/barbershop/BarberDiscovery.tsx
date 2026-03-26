import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native'

interface Shop {
  id: string
  shopName: string
  specialties: string[]
  baseCutPrice: number
  currency: string
  avgWaitMinutes: number
  totalCuts: number
  distanceKm?: number
}

const SPECIALTY_ICONS: Record<string, string> = {
  fade: '✂️', locs: '🪡', braids: '💈', coloring: '🎨', shaving: '🪒', beard_design: '🧔'
}

interface Props { apiBaseUrl: string; userToken: string; onSelectShop: (shop: Shop) => void }

export default function BarberDiscovery({ apiBaseUrl, userToken, onSelectShop }: Props) {
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  const search = async () => {
    setLoading(true)
    try {
      // In production: use device GPS. Using Lagos default for demo.
      const params = new URLSearchParams({ lat: '6.5244', lng: '3.3792', radius: '5' })
      if (filter) params.set('specialty', filter)
      const res = await fetch(`${apiBaseUrl}/barbershops/nearby?${params}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      })
      const { data } = await res.json()
      setShops(data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { search() }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Barbers Nearby</Text>
      <View style={styles.filterRow}>
        {['fade', 'locs', 'braids', 'coloring', 'shaving'].map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, filter === s && styles.filterChipActive]}
            onPress={() => { setFilter(filter === s ? '' : s); setTimeout(search, 0) }}
          >
            <Text style={styles.filterChipText}>{SPECIALTY_ICONS[s]} {s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? <ActivityIndicator color="#00C853" style={{ marginTop: 40 }} /> : (
        <FlatList
          data={shops}
          keyExtractor={s => s.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.shopCard} onPress={() => onSelectShop(item)}>
              <View style={styles.shopHeader}>
                <Text style={styles.shopName}>{item.shopName}</Text>
                {item.distanceKm != null && <Text style={styles.distance}>{item.distanceKm.toFixed(1)} km</Text>}
              </View>
              <View style={styles.specialtyRow}>
                {item.specialties.slice(0, 4).map(s => (
                  <Text key={s} style={styles.specialtyTag}>{SPECIALTY_ICONS[s] ?? '💈'} {s}</Text>
                ))}
              </View>
              <View style={styles.shopMeta}>
                <Text style={styles.metaItem}>⏱ ~{item.avgWaitMinutes} min wait</Text>
                <Text style={styles.metaItem}>✂️ {item.totalCuts} cuts</Text>
                <Text style={styles.price}>₦{item.baseCutPrice?.toLocaleString() ?? '—'}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No barbers found nearby. Try a wider radius.</Text>}
          contentContainerStyle={{ paddingBottom: 80 }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 16 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  filterChip: { backgroundColor: '#1A1A1A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#2A2A2A' },
  filterChipActive: { backgroundColor: '#003D1A', borderColor: '#00C853' },
  filterChipText: { color: '#CCC', fontSize: 12, textTransform: 'capitalize' },
  shopCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, marginBottom: 12 },
  shopHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shopName: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  distance: { color: '#888', fontSize: 13 },
  specialtyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  specialtyTag: { color: '#AAA', fontSize: 12, backgroundColor: '#2A2A2A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, textTransform: 'capitalize' },
  shopMeta: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  metaItem: { color: '#888', fontSize: 13 },
  price: { marginLeft: 'auto', color: '#00C853', fontWeight: '700', fontSize: 15 },
  empty: { color: '#555', textAlign: 'center', marginTop: 60, fontSize: 15 },
})
