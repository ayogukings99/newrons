/**
 * QuizLeaderboard — real-time leaderboard with rank animations
 *
 * Polls /quizzes/:sessionId/leaderboard every 5s during a live session.
 * Animates rank changes (entries slide and fade on re-order).
 * Shows podium (top 3) with crown/medal display, then a scrollable ranked list.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { apiClient } from '../../utils/apiClient'

export interface LeaderboardEntry {
  user_id: string
  display_name: string
  avatar_url?: string
  total_points: number
  rank: number
  correct_count?: number
  streak?: number
}

interface QuizLeaderboardProps {
  sessionId: string
  currentUserId?: string
  /** If true, poll continuously (live quiz). If false, one-shot fetch (post-quiz). */
  live?: boolean
  totalQuestions?: number
}

const PODIUM_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']
const PODIUM_EMOJIS = ['👑', '🥈', '🥉']
const PODIUM_HEIGHTS = [80, 56, 40]

function Avatar({ name, size = 40, color = '#6C47FF' }: { name: string; size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: color }}>
      <Text style={{ color, fontSize: size * 0.4, fontWeight: '800' }}>{(name[0] ?? '?').toUpperCase()}</Text>
    </View>
  )
}

function AnimatedRow({
  entry,
  index,
  isCurrentUser,
  totalQuestions,
}: {
  entry: LeaderboardEntry
  index: number
  isCurrentUser: boolean
  totalQuestions?: number
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 40, useNativeDriver: true }),
    ]).start()
  }, [entry.total_points])

  const rowColors = ['#1A1A2E', '#1A1E2E', '#1E1A2E']
  const rankColor = index === 0 ? '#FFD700' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : '#555'

  return (
    <Animated.View
      style={[
        s.rankRow,
        isCurrentUser && s.rankRowMe,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        index < 3 && { backgroundColor: rowColors[index] },
      ]}
    >
      {/* Rank */}
      <View style={s.rankNumBox}>
        <Text style={[s.rankNum, { color: rankColor }]}>
          {index < 3 ? PODIUM_EMOJIS[index] : `#${entry.rank}`}
        </Text>
      </View>

      {/* Avatar */}
      <Avatar
        name={entry.display_name}
        size={36}
        color={isCurrentUser ? '#6C47FF' : index < 3 ? PODIUM_COLORS[index] : '#444'}
      />

      {/* Name + stats */}
      <View style={s.rankInfo}>
        <Text style={[s.rankName, isCurrentUser && s.rankNameMe]} numberOfLines={1}>
          {entry.display_name}{isCurrentUser ? ' (you)' : ''}
        </Text>
        {entry.correct_count != null && totalQuestions && (
          <Text style={s.rankStat}>
            {entry.correct_count}/{totalQuestions} correct
            {entry.streak && entry.streak >= 3 ? `  🔥 ${entry.streak}` : ''}
          </Text>
        )}
      </View>

      {/* Points */}
      <View style={s.rankPoints}>
        <Text style={[s.rankPointsNum, index === 0 && { color: '#FFD700' }]}>
          {entry.total_points.toLocaleString()}
        </Text>
        <Text style={s.rankPointsLabel}>pts</Text>
      </View>
    </Animated.View>
  )
}

