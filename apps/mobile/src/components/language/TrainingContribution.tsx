import React, { useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native'

interface Props {
  apiBaseUrl: string
  userToken: string
  languageId: string
  languageName: string
  aiOutput?: string       // pre-fill if coming from an AI interaction
  originalText?: string
}

const CONTRIBUTION_TYPES = [
  { value: 'correction', label: '✏️ Correction', desc: 'The AI said something wrong' },
  { value: 'new_phrase', label: '➕ New Phrase', desc: 'A phrase the AI doesn\'t know' },
  { value: 'dialect_variant', label: '🗣 Dialect', desc: 'Different regional variant' },
  { value: 'pronunciation', label: '🔊 Pronunciation', desc: 'Improve how it sounds' },
]

export default function TrainingContribution({ apiBaseUrl, userToken, languageId, languageName, aiOutput = '', originalText = '' }: Props) {
  const [type, setType] = useState('correction')
  const [original, setOriginal] = useState(originalText)
  const [aiText, setAiText] = useState(aiOutput)
  const [corrected, setCorrected] = useState('')
  const [context, setContext] = useState('')
  const [dialect, setDialect] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!original || !aiText || !corrected) return Alert.alert('Missing fields', 'Please fill in all required fields')
    setSubmitting(true)
    try {
      const res = await fetch(`${apiBaseUrl}/languages/contribute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ languageId, type, originalText: original, aiOutput: aiText, correctedText: corrected, context, dialectVariant: dialect || undefined }),
      })
      if (!res.ok) throw new Error('Submission failed')
      Alert.alert('Thank you! 🙏', `Your ${languageName} correction has been submitted. When 3 speakers validate it, it will improve the AI for everyone.`)
      setCorrected(''); setContext(''); setDialect('')
    } catch (e) {
      Alert.alert('Error', 'Failed to submit. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <Text style={styles.title}>Help train {languageName}</Text>
      <Text style={styles.subtitle}>Your correction will be reviewed by 3 native speakers before improving the AI.</Text>

      <Text style={styles.label}>Type of contribution</Text>
      <View style={styles.typeGrid}>
        {CONTRIBUTION_TYPES.map(t => (
          <TouchableOpacity key={t.value} style={[styles.typeChip, type === t.value && styles.typeChipActive]} onPress={() => setType(t.value)}>
            <Text style={styles.typeChipLabel}>{t.label}</Text>
            <Text style={styles.typeChipDesc}>{t.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Original text (what you said)*</Text>
      <TextInput style={styles.input} value={original} onChangeText={setOriginal} placeholder="What you typed or said…" placeholderTextColor="#555" multiline />

      <Text style={styles.label}>What the AI produced*</Text>
      <TextInput style={[styles.input, styles.errorInput]} value={aiText} onChangeText={setAiText} placeholder="The AI's incorrect output…" placeholderTextColor="#555" multiline />

      <Text style={styles.label}>Correct version*</Text>
      <TextInput style={[styles.input, styles.correctInput]} value={corrected} onChangeText={setCorrected} placeholder={`The correct ${languageName}…`} placeholderTextColor="#555" multiline />

      <Text style={styles.label}>Context (optional)</Text>
      <TextInput style={styles.input} value={context} onChangeText={setContext} placeholder="What were you discussing?" placeholderTextColor="#555" />

      <Text style={styles.label}>Dialect variant (optional)</Text>
      <TextInput style={styles.input} value={dialect} onChangeText={setDialect} placeholder="e.g. Lagos Yoruba, Oyo Yoruba…" placeholderTextColor="#555" />

      <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#000" /> : <Text style={styles.submitText}>Submit Correction</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  title: { color: '#FFF', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: '#888', fontSize: 14, lineHeight: 20, marginBottom: 24 },
  label: { color: '#AAA', fontSize: 13, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#1A1A1A', color: '#FFF', borderRadius: 12, padding: 14, fontSize: 15, minHeight: 50 },
  errorInput: { borderWidth: 1, borderColor: '#FF5252' },
  correctInput: { borderWidth: 1, borderColor: '#00C853' },
  typeGrid: { gap: 8 },
  typeChip: { backgroundColor: '#1A1A1A', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2A' },
  typeChipActive: { backgroundColor: '#0A2A14', borderColor: '#00C853' },
  typeChipLabel: { color: '#FFF', fontWeight: '600', fontSize: 14 },
  typeChipDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  submitButton: { backgroundColor: '#00C853', padding: 18, borderRadius: 14, alignItems: 'center', marginTop: 32 },
  submitText: { color: '#000', fontWeight: '700', fontSize: 16 },
})
