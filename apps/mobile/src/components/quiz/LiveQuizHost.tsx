import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * LiveQuizHost
 * Host-side live quiz controller
 *
 * TODO: implement component
 */
export default function LiveQuizHost() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>LiveQuizHost</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