export default function QuizLeaderboard({
  sessionId,
  currentUserId,
  live = false,
  totalQuestions,
}: QuizLeaderboardProps) {
  const [entries, setEntries]   = useState<LeaderboardEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchLeaderboard = useCallback(async () => {
    try {
      const data = await apiClient.get(`/quizzes/${sessionId}/leaderboard`)
      setEntries(data)
      setLastUpdated(new Date())
    } catch {} finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchLeaderboard()
    if (live) {
      pollRef.current = setInterval(fetchLeaderboard, 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId, live])

  const top3   = entries.slice(0, 3)
  const rest   = entries.slice(3)
  const myRank = entries.find(e => e.user_id === currentUserId)

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#6C47FF" size="large" />
      </View>
    )
  }

  if (entries.length === 0) {
    return (
      <View style={s.center}>
        <Text style={s.emptyEmoji}>📊</Text>
        <Text style={s.emptyText}>No scores yet</Text>
      </View>
    )
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>🏆 Leaderboard</Text>
        {live && lastUpdated && (
          <TouchableOpacity onPress={fetchLeaderboard}>
            <Text style={s.refreshText}>↻ Live</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* My position sticky banner (if not in top 3) */}
      {myRank && myRank.rank > 3 && (
        <View style={s.myPositionBanner}>
          <Text style={s.myPositionText}>
            You're #{myRank.rank} with {myRank.total_points.toLocaleString()} pts
          </Text>
          <Text style={s.myPositionDiff}>
            {entries[1] ? `${(entries[0].total_points - myRank.total_points).toLocaleString()} pts behind 1st` : ''}
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Podium — top 3 visual */}
        {top3.length >= 2 && (
          <View style={s.podiumSection}>
            <View style={s.podiumStage}>
              {/* Reorder: 2nd | 1st | 3rd */}
              {[top3[1], top3[0], top3[2]].map((e, podiumIdx) => {
                if (!e) return <View key={`empty-${podiumIdx}`} style={{ flex: 1 }} />
                const realIdx = podiumIdx === 0 ? 1 : podiumIdx === 1 ? 0 : 2
                const isMe = e.user_id === currentUserId
                return (
                  <View key={e.user_id} style={[s.podiumPillar, { flex: 1 }]}>
                    {realIdx === 0 && <Text style={s.podiumCrown}>👑</Text>}
                    <Avatar
                      name={e.display_name}
                      size={realIdx === 0 ? 52 : 40}
                      color={isMe ? '#6C47FF' : PODIUM_COLORS[realIdx]}
                    />
                    <Text style={s.podiumName} numberOfLines={1}>{e.display_name}{isMe ? ' ★' : ''}</Text>
                    <Text style={s.podiumPoints}>{e.total_points.toLocaleString()}</Text>
                    <View style={[s.podiumBlock, { height: PODIUM_HEIGHTS[realIdx], backgroundColor: PODIUM_COLORS[realIdx] + '33', borderTopWidth: 3, borderTopColor: PODIUM_COLORS[realIdx] }]}>
                      <Text style={[s.podiumMedal, { color: PODIUM_COLORS[realIdx] }]}>{realIdx + 1}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {/* Full ranked list */}
        <View style={s.rankList}>
          {entries.map((entry, i) => (
            <AnimatedRow
              key={entry.user_id}
              entry={entry}
              index={i}
              isCurrentUser={entry.user_id === currentUserId}
              totalQuestions={totalQuestions}
            />
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#0A0A0F' },
  center:             { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A0F' },
  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20 },
  headerTitle:        { color: '#fff', fontSize: 18, fontWeight: '800' },
  refreshText:        { color: '#6C47FF', fontSize: 13, fontWeight: '600' },
  myPositionBanner:   { backgroundColor: '#1E1A3A', marginHorizontal: 16, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#6C47FF44', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myPositionText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  myPositionDiff:     { color: '#888', fontSize: 12 },
  podiumSection:      { paddingHorizontal: 16, paddingBottom: 8 },
  podiumStage:        { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', height: 220, gap: 4 },
  podiumPillar:       { alignItems: 'center', justifyContent: 'flex-end' },
  podiumCrown:        { fontSize: 22, marginBottom: 4 },
  podiumName:         { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 4, marginBottom: 2, textAlign: 'center' },
  podiumPoints:       { color: '#aaa', fontSize: 11, marginBottom: 4 },
  podiumBlock:        { width: '100%', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  podiumMedal:        { fontSize: 18, fontWeight: '800' },
  rankList:           { paddingHorizontal: 16, gap: 6 },
  rankRow:            { flexDirection: 'row', alignItems: 'center', backgroundColor: '#12121A', borderRadius: 12, padding: 10, gap: 10, borderWidth: 1, borderColor: '#1E1E2E' },
  rankRowMe:          { borderColor: '#6C47FF44', backgroundColor: '#1E1A3A' },
  rankNumBox:         { width: 32, alignItems: 'center' },
  rankNum:            { fontSize: 16, fontWeight: '800' },
  rankInfo:           { flex: 1, minWidth: 0 },
  rankName:           { color: '#ddd', fontSize: 14, fontWeight: '500' },
  rankNameMe:         { color: '#fff', fontWeight: '700' },
  rankStat:           { color: '#666', fontSize: 11, marginTop: 2 },
  rankPoints:         { alignItems: 'flex-end' },
  rankPointsNum:      { color: '#6C47FF', fontSize: 16, fontWeight: '800' },
  rankPointsLabel:    { color: '#555', fontSize: 10 },
  emptyEmoji:         { fontSize: 40, marginBottom: 12 },
  emptyText:          { color: '#888', fontSize: 15 },
})
