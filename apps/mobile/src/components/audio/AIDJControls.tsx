import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Switch, Animated, Dimensions,
} from 'react-native'
import { usePut } from '../../hooks/useApi'

const { width } = Dimensions.get('window')

type AIMood = 'energetic' | 'chill' | 'focused' | 'celebratory'

const MOODS: { key: AIMood; label: string; icon: string; desc: string; genres: string }[] = [
  {
    key: 'energetic',
    label: 'Energetic',
    icon: '⚡',
    desc: 'High energy, crowd-moving',
    genres: 'Afrobeats, Amapiano, Dancehall',
  },
  {
    key: 'celebratory',
    label: 'Celebratory',
    icon: '🎉',
    desc: 'Party mode, big anthems',
    genres: 'Afro-pop, Highlife, Jùjú',
  },
  {
    key: 'chill',
    label: 'Chill',
    icon: '🌙',
    desc: 'Relaxed, low-key vibes',
    genres: 'Afro-soul, R&B, Lo-fi Afro',
  },
  {
    key: 'focused',
    label: 'Focused',
    icon: '🎯',
    desc: 'Concentration, study mode',
    genres: 'Instrumental, Lo-fi, Ambient',
  },
]

interface Props {
  sessionId: string
  enabled: boolean
  currentMood: AIMood
  onToggle?: (enabled: boolean) => void
  onMoodChange?: (mood: AIMood) => void
}

export default function AIDJControls({
  sessionId,
  enabled,
  currentMood,
  onToggle,
  onMoodChange,
}: Props) {
  const [loading, setLoading] = useState(false)
  const { put } = usePut()

  const handleToggle = async (value: boolean) => {
    setLoading(true)
    try {
      await put(`/audio-sessions/${sessionId}/ai-dj`, {
        enabled: value,
        mood: currentMood,
      })
      onToggle?.(value)
    } finally {
      setLoading(false)
    }
  }

  const handleMoodSelect = async (mood: AIMood) => {
    if (mood === currentMood) return
    setLoading(true)
    try {
      await put(`/audio-sessions/${sessionId}/ai-dj`, { enabled, mood })
      onMoodChange?.(mood)
    } finally {
      setLoading(false)
    }
  }

  const activeMood = MOODS.find(m => m.key === currentMood)

  return (
    <View style={styles.container}>
      {/* AI DJ Toggle */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleTitle}>🤖 AI DJ</Text>
          <Text style={styles.toggleDesc}>
            Claude selects tracks based on mood, time, and listener reactions
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={loading}
          trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(33,150,243,0.4)' }}
          thumbColor={enabled ? '#2196F3' : 'rgba(255,255,255,0.3)'}
        />
      </View>

      {/* Current mood display */}
      {enabled && activeMood && (
        <View style={styles.activeMoodBar}>
          <Text style={styles.activeMoodIcon}>{activeMood.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.activeMoodLabel}>Currently: {activeMood.label}</Text>
            <Text style={styles.activeMoodGenres}>{activeMood.genres}</Text>
          </View>
        </View>
      )}

      {/* Mood selector */}
      <View style={styles.moodsSection}>
        <Text style={styles.sectionLabel}>Set the Mood</Text>
        <View style={styles.moodsGrid}>
          {MOODS.map(mood => (
            <TouchableOpacity
              key={mood.key}
              style={[
                styles.moodCard,
                currentMood === mood.key && styles.moodCardActive,
                !enabled && styles.moodCardDisabled,
              ]}
              onPress={() => handleMoodSelect(mood.key)}
              disabled={!enabled || loading}
            >
              <Text style={styles.moodIcon}>{mood.icon}</Text>
              <Text style={[styles.moodLabel, currentMood === mood.key && styles.moodLabelActive]}>
                {mood.label}
              </Text>
              <Text style={styles.moodDesc}>{mood.desc}</Text>
              <Text style={styles.moodGenres}>{mood.genres}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* How it works */}
      <View style={styles.howItWorks}>
        <Text style={styles.howTitle}>How AI DJ works</Text>
        <Text style={styles.howBody}>
          Claude reads the room — the hub type, time of day, what's been playing,
          and listener thumbs up/down — and picks the next track automatically.
          You keep the rewind.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 20,
    backgroundColor: 'rgba(33,150,243,0.06)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  toggleInfo: { flex: 1 },
  toggleTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  toggleDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 16 },

  activeMoodBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: 'rgba(33,150,243,0.1)',
  },
  activeMoodIcon: { fontSize: 28 },
  activeMoodLabel: { color: '#2196F3', fontWeight: '600', fontSize: 14 },
  activeMoodGenres: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },

  moodsSection: { padding: 20 },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16,
  },
  moodsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  moodCard: {
    width: (width - 56) / 2, padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  moodCardActive: { borderColor: '#2196F3', backgroundColor: 'rgba(33,150,243,0.12)' },
  moodCardDisabled: { opacity: 0.4 },
  moodIcon: { fontSize: 28, marginBottom: 6 },
  moodLabel: { color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  moodLabelActive: { color: '#2196F3' },
  moodDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 4 },
  moodGenres: { color: 'rgba(255,255,255,0.25)', fontSize: 11, lineHeight: 14 },

  howItWorks: {
    margin: 20, padding: 16,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
  },
  howTitle: { color: 'rgba(255,255,255,0.6)', fontWeight: '700', fontSize: 13, marginBottom: 8 },
  howBody: { color: 'rgba(255,255,255,0.3)', fontSize: 12, lineHeight: 18 },
})
