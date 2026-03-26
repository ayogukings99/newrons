import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'

// PRIVACY: no auth required — completely anonymous by design
interface Props { apiBaseUrl: string; onDone?: () => void }

const CATEGORIES = [
  { value: 'theft', label: '🔓 Theft' }, { value: 'harassment', label: '⚠️ Harassment' },
  { value: 'accident', label: '🚗 Accident' }, { value: 'road_hazard', label: '🚧 Road Hazard' },
  { value: 'flooding', label: '🌊 Flooding' }, { value: 'protest', label: '📢 Protest' },
]
const SEVERITIES = [
  { value: 'low', label: 'Low', color: '#4CAF50' },
  { value: 'moderate', label: 'Moderate', color: '#FF9800' },
  { value: 'high', label: 'High', color: '#F44336' },
]

export default function IncidentReporter({ apiBaseUrl, onDone }: Props) {
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('moderate')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (!category) return Alert.alert('Select a category', 'What type of incident is this?')
    setSubmitting(true)
    try {
      // In production: get actual GPS location from expo-location
      await fetch(`${apiBaseUrl}/security/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // PRIVACY: no Authorization header — fully anonymous
        body: JSON.stringify({
          category,
          severity,
          geoPoint: { lat: 6.5244, lng: 3.3792 }, // TODO: real GPS
          timeOfIncident: new Date().toISOString(),
        }),
      })
      setDone(true)
      setTimeout(() => { setDone(false); setCategory(''); onDone?.() }, 2500)
    } catch {
      Alert.alert('Error', 'Could not submit. Check your connection.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <View style={styles.doneContainer}>
      <Text style={styles.doneIcon}>🛡</Text>
      <Text style={styles.doneTitle}>Report received</Text>
      <Text style={styles.doneSub}>Anonymous. Your identity was never recorded.</Text>
    </View>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Report an Incident</Text>
      <Text style={styles.privacy}>🔒 Completely anonymous — your identity is never stored</Text>

      <Text style={styles.label}>What happened?</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map(c => (
          <TouchableOpacity
            key={c.value}
            style={[styles.catChip, category === c.value && styles.catChipActive]}
            onPress={() => setCategory(c.value)}
          >
            <Text style={styles.catText}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>How serious?</Text>
      <View style={styles.severityRow}>
        {SEVERITIES.map(s => (
          <TouchableOpacity
            key={s.value}
            style={[styles.sevChip, severity === s.value && { borderColor: s.color, backgroundColor: s.color + '22' }]}
            onPress={() => setSeverity(s.value)}
          >
            <Text style={[styles.sevText, severity === s.value && { color: s.color }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, !category && styles.disabledBtn]}
        onPress={submit}
        disabled={!category || submitting}
      >
        {submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>Submit Anonymously</Text>}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', padding: 24 },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  privacy: { color: '#4A9EFF', fontSize: 13, marginBottom: 24 },
  label: { color: '#AAA', fontSize: 13, marginBottom: 10, marginTop: 20 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catChip: { backgroundColor: '#1A1A1A', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  catChipActive: { backgroundColor: '#1A2A3A', borderColor: '#4A9EFF' },
  catText: { color: '#CCC', fontSize: 14 },
  severityRow: { flexDirection: 'row', gap: 12 },
  sevChip: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2A', backgroundColor: '#1A1A1A' },
  sevText: { color: '#888', fontWeight: '600' },
  submitBtn: { backgroundColor: '#4A9EFF', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  disabledBtn: { opacity: 0.4 },
  submitText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  doneContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A', gap: 12 },
  doneIcon: { fontSize: 64 },
  doneTitle: { color: '#FFF', fontSize: 22, fontWeight: '700' },
  doneSub: { color: '#4A9EFF', fontSize: 14 },
})
