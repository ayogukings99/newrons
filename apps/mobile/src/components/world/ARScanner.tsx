import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View, TouchableOpacity, Text, StyleSheet, Alert,
  Dimensions, Animated, ScrollView, ActivityIndicator,
} from 'react-native'
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera'
import * as Location from 'expo-location'
import { useApi } from '../../hooks/useApi'

const { width, height } = Dimensions.get('window')

// Scan type configuration
const SCAN_TYPES = [
  { key: 'object', label: 'Object', icon: '📦', hint: 'Product, tool, furniture' },
  { key: 'sculpture', label: 'Sculpture', icon: '🗿', hint: 'Art, cultural artefact' },
  { key: 'art', label: 'Art', icon: '🎨', hint: 'Painting, mural, craft' },
  { key: 'environment', label: 'Space', icon: '🏛️', hint: 'Room, shop, outdoor area' },
] as const

type ScanType = typeof SCAN_TYPES[number]['key']
type ScanState = 'type_select' | 'capturing' | 'review' | 'submitting' | 'done'

// Angle guide dots — show user which directions they've covered
const ANGLE_TARGETS = [
  { label: 'Front', angle: 0 },
  { label: 'Left', angle: 45 },
  { label: 'Side L', angle: 90 },
  { label: 'Behind', angle: 135 },
  { label: 'Back', angle: 180 },
  { label: 'Side R', angle: 225 },
  { label: 'Right', angle: 270 },
  { label: 'Top', angle: 315 },
]

interface Props {
  onScanCreated?: (scanId: string) => void
  onCancel?: () => void
}

