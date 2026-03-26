import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * LiveQuizParticipant
 * Participant answer interface with timer
 *
 * TODO: implement component
 */
export default function LiveQuizParticipant() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>LiveQuizParticipant</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
