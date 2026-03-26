import React, { useState } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, PanResponder,
  Animated, Dimensions, Alert,
} from 'react-native'
import { usePut, usePost } from '../../hooks/useApi'
import RewindButton from './RewindButton'

const { width } = Dimensions.get('window')
const SLIDER_HEIGHT = 160

type DJEffect = 'reverb' | 'echo' | 'vinyl' | 'none'

const EFFECTS: { key: DJEffect; label: string; icon: string; desc: string }[] = [
  { key: 'reverb', label: 'Reverb', icon: '🌊', desc: 'Deep hall echo' },
  { key: 'echo',   label: 'Echo',   icon: '🔁', desc: 'Delay repeat' },
  { key: 'vinyl',  label: 'Vinyl',  icon: '📀', desc: 'Warm crackle' },
  { key: 'none',   label: 'Clean',  icon: '✨', desc: 'No effect' },
]

interface Props {
  sessionId: string
  initialEQ?: { bass: number; mid: number; treble: number }
  initialEffect?: DJEffect
  onClose?: () => void
}

// Vertical slider component
function EQSlider({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  const pos = useRef(new Animated.Value(SLIDER_HEIGHT * (1 - value / 100))).current
  const startY = useRef(0)
  const startValue = useRef(value)

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (_, gs) => {
      startY.current = gs.y0
      startValue.current = value
    },
    onPanResponderMove: (_, gs) => {
      const delta = (gs.dy / SLIDER_HEIGHT) * 100
      const newValue = Math.max(0, Math.min(100, startValue.current - delta))
      onChange(newValue)
      pos.setValue(SLIDER_HEIGHT * (1 - newValue / 100))
    },
  })

  const fillHeight = SLIDER_HEIGHT * (value / 100)

  return (
    <View style={eqStyles.container}>
      <View style={eqStyles.track} {...panResponder.panHandlers}>
        <View style={[eqStyles.fill, { height: fillHeight }]} />
        <Animated.View style={[eqStyles.thumb, { top: pos }]} />
      </View>
      <Text style={eqStyles.value}>{Math.round(value)}</Text>
      <Text style={eqStyles.label}>{label}</Text>
    </View>
  )
}

import { useRef } from 'react'

const eqStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4 },
  track: {
    width: 40, height: SLIDER_HEIGHT,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20, justifyContent: 'flex-end',
    overflow: 'visible', position: 'relative',
  },
  fill: { width: '100%', backgroundColor: '#F5A623', borderRadius: 20 },
  thumb: {
    position: 'absolute', left: '50%', marginLeft: -10,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#fff', borderWidth: 2, borderColor: '#F5A623',
    elevation: 4, shadowColor: '#F5A623', shadowOpacity: 0.5, shadowRadius: 4,
  },
  value: { color: '#F5A623', fontSize: 13, fontWeight: '700' },
  label: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
})

export default function DJConsole({ sessionId, initialEQ, initialEffect, onClose }: Props) {
  const [eq, setEQ] = useState(initialEQ ?? { bass: 60, mid: 50, treble: 55 })
  const [activeEffect, setActiveEffect] = useState<DJEffect>(initialEffect ?? 'none')
  const [saving, setSaving] = useState(false)

  const { put } = usePut()
  const { post } = usePost()

  const updateEQ = async (band: keyof typeof eq, value: number) => {
    const newEQ = { ...eq, [band]: Math.round(value) }
    setEQ(newEQ)
    // Debounced update — send after user stops dragging (for production, debounce this)
    try {
      await put(`/audio-sessions/${sessionId}/eq`, newEQ)
    } catch {
      // Non-critical — UI stays responsive
    }
  }

  const applyEffect = async (effect: DJEffect) => {
    setActiveEffect(effect)
    try {
      await post(`/audio-sessions/${sessionId}/effect`, { effect })
    } catch (err: any) {
      Alert.alert('Error', err.message)
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎛 DJ Console</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>Done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* EQ section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>EQ — Equalizer</Text>
        <View style={styles.eqRow}>
          <EQSlider label="Bass" value={eq.bass} onChange={v => updateEQ('bass', v)} />
          <EQSlider label="Mid" value={eq.mid} onChange={v => updateEQ('mid', v)} />
          <EQSlider label="Treble" value={eq.treble} onChange={v => updateEQ('treble', v)} />
        </View>
      </View>

      {/* Effects section */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Effects</Text>
        <View style={styles.effectsGrid}>
          {EFFECTS.map(fx => (
            <TouchableOpacity
              key={fx.key}
              style={[styles.effectCard, activeEffect === fx.key && styles.effectCardActive]}
              onPress={() => applyEffect(fx.key)}
            >
              <Text style={styles.effectIcon}>{fx.icon}</Text>
              <Text style={styles.effectLabel}>{fx.label}</Text>
              <Text style={styles.effectDesc}>{fx.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* The Rewind */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Rewind — The crowd demands it</Text>
        <RewindButton sessionId={sessionId} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingBottom: 32 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  closeBtn: { color: '#F5A623', fontSize: 15, fontWeight: '600' },

  section: { paddingHorizontal: 20, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  sectionLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 20,
  },

  eqRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 20 },

  effectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  effectCard: {
    width: (width - 64) / 2, padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  effectCardActive: { borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.1)' },
  effectIcon: { fontSize: 28, marginBottom: 6 },
  effectLabel: { color: '#fff', fontWeight: '700', fontSize: 14, marginBottom: 2 },
  effectDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
})
