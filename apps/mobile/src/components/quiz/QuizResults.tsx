/**
 * QuizResults — post-quiz breakdown screen
 *
 * Shows:
 *  - Personal score card (rank, points, correct count, accuracy)
 *  - Prize distribution (winner + participation coins)
 *  - Per-question breakdown: Q text, correct answer, your answer, points earned
 *  - Final leaderboard (top 10 + your position)
 */
import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native'
import { apiClient } from '../../utils/apiClient'

interface QuestionResult {
  question_number: number
  question_text: string
  format: 'multiple_choice' | 'true_false' | 'short_answer'
  correct_answer: string
  your_answer: string | null
  is_correct: boolean
  points_earned: number
  speed_bonus: boolean
  explanation?: string
}

interface ParticipantResult {
  user_id: string
  display_name: string
  rank: number
  total_points: number
  correct_count: number
  question_results: QuestionResult[]
  prize_earned?: number
  prize_currency?: string
  coins_earned: number
}

interface SessionSummary {
  title: string
  total_questions: number
  participant_count: number
  winner: { user_id: string; display_name: string; total_points: number } | null
  prize_amount?: number
  prize_currency?: string
  top_score: number
  avg_score: number
}

interface QuizResultsProps {
  sessionId: string
  currentUserId: string
  onClose: () => void
  onPlayAgain?: () => void
}

type Tab = 'summary' | 'breakdown' | 'leaderboard'

function ScoreRing({ accuracy, size = 120 }: { accuracy: number; size?: number }) {
  const anim = React.useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: accuracy, duration: 1200, useNativeDriver: false }).start()
  }, [accuracy])

  const color = accuracy >= 0.8 ? '#30D158' : accuracy >= 0.5 ? '#FF9500' : '#FF4444'

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 6, borderColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center', position: 'absolute' }} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color, fontSize: size * 0.28, fontWeight: '800' }}>{Math.round(accuracy * 100)}%</Text>
        <Text style={{ color: '#666', fontSize: 11 }}>accuracy</Text>
      </View>
    </View>
  )
}

