import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Animated, Alert, Dimensions,
} from 'react-native'
import { usePost, useGet } from '../../hooks/useApi'

const { width } = Dimensions.get('window')

type SessionType = 'group_listen' | 'live_dj' | 'broadcast' | 'ai_dj'
type HubType = 'barbershop' | 'office' | 'study' | 'household' | 'event' | 'broadcast'

const SESSION_TYPES: { key: SessionType; label: string; icon: string; desc: string }[] = [
  { key: 'group_listen', label: 'Group Listen', icon: '👂', desc: 'Everyone hears the same track in sync' },
  { key: 'live_dj',      label: 'Live DJ',      icon: '🎧', desc: 'You control the music, crowd listens' },
  { key: 'broadcast',    label: 'Broadcast',    icon: '📡', desc: 'One-way stream to your followers' },
  { key: 'ai_dj',        label: 'AI DJ',        icon: '🤖', desc: 'Let Claude pick and mix automatically' },
]

const HUB_TYPES: { key: HubType; label: string; icon: string }[] = [
  { key: 'barbershop', label: 'Barbershop',  icon: '💈' },
  { key: 'office',     label: 'Office',      icon: '🏢' },
  { key: 'study',      label: 'Study Room',  icon: '📚' },
  { key: 'household',  label: 'Home',        icon: '🏠' },
  { key: 'event',      label: 'Event',       icon: '🎪' },
  { key: 'broadcast',  label: 'Radio',       icon: '📻' },
]

interface ActiveSession {
  id: string
  session_type: SessionType
  title: string
  current_listeners: number
  ai_dj_enabled: boolean
}

interface Props {
  hubId: string
  onSessionStarted?: (sessionId: string) => void
  onJoinSession?: (sessionId: string) => void
}

