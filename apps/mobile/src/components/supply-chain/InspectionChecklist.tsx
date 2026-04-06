import { useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image, Modal } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

type ItemResult = 'PASS' | 'FAIL' | 'CONDITIONAL' | null
type DefectType = 'CRITICAL' | 'MAJOR' | 'MINOR'

interface InspectionItem {
  id: string
  sku_id: string
  sku_name: string
  description: string
  aql_critical: boolean
}

interface InspectionResult {
  item_id: string
  result: ItemResult
  defect_type?: DefectType
  notes?: string
  photo_uri?: string
}

interface InspectionChecklistProps {
  batch: {
    id: string
    supplier_did: string
    po_id: string
    items: InspectionItem[]
  }
  onSubmit: (results: InspectionResult[]) => Promise<void>
}

/// Mobile QC inspection checklist component.
///
/// Inspector workflow (one item at a time):
///   1. Show item details (SKU, AQL flag)
///   2. PASS / FAIL / CONDITIONAL buttons
///   3. On FAIL: select defect type (CRITICAL / MAJOR / MINOR) + optional photo
///   4. After all items: submit batch → emits ITEM_INSPECTED events to source chain
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Mobile — QC Inspection Checklist
export function InspectionChecklist({ batch, onSubmit }: InspectionChecklistProps) {
  const [results, setResults] = useState<Record<string, InspectionResult>>({})
  const [currentIdx, setCurrentIdx] = useState(0)
  const [defectModalItem, setDefectModalItem] = useState<InspectionItem | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const currentItem = batch.items[currentIdx]
  const totalItems = batch.items.length
  const completedItems = Object.keys(results).length
  const allDone = completedItems === totalItems

  function setResult(item: InspectionItem, result: ItemResult) {
    if (result === 'FAIL') {
      setDefectModalItem(item)
      return
    }
    setResults(prev => ({
      ...prev,
      [item.id]: { item_id: item.id, result },
    }))
    if (currentIdx < totalItems - 1) setCurrentIdx(i => i + 1)
  }

  function setDefectResult(
    item: InspectionItem,
    defect_type: DefectType,
    photo_uri?: string
  ) {
    setResults(prev => ({
      ...prev,
      [item.id]: { item_id: item.id, result: 'FAIL', defect_type, photo_uri },
    }))
    setDefectModalItem(null)
    if (currentIdx < totalItems - 1) setCurrentIdx(i => i + 1)
  }

  async function handleSubmit() {
    setSubmitting(true)
    try {
      await onSubmit(Object.values(results))
      setSubmitted(true)
    } catch (err) {
      Alert.alert('Error', String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    const passes = Object.values(results).filter(r => r.result === 'PASS').length
    const fails = Object.values(results).filter(r => r.result === 'FAIL').length
    return (
      <View style={[styles.card, styles.doneCard]}>
        <Text style={styles.doneIcon}>🔍✅</Text>
        <Text style={styles.doneText}>Inspection Complete</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.passCount}>✓ {passes} PASS</Text>
          <Text style={styles.failCount}>✕ {fails} FAIL</Text>
        </View>
        <Text style={styles.doneSub}>Results anchored to source chain</Text>
        <View style={styles.chainBadge}>
          <Text style={styles.chainBadgeText}>● On-chain · Supplier-shared</Text>
        </View>
      </View>
    )
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Progress */}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${(completedItems / totalItems) * 100}%` as any }]} />
        </View>
        <Text style={styles.progressText}>{completedItems} / {totalItems} items inspected</Text>

        {/* Current item */}
        {currentItem && (
          <View style={styles.currentItem}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemIdx}>Item {currentIdx + 1}</Text>
              {currentItem.aql_critical && (
                <View style={styles.criticalBadge}>
                  <Text style={styles.criticalText}>AQL CRITICAL</Text>
                </View>
              )}
            </View>
            <Text style={styles.itemName}>{currentItem.sku_name}</Text>
            <Text style={styles.itemDesc}>{currentItem.description}</Text>

            {/* Result buttons */}
            {!results[currentItem.id] ? (
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.resultBtn, styles.passBtn]}
                  onPress={() => setResult(currentItem, 'PASS')}
                >
                  <Text style={styles.resultBtnText}>✓ PASS</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultBtn, styles.conditionalBtn]}
                  onPress={() => setResult(currentItem, 'CONDITIONAL')}
                >
                  <Text style={styles.resultBtnText}>~ COND.</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.resultBtn, styles.failBtn]}
                  onPress={() => setResult(currentItem, 'FAIL')}
                >
                  <Text style={styles.resultBtnText}>✕ FAIL</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.completedRow}>
                <Text style={styles.completedText}>
                  {results[currentItem.id].result === 'PASS' && '✓ Passed'}
                  {results[currentItem.id].result === 'CONDITIONAL' && '~ Conditional'}
                  {results[currentItem.id].result === 'FAIL' && `✕ Failed — ${results[currentItem.id].defect_type}`}
                </Text>
                <TouchableOpacity onPress={() => setCurrentIdx(i => Math.min(i + 1, totalItems - 1))}>
                  <Text style={styles.nextText}>Next →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* All items summary */}
        {allDone && (
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitText}>
              {submitting ? 'Submitting…' : 'Submit Inspection Results'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Defect detail modal */}
      <DefectModal
        item={defectModalItem}
        onConfirm={setDefectResult}
        onCancel={() => setDefectModalItem(null)}
      />
    </>
  )
}

function DefectModal({
  item,
  onConfirm,
  onCancel,
}: {
  item: InspectionItem | null
  onConfirm: (item: InspectionItem, defect: DefectType, photo?: string) => void
  onCancel: () => void
}) {
  const [defect, setDefect] = useState<DefectType | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)

  async function capturePhoto() {
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 })
    if (!result.canceled) setPhoto(result.assets[0].uri)
  }

  if (!item) return null

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modal}>
        <Text style={styles.modalTitle}>Defect Detail</Text>
        <Text style={styles.modalSub}>{item.sku_name}</Text>

        <Text style={styles.defectLabel}>SELECT DEFECT TYPE</Text>
        {(['CRITICAL', 'MAJOR', 'MINOR'] as DefectType[]).map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.defectBtn, defect === d && styles.defectBtnActive]}
            onPress={() => setDefect(d)}
          >
            <Text style={[styles.defectBtnText, defect === d && { color: '#fff' }]}>{d}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.photoBtn} onPress={capturePhoto}>
          <Text style={styles.photoBtnText}>{photo ? '📷 Retake Photo' : '📷 Add Photo Evidence'}</Text>
        </TouchableOpacity>
        {photo && <Image source={{ uri: photo }} style={styles.photoPreview} />}

        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, !defect && styles.btnDisabled]}
            onPress={() => defect && onConfirm(item, defect, photo ?? undefined)}
            disabled={!defect}
          >
            <Text style={styles.confirmText}>Confirm Defect</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  progressBar: { height: 3, backgroundColor: '#1f2937', marginHorizontal: 16, marginTop: 16, borderRadius: 2 },
  progressFill: { height: '100%', backgroundColor: '#2dd4bf', borderRadius: 2 },
  progressText: { color: '#6b7280', fontSize: 11, marginTop: 6, marginHorizontal: 16 },
  card: { margin: 16, backgroundColor: '#111827', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1f2937' },
  doneCard: { alignItems: 'center', paddingVertical: 32 },
  doneIcon: { fontSize: 40, marginBottom: 8 },
  doneText: { color: '#e5e7eb', fontSize: 18, fontWeight: '700' },
  doneSub: { color: '#6b7280', fontSize: 12 },
  summaryRow: { flexDirection: 'row', gap: 24, marginVertical: 8 },
  passCount: { color: '#2dd4bf', fontWeight: '700', fontSize: 16 },
  failCount: { color: '#f87171', fontWeight: '700', fontSize: 16 },
  chainBadge: { marginTop: 8, backgroundColor: '#064e3b', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 },
  chainBadgeText: { color: '#2dd4bf', fontSize: 12, fontWeight: '600' },
  currentItem: { margin: 16, backgroundColor: '#111827', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#1f2937', gap: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemIdx: { color: '#4b5563', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  criticalBadge: { backgroundColor: '#7f1d1d', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 },
  criticalText: { color: '#fca5a5', fontSize: 10, fontWeight: '700' },
  itemName: { color: '#f3f4f6', fontSize: 16, fontWeight: '600' },
  itemDesc: { color: '#9ca3af', fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 8 },
  resultBtn: { flex: 1, borderRadius: 8, padding: 14, alignItems: 'center' },
  passBtn: { backgroundColor: '#064e3b' },
  conditionalBtn: { backgroundColor: '#1c1917' },
  failBtn: { backgroundColor: '#7f1d1d' },
  resultBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  completedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  completedText: { color: '#9ca3af', fontSize: 13 },
  nextText: { color: '#2dd4bf', fontSize: 13, fontWeight: '600' },
  submitBtn: { margin: 16, backgroundColor: '#0d9488', borderRadius: 8, padding: 16, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  // Modal
  modal: { flex: 1, backgroundColor: '#0a0a0f', padding: 24, gap: 14 },
  modalTitle: { color: '#f3f4f6', fontSize: 18, fontWeight: '700', marginTop: 16 },
  modalSub: { color: '#9ca3af', fontSize: 13, marginTop: -8 },
  defectLabel: { color: '#4b5563', fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  defectBtn: { borderRadius: 8, borderWidth: 1, borderColor: '#374151', padding: 14, alignItems: 'center' },
  defectBtnActive: { backgroundColor: '#0d9488', borderColor: '#0d9488' },
  defectBtnText: { color: '#9ca3af', fontWeight: '600', fontSize: 14 },
  photoBtn: { borderWidth: 1, borderColor: '#374151', borderStyle: 'dashed', borderRadius: 8, padding: 14, alignItems: 'center' },
  photoBtnText: { color: '#9ca3af', fontSize: 13 },
  photoPreview: { width: '100%', height: 160, borderRadius: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: { flex: 1, borderRadius: 8, borderWidth: 1, borderColor: '#374151', padding: 14, alignItems: 'center' },
  cancelText: { color: '#9ca3af', fontWeight: '600' },
  confirmBtn: { flex: 1, backgroundColor: '#0d9488', borderRadius: 8, padding: 14, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '700' },
})
