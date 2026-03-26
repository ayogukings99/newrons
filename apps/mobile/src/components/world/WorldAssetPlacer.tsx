import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * WorldAssetPlacer
 * Drag-and-drop asset placement into NEXUS context
 *
 * TODO: implement component
 */
export default function WorldAssetPlacer() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>WorldAssetPlacer</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
