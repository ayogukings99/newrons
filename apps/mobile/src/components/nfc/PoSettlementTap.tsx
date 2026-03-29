/**
 * PoSettlementTap Component
 * NFC-triggered PO settlement (goods receipt with payment)
 *
 * Workflow:
 * 1. Show pending settlement amount and supplier info
 * 2. "Hold to Pay" gesture with visual ring animation
 * 3. On confirmation, call POST /integration/settlement/execute
 * 4. Show success animation with on-chain badge
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Alert,
  useColorScheme,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import LottieView from 'lottie-react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useMutation } from '@tanstack/react-query'
import axios from 'axios'

// ── Types ──────────────────────────────────────────────────────────────

interface PoSettlementTapProps {
  poId: string
  supplierName: string
  supplierDid: string
  buyerDid: string
  amountNxt: number
  currency?: string
  onSuccess?: (settlement: any) => void
  onError?: (error: Error) => void
}

// ── API Client ──────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'https://api.neurons.app',
})

api.interceptors.request.use(async (config) => {
  // TODO: Attach JWT token from secure storage
  const token = await (
    await import('expo-secure-store')
  ).getItemAsync('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Component ──────────────────────────────────────────────────────────

const PoSettlementTap: React.FC<PoSettlementTapProps> = ({
  poId,
  supplierName,
  supplierDid,
  buyerDid,
  amountNxt,
  currency = 'NXT',
  onSuccess,
  onError,
}) => {
  const navigation = useNavigation()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  const screenWidth = Dimensions.get('window').width
  const [pressing, setPressing] = useState(false)
  const [holdProgress, setHoldProgress] = useState(0)
  const [showSuccess, setShowSuccess] = useState(false)

  // Animations
  const ringScale = useRef(new Animated.Value(1)).current
  const ringOpacity = useRef(new Animated.Value(0.3)).current
  const successScale = useRef(new Animated.Value(0)).current
  const successOpacity = useRef(new Animated.Value(0)).current

  // Hold-to-activate timer
  const holdTimer = useRef<NodeJS.Timeout | null>(null)
  const holdStart = useRef<number>(0)

  // Settlement execution mutation
  const { mutate: executeSettlement, isPending: isExecuting } = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/integration/settlement/execute/${poId}`)
      return response.data
    },
    onSuccess: (data) => {
      animateSuccess()
      if (onSuccess) onSuccess(data.data)

      // Auto-navigate after success animation
      setTimeout(() => {
        navigation.goBack()
      }, 2000)
    },
    onError: (error: any) => {
      const message =
        error.response?.data?.error || error.message || 'Settlement failed'
      Alert.alert('Settlement Error', message)
      if (onError) onError(error)
    },
  })

  // ── Hold-to-Pay Gesture ────────────────────────────────────────────

  const animateRing = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(ringScale, {
          toValue: 1.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    ]).start((finished) => {
      if (finished) {
        ringScale.setValue(1)
        ringOpacity.setValue(0.3)
        animateRing()
      }
    })
  }

  const animateSuccess = () => {
    Animated.parallel([
      Animated.timing(successScale, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(successOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start()

    setShowSuccess(true)
  }

  const handlePressIn = () => {
    if (isExecuting || showSuccess) return

    setPressing(true)
    holdStart.current = Date.now()
    setHoldProgress(0)

    // Animate ring while holding
    animateRing()

    // Execute settlement after 1.5 second hold
    holdTimer.current = setTimeout(() => {
      executeSettlement()
    }, 1500)
  }

  const handlePressOut = () => {
    setPressing(false)
    ringScale.setValue(1)
    ringOpacity.setValue(0.3)

    if (holdTimer.current) {
      clearTimeout(holdTimer.current)
    }
  }

  // Update hold progress indicator
  useEffect(() => {
    if (!pressing) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - holdStart.current
      const progress = Math.min(elapsed / 1500, 1)
      setHoldProgress(progress)
    }, 50)

    return () => clearInterval(interval)
  }, [pressing])

  // ── Styles ─────────────────────────────────────────────────────────

  const isDarkMode = isDark
  const bgColor = isDarkMode ? '#1a1a1a' : '#f5f5f5'
  const textColor = isDarkMode ? '#ffffff' : '#000000'
  const accentColor = '#4CAF50' // Green for settlement

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bgColor, borderColor: accentColor },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: textColor }]}>
          Complete Settlement
        </Text>
        <Text style={[styles.subtitle, { color: isDarkMode ? '#aaa' : '#666' }]}>
          Goods Receipt + Payment
        </Text>
      </View>

      {/* Settlement Info Card */}
      <View
        style={[
          styles.infoCard,
          { backgroundColor: isDarkMode ? '#2a2a2a' : '#ffffff' },
        ]}
      >
        {/* Supplier Info */}
        <View style={styles.supplierRow}>
          <View style={styles.supplierAvatar}>
            <Ionicons
              name="business-outline"
              size={24}
              color={accentColor}
            />
          </View>
          <View style={styles.supplierText}>
            <Text style={[styles.supplierName, { color: textColor }]}>
              {supplierName}
            </Text>
            <Text style={[styles.supplierDid, { color: isDarkMode ? '#888' : '#999' }]}>
              {supplierDid.slice(0, 20)}...
            </Text>
          </View>
        </View>

        {/* Amount */}
        <View style={[styles.amountBox, { borderColor: accentColor }]}>
          <Text style={[styles.amountLabel, { color: isDarkMode ? '#aaa' : '#666' }]}>
            Settlement Amount
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.amountValue, { color: accentColor }]}>
              {amountNxt.toFixed(4)}
            </Text>
            <Text style={[styles.currencyBadge, { color: accentColor, borderColor: accentColor }]}>
              {currency}
            </Text>
          </View>
        </View>

        {/* PO Reference */}
        <View style={styles.refBox}>
          <Text style={[styles.refLabel, { color: isDarkMode ? '#aaa' : '#666' }]}>
            PO ID
          </Text>
          <Text style={[styles.refValue, { color: textColor }]}>
            {poId.slice(0, 12)}...
          </Text>
        </View>
      </View>

      {/* Hold-to-Pay Button */}
      <View style={styles.actionArea}>
        {!showSuccess ? (
          <>
            <TouchableOpacity
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={isExecuting}
              activeOpacity={0.7}
              style={[
                styles.holdButton,
                {
                  backgroundColor: accentColor,
                  opacity: isExecuting ? 0.6 : 1,
                },
              ]}
            >
              {/* Ring animation background */}
              <Animated.View
                style={[
                  styles.ringAnimation,
                  {
                    transform: [{ scale: ringScale }],
                    opacity: ringOpacity,
                  },
                ]}
              />

              {/* Hold progress ring */}
              {pressing && (
                <View
                  style={[
                    styles.progressRing,
                    {
                      borderColor: accentColor,
                      borderRightColor: 'transparent',
                      transform: [
                        { rotate: `${holdProgress * 360}deg` },
                      ] as any,
                    },
                  ]}
                />
              )}

              {/* Button content */}
              {isExecuting ? (
                <ActivityIndicator color="#ffffff" size="large" />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons
                    name="hand-right-outline"
                    size={32}
                    color="#ffffff"
                  />
                  <Text style={styles.buttonText}>
                    {pressing ? 'Confirm' : 'Hold to Pay'}
                  </Text>
                  {pressing && (
                    <Text style={styles.progressText}>
                      {Math.round(holdProgress * 100)}%
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>

            {/* Hold hint */}
            {!pressing && (
              <Text style={[styles.hint, { color: isDarkMode ? '#aaa' : '#999' }]}>
                Press and hold for 1.5 seconds to confirm
              </Text>
            )}
          </>
        ) : (
          // Success state
          <View style={styles.successContainer}>
            <Animated.View
              style={[
                styles.successIcon,
                {
                  transform: [{ scale: successScale }],
                  opacity: successOpacity,
                },
              ]}
            >
              <MaterialCommunityIcons
                name="check-circle"
                size={80}
                color={accentColor}
              />
            </Animated.View>

            <Text style={[styles.successTitle, { color: textColor }]}>
              Settlement Complete
            </Text>

            <View style={styles.successBadges}>
              <View style={[styles.badge, { backgroundColor: `${accentColor}20` }]}>
                <Ionicons
                  name="checkmark-done"
                  size={16}
                  color={accentColor}
                />
                <Text style={[styles.badgeText, { color: accentColor }]}>
                  NXT Transferred
                </Text>
              </View>

              <View style={[styles.badge, { backgroundColor: `#2196F320` }]}>
                <MaterialCommunityIcons
                  name="check-network-outline"
                  size={16}
                  color="#2196F3"
                />
                <Text style={[styles.badgeText, { color: '#2196F3' }]}>
                  On-Chain Anchored
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Footer: Disclaimer */}
      <View style={styles.footer}>
        <Text style={[styles.disclaimerText, { color: isDarkMode ? '#888' : '#999' }]}>
          Settlement is instant and irreversible. Verify supplier details before
          confirming.
        </Text>
      </View>
    </View>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderTopWidth: 2,
    paddingTop: 20,
    paddingHorizontal: 16,
  },

  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 14,
    fontWeight: '500',
  },

  infoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },

  supplierAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  supplierText: {
    flex: 1,
  },

  supplierName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },

  supplierDid: {
    fontSize: 12,
    fontFamily: 'monospace',
  },

  amountBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },

  amountLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  amountValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },

  currencyBadge: {
    fontSize: 12,
    fontWeight: 'bold',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },

  refBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderRadius: 6,
    padding: 10,
  },

  refLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },

  refValue: {
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '500',
  },

  actionArea: {
    alignItems: 'center',
    marginVertical: 24,
    flex: 1,
    justifyContent: 'center',
  },

  holdButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
    overflow: 'hidden',
  },

  ringAnimation: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#4CAF50',
  },

  progressRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
  },

  buttonContent: {
    alignItems: 'center',
    gap: 8,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  progressText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },

  hint: {
    fontSize: 12,
    marginTop: 12,
    fontStyle: 'italic',
  },

  successContainer: {
    alignItems: 'center',
  },

  successIcon: {
    marginBottom: 16,
  },

  successTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },

  successBadges: {
    flexDirection: 'row',
    gap: 12,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },

  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },

  footer: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },

  disclaimerText: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
})

export default PoSettlementTap
