import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

interface Stop {
  id: string
  seq: number
  address: string
  recipient_name: string
  items: Array<{ sku_name: string; qty: number }>
}

interface PodCaptureProps {
  stop: Stop
  onConfirm: (stopId: string, photoUri?: string) => Promise<void>
}

/// Proof-of-Delivery capture component for driver route execution.
///
/// Driver workflow:
///   1. Review stop details (address, recipient, items)
///   2. Capture POD photo (optional but recommended)
///   3. Tap "Confirm Delivery" → emits STOP_COMPLETED + DELIVERY_CONFIRMED
///      (DELIVERY_CONFIRMED is anchored to DHT for immutable proof)
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Mobile — Driver Route Execution
export function PodCapture({ stop, onConfirm }: PodCaptureProps) {
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function handleCapturePhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
    }
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm(stop.id, photoUri ?? undefined)
      setConfirmed(true)
    } catch (err) {
      Alert.alert('Error', String(err))
    } finally {
      setLoading(false)
    }
  }

  if (confirmed) {
    return (
      <View style={[styles.card, styles.doneCard]}>
        <Text style={styles.doneIcon}>📦✅</Text>
        <Text style={styles.doneText}>Delivery Confirmed</Text>
        <Text style={styles.doneSub}>DELIVERY_CONFIRMED anchored to DHT</Text>
        <View style={styles.chainBadge}>
          <Text style={styles.chainBadgeText}>● On-chain · DHT anchored</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      {/* Stop header */}
      <View style={styles.header}>
        <Text style={styles.stopLabel}>STOP {stop.seq}</Text>
      </View>

      {/* Recipient */}
      <View style={styles.recipientBlock}>
        <Text style={styles.recipientName}>{stop.recipient_name}</Text>
        <Text style={styles.address}>{stop.address}</Text>
      </View>

      {/* Items */}
      <View style={styles.itemsBlock}>
        <Text style={styles.sectionLabel}>ITEMS</Text>
        {stop.items.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.sku_name}</Text>
            <Text style={styles.itemQty}>×{item.qty}</Text>
          </View>
        ))}
      </View>

      {/* Photo capture */}
      <View style={styles.photoBlock}>
        <Text style={styles.sectionLabel}>PROOF OF DELIVERY</Text>
        {photoUri ? (
          <View>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            <TouchableOpacity onPress={handleCapturePhoto} style={styles.retakeBtn}>
              <Text style={styles.retakeText}>Retake Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.photoBtn} onPress={handleCapturePhoto}>
            <Text style={styles.photoBtnIcon}>📷</Text>
            <Text style={styles.photoBtnText}>Take POD Photo</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Confirm CTA */}
      <TouchableOpacity
        style={[styles.confirmBtn, loading && styles.btnDisabled]}
        onPress={handleConfirm}
        disabled={loading}
      >
        <Text style={styles.confirmText}>
          {loading ? 'Confirming…' : 'Confirm Delivery'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#111827', borderRadius: 12, padding: 16, gap: 14, borderWidth: 1, borderColor: '#1f2937' },
  doneCard: { alignItems: 'center', paddingVertical: 32 },
  doneIcon: { fontSize: 40, marginBottom: 8 },
  doneText: { color: '#e5e7eb', fontSize: 18, fontWeight: '700' },
  doneSub: { color: '#6b7280', fontSize: 12 },
  chainBadge: { marginTop: 8, backgroundColor: '#064e3b', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  chainBadgeText: { color: '#2dd4bf', fontSize: 12, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center' },
  stopLabel: { color: '#2dd4bf', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  recipientBlock: { gap: 2 },
  recipientName: { color: '#f3f4f6', fontSize: 16, fontWeight: '600' },
  address: { color: '#9ca3af', fontSize: 13 },
  itemsBlock: { gap: 6 },
  sectionLabel: { color: '#4b5563', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#0a0a0f', borderRadius: 6, padding: 10 },
  itemName: { color: '#d1d5db', fontSize: 13 },
  itemQty: { color: '#2dd4bf', fontSize: 13, fontWeight: '700' },
  photoBlock: { gap: 8 },
  photoBtn: {
    borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed', borderRadius: 10,
    padding: 20, alignItems: 'center', gap: 6,
  },
  photoBtnIcon: { fontSize: 28 },
  photoBtnText: { color: '#9ca3af', fontSize: 13 },
  photoPreview: { width: '100%', height: 180, borderRadius: 8, backgroundColor: '#0a0a0f' },
  retakeBtn: { marginTop: 6, alignItems: 'center' },
  retakeText: { color: '#6b7280', fontSize: 12 },
  confirmBtn: { backgroundColor: '#0d9488', borderRadius: 8, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  confirmText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
