import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native'

interface Language { id: string; code: string; nameEnglish: string; nameNative: string; tier: number; ttsAvailable: boolean }
interface Props {
  apiBaseUrl: string
  selected?: string
  onSelect: (language: Language) => void
}

const TIER_LABELS: Record<number, string> = { 1: '🚀 Launch', 2: 'Month 3', 3: 'Month 6', 4: 'Community' }

export default function LanguagePicker({ apiBaseUrl, selected, onSelect }: Props) {
  const [languages, setLanguages] = useState<Language[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiBaseUrl}/languages`).then(r => r.json()).then(({ data }) => {
      setLanguages(data ?? [])
      setLoading(false)
    })
  }, [])

  const filtered = languages.filter(l =>
    l.nameEnglish.toLowerCase().includes(search.toLowerCase()) ||
    l.nameNative.toLowerCase().includes(search.toLowerCase()) ||
    l.code.toLowerCase().includes(search.toLowerCase())
  )

  // Group by tier
  const tier1 = filtered.filter(l => l.tier === 1)
  const tier2Plus = filtered.filter(l => l.tier > 1)

  const renderLanguage = ({ item }: { item: Language }) => (
    <TouchableOpacity
      style={[styles.langItem, selected === item.code && styles.langItemSelected]}
      onPress={() => onSelect(item)}
    >
      <View style={styles.langInfo}>
        <Text style={styles.langNative}>{item.nameNative}</Text>
        <Text style={styles.langEnglish}>{item.nameEnglish}</Text>
      </View>
      <View style={styles.langRight}>
        {item.ttsAvailable && <Text style={styles.ttsTag}>🔊</Text>}
        {selected === item.code && <Text style={styles.checkmark}>✓</Text>}
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search languages…"
        placeholderTextColor="#666"
        value={search}
        onChangeText={setSearch}
      />
      {loading ? (
        <ActivityIndicator color="#00C853" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={[
            ...( tier1.length ? [{ type: 'header', label: TIER_LABELS[1] } as any] : []),
            ...tier1,
            ...( tier2Plus.length ? [{ type: 'header', label: 'Coming Soon' } as any] : []),
            ...tier2Plus,
          ]}
          keyExtractor={(item, i) => item.type === 'header' ? `h-${i}` : item.id}
          renderItem={({ item }) =>
            item.type === 'header'
              ? <Text style={styles.sectionHeader}>{item.label}</Text>
              : renderLanguage({ item })
          }
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  search: { backgroundColor: '#1A1A1A', color: '#FFF', margin: 16, padding: 14, borderRadius: 12, fontSize: 15 },
  sectionHeader: { color: '#00C853', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingVertical: 8, marginTop: 8 },
  langItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  langItemSelected: { backgroundColor: '#0A2A14' },
  langInfo: {},
  langNative: { color: '#FFF', fontSize: 17, fontWeight: '600' },
  langEnglish: { color: '#888', fontSize: 13, marginTop: 2 },
  langRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ttsTag: { fontSize: 14 },
  checkmark: { color: '#00C853', fontSize: 18, fontWeight: '700' },
})
