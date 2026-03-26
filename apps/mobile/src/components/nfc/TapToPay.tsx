import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import NfcManager, { NfcTech } from 'react-native-nfc-manager'

// Offline queue key for MMKV storage
const OFFLINE_QUEUE_KEY = 'nfc_offline_queue'
const MAX_OFFLINE_QUEUE = 50

interface NFCTag {
  id: string
  ownerId: string
  label: string
  defaultAmount?: number
  currency: string
}

interface TapToPayProps {
  apiBaseUrl: string
  userToken: string
  onSuccess?: (tap: { amount: number; recipient: string }) => void
  onError?: (error: string) => void
}

export default function TapToPay({ apiBaseUrl, userToken, onSuccess, onError }: TapToPayProps) {
  const [step, setStep] = useState<'idle' | 'scanning' | 'confirm' | 'processing' | 'done'>('idle')
  const [resolvedTag, setResolvedTag] = useState<NFCTag | null>(null)
  const [amount, setAmount] = useState('')

  // ── NFC Read ──────────────────────────────────────────────────
  const startNFCScan = useCallback(async () => {
    setStep('scanning')
    try {
      await NfcManager.start()
      await NfcManager.requestTechnology(NfcTech.Ndef)
      const tag = await NfcManager.getTag()
      if (!tag?.id) throw new Error('No NFC tag detected')

      // Resolve the NFC UID to a NEXUS payment tag
      const response = await fetch(`${apiBaseUrl}/nfc-payments/tags/uid/${tag.id}`)
      if (!response.ok) throw new Error('NFC tag not registered in NEXUS')

      const { data } = await response.json()
      setResolvedTag(data)
      if (data.defaultAmount) setAmount(String(data.defaultAmount))
      setStep('confirm')
    } catch (err: any) {
      setStep('idle')
      onError?.(err.message)
      Alert.alert('Scan Failed', err.message)
    } finally {
      NfcManager.cancelTechnologyRequest()
    }
  }, [apiBaseUrl])

  // ── Process Payment ───────────────────────────────────────────
  const confirmPayment = useCallback(async () => {
    if (!resolvedTag || !amount || parseFloat(amount) <= 0) return
    setStep('processing')

    try {
      const response = await fetch(`${apiBaseUrl}/nfc-payments/tap`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tagId: resolvedTag.id,
          receiverId: resolvedTag.ownerId,
          amount: parseFloat(amount),
          currency: resolvedTag.currency,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error ?? 'Payment failed')
      }

      setStep('done')
      onSuccess?.({ amount: parseFloat(amount), recipient: resolvedTag.label })
    } catch (err: any) {
      setStep('confirm')
      onError?.(err.message)
      Alert.alert('Payment Failed', err.message)
    }
  }, [resolvedTag, amount, apiBaseUrl, userToken])

  const reset = () => { setStep('idle'); setResolvedTag(null); setAmount('') }

  // ── Render ────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {step === 'idle' && (
        <View style={styles.centeredSection}>
          <View style={styles.nfcIcon}><Text style={styles.nfcIconText}>📲</Text></View>
          <Text style={styles.title}>Tap to Pay</Text>
          <Text style={styles.subtitle}>Hold your phone near an NFC payment tag</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={startNFCScan}>
            <Text style={styles.primaryButtonText}>Start Scan</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'scanning' && (
        <View style={styles.centeredSection}>
          <ActivityIndicator size="large" color="#00C853" />
          <Text style={styles.scanningText}>Waiting for NFC tag…</Text>
          <TouchableOpacity style={styles.cancelButton} onPress={reset}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'confirm' && resolvedTag && (
        <View style={styles.centeredSection}>
          <Text style={styles.merchantLabel}>{resolvedTag.label}</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountPrefix}>₦</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#666"
              autoFocus
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, !amount && styles.disabledButton]}
            onPress={confirmPayment}
            disabled={!amount || parseFloat(amount) <= 0}
          >
            <Text style={styles.primaryButtonText}>Pay {amount ? `₦${amount}` : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={reset}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'processing' && (
        <View style={styles.centeredSection}>
          <ActivityIndicator size="large" color="#00C853" />
          <Text style={styles.scanningText}>Processing payment…</Text>
        </View>
      )}

      {step === 'done' && (
        <View style={styles.centeredSection}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>Payment Complete</Text>
          <Text style={styles.successAmount}>₦{amount} → {resolvedTag?.label}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={reset}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A', justifyContent: 'center', alignItems: 'center', padding: 24 },
  centeredSection: { alignItems: 'center', gap: 16, width: '100%' },
  nfcIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#00C853' },
  nfcIconText: { fontSize: 40 },
  title: { fontSize: 28, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 15, color: '#999', textAlign: 'center', maxWidth: 260 },
  scanningText: { color: '#CCCCCC', fontSize: 16 },
  merchantLabel: { fontSize: 22, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountPrefix: { fontSize: 32, color: '#00C853', fontWeight: '300' },
  amountInput: { fontSize: 52, fontWeight: '700', color: '#FFFFFF', minWidth: 150, textAlign: 'center' },
  successIcon: { fontSize: 60 },
  successText: { fontSize: 24, fontWeight: '700', color: '#00C853' },
  successAmount: { fontSize: 16, color: '#AAAAAA' },
  primaryButton: { backgroundColor: '#00C853', paddingHorizontal: 40, paddingVertical: 16, borderRadius: 14, width: '100%', alignItems: 'center' },
  primaryButtonText: { color: '#000000', fontSize: 17, fontWeight: '700' },
  cancelButton: { paddingVertical: 12 },
  cancelButtonText: { color: '#888888', fontSize: 15 },
  disabledButton: { opacity: 0.4 },
})
