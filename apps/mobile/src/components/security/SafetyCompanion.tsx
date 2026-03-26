import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native'

interface Props {
  apiBaseUrl: string
  userToken: string
  trustedContacts: Array<{ id: string; displayName: string; avatarUrl?: string }>
  onActivated?: (shareId: string) => void
}

export default function SafetyCompanion({ apiBaseUrl, userToken, trustedContacts, onActivated }: Props) {
  const [selectedContact, setSelectedContact] = useState<string>('')
  const [estimatedMins, setEstimatedMins] = useState('30')
  const [activating, setActivating] = useState(false)
  const [active, setActive] = useState<{ shareId: string; contactName: string; expiresAt: string } | null>(null)

  const activate = async () => {
    if (!selectedContact) return Alert.alert('Choose a contact', 'Who should watch over your journey?')
    setActivating(true)
    try {
      const arrival = new Date()
      arrival.setMinutes(arrival.getMinutes() + parseInt(estimatedMins))

      const res = await fetch(`${apiBaseUrl}/security/safety-companion`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trustedContactId: selectedContact,
          destination: { lat: 6.4698, lng: 3.5852 }, // TODO: real destination from input
          estimatedArrival: arrival.toISOString(),
        }),
      })
      const { data } = await res.json()
      const contact = trustedContacts.find(c => c.id === selectedContact)
      setActive({ shareId: data.shareId, contactName: contact?.displayName ?? 'Contact', expiresAt: data.expiresAt })
      onActivated?.(data.shareId)
    } catch {
      Alert.alert('Error', 'Could not activate safety companion')
    } finally {
      setActivating(false)
    }
  }

  const deactivate = async () => {
    if (!active) return
    try {
      await fetch(`${apiBaseUrl}/security/safety-companion/${active.shareId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userToken}` },
      })
      setActive(null)
      Alert.alert('Safe arrival confirmed', 'Your journey share has ended.')
    } catch {
      Alert.alert('Error', 'Could not end the share')
    }
  }

  if (active) return (
    <View style={styles.container}>
      <View style={styles.activeCard}>
        <Text style={styles.activeIcon}>🤝</Text>
        <Text style={styles.activeTitle}>Safety Companion Active</Text>
        <Text style={styles.activeSub}>{active.contactName} is watching your journey</Text>
        <Text style={styles.activeExpiry}>Auto-ends: {new Date(active.expiresAt).toLocaleTimeString()}</Text>
      </View>
      <TouchableOpacity style={styles.arrivedBtn} onPress={deactivate}>
        <Text style={styles.arrivedBtnText}>✅ I Arrived Safely</Text>
      </TouchableOpacity>
      <Text style={styles.privacyNote}>🔒 Location is shared peer-to-peer only. NEXUS never stores your route.</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Safety Companion</Text>
      <Text style={styles.subtitle}>Share your journey with one trusted contact. Automatically ends when you arrive.</Text>

      <Text style={styles.label}>Who should watch your journey?</Text>
      {trustedContacts.map(c => (
        <TouchableOpacity
          key={c.id}
          style={[styles.contactItem, selectedContact === c.id && styles.contactItemSelected]}
          onPress={() => setSelectedContact(c.id)}
        >
          <View style={styles.contactAvatar}><Text style={styles.contactInitial}>{c.displayName[0]}</Text></View>
          <Text style={styles.contactName}>{c.displayName}</Text>
          {selectedContact === c.id && <Text style={styles.contactCheck}>✓</Text>}
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Estimated travel time (minutes)</Text>
      <TextInput
        style={styles.input}
        value={estimatedMins}
        onChangeText={setEstimatedMins}
        keyboardType="number-pad"
        placeholder="30"
        placeholderTextColor="#555"
      />

      <TouchableOpacity style={[styles.activateBtn, !selectedContact && styles.disabledBtn]} onPress={activate} disabled={activating || !selectedContact}>
        {activating ? <ActivityIndicator color="#FFF" /> : <Text style={styles.activateBtnText}>Activate Safety Companion</Text>}
      </TouchableOpacity>

      <Text style={styles.privacyNote}>🔒 Your route is never stored by NEXUS. Peer-to-peer only.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', lineHeight: 22, marginBottom: 24, fontSize: 14 },
  label: { color: '#AAA', fontSize: 13, marginBottom: 10, marginTop: 20 },
  contactItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#2A2A2A' },
  contactItemSelected: { borderColor: '#4A9EFF', backgroundColor: '#0A1A2A' },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  contactInitial: { color: '#FFF', fontWeight: '700' },
  contactName: { color: '#FFF', flex: 1, fontSize: 15 },
  contactCheck: { color: '#4A9EFF', fontWeight: '700', fontSize: 16 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderRadius: 12, padding: 14, fontSize: 16 },
  activateBtn: { backgroundColor: '#4A9EFF', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  disabledBtn: { opacity: 0.4 },
  activateBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  privacyNote: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 },
  activeCard: { backgroundColor: '#0A1A2A', borderRadius: 20, padding: 28, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#4A9EFF', marginBottom: 24 },
  activeIcon: { fontSize: 50 },
  activeTitle: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  activeSub: { color: '#4A9EFF', fontSize: 15 },
  activeExpiry: { color: '#888', fontSize: 13 },
  arrivedBtn: { backgroundColor: '#00C853', padding: 18, borderRadius: 14, alignItems: 'center', marginBottom: 16 },
  arrivedBtnText: { color: '#000', fontWeight: '700', fontSize: 16 },
})