export default function QuizResults({ sessionId, currentUserId, onClose, onPlayAgain }: QuizResultsProps) {
  const [loading, setLoading]               = useState(true)
  const [session, setSession]               = useState<SessionSummary | null>(null)
  const [myResult, setMyResult]             = useState<ParticipantResult | null>(null)
  const [allResults, setAllResults]         = useState<ParticipantResult[]>([])
  const [activeTab, setActiveTab]           = useState<Tab>('summary')
  const [expandedQ, setExpandedQ]           = useState<number | null>(null)
  const fadeAnim                            = React.useRef(new Animated.Value(0)).current

  useEffect(() => {
    fetchResults()
  }, [sessionId])

  async function fetchResults() {
    try {
      const data = await apiClient.get(`/quizzes/${sessionId}/results`)
      setSession(data.session)
      setAllResults(data.participants ?? [])
      setMyResult(data.participants?.find((p: ParticipantResult) => p.user_id === currentUserId) ?? null)
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start()
    } catch {
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#6C47FF" size="large" />
        <Text style={s.loadingText}>Loading results…</Text>
      </View>
    )
  }

  const accuracy = myResult && session
    ? myResult.correct_count / session.total_questions
    : 0

  const isWinner = myResult?.rank === 1

  /* ── TABS ──────────────────────────────────────────────────── */
  const tabs: { key: Tab; label: string }[] = [
    { key: 'summary',     label: 'Summary'   },
    { key: 'breakdown',   label: 'Breakdown' },
    { key: 'leaderboard', label: 'Rankings'  },
  ]

  return (
    <Animated.View style={[s.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onClose} style={s.closeBtn}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{session?.title ?? 'Quiz Results'}</Text>
        {onPlayAgain ? (
          <TouchableOpacity onPress={onPlayAgain}>
            <Text style={s.playAgainText}>Play Again</Text>
          </TouchableOpacity>
        ) : <View style={{ width: 80 }} />}
      </View>

      {/* Winner banner */}
      {isWinner && (
        <View style={s.winnerBanner}>
          <Text style={s.winnerEmoji}>🏆</Text>
          <View>
            <Text style={s.winnerTitle}>You Won!</Text>
            {myResult?.prize_earned
              ? <Text style={s.winnerSub}>+{myResult.prize_earned} {myResult.prize_currency} prize sent to your wallet</Text>
              : <Text style={s.winnerSub}>Top of the leaderboard!</Text>
            }
          </View>
        </View>
      )}

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[s.tab, activeTab === t.key && s.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[s.tabText, activeTab === t.key && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ── SUMMARY TAB ─────────────────────────────────────── */}
        {activeTab === 'summary' && (
          <View style={s.tabContent}>
            {/* Score card */}
            <View style={s.scoreCard}>
              <ScoreRing accuracy={accuracy} />
              <View style={s.scoreStats}>
                <View style={s.statBlock}>
                  <Text style={s.statNum}>{myResult?.total_points.toLocaleString() ?? 0}</Text>
                  <Text style={s.statLabel}>points</Text>
                </View>
                <View style={s.statBlock}>
                  <Text style={s.statNum}>#{myResult?.rank ?? '—'}</Text>
                  <Text style={s.statLabel}>rank</Text>
                </View>
                <View style={s.statBlock}>
                  <Text style={s.statNum}>{myResult?.correct_count ?? 0}/{session?.total_questions ?? 0}</Text>
                  <Text style={s.statLabel}>correct</Text>
                </View>
              </View>
            </View>

            {/* Coins + prize */}
            {(myResult?.coins_earned || myResult?.prize_earned) ? (
              <View style={s.rewardsRow}>
                {myResult.coins_earned > 0 && (
                  <View style={s.rewardChip}>
                    <Text style={s.rewardEmoji}>🪙</Text>
                    <Text style={s.rewardText}>+{myResult.coins_earned} coins</Text>
                  </View>
                )}
                {myResult.prize_earned && myResult.prize_earned > 0 && (
                  <View style={[s.rewardChip, s.rewardChipGold]}>
                    <Text style={s.rewardEmoji}>💰</Text>
                    <Text style={[s.rewardText, { color: '#FFD700' }]}>+{myResult.prize_earned} {myResult.prize_currency}</Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Session stats */}
            <View style={s.sessionStats}>
              <Text style={s.sessionStatsTitle}>Session Stats</Text>
              <View style={s.sessionStatRow}>
                <Text style={s.sessionStatLabel}>Participants</Text>
                <Text style={s.sessionStatValue}>{session?.participant_count}</Text>
              </View>
              <View style={s.sessionStatRow}>
                <Text style={s.sessionStatLabel}>Top Score</Text>
                <Text style={s.sessionStatValue}>{session?.top_score?.toLocaleString()} pts</Text>
              </View>
              <View style={s.sessionStatRow}>
                <Text style={s.sessionStatLabel}>Average Score</Text>
                <Text style={s.sessionStatValue}>{Math.round(session?.avg_score ?? 0).toLocaleString()} pts</Text>
              </View>
              {session?.winner && (
                <View style={s.sessionStatRow}>
                  <Text style={s.sessionStatLabel}>Winner</Text>
                  <Text style={[s.sessionStatValue, { color: '#FFD700' }]}>🏆 {session.winner.display_name}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── BREAKDOWN TAB ───────────────────────────────────── */}
        {activeTab === 'breakdown' && (
          <View style={s.tabContent}>
            {myResult?.question_results?.length ? myResult.question_results.map((qr) => (
              <TouchableOpacity
                key={qr.question_number}
                style={[s.qResultCard, qr.is_correct ? s.qResultCorrect : s.qResultWrong]}
                onPress={() => setExpandedQ(expandedQ === qr.question_number ? null : qr.question_number)}
              >
                <View style={s.qResultHeader}>
                  <View style={s.qResultNumBadge}>
                    <Text style={s.qResultNum}>Q{qr.question_number}</Text>
                  </View>
                  <Text style={s.qResultIndicator}>{qr.is_correct ? '✓' : '✗'}</Text>
                  <Text style={s.qResultPoints}>
                    {qr.is_correct ? `+${qr.points_earned}${qr.speed_bonus ? ' ⚡' : ''}` : '0'} pts
                  </Text>
                  <Text style={s.qResultChevron}>{expandedQ === qr.question_number ? '▲' : '▼'}</Text>
                </View>

                <Text style={s.qResultText} numberOfLines={expandedQ === qr.question_number ? undefined : 2}>
                  {qr.question_text}
                </Text>

                {expandedQ === qr.question_number && (
                  <View style={s.qResultDetail}>
                    <View style={s.qAnswerRow}>
                      <Text style={s.qAnswerLabel}>Correct answer</Text>
                      <Text style={s.qAnswerCorrect}>{qr.correct_answer}</Text>
                    </View>
                    {qr.your_answer && (
                      <View style={s.qAnswerRow}>
                        <Text style={s.qAnswerLabel}>Your answer</Text>
                        <Text style={[s.qAnswerYours, !qr.is_correct && s.qAnswerYoursWrong]}>{qr.your_answer}</Text>
                      </View>
                    )}
                    {!qr.your_answer && (
                      <Text style={s.qUnanswered}>No answer submitted</Text>
                    )}
                    {qr.explanation && (
                      <Text style={s.qExplanation}>{qr.explanation}</Text>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            )) : (
              <View style={s.center}>
                <Text style={{ color: '#888' }}>No question data available</Text>
              </View>
            )}
          </View>
        )}

        {/* ── LEADERBOARD TAB ─────────────────────────────────── */}
        {activeTab === 'leaderboard' && (
          <View style={s.tabContent}>
            {allResults.slice(0, 10).map((p, i) => (
              <View key={p.user_id} style={[s.lbRow, p.user_id === currentUserId && s.lbRowMe]}>
                <Text style={[s.lbRank, i < 3 && { color: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }]}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </Text>
                <View style={s.lbAvatar}>
                  <Text style={s.lbAvatarText}>{(p.display_name[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.lbName, p.user_id === currentUserId && { color: '#fff', fontWeight: '700' }]}>
                    {p.display_name}{p.user_id === currentUserId ? ' (you)' : ''}
                  </Text>
                  <Text style={s.lbSub}>{p.correct_count}/{session?.total_questions} correct</Text>
                </View>
                <Text style={[s.lbPoints, i === 0 && { color: '#FFD700' }]}>{p.total_points.toLocaleString()} pts</Text>
              </View>
            ))}

            {/* My entry if outside top 10 */}
            {myResult && myResult.rank > 10 && (
              <>
                <Text style={s.ellipsis}>⋯</Text>
                <View style={[s.lbRow, s.lbRowMe]}>
                  <Text style={s.lbRank}>#{myResult.rank}</Text>
                  <View style={s.lbAvatar}><Text style={s.lbAvatarText}>{(myResult.display_name[0] ?? '?').toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.lbName, { color: '#fff', fontWeight: '700' }]}>{myResult.display_name} (you)</Text>
                    <Text style={s.lbSub}>{myResult.correct_count}/{session?.total_questions} correct</Text>
                  </View>
                  <Text style={s.lbPoints}>{myResult.total_points.toLocaleString()} pts</Text>
                </View>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0A0A0F' },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F', gap: 12 },
  loadingText:        { color: '#888', fontSize: 14 },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  headerTitle:        { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  closeBtn:           { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center' },
  closeBtnText:       { color: '#aaa', fontSize: 14 },
  playAgainText:      { color: '#6C47FF', fontSize: 14, fontWeight: '600', width: 80, textAlign: 'right' },
  winnerBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2B2000', borderBottomWidth: 1, borderBottomColor: '#FFD70033', padding: 14, gap: 12 },
  winnerEmoji:        { fontSize: 32 },
  winnerTitle:        { color: '#FFD700', fontSize: 16, fontWeight: '800' },
  winnerSub:          { color: '#aaa', fontSize: 12, marginTop: 2 },
  tabBar:             { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  tab:                { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:          { borderBottomWidth: 2, borderBottomColor: '#6C47FF' },
  tabText:            { color: '#666', fontSize: 13, fontWeight: '600' },
  tabTextActive:      { color: '#6C47FF' },
  tabContent:         { gap: 12 },
  scoreCard:          { backgroundColor: '#12121A', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 20, borderWidth: 1, borderColor: '#1E1E2E' },
  scoreStats:         { flex: 1, gap: 12 },
  statBlock:          { alignItems: 'center' },
  statNum:            { color: '#fff', fontSize: 22, fontWeight: '800' },
  statLabel:          { color: '#666', fontSize: 11, marginTop: 2 },
  rewardsRow:         { flexDirection: 'row', gap: 10 },
  rewardChip:         { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderRadius: 10, padding: 12, gap: 8, borderWidth: 1, borderColor: '#1E1E2E' },
  rewardChipGold:     { borderColor: '#FFD70044', backgroundColor: '#2B2000' },
  rewardEmoji:        { fontSize: 20 },
  rewardText:         { color: '#6C47FF', fontSize: 14, fontWeight: '700' },
  sessionStats:       { backgroundColor: '#12121A', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#1E1E2E' },
  sessionStatsTitle:  { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  sessionStatRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1E1E2E' },
  sessionStatLabel:   { color: '#888', fontSize: 13 },
  sessionStatValue:   { color: '#fff', fontSize: 13, fontWeight: '600' },
  qResultCard:        { backgroundColor: '#12121A', borderRadius: 12, padding: 14, borderWidth: 1, borderLeftWidth: 4 },
  qResultCorrect:     { borderColor: '#1E2E1A', borderLeftColor: '#30D158' },
  qResultWrong:       { borderColor: '#2E1A1A', borderLeftColor: '#FF4444' },
  qResultHeader:      { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  qResultNumBadge:    { backgroundColor: '#1E1E2E', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  qResultNum:         { color: '#888', fontSize: 11, fontWeight: '700' },
  qResultIndicator:   { fontSize: 16, fontWeight: '800', color: '#fff' },
  qResultPoints:      { flex: 1, color: '#6C47FF', fontSize: 13, fontWeight: '700' },
  qResultChevron:     { color: '#555', fontSize: 12 },
  qResultText:        { color: '#ccc', fontSize: 13, lineHeight: 18 },
  qResultDetail:      { marginTop: 10, gap: 6, borderTopWidth: 1, borderTopColor: '#1E1E2E', paddingTop: 10 },
  qAnswerRow:         { flexDirection: 'row', gap: 8 },
  qAnswerLabel:       { color: '#666', fontSize: 12, width: 100 },
  qAnswerCorrect:     { color: '#30D158', fontSize: 12, flex: 1, fontWeight: '600' },
  qAnswerYours:       { color: '#aaa', fontSize: 12, flex: 1 },
  qAnswerYoursWrong:  { color: '#FF4444' },
  qUnanswered:        { color: '#FF9500', fontSize: 12, fontStyle: 'italic' },
  qExplanation:       { color: '#888', fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  lbRow:              { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderRadius: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: '#1E1E2E' },
  lbRowMe:            { borderColor: '#6C47FF44', backgroundColor: '#1E1A3A' },
  lbRank:             { color: '#888', fontSize: 16, width: 32, textAlign: 'center' },
  lbAvatar:           { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E1E2E', alignItems: 'center', justifyContent: 'center' },
  lbAvatarText:       { color: '#6C47FF', fontSize: 13, fontWeight: '700' },
  lbName:             { color: '#ccc', fontSize: 13 },
  lbSub:              { color: '#555', fontSize: 11, marginTop: 2 },
  lbPoints:           { color: '#6C47FF', fontSize: 14, fontWeight: '700' },
  ellipsis:           { color: '#555', textAlign: 'center', fontSize: 18, paddingVertical: 4 },
})
