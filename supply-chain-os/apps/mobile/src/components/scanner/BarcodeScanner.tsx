import { useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'

interface BarcodeScannerProps {
  onScan: (data: string, type: string) => void
  onClose: () => void
  /** Optional overlay label shown in the viewfinder */
  label?: string
}

/// Full-screen barcode/QR scanner component.
///
/// Emits `onScan(data, barcodeType)` on every successful scan.
/// The parent decides whether to auto-close or allow continuous scanning.
///
/// Design spec: SUPPLY-CHAIN-DESIGN.md §Mobile — Warehouse Scanner
export function BarcodeScanner({ onScan, onClose, label }: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [lastScan, setLastScan] = useState<{ data: string; type: string } | null>(null)

  const handleBarCodeScanned = useCallback(
    ({ type, data }: { type: string; data: string }) => {
      if (scanned) return
      setScanned(true)
      setLastScan({ data, type })
      onScan(data, type)
    },
    [scanned, onScan]
  )

  if (!permission) return null

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Camera permission required for scanning</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'datamatrix'],
        }}
      />

      {/* Viewfinder overlay */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕ Close</Text>
          </TouchableOpacity>
          {label && <Text style={styles.label}>{label}</Text>}
        </View>

        {/* Targeting reticle */}
        <View style={styles.reticle}>
          <View style={styles.reticleBorder} />
        </View>

        {/* Last scan result */}
        {lastScan && (
          <View style={styles.resultBar}>
            <Text style={styles.resultType}>{lastScan.type}</Text>
            <Text style={styles.resultData} numberOfLines={1}>{lastScan.data}</Text>
            <TouchableOpacity
              style={styles.rescanBtn}
              onPress={() => setScanned(false)}
            >
              <Text style={styles.rescanText}>Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {!lastScan && (
          <View style={styles.hintBar}>
            <Text style={styles.hintText}>Align barcode within the frame</Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  permissionContainer: {
    flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  permissionText: { color: '#9ca3af', textAlign: 'center', paddingHorizontal: 32 },
  btn: { backgroundColor: '#0d9488', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeBtn: { padding: 8 },
  closeText: { color: '#e5e7eb', fontSize: 14 },
  label: { color: '#2dd4bf', fontSize: 13, fontWeight: '600' },
  reticle: {
    alignSelf: 'center', width: 240, height: 240,
    justifyContent: 'center', alignItems: 'center',
  },
  reticleBorder: {
    width: '100%', height: '100%',
    borderWidth: 2, borderColor: '#2dd4bf', borderRadius: 12,
    opacity: 0.8,
  },
  resultBar: {
    backgroundColor: 'rgba(0,0,0,0.85)', padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  resultType: { color: '#2dd4bf', fontSize: 11, fontWeight: '700', flexShrink: 0 },
  resultData: { color: '#e5e7eb', fontSize: 13, flex: 1 },
  rescanBtn: { backgroundColor: '#0d9488', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  rescanText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  hintBar: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 16, alignItems: 'center' },
  hintText: { color: '#9ca3af', fontSize: 13 },
})
