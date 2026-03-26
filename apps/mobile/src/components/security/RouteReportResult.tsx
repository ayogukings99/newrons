import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'

interface RouteReport {
  riskLevel: 'low' | 'moderate' | 'elevated' | 'high'
  summary: { incidentCount24h: number; incidentTypes: string[]; mostCommonCategory?: string }
  alternativeRoutes: Array<{ description: string; estimatedExtraMinutes: number; riskLevel: string }>
  expiresAt: string
}

const RISK_CONFIG = {
  low:      { color: '#4CAF50', bg: '#0A2A0A', label: 'Low Risk',      icon: '✅' },
  moderate: { color: '#FF9800', bg: '#2A1A00', label: 'Moderate Risk', icon: '⚠️' },
  elevated: { color: '#FF5722', bg: '#2A0A00', label: 'Elevated Risk', icon: '🔶' },
  high:     { color: '#F44336', bg: '#2A0000', label: 'High Risk',     icon: '🚨' },
}

interface Props { report: RouteReport; onActivateSafety?: () => void }

export default function RouteReportResult({ report, onActivateSafety }: Props) {
  const risk = RISK_CONFIG[report.riskLevel]

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <View style={[styles.riskBanner, { backgroundColor: risk.bg, borderColor: risk.color }]}>
        <Text style={styles.riskIcon}>{risk.icon}</Text>
        <View>
          <Text style={[styles.riskLabel, { color: risk.color }]}>{risk.label}</Text>
          <Text style={styles.riskSub}>{report.summary.incidentCount24h} incidents in last 24 hours</Text>
        </View>
      </View>

      {report.summary.incidentTypes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reported Incidents</Text>
          <View style={styles.typeRow}>
            {report.summary.incidentTypes.map(t => (
              <View key={t} style={styles.typeTag}>
                <Text style={styles.typeTagText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {report.alternativeRoutes.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Alternative Routes</Text>
          {report.alternativeRoutes.map((r, i) => (
            <View key={i} style={styles.altRoute}>
              <Text style={styles.altDesc}>{r.description}</Text>
              <Text style={styles.altExtra}>+{r.estimatedExtraMinutes} min · {r.riskLevel} risk</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.privacy}>
        <Text style={styles.privacyText}>🔒 This report was never linked to your identity</Text>
        <Text style={styles.expiresText}>Updates in {Math.round((new Date(report.expiresAt).getTime() - Date.now()) / 60000)} min</Text>
      </View>

      {(report.riskLevel === 'elevated' || report.riskLevel === 'high') && onActivateSafety && (
        <TouchableOpacity style={styles.safetyBtn} onPress={onActivateSafety}>
          <Text style={styles.safetyBtnText}>🤝 Share Journey with Trusted Contact</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  riskBanner: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  riskIcon: { fontSize: 36 },
  riskLabel: { fontSize: 20, fontWeight: '700' },
  riskSub: { color: '#AAA', fontSize: 13, marginTop: 2 },
  section: { backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16, marginBottom: 12 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeTag: { backgroundColor: '#2A2A2A', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  typeTagText: { color: '#CCC', fontSize: 13, textTransform: 'capitalize' },
  altRoute: { borderTopWidth: 1, borderTopColor: '#2A2A2A', paddingTop: 12, marginTop: 12 },
  altDesc: { color: '#FFF', fontSize: 14 },
  altExtra: { color: '#888', fontSize: 12, marginTop: 4 },
  privacy: { paddingVertical: 16, alignItems: 'center' },
  privacyText: { color: '#4A9EFF', fontSize: 13 },
  expiresText: { color: '#555', fontSize: 12, marginTop: 4 },
  safetyBtn: { backgroundColor: '#1A2A3A', padding: 18, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#4A9EFF', marginTop: 8 },
  safetyBtnText: { color: '#4A9EFF', fontWeight: '700', fontSize: 15 },
})
