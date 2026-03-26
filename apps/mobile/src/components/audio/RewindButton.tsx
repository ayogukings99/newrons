import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * RewindButton
 * The iconic rewind effect button
 *
 * TODO: implement component
 */
export default function RewindButton() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>RewindButton</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
