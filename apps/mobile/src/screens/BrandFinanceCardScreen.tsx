/**
 * BrandFinanceCardScreen
 *
 * Pillar 4 — Brand Finance Card
 * The user's "economic passport" within neurons.app.
 * Shows NXT wallet balance, DID identity, reputation metrics,
 * recent transactions, and 7-day trading activity.
 *
 * Architecture:
 *   - Part of the unified neurons.app mobile app
 *   - Identity: did:scn: sovereign node DID (same as EconomyScreen)
 *   - Settlement: NXT community coin (process_wallet_transfer RPC)
 *   - Dark theme: bg #0a0a0f, cards #111827, accent teal #2dd4bf
 *   - Card hero gradient: #4279FF → #7B4FFF
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  id: string
  type: 'sent' | 'received' | 'locked' | 'released'
  description: string
  amount: number
  timestamp: string
}

// ---------------------------------------------------------------------------
// Mock data — v1 hardcoded
// ---------------------------------------------------------------------------

const MOCK_DID = 'did:scn:7kF3mR9pL2vQ8nX5sY1zA4bC6dE0gH2jK...x9Q'
const MOCK_DID_SHORT = 'did:scn:7kF...x9Q'
const MOCK_BALANCE = '12,450'
const MOCK_NODE_TYPE = 'Sovereign Node'

const MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: '1',
    type: 'sent',
    description: 'NFC Payment - Barber',
    amount: -350,
    timestamp: '2026-04-06T09:14:00Z',
  },
  {
    id: '2',
    type: 'received',
    description: 'PO Settlement - Supplier A',
    amount: 2100,
    timestamp: '2026-04-05T17:30:00Z',
  },
  {
    id: '3',
    type: 'received',
    description: 'Task Reward - Delivery',
    amount: 500,
    timestamp: '2026-04-05T14:10:00Z',
  },
  {
    id: '4',
    type: 'received',
    description: 'Tip Received',
    amount: 120,
    timestamp: '2026-04-04T20:45:00Z',
  },
  {
    id: '5',
    type: 'locked',
    description: 'Escrow Lock - PO #234',
    amount: -800,
    timestamp: '2026-04-04T11:00:00Z',
  },
  {
    id: '6',
    type: 'released',
    description: 'Escrow Release - PO #229',
    amount: 1400,
    timestamp: '2026-04-03T16:20:00Z',
  },
]

// 7-day mock bar chart data (NXT volume per day)
const CHART_BARS = [
  { day: 'Mon', value: 60 },
  { day: 'Tue', value: 35 },
  { day: 'Wed', value: 80 },
  { day: 'Thu', value: 50 },
  { day: 'Fri', value: 95 },
  { day: 'Sat', value: 45 },
  { day: 'Sun', value: 70 },
]

const CHART_MAX = 95

// ---------------------------------------------------------------------------
// Helper utils
// ---------------------------------------------------------------------------

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date('2026-04-06T12:00:00Z')
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function getTransactionColor(type: Transaction['type']): string {
  switch (type) {
    case 'received':
    case 'released':
      return '#22c55e' // green
    case 'sent':
      return '#ef4444' // red
    case 'locked':
      return '#f59e0b' // amber — escrow hold
    default:
      return '#9ca3af'
  }
}

function getTransactionIcon(type: Transaction['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'received':
      return 'arrow-down-circle'
    case 'released':
      return 'checkmark-circle'
    case 'sent':
      return 'arrow-up-circle'
    case 'locked':
      return 'lock-closed'
    default:
      return 'ellipse'
  }
}

function formatAmount(amount: number): string {
  const prefix = amount >= 0 ? '+' : ''
  return `${prefix}${amount.toLocaleString()} NXT`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * CardHero — credit-card style element with gradient simulation via
 * layered Views (LinearGradient requires expo-linear-gradient; using
 * styled Views as a graceful fallback that matches the dark-premium aesthetic).
 */
function CardHero() {
  const handleCopyDID = () => {
    Alert.alert('DID Copied', MOCK_DID)
  }

  return (
    <View style={styles.cardHeroWrapper}>
      {/* Gradient simulation: deep blue-purple layered backgrounds */}
      <View style={styles.cardHero}>
        <View style={styles.cardHeroGradientLayer} />

        {/* Top row: logo + chip icon */}
        <View style={styles.cardTopRow}>
          <Text style={styles.cardLogoText}>newrons</Text>
          <View style={styles.cardChip}>
            <Ionicons name="hardware-chip-outline" size={18} color="rgba(255,255,255,0.7)" />
          </View>
        </View>

        {/* Center: NXT balance */}
        <View style={styles.cardBalanceRow}>
          <Text style={styles.cardBalanceLabel}>NXT Balance</Text>
          <Text style={styles.cardBalance}>{MOCK_BALANCE}</Text>
          <Text style={styles.cardBalanceCurrency}>NXT</Text>
        </View>

        {/* Bottom row: DID + node badge */}
        <View style={styles.cardBottomRow}>
          <TouchableOpacity onPress={handleCopyDID} style={styles.cardDIDContainer}>
            <Ionicons name="finger-print-outline" size={12} color="rgba(255,255,255,0.6)" />
            <Text style={styles.cardDID}>{MOCK_DID_SHORT}</Text>
          </TouchableOpacity>
          <View style={styles.cardNodeBadge}>
            <Ionicons name="shield-checkmark" size={10} color="#2dd4bf" />
            <Text style={styles.cardNodeBadgeText}>{MOCK_NODE_TYPE}</Text>
          </View>
        </View>
      </View>

      {/* Decorative glow behind card */}
      <View style={styles.cardGlow} />
    </View>
  )
}

