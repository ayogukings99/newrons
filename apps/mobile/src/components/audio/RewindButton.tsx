import React, { useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Vibration } from 'react-native'
import { usePost } from '../../hooks/useApi'

interface Props {
  sessionId: string
  size?: 'normal' | 'large'
}

/**
 * RewindButton — The cultural heart of NEXUS audio.
 *
 * In African sound system culture (dancehall, Afrobeats, early highlife),
 * the rewind is a crowd signal: when a track is too good, you don't let it end —
 * you demand the DJ pull it back to the top.
 *
 * This button:
 *   1. Triggers a haptic pulse
 *   2. Calls POST /audio-sessions/:id/rewind
 *   3. Every listener's audio snaps back to position 0 simultaneously
 *   4. A vinyl scratch animation plays
 */
export default function RewindButton({ sessionId, size = 'normal' }: Props) {
  const [rewinding, setRewinding] = useState(false)
  const [rewindCount, setRewindCount] = useState(0)
  const scaleAnim = useRef(new Animated.Value(1)).current
  const rotateAnim = useRef(new Animated.Value(0)).current
  const { post } = usePost()

  const triggerRewind = async () => {
    if (rewinding) return

    // Haptic feedback — strong pulse
    Vibration.vibrate([0, 50, 30, 100])

    setRewinding(true)

    // Vinyl spin-back animation
    Animated.parallel([
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.2, duration: 80, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.9, duration: 200, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: -1, duration: 300, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
    ]).start()

    try {
      await post(`/audio-sessions/${sessionId}/rewind`, {})
      setRewindCount(prev => prev + 1)
    } catch (err: any) {
      // Non-fatal — user might not have DJ access
    } finally {
      setTimeout(() => setRewinding(false), 600)
    }
  }

  const rotation = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-180deg', '0deg', '180deg'],
  })

  const isLarge = size === 'large'

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity onPress={triggerRewind} activeOpacity={0.8} disabled={rewinding}>
        <Animated.View
          style={[
            styles.button,
            isLarge && styles.buttonLarge,
            rewinding && styles.buttonActive,
            { transform: [{ scale: scaleAnim }, { rotate: rotation }] },
          ]}
        >
          <Text style={[styles.icon, isLarge && styles.iconLarge]}>⏪</Text>
        </Animated.View>
      </TouchableOpacity>

      <Text style={styles.label}>REWIND</Text>

      {rewindCount > 0 && (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{rewindCount}×</Text>
        </View>
      )}

      <Text style={styles.subLabel}>
        {rewinding ? 'Rewinding the whole room...' : 'Pull it back — the crowd demands it'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8 },

  button: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(244,67,54,0.15)',
    borderWidth: 2.5, borderColor: '#F44336',
    justifyContent: 'center', alignItems: 'center',
  },
  buttonLarge: { width: 120, height: 120, borderRadius: 60 },
  buttonActive: { backgroundColor: 'rgba(244,67,54,0.4)', borderColor: '#fff' },

  icon: { fontSize: 32 },
  iconLarge: { fontSize: 48 },

  label: {
    color: '#F44336', fontWeight: '900', fontSize: 12,
    letterSpacing: 2, textTransform: 'uppercase',
  },

  countBadge: {
    backgroundColor: '#F44336',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12,
  },
  countText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  subLabel: {
    color: 'rgba(255,255,255,0.3)', fontSize: 11,
    textAlign: 'center', maxWidth: 200, lineHeight: 16,
  },
})
