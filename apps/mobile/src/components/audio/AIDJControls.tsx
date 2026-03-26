import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * AIDJControls
 * Enable AI DJ and select mood
 *
 * TODO: implement component
 */
export default function AIDJControls() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>AIDJControls</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
