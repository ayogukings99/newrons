import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

/**
 * KnowledgeBaseManager
 * Upload and manage AI knowledge base documents
 *
 * TODO: implement component
 */
export default function KnowledgeBaseManager() {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>KnowledgeBaseManager</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, color: '#666' },
})
