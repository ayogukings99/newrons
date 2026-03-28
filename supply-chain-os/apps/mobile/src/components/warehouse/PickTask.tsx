import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Modal, Alert } from 'react-native'
import { BarcodeScanner } from '../scanner/BarcodeScanner'

interface PickTaskProps {
  task: {
    id: string
    sku_id: string
    sku_name: string
    from_bin: string
    to_bin: string
    qty: number
    status: string
  }
  onComplete: (taskId: string) => Promise<void>
}

type PickStep = 'confirm_bin' | 'scanning' | 'confirm_qty' | 'done'

/// Guided pick task workflow for warehouse floor staff.
///
/// Steps:
///   1. Show task details (SKU, from_bin, qty)
///   2. "Scan Bin" → open scanner, verify bin_id matches from_bin
///   3. "Confirm Qty" → user confirms qty picked
///   4. Emit TASK_COMPLETED event via Tauri command
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Mobile — Warehouse Pick Task
export function PickTask({ task, onComplete }: PickTaskProps) {
  const [step, setStep] = useState<PickStep>('confirm_bin')
  const [scannerVisible, setScannerVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleBinScan(data: string) {
    setScannerVisible(false)
    if (data === task.from_bin) {
      setStep('confirm_qty')
    } else {
      Alert.alert(
        'Wrong Bin',
        `Scanned: ${data}\nExpected: ${task.from_bin}`,
        [{ text: 'Try Again', onPress: () => setScannerVisible(true) }]
      )
    }
  }

  async function handleConfirmComplete() {
    setLoading(true)
    try {
      await onComplete(task.id)
      setStep('done')
    } catch (err) {
      Alert.alert('Error', String(err))
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <View style={[styles.card, styles.doneCard]}>
        <Text style={styles.doneIcon}>✅</Text>
        <Text style={styles.doneText}>Task Complete</Text>
        <Text style={styles.doneSub}>TASK_COMPLETED event written to chain</Text>
        <View style={styles.onChainBadge}>
          <Text style={styles.onChainText}>● On-chain</Text>
        </View>
      </View>
    )
  }

  return (
    <>
      <View style={styles.card}>
        {/* Task header */}
        <View style={styles.header}>
          <Text style={styles.taskType}>PICK</Text>
          <Text style={styles.taskId}>{task.id.slice(0, 8)}…</Text>
        </View>

        {/* SKU info */}
        <Text style={styles.skuName}>{task.sku_name}</Text>
        <Text style={styles.skuId}>{task.sku_id}</Text>

        {/* Bin + qty row */}
        <View style={styles.detailRow}>
          <DetailCell label="FROM BIN" value={task.from_bin} highlight={step === 'confirm_bin'} />
          <DetailCell label="TO BIN" value={task.to_bin} />
          <DetailCell label="QTY" value={String(task.qty)} />
        </View>

        {/* Step-specific CTA */}
        {step === 'confirm_bin' && (
          <TouchableOpacity style={styles.btn} onPress={() => setScannerVisible(true)}>
            <Text style={styles.btnText}>📷 Scan Bin {task.from_bin}</Text>
          </TouchableOpacity>
        )}

        {step === 'confirm_qty' && (
          <View style={styles.confirmBlock}>
            <View style={styles.checkRow}>
              <Text style={styles.checkIcon}>✓</Text>
              <Text style={styles.checkLabel}>Bin {task.from_bin} confirmed</Text>
            </View>
            <TouchableOpacity
              style={[styles.btn, loading && styles.btnDisabled]}
              onPress={handleConfirmComplete}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? 'Saving…' : `Confirm ${task.qty}x picked`}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Barcode scanner modal */}
      <Modal visible={scannerVisible} animationType="slide">
        <BarcodeScanner
          label={`Scan bin: ${task.from_bin}`}
          onScan={handleBinScan}
          onClose={() => setScannerVisible(false)}
        />
      </Modal>
    </>
  )
}

function DetailCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.detailCell}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && { color: '#2dd4bf' }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#1f2937', gap: 12,
  },
  doneCard: { alignItems: 'center', paddingVertical: 32 },
  doneIcon: { fontSize: 40, marginBottom: 8 },
  doneText: { color: '#e5e7eb', fontSize: 18, fontWeight: '700' },
  doneSub: { color: '#6b7280', fontSize: 12 },
  onChainBadge: { marginTop: 8, backgroundColor: '#064e3b', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  onChainText: { color: '#2dd4bf', fontSize: 12, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskType: { color: '#2dd4bf', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  taskId: { color: '#4b5563', fontSize: 11 },
  skuName: { color: '#f3f4f6', fontSize: 16, fontWeight: '600' },
  skuId: { color: '#6b7280', fontSize: 12, marginTop: -8 },
  detailRow: { flexDirection: 'row', gap: 8 },
  detailCell: { flex: 1, backgroundColor: '#0a0a0f', borderRadius: 8, padding: 10 },
  detailLabel: { color: '#4b5563', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  detailValue: { color: '#e5e7eb', fontSize: 14, fontWeight: '600', marginTop: 2 },
  btn: { backgroundColor: '#0d9488', borderRadius: 8, padding: 14, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  confirmBlock: { gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkIcon: { color: '#2dd4bf', fontSize: 16 },
  checkLabel: { color: '#9ca3af', fontSize: 13 },
})
