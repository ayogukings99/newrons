/**
 * QuizCreator — configure and launch a quiz from a knowledge base
 * Lets the host pick KB, set difficulty/format/count, add a prize, and kick off generation.
 */
import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { apiClient } from '../../utils/apiClient'

interface KnowledgeBase {
  id: string
  name: string
  description?: string
  document_count: number
}

interface QuizCreatorProps {
  contextId?: string
  contextType?: 'hub' | 'event' | 'group' | 'meeting'
  onSessionCreated: (sessionId: string) => void
  onCancel: () => void
}

type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed'
type Format = 'multiple_choice' | 'true_false' | 'short_answer' | 'mixed'

const DIFFICULTIES: { value: Difficulty; label: string; emoji: string }[] = [
  { value: 'easy',   label: 'Easy',   emoji: '🟢' },
  { value: 'medium', label: 'Medium', emoji: '🟡' },
  { value: 'hard',   label: 'Hard',   emoji: '🔴' },
  { value: 'mixed',  label: 'Mixed',  emoji: '🎲' },
]

const FORMATS: { value: Format; label: string; desc: string }[] = [
  { value: 'multiple_choice', label: 'Multiple Choice', desc: 'A/B/C/D options' },
  { value: 'true_false',      label: 'True / False',    desc: 'Binary answers' },
  { value: 'short_answer',    label: 'Short Answer',    desc: 'AI-graded text' },
  { value: 'mixed',           label: 'Mixed',           desc: 'All formats' },
]

const QUESTION_COUNTS = [5, 10, 15, 20, 30]
const TIME_OPTIONS    = [10, 15, 20, 30, 45, 60]

