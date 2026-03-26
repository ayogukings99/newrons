import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator,
} from 'react-native'

interface NFCTag {
  id: string
  label: string
  category: string
  defaultAmount?: number
  currency: string
  tapCount: number
  totalReceived: number
  qrFallbackUrl: string
  isActive: boolean
}

const CATEGORIES = ['transport', 'food', 'market', 'service', 'entertainment', 'religious']
const CATEGORY_ICONS: Record<string, string> = {
  transport: '🚌', food: '🍲', market: '🛒',
  service: '🔧', entertainment: '🎵', religious: '🕌',
}

interface Props { apiBaseUrl: string; userToken: string }

export default function NFCTagManager({ apiBaseUrl, userToken }: Props) {
  const [tags, setTags] = useState<NFCTag[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState('market')
  const [newDefaultAmount, setNewDefaultAmount] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { fetchTags() }, [])

  const fetchTags = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${apiBaseUrl}/nfc-payments/tags`, {
        headers: { Authorization: `Bearer ${userToken}` },
      })
      const { data } = await res.json()
      setTags(data ?? [])
    } catch (e) {
      Alert.alert('Error', 'Failed to load your NFC tags')
    } finally {
      setLoading(false)
    }
  }

  const createTag = async () => {
    if (!newLabel.trim()) return Alert.alert('Error', 'Label is required')
    setCreating(true)
    try {
      const res = await fetch(`${apiBaseUrl}/nfc-payments/tags`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel,
          category: newCategory,
          defaultAmount: newDefaultAmount ? parseFloat(newDefaultAmount) : undefined,
          currency: 'NGN',
        }),
      })
      const { data } = await res.json()
      setTags(prev => [data, ...prev])
      setShowCreate(false)
      setNewLabel(''); setNewCategory('market'); setNewDefaultAmount('')
    } catch (e) {
      Alert.alert('Error', 'Failed to create tag')
    } finally {
      setCreating(false)
    }
  }

  const deactivateTag = (tagId: string) => {
    Alert.alert('Deactivate Tag', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Deactivate', style: 'destructive',
        onPress: async () => {
          await fetch(`${apiBaseUrl}/nfc-payments/tags/${tagId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${userToken}` },
          })
          setTags(prev => prev.filter(t => t.id !== tagId))
        },
      },
    ])
  }

  const renderTag = ({ item }: { item: NFCTag }) => (
    <View style={styles.tagCard}>
      <View style={styles.tagHeader}>
        <Text style={styles.tagIcon}>{CATEGORY_ICONS[item.category] ?? '💳'}</Text>
        <View style={styles.tagInfo}>
          <Text style={styles.tagLabel}>{item.label}</Text>
          <Text style={styles.tagCategory}>{item.category}</Text>
        </View>
        <TouchableOpacity onPress={() => deactivateTag(item.id)} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagStats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.tapCount}</Text>
          <Text style={styles.statLabel}>Taps</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>₦{item.totalReceived.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Total Received</Text>
        </View>
        {item.defaultAmount && (
          <View style={styles.stat}>
            <Text style={styles.statValue}>₦{item.defaultAmount}</Text>
            <Text style={styles.statLabel}>Default</Text>
          </View>
        )}
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My NFC Tags</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setShowCreate(true)}>
          <Text style={styles.addButtonText}>+ New Tag</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#00C853" style={{ marginTop: 40 }} />
      ) : tags.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📡</Text>
          <Text style={styles.emptyTitle}>No NFC tags yet</Text>
          <Text style={styles.emptySubtitle}>Create a tag for your shop, stall, or service to start accepting tap payments</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setShowCreate(true)}>
            <Text style={styles.primaryButtonText}>Create Your First Tag</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tags}
          keyExtractor={t => t.id}
          renderItem={renderTag}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      {/* Create Tag Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>New NFC Tag</Text>
          <TextInput
            style={styles.input}
            placeholder="Tag label (e.g. Mama Nkechi's Suya Stand)"
            placeholderTextColor="#666"
            value={newLabel}
            onChangeText={setNewLabel}
          />
          <Text style={styles.inputLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, newCategory === cat && styles.categoryChipActive]}
                onPress={() => setNewCategory(cat)}
              >
                <Text style={styles.categoryChipText}>{CATEGORY_ICONS[cat]} {cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Default amount (optional)"
            placeholderTextColor="#666"
            keyboardType="decimal-pad"
            value={newDefaultAmount}
            onChangeText={setNewDefaultAmount}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCreate(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={createTag} disabled={creating}>
              {creating ? <ActivityIndicator color="#000" /> : <Text style={styles.primaryButtonText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#FFFFFF' },
  addButton: { backgroundColor: '#00C853', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addButtonText: { color: '#000', fontWeight: '600', fontSize: 14 },
  tagCard: { backgroundColor: '#1A1A1A', margin: 12, marginBottom: 0, borderRadius: 16, padding: 16 },
  tagHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tagIcon: { fontSize: 28 },
  tagInfo: { flex: 1 },
  tagLabel: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  tagCategory: { color: '#888', fontSize: 13, textTransform: 'capitalize' },
  deleteBtn: { padding: 8 },
  deleteText: { color: '#555', fontSize: 16 },
  tagStats: { flexDirection: 'row', gap: 24, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#2A2A2A' },
  stat: { alignItems: 'center' },
  statValue: { color: '#00C853', fontSize: 18, fontWeight: '700' },
  statLabel: { color: '#666', fontSize: 12, marginTop: 2 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyIcon: { fontSize: 60 },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  emptySubtitle: { color: '#666', textAlign: 'center', lineHeight: 22 },
  modal: { flex: 1, backgroundColor: '#0A0A0A', padding: 24, paddingTop: 40 },
  modalTitle: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 24 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 15 },
  inputLabel: { color: '#888', fontSize: 13, marginBottom: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: { backgroundColor: '#1A1A1A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2A2A2A' },
  categoryChipActive: { backgroundColor: '#003D1A', borderColor: '#00C853' },
  categoryChipText: { color: '#CCC', fontSize: 13, textTransform: 'capitalize' },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelButton: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#1A1A1A', alignItems: 'center' },
  cancelText: { color: '#888', fontWeight: '600' },
  primaryButton: { flex: 1, backgroundColor: '#00C853', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryButtonText: { color: '#000', fontSize: 15, fontWeight: '700' },
})
