import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * ScanPreview
 * 3D preview of captured scan using Three.js / Babylon.js
 *
 * TODO: implement component
 */
export default function ScanPreview() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>ScanPreview</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
