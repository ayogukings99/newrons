import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * GroupAudioPlayer
 * Synchronized group playback UI
 *
 * TODO: implement component
 */
export default function GroupAudioPlayer() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>GroupAudioPlayer</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
