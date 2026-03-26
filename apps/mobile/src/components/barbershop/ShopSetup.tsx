import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * ShopSetup
 * Create and configure virtual barbershop
 *
 * TODO: implement component
 */
export default function ShopSetup() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>ShopSetup</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