export default function AudioSessionBroadcast({ hubId, onSessionStarted, onJoinSession }: Props) {
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([])
  const [creating, setCreating] = useState(false)
  const [sessionType, setSessionType] = useState<SessionType>('group_listen')
  const [hubType, setHubType] = useState<HubType>('barbershop')
  const [title, setTitle] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)

  const pulseAnim = useRef(new Animated.Value(1)).current
  const { get } = useGet()
  const { post } = usePost()

  useEffect(() => {
    loadSessions()
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  const loadSessions = async () => {
    try {
      const sessions = await get(`/audio-sessions/hub/${hubId}`)
      setActiveSessions(sessions ?? [])
    } catch { }
  }

  const startSession = async () => {
    setLoading(true)
    try {
      const session = await post('/audio-sessions', {
        hubId,
        hubType,
        sessionType,
        title: title.trim() || `${SESSION_TYPES.find(s => s.key === sessionType)?.label} · ${new Date().toLocaleTimeString()}`,
        isPublic,
      })

      Alert.alert('Session started!', `${activeSessions.length + 1 === 1 ? "You're" : 'Your session is'} live now.`)
      setShowCreateForm(false)
      setTitle('')
      loadSessions()
      onSessionStarted?.(session.id)
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  const selectedType = SESSION_TYPES.find(s => s.key === sessionType)

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Live sessions */}
      {activeSessions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Animated.View style={[styles.liveIndicator, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.sectionTitle}>Live Now</Text>
          </View>
          {activeSessions.map(session => (
            <TouchableOpacity
              key={session.id}
              style={styles.sessionCard}
              onPress={() => onJoinSession?.(session.id)}
            >
              <Text style={styles.sessionIcon}>
                {SESSION_TYPES.find(s => s.key === session.session_type)?.icon ?? '🎵'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionTitle}>{session.title}</Text>
                <View style={styles.sessionMeta}>
                  <Text style={styles.sessionMetaText}>
                    {SESSION_TYPES.find(s => s.key === session.session_type)?.label}
                  </Text>
                  <Text style={styles.sessionMetaText}>·</Text>
                  <Text style={styles.sessionMetaText}>
                    👤 {session.current_listeners}
                  </Text>
                  {session.ai_dj_enabled && (
                    <Text style={styles.sessionMetaText}>· 🤖 AI DJ</Text>
                  )}
                </View>
              </View>
              <View style={styles.joinBtn}>
                <Text style={styles.joinBtnText}>Join</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Create session */}
      {!showCreateForm ? (
        <View style={styles.startSection}>
          <Text style={styles.startTitle}>Start a Session</Text>
          <Text style={styles.startSub}>
            Play music in sync with everyone in your space.{'\n'}
            One tap — the whole room hears the same thing.
          </Text>
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => setShowCreateForm(true)}
          >
            <Text style={styles.startBtnText}>+ Start New Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.createForm}>
          <Text style={styles.formTitle}>New Session</Text>

          {/* Session type */}
          <Text style={styles.fieldLabel}>Session Type</Text>
          <View style={styles.typeGrid}>
            {SESSION_TYPES.map(type => (
              <TouchableOpacity
                key={type.key}
                style={[styles.typeCard, sessionType === type.key && styles.typeCardActive]}
                onPress={() => setSessionType(type.key)}
              >
                <Text style={styles.typeIcon}>{type.icon}</Text>
                <Text style={styles.typeLabel}>{type.label}</Text>
                <Text style={styles.typeDesc}>{type.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Hub type */}
          <Text style={styles.fieldLabel}>Space Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hubScroll}>
            {HUB_TYPES.map(hub => (
              <TouchableOpacity
                key={hub.key}
                style={[styles.hubChip, hubType === hub.key && styles.hubChipActive]}
                onPress={() => setHubType(hub.key)}
              >
                <Text style={styles.hubIcon}>{hub.icon}</Text>
                <Text style={[styles.hubLabel, hubType === hub.key && styles.hubLabelActive]}>
                  {hub.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Title */}
          <Text style={styles.fieldLabel}>Session Name (optional)</Text>
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder={`e.g. "Friday Cuts Mix", "Study Session"`}
            placeholderTextColor="rgba(255,255,255,0.2)"
            maxLength={80}
          />

          {/* Public toggle */}
          <TouchableOpacity
            style={styles.publicToggle}
            onPress={() => setIsPublic(!isPublic)}
          >
            <View style={[styles.publicToggleCheck, isPublic && styles.publicToggleCheckActive]}>
              {isPublic && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
            </View>
            <View>
              <Text style={styles.publicToggleLabel}>Open to the public</Text>
              <Text style={styles.publicToggleSub}>Anyone in NEXUS can discover and join</Text>
            </View>
          </TouchableOpacity>

          {/* Actions */}
          <View style={styles.formActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setShowCreateForm(false)}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.goLiveBtn, loading && { opacity: 0.6 }]}
              onPress={startSession}
              disabled={loading}
            >
              <Text style={styles.goLiveBtnText}>
                {loading ? 'Starting...' : `🔴 Go Live`}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  section: { paddingHorizontal: 20, paddingTop: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  liveIndicator: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F44336' },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  sessionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, marginBottom: 10,
  },
  sessionIcon: { fontSize: 28 },
  sessionTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  sessionMeta: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  sessionMetaText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  joinBtn: { backgroundColor: '#F5A623', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  joinBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },

  startSection: { padding: 32, alignItems: 'center' },
  startTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  startSub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  startBtn: { backgroundColor: '#F5A623', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 },
  startBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },

  createForm: { padding: 20 },
  formTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 24 },
  fieldLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  typeCard: {
    width: (width - 56) / 2, padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  typeCardActive: { borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.1)' },
  typeIcon: { fontSize: 24, marginBottom: 4 },
  typeLabel: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 2 },
  typeDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 14 },

  hubScroll: { marginBottom: 24 },
  hubChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'transparent', marginRight: 8,
  },
  hubChipActive: { borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.1)' },
  hubIcon: { fontSize: 18 },
  hubLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  hubLabelActive: { color: '#F5A623', fontWeight: '600' },

  titleInput: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10, padding: 14,
    color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 20,
  },

  publicToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  publicToggleCheck: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  publicToggleCheckActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  publicToggleLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  publicToggleSub: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },

  formActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  cancelBtnText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600', fontSize: 15 },
  goLiveBtn: {
    flex: 2, backgroundColor: '#F44336',
    paddingVertical: 14, borderRadius: 10, alignItems: 'center',
  },
  goLiveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
