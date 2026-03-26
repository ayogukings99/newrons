/**
 * LiveQuizParticipant — participant-side live quiz interface
 *
 * WebSocket receives: quiz_started, question, leaderboard_update, quiz_ended
 * Participant sees countdown timer, answer options, and instant feedback after answering.
 * Speed bonus: answering in first 25% of time earns +50% points (shown if earned).
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Vibration,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { apiClient } from '../../utils/apiClient'

interface QuizQuestion {
  id: string
  question_number: number
  question_text: string
  format: 'multiple_choice' | 'true_false' | 'short_answer'
  choices?: string[]       // e.g. ["A. Lagos", "B. Abuja", ...]
  time_limit_sec: number
}

interface AnswerResult {
  is_correct: boolean
  points_earned: number
  speed_bonus: boolean
  correct_answer?: string
  explanation?: string
}

interface LeaderboardEntry {
  user_id: string
  display_name: string
  total_points: number
  rank: number
}

interface LiveQuizParticipantProps {
  sessionId: string
  onEnd: (finalLeaderboard: LeaderboardEntry[]) => void
}

type ParticipantPhase = 'waiting' | 'question' | 'answered' | 'between' | 'ended'

const CHOICE_LABELS = ['A', 'B', 'C', 'D']
const CHOICE_COLORS = ['#4A90D9', '#30D158', '#FF9500', '#FF4444']

export default function LiveQuizParticipant({ sessionId, onEnd }: LiveQuizParticipantProps) {
  const [phase, setPhase]                   = useState<ParticipantPhase>('waiting')
  const [question, setQuestion]             = useState<QuizQuestion | null>(null)
  const [timeLeft, setTimeLeft]             = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [shortAnswer, setShortAnswer]       = useState('')
  const [result, setResult]                 = useState<AnswerResult | null>(null)
  const [leaderboard, setLeaderboard]       = useState<LeaderboardEntry[]>([])
  const [totalPoints, setTotalPoints]       = useState(0)
  const [submitting, setSubmitting]         = useState(false)
  const [questionCount, setQuestionCount]   = useState(0)
  const startTimeRef                        = useRef<number>(0)
  const timerRef                            = useRef<ReturnType<typeof setInterval> | null>(null)
  const progressAnim                        = useRef(new Animated.Value(1)).current
  const feedbackAnim                        = useRef(new Animated.Value(0)).current
  const wsRef                               = useRef<WebSocket | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`${process.env.EXPO_PUBLIC_WS_URL}/quizzes/${sessionId}/ws`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        handleWsMessage(msg)
      } catch {}
    }
    ws.onerror = () => {}

    return () => {
      ws.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sessionId])

  function handleWsMessage(msg: any) {
    if (msg.type === 'quiz_started') {
      setQuestionCount(msg.questionCount ?? 0)
      setPhase('waiting')
    }

    if (msg.type === 'question') {
      const q: QuizQuestion = msg.question
      q.time_limit_sec = msg.endsAt
        ? Math.max(0, Math.round((new Date(msg.endsAt).getTime() - Date.now()) / 1000))
        : q.time_limit_sec ?? 20

      setQuestion(q)
      setSelectedAnswer(null)
      setShortAnswer('')
      setResult(null)
      setPhase('question')
      startTimeRef.current = Date.now()

      // Start countdown
      if (timerRef.current) clearInterval(timerRef.current)
      setTimeLeft(q.time_limit_sec)
      progressAnim.setValue(1)
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: q.time_limit_sec * 1000,
        useNativeDriver: false,
      }).start()

      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            setPhase(p => p === 'question' ? 'between' : p)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    if (msg.type === 'leaderboard_update') {
      setLeaderboard(msg.leaderboard ?? [])
      if (phase !== 'question') setPhase('between')
    }

    if (msg.type === 'quiz_ended') {
      clearInterval(timerRef.current!)
      setLeaderboard(msg.finalLeaderboard ?? [])
      setPhase('ended')
      onEnd(msg.finalLeaderboard ?? [])
    }
  }

  async function handleSubmit(answer: string) {
    if (!question || submitting) return
    const responseTimeMs = Date.now() - startTimeRef.current
    setSubmitting(true)

    try {
      const res = await apiClient.post(`/quizzes/${sessionId}/respond`, {
        questionId: question.id,
        response: answer,
        responseTimeMs,
      })
      clearInterval(timerRef.current!)
      setResult(res)
      setTotalPoints(prev => prev + (res.points_earned ?? 0))
      setPhase('answered')

      if (res.is_correct) {
        Vibration.vibrate(100)
      } else {
        Vibration.vibrate([0, 80, 50, 80])
      }

      // Animate feedback in
      Animated.spring(feedbackAnim, {
        toValue: 1, useNativeDriver: true, tension: 80, friction: 8,
      }).start()
    } catch {
      setPhase('between')
    } finally {
      setSubmitting(false)
    }
  }

  /* ── WAITING ────────────────────────────────────────────────── */
  if (phase === 'waiting') {
    return (
      <View style={s.centerContainer}>
        <Text style={s.waitEmoji}>🧠</Text>
        <Text style={s.waitTitle}>Quiz is starting…</Text>
        <Text style={s.waitSub}>Get ready — the host is about to broadcast the first question</Text>
        <ActivityIndicator color="#6C47FF" style={{ marginTop: 20 }} />
        <Text style={s.totalPts}>Total points: {totalPoints}</Text>
      </View>
    )
  }

  /* ── BETWEEN QUESTIONS ──────────────────────────────────────── */
  if (phase === 'between') {
    const myEntry = leaderboard.find(e => e.rank != null)
    return (
      <View style={s.centerContainer}>
        <Text style={s.waitEmoji}>⏳</Text>
        <Text style={s.waitTitle}>Next question coming…</Text>
        <Text style={s.totalPts}>Your points: {totalPoints}</Text>
        {leaderboard.slice(0, 3).map((e, i) => (
          <Text key={e.user_id} style={s.miniLbRow}>
            {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {e.display_name} — {e.total_points} pts
          </Text>
        ))}
      </View>
    )
  }

  /* ── ENDED ────────────────────────────────────────────────── */
  if (phase === 'ended') {
    const myRank = leaderboard.find(e => e.total_points === totalPoints)?.rank
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Quiz Over! 🎉</Text>
        </View>
        <View style={s.centerContainer}>
          <Text style={s.bigPoints}>{totalPoints}</Text>
          <Text style={s.bigPointsLabel}>total points</Text>
          {myRank && <Text style={s.myRank}>You finished #{myRank}</Text>}
        </View>
      </View>
    )
  }

  /* ── QUESTION ───────────────────────────────────────────────── */
  if (!question) return null

  const timerColor = timeLeft <= 5 ? '#FF4444' : timeLeft <= 10 ? '#FF9500' : '#6C47FF'
  const isAnswered = phase === 'answered'

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Timer bar */}
      <View style={s.timerBar}>
        <View style={s.timerBarTrack}>
          <Animated.View
            style={[s.timerBarFill, {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: timerColor,
            }]}
          />
        </View>
        <Text style={[s.timerNum, { color: timerColor }]}>{timeLeft}</Text>
      </View>

      <ScrollView contentContainerStyle={s.questionScroll} keyboardShouldPersistTaps="handled">
        {/* Question number badge */}
        <View style={s.qNumBadge}>
          <Text style={s.qNumText}>Q{question.question_number}{questionCount > 0 ? ` of ${questionCount}` : ''}</Text>
        </View>

        {/* Question text */}
        <Text style={s.questionText}>{question.question_text}</Text>

        {/* Answer area */}
        {question.format === 'short_answer' ? (
          <View style={s.shortAnswerBox}>
            <TextInput
              style={s.shortAnswerInput}
              value={shortAnswer}
              onChangeText={setShortAnswer}
              placeholder="Type your answer…"
              placeholderTextColor="#555"
              multiline
              editable={!isAnswered}
            />
            {!isAnswered && (
              <TouchableOpacity
                style={[s.submitBtn, (!shortAnswer.trim() || submitting) && s.submitBtnDisabled]}
                onPress={() => handleSubmit(shortAnswer.trim())}
                disabled={!shortAnswer.trim() || submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.submitBtnText}>Submit Answer</Text>
                }
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.choicesGrid}>
            {(question.choices ?? (question.format === 'true_false' ? ['True', 'False'] : [])).map((choice, i) => {
              const label = CHOICE_LABELS[i] ?? String(i + 1)
              const isSelected = selectedAnswer === choice
              const isCorrect  = isAnswered && result?.correct_answer === choice
              const isWrong    = isAnswered && isSelected && !result?.is_correct

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.choiceBtn,
                    { borderColor: CHOICE_COLORS[i % CHOICE_COLORS.length] },
                    isSelected  && s.choiceBtnSelected,
                    isCorrect   && s.choiceBtnCorrect,
                    isWrong     && s.choiceBtnWrong,
                    isAnswered  && !isSelected && !isCorrect && s.choiceBtnFaded,
                  ]}
                  onPress={() => {
                    if (isAnswered || submitting) return
                    setSelectedAnswer(choice)
                    handleSubmit(choice)
                  }}
                  disabled={isAnswered || submitting}
                >
                  <View style={[s.choiceLabel, { backgroundColor: CHOICE_COLORS[i % CHOICE_COLORS.length] }]}>
                    <Text style={s.choiceLabelText}>{label}</Text>
                  </View>
                  <Text style={[s.choiceText, (isCorrect || (isSelected && result?.is_correct)) && s.choiceTextCorrect]}>
                    {choice}
                  </Text>
                  {isCorrect  && <Text style={s.choiceIndicator}>✓</Text>}
                  {isWrong    && <Text style={s.choiceIndicatorWrong}>✗</Text>}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Feedback card */}
        {isAnswered && result && (
          <Animated.View
            style={[
              s.feedbackCard,
              result.is_correct ? s.feedbackCorrect : s.feedbackWrong,
              { transform: [{ scale: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }], opacity: feedbackAnim },
            ]}
          >
            <Text style={s.feedbackEmoji}>{result.is_correct ? '🎯' : '💡'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.feedbackTitle}>
                {result.is_correct ? `+${result.points_earned} pts${result.speed_bonus ? ' ⚡ Speed Bonus!' : ''}` : 'Incorrect'}
              </Text>
              {result.explanation
                ? <Text style={s.feedbackExplanation}>{result.explanation}</Text>
                : !result.is_correct && result.correct_answer
                  ? <Text style={s.feedbackExplanation}>Correct: {result.correct_answer}</Text>
                  : null
              }
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Points bar */}
      <View style={s.pointsBar}>
        <Text style={s.pointsBarText}>⭐ {totalPoints} pts</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#0A0A0F' },
  header:               { padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  headerTitle:          { color: '#fff', fontSize: 17, fontWeight: '700' },
  centerContainer:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12, backgroundColor: '#0A0A0F' },
  waitEmoji:            { fontSize: 56 },
  waitTitle:            { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  waitSub:              { color: '#888', fontSize: 14, textAlign: 'center' },
  totalPts:             { color: '#6C47FF', fontSize: 15, fontWeight: '700', marginTop: 8 },
  miniLbRow:            { color: '#bbb', fontSize: 13, marginTop: 4 },
  bigPoints:            { color: '#6C47FF', fontSize: 72, fontWeight: '800' },
  bigPointsLabel:       { color: '#888', fontSize: 14 },
  myRank:               { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 8 },
  timerBar:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 8, gap: 10 },
  timerBarTrack:        { flex: 1, height: 6, backgroundColor: '#1E1E2E', borderRadius: 3, overflow: 'hidden' },
  timerBarFill:         { height: 6, borderRadius: 3 },
  timerNum:             { fontSize: 20, fontWeight: '800', width: 32, textAlign: 'right' },
  questionScroll:       { padding: 16, paddingBottom: 32 },
  qNumBadge:            { backgroundColor: '#1E1A3A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 12 },
  qNumText:             { color: '#6C47FF', fontSize: 12, fontWeight: '700' },
  questionText:         { color: '#fff', fontSize: 18, fontWeight: '600', lineHeight: 26, marginBottom: 24 },
  choicesGrid:          { gap: 10 },
  choiceBtn:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderRadius: 12, borderWidth: 1.5, overflow: 'hidden', minHeight: 54 },
  choiceBtnSelected:    { backgroundColor: '#1E1A3A' },
  choiceBtnCorrect:     { backgroundColor: '#0D2B1A', borderColor: '#30D158' },
  choiceBtnWrong:       { backgroundColor: '#2B0D0D', borderColor: '#FF4444' },
  choiceBtnFaded:       { opacity: 0.5 },
  choiceLabel:          { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 54 },
  choiceLabelText:      { color: '#fff', fontSize: 15, fontWeight: '800' },
  choiceText:           { flex: 1, color: '#ddd', fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 },
  choiceTextCorrect:    { color: '#30D158', fontWeight: '600' },
  choiceIndicator:      { color: '#30D158', fontSize: 18, paddingRight: 12 },
  choiceIndicatorWrong: { color: '#FF4444', fontSize: 18, paddingRight: 12 },
  shortAnswerBox:       { gap: 12 },
  shortAnswerInput:     { backgroundColor: '#12121A', borderRadius: 12, borderWidth: 1, borderColor: '#1E1E2E', color: '#fff', padding: 14, fontSize: 15, minHeight: 100, textAlignVertical: 'top' },
  submitBtn:            { backgroundColor: '#6C47FF', borderRadius: 10, padding: 14, alignItems: 'center' },
  submitBtnDisabled:    { opacity: 0.4 },
  submitBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  feedbackCard:         { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 12, padding: 14, marginTop: 20, gap: 10 },
  feedbackCorrect:      { backgroundColor: '#0D2B1A', borderWidth: 1, borderColor: '#30D15844' },
  feedbackWrong:        { backgroundColor: '#2B0D0D', borderWidth: 1, borderColor: '#FF444444' },
  feedbackEmoji:        { fontSize: 24 },
  feedbackTitle:        { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 4 },
  feedbackExplanation:  { color: '#bbb', fontSize: 13, lineHeight: 18 },
  pointsBar:            { backgroundColor: '#12121A', borderTopWidth: 1, borderTopColor: '#1E1E2E', padding: 12, alignItems: 'center' },
  pointsBarText:        { color: '#6C47FF', fontSize: 15, fontWeight: '700' },
})
