import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions,
} from 'react-native'
import { Audio } from 'expo-av'
import { useGet, usePost } from '../../hooks/useApi'

const { width } = Dimensions.get('window')

interface SyncState {
  trackId: string | null
  positionMs: number
  timestamp: number
  effect: string
  eq: { bass: number; mid: number; treble: number }
  aiDjEnabled: boolean
  aiDjMood: string | null
}

interface Props {
  sessionId: string
  sessionTitle: string
  isHost: boolean
  isDJ: boolean
  onOpenDJConsole?: () => void
  onLeave?: () => void
}

const EFFECT_ICONS: Record<string, string> = {
  reverb: '🌊', echo: '🔁', vinyl: '📀', rewind: '⏪', none: '',
}

export default function GroupAudioPlayer({
  sessionId,
  sessionTitle,
  isHost,
  isDJ,
  onOpenDJConsole,
  onLeave,
}: Props) {
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [sound, setSound] = useState<Audio.Sound | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [listenerCount, setListenerCount] = useState(0)
  const [activeEffect, setActiveEffect] = useState<string>('none')

  const pulseAnim = useRef(new Animated.Value(1)).current
  const wsRef = useRef<WebSocket | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { get } = useGet()
  const { post } = usePost()

  // Pulse animation for the "live" indicator
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // Connect to WebSocket for real-time events
  useEffect(() => {
    const wsUrl = `wss://api.neurons.app/api/v1/audio-sessions/${sessionId}/ws`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      handleWSMessage(msg)
    }

    ws.onopen = () => ws.send(JSON.stringify({ type: 'ping' }))

    return () => {
      ws.close()
    }
  }, [sessionId])

  // Poll sync state every 10 seconds for drift correction
  useEffect(() => {
    const doSync = async () => {
      try {
        const state: SyncState = await get(`/audio-sessions/${sessionId}/sync`)
        setSyncState(state)
        await applySync(state)
      } catch {
        // Session may have ended
      }
    }

    doSync()
    syncIntervalRef.current = setInterval(doSync, 10000)

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    }
  }, [sessionId])

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      sound?.unloadAsync()
    }
  }, [sound])

  const handleWSMessage = useCallback((msg: any) => {
    switch (msg.type) {
      case 'track_change':
        // Load and play the new track, seeking to positionMs + latency compensation
        loadTrack(msg.trackId, msg.positionMs, msg.timestamp)
        break

      case 'effect_applied':
        setActiveEffect(msg.effect)
        // Apply audio effect to local playback
        // In production: use Web Audio API nodes for reverb/echo/vinyl simulation
        if (msg.effect === 'rewind') {
          sound?.setPositionAsync(0)
        }
        break

      case 'rewind':
        sound?.setPositionAsync(0)
        setActiveEffect('rewind')
        break

      case 'session_ended':
        sound?.unloadAsync()
        setIsPlaying(false)
        onLeave?.()
        break
    }
  }, [sound])

  const loadTrack = async (
    trackId: string,
    targetPositionMs: number,
    serverTimestamp: number
  ) => {
    try {
      // Unload previous track
      await sound?.unloadAsync()

      // Fetch track URL (in production: from creator_content table)
      // For now, use a placeholder — real implementation fetches from API
      const trackUrl = `https://api.neurons.app/tracks/${trackId}/stream`

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: trackUrl },
        { shouldPlay: false }
      )

      // Compensate for network latency
      const latencyMs = Date.now() - serverTimestamp
      const correctedPositionMs = targetPositionMs + latencyMs

      await newSound.setPositionAsync(correctedPositionMs)
      await newSound.playAsync()

      setSound(newSound)
      setIsPlaying(true)
    } catch (err) {
      console.error('[GroupAudioPlayer] Failed to load track:', err)
    }
  }

  const applySync = async (state: SyncState) => {
    if (!state.trackId || !sound) return

    // Calculate how far off we are
    const status = await sound.getStatusAsync()
    if (!status.isLoaded) return

    const expectedPositionMs = state.positionMs + (Date.now() - state.timestamp)
    const drift = Math.abs((status.positionMillis ?? 0) - expectedPositionMs)

    // Re-sync if drift is more than 2 seconds
    if (drift > 2000) {
      await sound.setPositionAsync(expectedPositionMs)
      console.log(`[GroupAudioPlayer] Corrected ${drift}ms drift`)
    }
  }

  const handleLeave = async () => {
    await post(`/audio-sessions/${sessionId}/leave`, {})
    sound?.unloadAsync()
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current)
    wsRef.current?.close()
    onLeave?.()
  }

  const effectIcon = EFFECT_ICONS[activeEffect] ?? ''

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
          <Text style={styles.leaveBtnText}>← Leave</Text>
        </TouchableOpacity>
        <View style={styles.liveBadge}>
          <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
        <View style={styles.listenerPill}>
          <Text style={styles.listenerText}>👤 {listenerCount}</Text>
        </View>
      </View>

      {/* Main display */}
      <View style={styles.mainDisplay}>
        {/* Visualizer rings */}
        <View style={styles.visualizerContainer}>
          {[120, 150, 180, 210].map((size, i) => (
            <Animated.View
              key={i}
              style={[
                styles.visualizerRing,
                {
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  borderColor: `rgba(245,166,35,${0.15 - i * 0.03})`,
                  transform: [{ scale: isPlaying ? pulseAnim : 1 }],
                },
              ]}
            />
          ))}
          <View style={styles.visualizerCenter}>
            <Text style={styles.visualizerIcon}>
              {syncState?.aiDjEnabled ? '🤖' : '🎵'}
            </Text>
            {effectIcon ? (
              <Text style={styles.effectOverlay}>{effectIcon}</Text>
            ) : null}
          </View>
        </View>

        {/* Session info */}
        <Text style={styles.sessionTitle}>{sessionTitle}</Text>

        {syncState?.aiDjEnabled && (
          <View style={styles.aiDjBadge}>
            <Text style={styles.aiDjBadgeText}>
              🤖 AI DJ · {syncState.aiDjMood ?? 'energetic'}
            </Text>
          </View>
        )}

        {/* Active effect indicator */}
        {activeEffect && activeEffect !== 'none' && (
          <View style={styles.effectBadge}>
            <Text style={styles.effectBadgeText}>{effectIcon} {activeEffect.toUpperCase()}</Text>
          </View>
        )}
      </View>

      {/* EQ preview */}
      {syncState && (
        <View style={styles.eqPreview}>
          {(['bass', 'mid', 'treble'] as const).map(band => (
            <View key={band} style={styles.eqBand}>
              <View style={styles.eqBarBg}>
                <View
                  style={[
                    styles.eqBarFill,
                    { height: `${syncState.eq[band]}%` },
                  ]}
                />
              </View>
              <Text style={styles.eqBandLabel}>{band[0].toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )}

      {/* DJ Console button (DJ/host only) */}
      {(isDJ || isHost) && (
        <TouchableOpacity style={styles.djConsoleBtn} onPress={onOpenDJConsole}>
          <Text style={styles.djConsoleBtnText}>🎛 Open DJ Console</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12,
  },
  leaveBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  leaveBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(244,67,54,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F44336' },
  liveBadgeText: { color: '#F44336', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  listenerPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16,
  },
  listenerText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },

  mainDisplay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 20 },

  visualizerContainer: { justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  visualizerRing: {
    position: 'absolute', borderWidth: 1.5,
  },
  visualizerCenter: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(245,166,35,0.15)',
    borderWidth: 2, borderColor: '#F5A623',
    justifyContent: 'center', alignItems: 'center',
  },
  visualizerIcon: { fontSize: 36 },
  effectOverlay: { position: 'absolute', bottom: 4, right: 4, fontSize: 18 },

  sessionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  aiDjBadge: {
    backgroundColor: 'rgba(33,150,243,0.15)', borderWidth: 1, borderColor: '#2196F3',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16,
  },
  aiDjBadgeText: { color: '#2196F3', fontWeight: '600', fontSize: 13 },
  effectBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(245,166,35,0.1)', borderWidth: 1, borderColor: '#F5A623',
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 16,
  },
  effectBadgeText: { color: '#F5A623', fontWeight: '600', fontSize: 13 },

  eqPreview: {
    flexDirection: 'row', gap: 12, justifyContent: 'center',
    paddingBottom: 24, alignItems: 'flex-end',
  },
  eqBand: { alignItems: 'center', gap: 4 },
  eqBarBg: {
    width: 20, height: 60, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden',
  },
  eqBarFill: { width: '100%', backgroundColor: '#F5A623', borderRadius: 4 },
  eqBandLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },

  djConsoleBtn: {
    margin: 20, marginTop: 0,
    backgroundColor: 'rgba(245,166,35,0.12)', borderWidth: 1, borderColor: '#F5A623',
    paddingVertical: 14, borderRadius: 10, alignItems: 'center',
  },
  djConsoleBtnText: { color: '#F5A623', fontWeight: '700', fontSize: 15 },
})
