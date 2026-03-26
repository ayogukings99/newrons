import React, { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'

// PRIVACY: no auth required, no user data stored
interface RouteReport {
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high'
  summary: { incidentCount24h: number; incidentTypes: string[]; mostCommonCategory?: string }
  alternativeRoutes: Array<{ description: string; estimatedExtraMinutes: number; riskLevel: string }>
  expiresAt: string
}

interface Props {
  apiBaseUrl: string
  onReport: (report: RouteReport) => void
}

const RISK_COLORS = { low: '#4CAF50', moderate: '#FF9800', elevated: '#FF5722', high: '#F44336' }

export default function RouteReportRequest({ apiBaseUrl, onReport }: Props) {
  const [loading, setLoading] = useState(false)

  const getReport = async () => {
    setLoading(true)
    try {
      // In production: get actual GPS + destination from user input / maps
      const res = await fetch(`${apiBaseUrl}/security/route-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // PRIVACY: no Authorization header — ephemeral, no identity
        body: JSON.stringify({
          origin: { lat: 6.5244, lng: 3.3792 },
          destination: { lat: 6.4698, lng: 3.5852 },
          departureTime: new Date().toISOString(),
        }),
      })
      const { data } = await res.json()
      onReport(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.icon}><Text style={styles.iconText}>🛡</Text></View>
      <Text style={styles.title}>Route Safety Check</Text>
      <Text style={styles.subtitle}>Get a community-sourced safety briefing for your route. Your query is never stored or linked to you.</Text>
      <TouchableOpacity style={styles.button} onPress={getReport} disabled={loading}>
        {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Check My Route</Text>}
      </TouchableOpacity>
      <Text style={styles.privacy}>🔒 No location history · No account required</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  icon: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#0A1A3A', justifyContent: 'center', alignItems: 'center' },
  iconText: { fontSize: 40 },
  title: { color: '#FFF', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#888', textAlign: 'center', lineHeight: 22, fontSize: 14 },
  button: { backgroundColor: '#4A9EFF', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 14, width: '100%', alignItems: 'center' },
  buttonText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  privacy: { color: '#4A4A4A', fontSize: 12 },
})
