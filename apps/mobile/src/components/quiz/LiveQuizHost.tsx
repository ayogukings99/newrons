/**
 * LiveQuizHost — host-side live quiz controller
 *
 * Flow: lobby → broadcasting questions one by one → leaderboard after each → end
 * The host presses "Next Question" to broadcast each question to participants via WebSocket.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native'
import { apiClient } from '../../utils/apiClient'

interface Participant {
  user_id: string
  display_name: string
  avatar_url?: string
}

interface LeaderboardEntry {
  user_id: string
  display_name: string
  total_points: number
  rank: number
}

interface LiveQuizHostProps {
  sessionId: string
  questionCount: number
  onEnd: () => void
}

type HostPhase = 'lobby' | 'between_questions' | 'question_live' | 'ended'

export default function LiveQuizHost({ sessionId, questionCount, onEnd }: LiveQuizHostProps) {
  const [phase, setPhase]                   = useState<HostPhase>('lobby')
  const [currentQ, setCurrentQ]             = useState(0)
  const [participants, setParticipants]     = useState<Participant[]>([])
  const [leaderboard, setLeaderboard]       = useState<LeaderboardEntry[]>([])
  const [timeLeft, setTimeLeft]             = useState(0)
  const [totalTime, setTotalTime]           = useState(20)
  const [loading, setLoading]               = useState(false)
  const timerRef                            = useRef<ReturnType<typeof setInterval> | null>(null)
  const wsRef                               = useRef<WebSocket | null>(null)
  const progressAnim                        = useRef(new Animated.Value(1)).current

  // Connect WebSocket to receive participant_joined events
  useEffect(() => {
    const ws = new WebSocket(`${process.env.EXPO_PUBLIC_WS_URL}/quizzes/${sessionId}/ws`)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'participant_joined') {
          setParticipants(prev => {
            if (prev.find(p => p.user_id === msg.userId)) return prev
            return [...prev, { user_id: msg.userId, display_name: msg.displayName ?? msg.userId, avatar_url: msg.avatarUrl }]
          })
        }
        if (msg.type === 'leaderboard_update') {
          setLeaderboard(msg.leaderboard ?? [])
        }
      } catch {}
    }

    ws.onerror = () => {}

    return () => {
      ws.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [sessionId])

  // Fetch leaderboard after each question
  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await apiClient.get(`/quizzes/${sessionId}/leaderboard`)
      setLeaderboard(data)
    } catch {}
  }, [sessionId])

  // Start the quiz
  async function handleStart() {
    setLoading(true)
    try {
      await apiClient.post(`/quizzes/${sessionId}/start`, {})
      setPhase('between_questions')
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  // Broadcast the next question
  async function handleBroadcastNext() {
    const qNum = currentQ + 1
    setLoading(true)
    try {
      await apiClient.post(`/quizzes/${sessionId}/broadcast/${qNum}`, {})
      setCurrentQ(qNum)
      setPhase('question_live')

      // Start countdown timer — we don't know exact time, use totalTime
      setTimeLeft(totalTime)
      progressAnim.setValue(1)
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: totalTime * 1000,
        useNativeDriver: false,
      }).start()

      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current!)
            fetchLeaderboard()
            setPhase('between_questions')
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setLoading(false)
    }
  }

  // End the quiz
  async function handleEnd() {
    Alert.alert('End Quiz?', 'This will finalize scores and distribute rewards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Quiz',
        style: 'destructive',
        onPress: async () => {
          setLoading(true)
          try {
            await apiClient.post(`/quizzes/${sessionId}/end`, {})
            setPhase('ended')
            await fetchLeaderboard()
          } catch (err: any) {
            Alert.alert('Error', err.message)
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  /* ── LOBBY ────────────────────────────────────────────────── */
  if (phase === 'lobby') {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Quiz Lobby</Text>
          <View style={s.sessionBadge}><Text style={s.sessionBadgeText}>HOST</Text></View>
        </View>

        <View style={s.lobbyCountBox}>
          <Text style={s.lobbyCount}>{participants.length}</Text>
          <Text style={s.lobbyCountLabel}>participant{participants.length !== 1 ? 's' : ''} joined</Text>
        </View>

        <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
          {participants.length === 0 ? (
            <View style={s.waitingBox}>
              <ActivityIndicator color="#6C47FF" />
              <Text style={s.waitingText}>Waiting for participants to join…</Text>
            </View>
          ) : (
            participants.map(p => (
              <View key={p.user_id} style={s.participantRow}>
                <View style={s.avatarCircle}>
                  <Text style={s.avatarInitial}>{(p.display_name[0] ?? '?').toUpperCase()}</Text>
                </View>
                <Text style={s.participantName}>{p.display_name}</Text>
                <View style={s.readyDot} />
              </View>
            ))
          )}
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.primaryBtn, (participants.length === 0 || loading) && s.primaryBtnDisabled]}
            onPress={handleStart}
            disabled={participants.length === 0 || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>▶ Start Quiz ({questionCount} questions)</Text>}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  /* ── BETWEEN QUESTIONS / LEADERBOARD ─────────────────────── */
  if (phase === 'between_questions') {
    const isLast = currentQ >= questionCount
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>
            {currentQ === 0 ? 'Ready to Start' : `After Q${currentQ}`}
          </Text>
          <Text style={s.questionProgress}>{currentQ}/{questionCount}</Text>
        </View>

        {currentQ > 0 && leaderboard.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Current Standings</Text>
            <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
              {leaderboard.slice(0, 10).map((entry, i) => (
                <View key={entry.user_id} style={[s.lbRow, i === 0 && s.lbRowFirst]}>
                  <Text style={[s.lbRank, i === 0 && s.lbRankFirst]}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </Text>
                  <Text style={[s.lbName, i === 0 && s.lbNameFirst]}>{entry.display_name}</Text>
                  <Text style={s.lbPoints}>{entry.total_points.toLocaleString()} pts</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        <View style={s.footer}>
          {!isLast ? (
            <TouchableOpacity
              style={[s.primaryBtn, loading && s.primaryBtnDisabled]}
              onPress={handleBroadcastNext}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>📡 Broadcast Question {currentQ + 1}</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.endBtn} onPress={handleEnd} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>🏁 End Quiz & Distribute Rewards</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>
    )
  }

  /* ── QUESTION LIVE ──────────────────────────────────────────── */
  if (phase === 'question_live') {
    const timerColor = timeLeft <= 5 ? '#FF4444' : timeLeft <= 10 ? '#FF9500' : '#6C47FF'
    return (
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Question {currentQ} / {questionCount}</Text>
          <Text style={[s.timerText, { color: timerColor }]}>{timeLeft}s</Text>
        </View>

        {/* Progress bar */}
        <View style={s.progressTrack}>
          <Animated.View
            style={[s.progressFill, {
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              backgroundColor: timerColor,
            }]}
          />
        </View>

        <View style={s.liveCenter}>
          <Text style={s.broadcastIcon}>📡</Text>
          <Text style={s.liveLabel}>Question is LIVE</Text>
          <Text style={s.liveSub}>Participants are answering…</Text>
          <Text style={s.answerCount}>{leaderboard.length} answered so far</Text>
        </View>

        <View style={s.footer}>
          <TouchableOpacity
            style={s.skipBtn}
            onPress={() => {
              clearInterval(timerRef.current!)
              progressAnim.stopAnimation()
              fetchLeaderboard()
              setPhase('between_questions')
            }}
          >
            <Text style={s.skipBtnText}>Skip to Next →</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  /* ── ENDED ──────────────────────────────────────────────────── */
  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Quiz Complete! 🏆</Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
        <Text style={s.sectionLabel}>Final Leaderboard</Text>
        {leaderboard.map((entry, i) => (
          <View key={entry.user_id} style={[s.lbRow, i === 0 && s.lbRowFirst]}>
            <Text style={[s.lbRank, i === 0 && s.lbRankFirst]}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
            </Text>
            <Text style={[s.lbName, i === 0 && s.lbNameFirst]}>{entry.display_name}</Text>
            <Text style={s.lbPoints}>{entry.total_points.toLocaleString()} pts</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.primaryBtn} onPress={onEnd}>
          <Text style={s.primaryBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0A0A0F' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  headerTitle:        { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },
  sessionBadge:       { backgroundColor: '#6C47FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sessionBadgeText:   { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  questionProgress:   { color: '#6C47FF', fontSize: 15, fontWeight: '700' },
  lobbyCountBox:      { alignItems: 'center', paddingVertical: 32 },
  lobbyCount:         { color: '#6C47FF', fontSize: 64, fontWeight: '800' },
  lobbyCountLabel:    { color: '#888', fontSize: 14, marginTop: 4 },
  waitingBox:         { alignItems: 'center', paddingVertical: 32, gap: 12 },
  waitingText:        { color: '#888', fontSize: 14 },
  participantRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  avatarCircle:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1E1A3A', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarInitial:      { color: '#6C47FF', fontSize: 15, fontWeight: '700' },
  participantName:    { color: '#fff', fontSize: 14, flex: 1 },
  readyDot:           { width: 8, height: 8, borderRadius: 4, backgroundColor: '#30D158' },
  sectionLabel:       { color: '#888', fontSize: 12, fontWeight: '600', letterSpacing: 1, marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  lbRow:              { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  lbRowFirst:         { backgroundColor: '#1E1A3A', borderRadius: 10, paddingHorizontal: 8, borderBottomWidth: 0, marginBottom: 4 },
  lbRank:             { color: '#888', fontSize: 14, width: 36, textAlign: 'center' },
  lbRankFirst:        { fontSize: 20 },
  lbName:             { color: '#bbb', fontSize: 14, flex: 1 },
  lbNameFirst:        { color: '#fff', fontWeight: '700', fontSize: 15 },
  lbPoints:           { color: '#6C47FF', fontSize: 14, fontWeight: '700' },
  timerText:          { fontSize: 28, fontWeight: '800' },
  progressTrack:      { height: 4, backgroundColor: '#1E1E2E', marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  progressFill:       { height: 4, borderRadius: 2 },
  liveCenter:         { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  broadcastIcon:      { fontSize: 48, marginBottom: 8 },
  liveLabel:          { color: '#fff', fontSize: 20, fontWeight: '700' },
  liveSub:            { color: '#888', fontSize: 14 },
  answerCount:        { color: '#6C47FF', fontSize: 14, fontWeight: '600', marginTop: 8 },
  footer:             { padding: 16, paddingBottom: 32 },
  primaryBtn:         { backgroundColor: '#6C47FF', borderRadius: 12, padding: 16, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  endBtn:             { backgroundColor: '#FF6B35', borderRadius: 12, padding: 16, alignItems: 'center' },
  skipBtn:            { backgroundColor: '#1E1E2E', borderRadius: 12, padding: 14, alignItems: 'center' },
  skipBtnText:        { color: '#aaa', fontSize: 15, fontWeight: '600' },
})