export default function ARScanner({ onScanCreated, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [locationPermission, requestLocationPermission] = Location.usePermissions()

  const [scanState, setScanState] = useState<ScanState>('type_select')
  const [scanType, setScanType] = useState<ScanType>('object')
  const [capturedImages, setCapturedImages] = useState<string[]>([])
  const [captureAngle, setCaptureAngle] = useState(0)
  const [scanName, setScanName] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const cameraRef = useRef<CameraView>(null)
  const flashAnim = useRef(new Animated.Value(0)).current
  const { post } = useApi()

  const MIN_CAPTURES = 6
  const RECOMMENDED_CAPTURES = 12

  useEffect(() => {
    if (!locationPermission?.granted) {
      requestLocationPermission()
    }
    getCurrentLocation()
  }, [])

  const getCurrentLocation = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude })
    } catch {
      // Use a default location if GPS unavailable
      setLocation({ lat: 6.5244, lng: 3.3792 })  // Lagos, Nigeria
    }
  }

  const captureFrame = useCallback(async () => {
    if (!cameraRef.current) return

    // Flash animation to give feedback
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start()

    const photo = await cameraRef.current.takePictureAsync({
      quality: 0.8,
      base64: true,
      skipProcessing: true,
    })

    if (photo?.base64) {
      const dataUri = `data:image/jpeg;base64,${photo.base64}`
      setCapturedImages(prev => [...prev, dataUri])
      setCaptureAngle(prev => (prev + 45) % 360)
    }
  }, [flashAnim])

  const removeLastCapture = () => {
    setCapturedImages(prev => prev.slice(0, -1))
    setCaptureAngle(prev => Math.max(0, prev - 45))
  }

  const handleSubmit = async () => {
    if (capturedImages.length < MIN_CAPTURES) {
      Alert.alert(
        'More angles needed',
        `Capture at least ${MIN_CAPTURES} angles for a good 3D model. You have ${capturedImages.length}.`
      )
      return
    }

    if (!location) {
      Alert.alert('Location unavailable', 'Please enable location to tag your scan.')
      return
    }

    setSubmitting(true)
    setScanState('submitting')

    try {
      const result = await post('/world-scans', {
        captureImages: capturedImages,
        captureLocation: location,
        type: scanType,
        name: scanName || `${scanType} scan`,
      })

      setScanState('done')
      onScanCreated?.(result.id)
    } catch (err: any) {
      Alert.alert('Upload failed', err.message)
      setScanState('capturing')
    } finally {
      setSubmitting(false)
    }
  }

  // — Permission gates —
  if (!permission) return <View style={styles.container} />

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permissionText}>Camera access needed to scan objects</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // — Type selection screen —
  if (scanState === 'type_select') {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: '#0a0a0a' }]}>
        <Text style={styles.headerTitle}>What are you scanning?</Text>
        <Text style={styles.headerSub}>Choose the type of object or space</Text>
        <View style={styles.typeGrid}>
          {SCAN_TYPES.map(type => (
            <TouchableOpacity
              key={type.key}
              style={[styles.typeCard, scanType === type.key && styles.typeCardActive]}
              onPress={() => setScanType(type.key)}
            >
              <Text style={styles.typeIcon}>{type.icon}</Text>
              <Text style={styles.typeLabel}>{type.label}</Text>
              <Text style={styles.typeHint}>{type.hint}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.startBtn} onPress={() => setScanState('capturing')}>
          <Text style={styles.startBtnText}>Start Scanning →</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity style={styles.cancelLink} onPress={onCancel}>
            <Text style={styles.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  // — Submitting / Done screens —
  if (scanState === 'submitting' || scanState === 'done') {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: '#0a0a0a' }]}>
        {scanState === 'submitting' ? (
          <>
            <ActivityIndicator size="large" color="#F5A623" />
            <Text style={[styles.headerTitle, { marginTop: 20 }]}>Uploading your scan...</Text>
            <Text style={styles.headerSub}>
              Sending {capturedImages.length} angles to Luma AI for 3D reconstruction.
              {'\n'}This usually takes 3–10 minutes.
            </Text>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 64 }}>✅</Text>
            <Text style={[styles.headerTitle, { marginTop: 12 }]}>Scan submitted!</Text>
            <Text style={styles.headerSub}>
              Your 3D model is being reconstructed.{'\n'}
              You'll find it in your World Library when it's ready.
            </Text>
            <TouchableOpacity style={styles.startBtn} onPress={onCancel}>
              <Text style={styles.startBtnText}>Back to Library</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    )
  }

  // — Camera capturing screen —
  const progress = Math.min(capturedImages.length / RECOMMENDED_CAPTURES, 1)
  const isReady = capturedImages.length >= MIN_CAPTURES

  return (
    <View style={styles.container}>
      {/* Camera */}
      <CameraView ref={cameraRef} style={styles.camera} facing={'back' as CameraType}>
        {/* Flash overlay */}
        <Animated.View
          style={[styles.flashOverlay, { opacity: flashAnim }]}
          pointerEvents="none"
        />

        {/* Top HUD */}
        <View style={styles.hud}>
          <View style={styles.hudLeft}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={styles.hudBtn}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.hudCenter}>
            <Text style={styles.hudCount}>{capturedImages.length} / {RECOMMENDED_CAPTURES}</Text>
            <Text style={styles.hudLabel}>angles captured</Text>
          </View>
          <View style={styles.hudRight}>
            {capturedImages.length > 0 && (
              <TouchableOpacity onPress={removeLastCapture}>
                <Text style={styles.hudBtn}>↩</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBarBg}>
          <Animated.View
            style={[
              styles.progressBarFill,
              { width: `${progress * 100}%`, backgroundColor: isReady ? '#4CAF50' : '#F5A623' },
            ]}
          />
        </View>

        {/* Angle guide ring */}
        <View style={styles.guideContainer}>
          <View style={styles.guideRing}>
            {ANGLE_TARGETS.map((target, i) => {
              const covered = i < capturedImages.length
              const angleDeg = (i * 360) / ANGLE_TARGETS.length
              const rad = (angleDeg * Math.PI) / 180
              const r = 80
              const x = r * Math.sin(rad)
              const y = -r * Math.cos(rad)
              return (
                <View
                  key={target.angle}
                  style={[
                    styles.angleDot,
                    {
                      transform: [{ translateX: x }, { translateY: y }],
                      backgroundColor: covered ? '#4CAF50' : 'rgba(255,255,255,0.3)',
                    },
                  ]}
                />
              )
            })}
            <View style={styles.guideCenter}>
              <Text style={styles.guideCenterIcon}>
                {SCAN_TYPES.find(t => t.key === scanType)?.icon ?? '📦'}
              </Text>
            </View>
          </View>
          <Text style={styles.guideHint}>
            {!isReady
              ? `Walk around the ${scanType} — capture from different angles`
              : '✅ Enough angles! Tap Submit or keep going for higher quality'}
          </Text>
        </View>

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          {isReady && (
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>Submit for 3D Reconstruction</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.captureButton} onPress={captureFrame}>
            <View style={styles.captureButtonInner} />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  camera: { flex: 1 },

  // Permission
  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  permissionBtn: { backgroundColor: '#F5A623', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permissionBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },

  // Type selection
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 32 },
  typeCard: {
    width: (width - 72) / 2,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  typeCardActive: { borderColor: '#F5A623', backgroundColor: 'rgba(245,166,35,0.12)' },
  typeIcon: { fontSize: 36, marginBottom: 8 },
  typeLabel: { color: '#fff', fontWeight: '700', fontSize: 15, marginBottom: 4 },
  typeHint: { color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center' },
  startBtn: { backgroundColor: '#F5A623', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 10 },
  startBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
  cancelLink: { marginTop: 16 },
  cancelLinkText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },

  // HUD
  flashOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  hud: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  hudLeft: { width: 44 },
  hudRight: { width: 44, alignItems: 'flex-end' },
  hudCenter: { alignItems: 'center' },
  hudBtn: { color: '#fff', fontSize: 22 },
  hudCount: { color: '#fff', fontSize: 24, fontWeight: '800' },
  hudLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  // Progress
  progressBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 20 },
  progressBarFill: { height: 4, borderRadius: 2, transition: 'width 0.3s' } as any,

  // Angle guide
  guideContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  guideRing: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center' },
  angleDot: { position: 'absolute', width: 12, height: 12, borderRadius: 6 },
  guideCenter: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  guideCenterIcon: { fontSize: 28 },
  guideHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, textAlign: 'center', marginTop: 20, paddingHorizontal: 40, lineHeight: 18 },

  // Bottom controls
  bottomControls: { paddingBottom: 48, paddingHorizontal: 20, alignItems: 'center', gap: 16 },
  submitBtn: { backgroundColor: '#4CAF50', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  captureButton: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#fff',
  },
  captureButtonInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
})
