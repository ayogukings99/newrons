import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * QuizLeaderboard
 * Real-time quiz leaderboard display
 *
 * TODO: implement component
 */
export default function QuizLeaderboard() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>QuizLeaderboard</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
