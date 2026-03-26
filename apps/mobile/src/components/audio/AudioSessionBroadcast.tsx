import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * AudioSessionBroadcast
 * Live DJ broadcast interface
 *
 * TODO: implement component
 */
export default function AudioSessionBroadcast() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>AudioSessionBroadcast</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
