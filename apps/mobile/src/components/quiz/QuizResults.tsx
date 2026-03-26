import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * QuizResults
 * Post-quiz breakdown and rewards
 *
 * TODO: implement component
 */
export default function QuizResults() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>QuizResults</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
