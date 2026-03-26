import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * AvatarHairTryOn
 * Apply cut style to user avatar for preview
 *
 * TODO: implement component
 */
export default function AvatarHairTryOn() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>AvatarHairTryOn</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
