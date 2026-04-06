import { View, Text, StyleSheet } from 'react-native'

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home</Text>
      <Text style={styles.sub}>Module UI — Phase 1 build</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f', alignItems: 'center', justifyContent: 'center', gap: 8 },
  text: { color: '#e5e7eb', fontSize: 20, fontWeight: '700' },
  sub: { color: '#6b7280', fontSize: 13 },
})