/**
 * QuickActions — 4 circular teal icon buttons
 */
function QuickActions() {
  const actions = [
    { label: 'Send', icon: 'arrow-up' as keyof typeof Ionicons.glyphMap },
    { label: 'Receive', icon: 'arrow-down' as keyof typeof Ionicons.glyphMap },
    { label: 'Scan', icon: 'scan' as keyof typeof Ionicons.glyphMap },
    { label: 'History', icon: 'time' as keyof typeof Ionicons.glyphMap },
  ]

  const handleAction = (label: string) => {
    Alert.alert(label, `${label} action — coming in v2`)
  }

  return (
    <View style={styles.quickActionsRow}>
      {actions.map(action => (
        <View key={action.label} style={styles.quickActionItem}>
          <TouchableOpacity
            style={styles.quickActionCircle}
            onPress={() => handleAction(action.label)}
          >
            <Ionicons name={action.icon} size={20} color="#2dd4bf" />
          </TouchableOpacity>
          <Text style={styles.quickActionLabel}>{action.label}</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * ReputationSection — trust score ring + key stats
 */
function ReputationSection() {
  const TRUST_SCORE = 92
  // Simulate a ring using nested Views (no SVG dependency)
  const ringFill = TRUST_SCORE // percentage

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Reputation</Text>
      <View style={styles.reputationCard}>
        {/* Trust score ring — simulated with border arc */}
        <View style={styles.reputationLeft}>
          <View style={styles.trustRingOuter}>
            <View style={styles.trustRingInner}>
              <Text style={styles.trustScoreValue}>{TRUST_SCORE}%</Text>
              <Text style={styles.trustScoreLabel}>Trust</Text>
            </View>
            {/* Arc overlay to show progress — uses clip/border trick */}
            <View style={[styles.trustArc, { borderTopColor: '#2dd4bf', borderRightColor: '#2dd4bf' }]} />
          </View>
        </View>

        {/* Stats column */}
        <View style={styles.reputationStats}>
          <View style={styles.reputationStatRow}>
            <View style={styles.reputationStatDot} />
            <Text style={styles.reputationStatLabel}>Completed Trades</Text>
            <Text style={styles.reputationStatValue}>47</Text>
          </View>
          <View style={styles.reputationStatRow}>
            <View style={[styles.reputationStatDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.reputationStatLabel}>On-Time Delivery</Text>
            <Text style={[styles.reputationStatValue, { color: '#22c55e' }]}>98%</Text>
          </View>
          <View style={styles.reputationStatRow}>
            <View style={[styles.reputationStatDot, { backgroundColor: '#ef4444' }]} />
            <Text style={styles.reputationStatLabel}>Dispute Rate</Text>
            <Text style={[styles.reputationStatValue, { color: '#ef4444' }]}>1%</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

/**
 * TransactionList — recent 6 transactions
 */
function TransactionList() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <TouchableOpacity onPress={() => Alert.alert('All Transactions', 'Full history — coming in v2')}>
          <Text style={styles.sectionViewAll}>View all</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.transactionsList}>
        {MOCK_TRANSACTIONS.map(tx => {
          const color = getTransactionColor(tx.type)
          const icon = getTransactionIcon(tx.type)
          const amountStr = formatAmount(tx.amount)

          return (
            <View key={tx.id} style={styles.transactionItem}>
              <View style={[styles.transactionIconCircle, { borderColor: color + '40' }]}>
                <Ionicons name={icon} size={20} color={color} />
              </View>
              <View style={styles.transactionContent}>
                <Text style={styles.transactionDescription}>{tx.description}</Text>
                <Text style={styles.transactionTime}>{formatTime(tx.timestamp)}</Text>
              </View>
              <Text style={[styles.transactionAmount, { color }]}>{amountStr}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

/**
 * TradingHistoryChart — 7-day bar chart (mock bars, no external chart lib)
 */
function TradingHistoryChart() {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>7-Day Activity</Text>
        <Text style={styles.chartSubtitle}>NXT volume</Text>
      </View>

      <View style={styles.chartCard}>
        <View style={styles.chartBarsContainer}>
          {CHART_BARS.map((bar, index) => {
            const barHeightPercent = bar.value / CHART_MAX
            const barHeightPx = Math.round(barHeightPercent * 72)
            const isToday = index === CHART_BARS.length - 1
            return (
              <View key={bar.day} style={styles.chartBarColumn}>
                <View style={styles.chartBarTrack}>
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: barHeightPx,
                        backgroundColor: isToday ? '#4279FF' : '#2dd4bf',
                        opacity: isToday ? 1 : 0.65,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.chartDayLabel, isToday && styles.chartDayLabelToday]}>
                  {bar.day}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Y-axis hints */}
        <View style={styles.chartYAxis}>
          <Text style={styles.chartYLabel}>High</Text>
          <Text style={styles.chartYLabel}>Mid</Text>
          <Text style={styles.chartYLabel}>Low</Text>
        </View>

        {/* Baseline */}
        <View style={styles.chartBaseline} />

        <Text style={styles.chartFootnote}>
          Today highlighted in blue · Tap bar for details (v2)
        </Text>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function BrandFinanceCardScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />

      {/* Screen header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Finance Card</Text>
        <TouchableOpacity
          style={styles.headerMenuBtn}
          onPress={() => Alert.alert('Options', 'Card settings — coming in v2')}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Card hero */}
        <CardHero />

        {/* 2. Quick actions */}
        <QuickActions />

        {/* Divider */}
        <View style={styles.divider} />

        {/* 3. Reputation */}
        <ReputationSection />

        {/* 4. Transactions */}
        <TransactionList />

        {/* 5. Trading chart */}
        <TradingHistoryChart />

        {/* Footer spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // ---- Layout ----
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },

  // ---- Screen header ----
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  screenTitle: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  headerMenuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
  },

  // ---- Card Hero ----
  cardHeroWrapper: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 24,
    position: 'relative',
  },
  cardHero: {
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: '#1a2a6c', // deep base
    borderWidth: 1,
    borderColor: '#3a4a8c',
    // Shadow
    shadowColor: '#4279FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  cardHeroGradientLayer: {
    // Simulates the #4279FF → #7B4FFF gradient via an overlay
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderRadius: 16,
    // Right portion tinted purple
    borderRightWidth: 120,
    borderRightColor: 'rgba(123, 79, 255, 0.35)',
    borderTopWidth: 180,
    borderTopColor: 'rgba(66, 121, 255, 0.20)',
    borderStyle: 'solid',
  },
  cardGlow: {
    position: 'absolute',
    bottom: -16,
    left: 20,
    right: 20,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(66, 121, 255, 0.18)',
    // blur approximation — purely decorative
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLogoText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'lowercase',
    fontStyle: 'italic',
  },
  cardChip: {
    width: 30,
    height: 22,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  cardBalanceRow: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cardBalanceLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  cardBalance: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
  },
  cardBalanceCurrency: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: 2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardDIDContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardDID: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  cardNodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
  },
  cardNodeBadgeText: {
    color: '#2dd4bf',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ---- Quick Actions ----
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  quickActionItem: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(45, 212, 191, 0.25)',
  },
  quickActionLabel: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },

  // ---- Divider ----
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginHorizontal: 20,
    marginBottom: 20,
  },

  // ---- Shared section styles ----
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionViewAll: {
    color: '#2dd4bf',
    fontSize: 12,
    fontWeight: '600',
  },

  // ---- Reputation ----
  reputationCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  reputationLeft: {
    alignItems: 'center',
  },
  trustRingOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    borderColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  trustRingInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustArc: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    borderTopColor: '#2dd4bf',
    borderRightColor: '#2dd4bf',
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
    transform: [{ rotate: '-45deg' }],
  },
  trustScoreValue: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 20,
  },
  trustScoreLabel: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  reputationStats: {
    flex: 1,
    gap: 10,
  },
  reputationStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reputationStatDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2dd4bf',
  },
  reputationStatLabel: {
    flex: 1,
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '500',
  },
  reputationStatValue: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '700',
  },

  // ---- Transactions ----
  transactionsList: {
    gap: 8,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 10,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  transactionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(17, 24, 39, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  transactionContent: {
    flex: 1,
  },
  transactionDescription: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 3,
  },
  transactionTime: {
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '400',
  },
  transactionAmount: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ---- Chart ----
  chartCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    position: 'relative',
  },
  chartSubtitle: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 12,
  },
  chartBarsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 88,
    paddingBottom: 20, // room for day labels
    paddingLeft: 32,   // room for y-axis
  },
  chartBarColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  chartBarTrack: {
    width: '70%',
    height: 72,
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  chartDayLabel: {
    color: '#6b7280',
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  chartDayLabelToday: {
    color: '#4279FF',
    fontWeight: '700',
  },
  chartYAxis: {
    position: 'absolute',
    left: 16,
    top: 16,
    bottom: 36,
    justifyContent: 'space-between',
  },
  chartYLabel: {
    color: '#4b5563',
    fontSize: 9,
    fontWeight: '500',
  },
  chartBaseline: {
    height: 1,
    backgroundColor: '#1f2937',
    marginTop: 4,
    marginBottom: 8,
  },
  chartFootnote: {
    color: '#4b5563',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
})
