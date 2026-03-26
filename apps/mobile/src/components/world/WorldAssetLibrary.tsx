import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * WorldAssetLibrary
 * User's personal 3D scan collection
 *
 * TODO: implement component
 */
export default function WorldAssetLibrary() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>WorldAssetLibrary</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
