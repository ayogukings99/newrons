import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * QuizCreator
 * Configure and generate quiz from knowledge base
 *
 * TODO: implement component
 */
export default function QuizCreator() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>QuizCreator</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
