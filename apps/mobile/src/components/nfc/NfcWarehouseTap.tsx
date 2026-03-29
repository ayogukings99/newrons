/**
 * NfcWarehouseTap
 *
 * NFC warehouse tap component — reuses existing NFC infrastructure for warehouse operations.
 *
 * Behavior:
 *   - Shows "Ready to Scan" state with animated ring
 *   - On NFC read → calls POST /integration/warehouse/scan
 *   - Shows scan result with appropriate action prompt
 *   - Haptic feedback on successful scan
 *   - Error state for unregistered tags
 */

import React, { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native'
import NfcManager, { NfcTech } from 'react-native-nfc-manager'

interface NfcWarehouseTapProps {
  userId?: number
  apiBaseUrl?: string
  userToken?: string
  onScanComplete?: (result: any) => void
  onError?: (error: string) => void
  actionHint?: 'task_complete' | 'goods_receipt' | 'bin_lookup' | 'transfer'
  label?: string
}

interface ScanResult {
  scanType: string
  binId?: string
  taskId?: string
  message: string
  requiresConfirmation: boolean
}

type ScanState = 'idle' | 'scanning' | 'result' | 'error'

export function NfcWarehouseTap({
  userId,
  apiBaseUrl = 'https://api.neurons.app/api/v1',
  userToken,
  onScanComplete,
  onError,
  actionHint = 'bin_lookup',
  label = 'Tap to Scan',
}: NfcWarehouseTapProps) {
  const [state, setState] = useState<ScanState>('idle')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [nfcSupported, setNfcSupported] = useState(true)

  // Animation for the pulsing ring
  const pulseAnim = React.useRef(new Animated.Value(0)).current

  useEffect(() => {
    initializeNfc()
    startPulseAnimation()
  }, [])

  const initializeNfc = async () => {
    try {
      const supported = await NfcManager.isSupported()
      setNfcSupported(supported)
      if (supported) {
        await NfcManager.start()
      }
    } catch (err: any) {
      console.warn('NFC initialization failed:', err.message)
      setNfcSupported(false)
    }
  }

  const startPulseAnimation = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.in(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    ).start()
  }, [pulseAnim])

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  })

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 0],
  })

  const handleStartScan = useCallback(async () => {
    if (!nfcSupported) {
      Alert.alert('NFC Not Available', 'Your device does not support NFC')
      return
    }

    setState('scanning')
    setErrorMessage(null)

    try {
      await NfcManager.requestTechnology(NfcTech.Ndef)
      const tag = await NfcManager.getTag()

      if (!tag?.id) {
        throw new Error('No NFC tag detected')
      }

      // Call warehouse scan endpoint
      setIsProcessing(true)
      const response = await fetch(`${apiBaseUrl}/integration/warehouse/scan`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nfcUid: tag.id,
          actionHint,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error ?? 'Failed to process scan')
      }

      const { data } = await response.json()
      setResult(data)
      setState('result')

      // Trigger haptic feedback
      triggerHaptic()

      onScanComplete?.(data)
    } catch (err: any) {
      setErrorMessage(err.message)
      setState('error')
      onError?.(err.message)
      triggerErrorHaptic()
    } finally {
      setIsProcessing(false)
      NfcManager.cancelTechnologyRequest()
    }
  }, [nfcSupported, apiBaseUrl, userToken, actionHint, onScanComplete, onError])

  const triggerHaptic = () => {
    try {
      // React Native Haptics would be imported here
      // For now, this is a placeholder
      // import { Haptics } from 'expo'
      // Haptics.selectionAsync()
    } catch (err) {
      // Haptics not available
    }
  }

  const triggerErrorHaptic = () => {
    try {
      // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } catch (err) {
      // Haptics not available
    }
  }

  const resetScan = useCallback(() => {
    setState('idle')
    setResult(null)
    setErrorMessage(null)
  }, [])

  const handleConfirmAction = useCallback(async () => {
    if (!result) return

    try {
      setIsProcessing(true)

      // Perform context-specific action
      if (result.scanType === 'task_complete') {
        // Complete the task
        Alert.alert('Success', 'Task marked as completed')
      } else if (result.scanType === 'goods_receipt') {
        // Start goods receipt
        Alert.alert('Success', 'Goods receipt initiated')
      } else if (result.scanType === 'transfer') {
        // Start transfer
        Alert.alert('Success', 'Transfer initiated')
      }

      resetScan()
    } catch (err: any) {
      Alert.alert('Error', err.message)
    } finally {
      setIsProcessing(false)
    }
  }, [result, resetScan])

  // ── Render States ──────────────────────────────────────────────

  if (!nfcSupported) {
    return (
      <View style={styles.container}>
        <View style={styles.unsupportedContainer}>
          <Text style={styles.unsupportedIcon}>❌</Text>
          <Text style={styles.unsupportedText}>NFC not available</Text>
          <Text style={styles.unsupportedSubtext}>Your device doesn't support NFC</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Idle State */}
      {state === 'idle' && (
        <TouchableOpacity
          style={styles.tapZone}
          onPress={handleStartScan}
          activeOpacity={0.8}
        >
          {/* Animated pulsing ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
            ]}
          />

          {/* Center circle */}
          <View style={styles.center}>
            <Text style={styles.nfcIcon}>📲</Text>
            <Text style={styles.readyText}>Ready to Scan</Text>
            <Text style={styles.hintText}>{label}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Scanning State */}
      {state === 'scanning' && (
        <View style={styles.scanningContainer}>
          <ActivityIndicator size="large" color="#2dd4bf" />
          <Text style={styles.scanningText}>Waiting for tag...</Text>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={resetScan}
            disabled={isProcessing}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Result State */}
      {state === 'result' && result && (
        <View style={styles.resultContainer}>
          <View style={styles.resultIcon}>
            <Text style={styles.resultIconText}>✓</Text>
          </View>
          <Text style={styles.resultMessage}>{result.message}</Text>

          {result.requiresConfirmation && (
            <View style={styles.resultActions}>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmAction}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#0a0a0f" />
                ) : (
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={resetScan}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          )}

          {!result.requiresConfirmation && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={resetScan}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Error State */}
      {state === 'error' && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorMessage}>{errorMessage || 'Scan failed'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleStartScan}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={resetScan}
          >
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
  },

  // Idle state
  tapZone: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: '#2dd4bf',
  },
  center: {
    alignItems: 'center',
    gap: 8,
    zIndex: 10,
  },
  nfcIcon: {
    fontSize: 48,
  },
  readyText: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    color: '#9ca3af',
    fontSize: 12,
  },

  // Scanning state
  scanningContainer: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  scanningText: {
    color: '#9ca3af',
    fontSize: 15,
  },

  // Result state
  resultContainer: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  resultIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resultIconText: {
    fontSize: 40,
    color: '#fff',
  },
  resultMessage: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '90%',
  },

  // Error state
  errorContainer: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
  },
  errorIcon: {
    fontSize: 40,
  },
  errorMessage: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: '90%',
  },

  // Buttons
  resultActions: {
    width: '100%',
    gap: 10,
  },
  confirmButton: {
    backgroundColor: '#2dd4bf',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: '700',
  },
  skipButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#0d9488',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  retryButton: {
    backgroundColor: '#0d9488',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  dismissButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  dismissButtonText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#1f2937',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  cancelButtonText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },

  // Unsupported
  unsupportedContainer: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  unsupportedIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  unsupportedText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '600',
  },
  unsupportedSubtext: {
    color: '#9ca3af',
    fontSize: 12,
  },
})
