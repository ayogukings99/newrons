import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * DJConsole
 * EQ sliders and DJ effects panel
 *
 * TODO: implement component
 */
export default function DJConsole() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>DJConsole</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
