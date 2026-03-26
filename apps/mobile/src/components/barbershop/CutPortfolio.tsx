import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * CutPortfolio
 * Gallery of barber's avatar cut portfolio
 *
 * TODO: implement component
 */
export default function CutPortfolio() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>CutPortfolio</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
