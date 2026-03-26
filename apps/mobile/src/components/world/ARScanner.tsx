import React, { useState, useRef } from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
// import { Camera, CameraView } from 'expo-camera'

/**
 * ARScanner — Pillar 9: 3D World Building from Reality Scans
 *
 * Captures multi-angle photos for 3D reconstruction.
 * Uses ARKit (iOS) / ARCore (Android) for geometry capture.
 * Guides user to capture enough angles for good reconstruction.
 */
export default function ARScanner() {
  const [capturedImages, setCapturedImages] = useState<string[]>([])
  const [isCapturing, setIsCapturing] = useState(false)

  const handleCapture = async () => {
    // TODO: capture frame from camera + ARKit/ARCore depth data
    // Minimum 8 angles recommended for quality reconstruction
  }

  const handleSubmit = async () => {
    // TODO: call POST /api/v1/world-scans/process with captured images
    // Show progress indicator while Luma AI reconstructs the mesh
  }

  return (
    <View style={styles.container}>
      {/* TODO: Render CameraView with AR overlay */}
      <View style={styles.captureGuide}>
        <Text style={styles.guideText}>
          {capturedImages.length < 8
            ? `Capture ${8 - capturedImages.length} more angles`
            : 'Ready to reconstruct!'}
        </Text>
      </View>
      <TouchableOpacity style={styles.captureButton} onPress={handleCapture}>
        <Text style={styles.captureButtonText}>📸</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  captureGuide: { position: 'absolute', top: 60, alignSelf: 'center' },
  guideText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  captureButton: {
    position: 'absolute', bottom: 60, alignSelf: 'center',
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
  },
  captureButtonText: { fontSize: 32 },
})
