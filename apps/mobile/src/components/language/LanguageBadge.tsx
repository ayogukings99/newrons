import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  languageCode: string
  languageName: string
  contributionCount: number
  validatedCount: number
  isBuilder?: boolean
}

export default function LanguageBadge({ languageCode, languageName, contributionCount, validatedCount, isBuilder }: Props) {
  const level = validatedCount >= 50 ? 'Elder' : validatedCount >= 20 ? 'Senior' : validatedCount >= 5 ? 'Builder' : 'Learner'
  const levelColor = level === 'Elder' ? '#FFD700' : level === 'Senior' ? '#C0C0C0' : level === 'Builder' ? '#00C853' : '#888'

  return (
    <View style={styles.badge}>
      <View style={[styles.dot, { backgroundColor: levelColor }]} />
      <View>
        <Text style={styles.langName}>{languageName}</Text>
        <Text style={[styles.level, { color: levelColor }]}>{level} · {validatedCount} validated</Text>
      </View>
      {isBuilder && <Text style={styles.builderIcon}>🏗</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1A1A1A', padding: 12, borderRadius: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  langName: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  level: { fontSize: 12, marginTop: 2 },
  builderIcon: { marginLeft: 'auto', fontSize: 18 },
})