export default function QuizCreator({ contextId, contextType, onSessionCreated, onCancel }: QuizCreatorProps) {
  const [kbs, setKbs]                       = useState<KnowledgeBase[]>([])
  const [selectedKb, setSelectedKb]         = useState<KnowledgeBase | null>(null)
  const [title, setTitle]                   = useState('')
  const [difficulty, setDifficulty]         = useState<Difficulty>('mixed')
  const [format, setFormat]                 = useState<Format>('mixed')
  const [questionCount, setQuestionCount]   = useState(10)
  const [timePerQuestion, setTimePerQuestion] = useState(20)
  const [prizeAmount, setPrizeAmount]       = useState('')
  const [prizeCurrency, setPrizeCurrency]   = useState('NGN')
  const [loadingKbs, setLoadingKbs]         = useState(true)
  const [creating, setCreating]             = useState(false)
  const [step, setStep]                     = useState<'pick_kb' | 'configure'>('pick_kb')

  useEffect(() => { fetchKbs() }, [])

  async function fetchKbs() {
    try {
      const data = await apiClient.get('/knowledge-bases')
      setKbs(data)
    } catch {
      Alert.alert('Error', 'Could not load knowledge bases')
    } finally {
      setLoadingKbs(false)
    }
  }

  function selectKb(kb: KnowledgeBase) {
    setSelectedKb(kb)
    setTitle(`${kb.name} Quiz`)
    setStep('configure')
  }

  async function handleCreate() {
    if (!selectedKb || !title.trim()) return
    setCreating(true)
    try {
      const payload: Record<string, any> = {
        knowledgeBaseId: selectedKb.id,
        title: title.trim(),
        difficulty,
        format,
        questionCount,
        timePerQuestionSec: timePerQuestion,
      }
      if (contextId)   payload.contextId   = contextId
      if (contextType) payload.contextType = contextType
      if (prizeAmount) {
        payload.prizeAmount   = parseFloat(prizeAmount)
        payload.prizeCurrency = prizeCurrency
      }
      const session = await apiClient.post('/quizzes', payload)
      // Trigger Claude question generation immediately
      await apiClient.post(`/quizzes/${session.id}/generate`, {})
      onSessionCreated(session.id)
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create quiz')
    } finally {
      setCreating(false)
    }
  }

  /* ── STEP 1: pick knowledge base ───────────────────────────── */
  if (step === 'pick_kb') {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onCancel}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
          <Text style={s.headerTitle}>New Quiz</Text>
          <View style={{ width: 60 }} />
        </View>

        <Text style={s.stepLabel}>Choose a Knowledge Base</Text>
        <Text style={s.stepSub}>Questions will be generated from your selected KB using Claude</Text>

        {loadingKbs ? (
          <ActivityIndicator color="#6C47FF" style={{ marginTop: 40 }} />
        ) : kbs.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyEmoji}>📚</Text>
            <Text style={s.emptyTitle}>No Knowledge Bases Yet</Text>
            <Text style={s.emptyBody}>
              Create a knowledge base and add documents first — then come back to build a quiz from it.
            </Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
            {kbs.map(kb => (
              <TouchableOpacity key={kb.id} style={s.kbCard} onPress={() => selectKb(kb)}>
                <View style={s.kbIcon}><Text style={{ fontSize: 20 }}>🧠</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.kbName}>{kb.name}</Text>
                  {kb.description ? <Text style={s.kbDesc} numberOfLines={2}>{kb.description}</Text> : null}
                  <Text style={s.kbMeta}>{kb.document_count} document{kb.document_count !== 1 ? 's' : ''}</Text>
                </View>
                <Text style={s.kbArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    )
  }

  /* ── STEP 2: configure quiz ─────────────────────────────────── */
  const estimatedMins = Math.ceil(questionCount * timePerQuestion / 60)

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setStep('pick_kb')}><Text style={s.cancelText}>‹ Back</Text></TouchableOpacity>
        <Text style={s.headerTitle}>Configure Quiz</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.selectedKbBadge}>
          <Text style={s.badgeEmoji}>🧠</Text>
          <Text style={s.badgeName}>{selectedKb!.name}</Text>
        </View>

        <Text style={s.fieldLabel}>Quiz Title</Text>
        <TextInput
          style={s.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Enter a title…"
          placeholderTextColor="#555"
          maxLength={120}
        />

        <Text style={s.fieldLabel}>Difficulty</Text>
        <View style={s.chipRow}>
          {DIFFICULTIES.map(d => (
            <TouchableOpacity
              key={d.value}
              style={[s.chip, difficulty === d.value && s.chipActive]}
              onPress={() => setDifficulty(d.value)}
            >
              <Text style={[s.chipText, difficulty === d.value && s.chipTextActive]}>{d.emoji} {d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Question Format</Text>
        <View style={s.formatGrid}>
          {FORMATS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[s.formatCard, format === f.value && s.formatCardActive]}
              onPress={() => setFormat(f.value)}
            >
              <Text style={[s.formatLabel, format === f.value && s.formatLabelActive]}>{f.label}</Text>
              <Text style={s.formatDesc}>{f.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Number of Questions</Text>
        <View style={s.chipRow}>
          {QUESTION_COUNTS.map(n => (
            <TouchableOpacity
              key={n}
              style={[s.chip, questionCount === n && s.chipActive]}
              onPress={() => setQuestionCount(n)}
            >
              <Text style={[s.chipText, questionCount === n && s.chipTextActive]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Seconds Per Question</Text>
        <View style={s.chipRow}>
          {TIME_OPTIONS.map(t => (
            <TouchableOpacity
              key={t}
              style={[s.chip, timePerQuestion === t && s.chipActive]}
              onPress={() => setTimePerQuestion(t)}
            >
              <Text style={[s.chipText, timePerQuestion === t && s.chipTextActive]}>{t}s</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.fieldLabel}>Prize (optional)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={prizeAmount}
            onChangeText={setPrizeAmount}
            placeholder="Amount"
            placeholderTextColor="#555"
            keyboardType="numeric"
          />
          <TextInput
            style={[s.input, { width: 80 }]}
            value={prizeCurrency}
            onChangeText={t => setPrizeCurrency(t.toUpperCase())}
            placeholder="NGN"
            placeholderTextColor="#555"
            maxLength={5}
          />
        </View>

        <View style={s.summaryBox}>
          <Text style={s.summaryTitle}>Quiz Summary</Text>
          <Text style={s.summaryLine}>📋 {questionCount} questions · {difficulty} difficulty</Text>
          <Text style={s.summaryLine}>⏱ {timePerQuestion}s per question (~{estimatedMins} min)</Text>
          <Text style={s.summaryLine}>📝 {FORMATS.find(f => f.value === format)?.label} format</Text>
          {prizeAmount ? <Text style={s.summaryLine}>🏆 {prizeAmount} {prizeCurrency} prize for winner</Text> : null}
        </View>

        <TouchableOpacity
          style={[s.createBtn, (!title.trim() || creating) && s.createBtnDisabled]}
          onPress={handleCreate}
          disabled={!title.trim() || creating}
        >
          {creating
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.createBtnText}>✨ Generate Questions & Create Quiz</Text>
          }
        </TouchableOpacity>
        <Text style={s.generateNote}>Claude will generate {questionCount} questions from your KB. Usually 5–15 seconds.</Text>
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#0A0A0F' },
  header:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  headerTitle:         { color: '#fff', fontSize: 17, fontWeight: '700' },
  cancelText:          { color: '#6C47FF', fontSize: 15 },
  stepLabel:           { color: '#fff', fontSize: 20, fontWeight: '700', margin: 16, marginBottom: 4 },
  stepSub:             { color: '#888', fontSize: 13, marginHorizontal: 16, marginBottom: 8 },
  emptyState:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji:          { fontSize: 48, marginBottom: 16 },
  emptyTitle:          { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody:           { color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  kbCard:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1E1E2E' },
  kbIcon:              { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1E1A3A', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  kbName:              { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  kbDesc:              { color: '#888', fontSize: 12, marginBottom: 4 },
  kbMeta:              { color: '#6C47FF', fontSize: 12 },
  kbArrow:             { color: '#555', fontSize: 24 },
  selectedKbBadge:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1A3A', borderRadius: 10, padding: 10, marginBottom: 20, borderWidth: 1, borderColor: '#6C47FF44' },
  badgeEmoji:          { fontSize: 18, marginRight: 8 },
  badgeName:           { color: '#fff', fontSize: 14, fontWeight: '600' },
  fieldLabel:          { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input:               { backgroundColor: '#12121A', borderRadius: 10, borderWidth: 1, borderColor: '#1E1E2E', color: '#fff', padding: 12, fontSize: 15 },
  chipRow:             { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:                { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#12121A', borderWidth: 1, borderColor: '#1E1E2E' },
  chipActive:          { backgroundColor: '#6C47FF', borderColor: '#6C47FF' },
  chipText:            { color: '#aaa', fontSize: 13, fontWeight: '500' },
  chipTextActive:      { color: '#fff' },
  formatGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formatCard:          { width: '48%', backgroundColor: '#12121A', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#1E1E2E' },
  formatCardActive:    { borderColor: '#6C47FF', backgroundColor: '#1E1A3A' },
  formatLabel:         { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 2 },
  formatLabelActive:   { color: '#fff' },
  formatDesc:          { color: '#666', fontSize: 11 },
  summaryBox:          { backgroundColor: '#12121A', borderRadius: 12, padding: 14, marginTop: 20, borderWidth: 1, borderColor: '#1E1E2E' },
  summaryTitle:        { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  summaryLine:         { color: '#bbb', fontSize: 13, marginBottom: 4 },
  createBtn:           { backgroundColor: '#6C47FF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  createBtnDisabled:   { opacity: 0.5 },
  createBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  generateNote:        { color: '#666', fontSize: 12, textAlign: 'center', marginTop: 8 },
})
