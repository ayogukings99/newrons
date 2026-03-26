/**
 * LiveTranslator — Real-Time Translation Component
 * Phase 4 — African Languages Pillar
 *
 * A self-contained translation UI that supports:
 *   - Text translation with language auto-detection
 *   - Language pair selector (source + target)
 *   - Copy-to-clipboard for translated output
 *   - Recent translations list (session memory)
 *   - Swapping source/target languages
 *   - Loading shimmer + error state handling
 *
 * Props:
 *   initialSourceLang? — default source language (default: auto)
 *   initialTargetLang? — default target language (default: en)
 *   compact?           — show compact card mode (for embedding in other screens)
 *   onTranslated?      — callback with (sourceText, translatedText, targetLang)
 */

import React, { useState, useCallback, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Clipboard, Animated,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { apiClient } from '../../lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

type LangCode = 'auto' | 'en' | 'fr' | 'yo' | 'ig' | 'ha' | 'sw' | 'zu' | 'am' | 'pcm' | 'ar' | 'af' | 'xh' | 'so' | 'pt' | 'es'

interface Language {
  code:  LangCode
  name:  string
  flag?: string
}

interface RecentTranslation {
  id:         string
  source:     string
  translated: string
  sourceLang: LangCode
  targetLang: LangCode
  at:         Date
}

interface TranslationResult {
  sourceText:     string
  translatedText: string
  sourceLang:     LangCode
  targetLang:     LangCode
  fromCache:      boolean
}

// ── Constants ──────────────────────────────────────────────────────────────

const LANGUAGES: Language[] = [
  { code: 'auto', name: 'Auto-detect',       flag: '🌐' },
  { code: 'en',   name: 'English',            flag: '🇬🇧' },
  { code: 'fr',   name: 'French',             flag: '🇫🇷' },
  { code: 'yo',   name: 'Yoruba',             flag: '🇳🇬' },
  { code: 'ig',   name: 'Igbo',               flag: '🇳🇬' },
  { code: 'ha',   name: 'Hausa',              flag: '🇳🇬' },
  { code: 'sw',   name: 'Swahili',            flag: '🇹🇿' },
  { code: 'zu',   name: 'Zulu',               flag: '🇿🇦' },
  { code: 'am',   name: 'Amharic',            flag: '🇪🇹' },
  { code: 'pcm',  name: 'Nigerian Pidgin',    flag: '🇳🇬' },
  { code: 'ar',   name: 'Arabic',             flag: '🇸🇦' },
  { code: 'af',   name: 'Afrikaans',          flag: '🇿🇦' },
  { code: 'xh',   name: 'Xhosa',              flag: '🇿🇦' },
  { code: 'so',   name: 'Somali',             flag: '🇸🇴' },
  { code: 'pt',   name: 'Portuguese',         flag: '🇵🇹' },
  { code: 'es',   name: 'Spanish',            flag: '🇪🇸' },
]

const POPULAR_LANGS: LangCode[] = ['en', 'yo', 'fr', 'sw', 'ha', 'ig']

// ── Helpers ────────────────────────────────────────────────────────────────

const getLang = (code: LangCode) => LANGUAGES.find(l => l.code === code) ?? LANGUAGES[0]

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  initialSourceLang?: LangCode
  initialTargetLang?: LangCode
  compact?:           boolean
  onTranslated?:      (source: string, translated: string, targetLang: LangCode) => void
}

export default function LiveTranslator({
  initialSourceLang = 'auto',
  initialTargetLang = 'en',
  compact           = false,
  onTranslated,
}: Props) {
  const [sourceLang, setSourceLang] = useState<LangCode>(initialSourceLang)
  const [targetLang, setTargetLang] = useState<LangCode>(initialTargetLang)
  const [sourceText, setSourceText] = useState('')
  const [translated, setTranslated] = useState<TranslationResult | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [recents, setRecents]       = useState<RecentTranslation[]>([])
  const [showLangPicker, setShowLangPicker] = useState<'source' | 'target' | null>(null)

  const swapAnim = useRef(new Animated.Value(0)).current
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Translation ──────────────────────────────────────────────────────────

  const translate = useCallback(async (text: string, src: LangCode, tgt: LangCode) => {
    if (!text.trim() || src === tgt) {
      setTranslated(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const body: Record<string, any> = { text, targetLang: tgt }
      if (src !== 'auto') body.sourceLang = src

      const result: TranslationResult = await apiClient.post('/translate/text', body)
      setTranslated(result)
      onTranslated?.(text, result.translatedText, tgt)

      // Add to recents
      setRecents(prev => [
        {
          id:         Date.now().toString(),
          source:     text,
          translated: result.translatedText,
          sourceLang: result.sourceLang,
          targetLang: tgt,
          at:         new Date(),
        },
        ...prev.slice(0, 9), // keep last 10
      ])
    } catch (e: any) {
      setError(e.message ?? 'Translation failed')
    } finally {
      setLoading(false)
    }
  }, [onTranslated])

  // Debounced auto-translate as user types
  const handleSourceChange = (text: string) => {
    setSourceText(text)
    setTranslated(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (text.trim().length < 2) return
    debounceRef.current = setTimeout(() => {
      translate(text, sourceLang, targetLang)
    }, 800)
  }

  // ── Language Swap ────────────────────────────────────────────────────────

  const swapLanguages = () => {
    if (sourceLang === 'auto') return

    Animated.sequence([
      Animated.timing(swapAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(swapAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start()

    const prevSource = sourceLang
    const prevTarget = targetLang
    const prevText   = translated?.translatedText ?? ''

    setSourceLang(prevTarget)
    setTargetLang(prevSource)
    setSourceText(prevText)
    setTranslated(null)

    if (prevText) {
      setTimeout(() => translate(prevText, prevTarget, prevSource), 100)
    }
  }

  // ── Copy ─────────────────────────────────────────────────────────────────

  const copyTranslation = () => {
    if (!translated?.translatedText) return
    Clipboard.setString(translated.translatedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Lang Picker ───────────────────────────────────────────────────────────

  const selectLang = (code: LangCode) => {
    if (showLangPicker === 'source') {
      setSourceLang(code)
      if (sourceText) translate(sourceText, code, targetLang)
    } else if (showLangPicker === 'target') {
      setTargetLang(code)
      if (sourceText) translate(sourceText, sourceLang, code)
    }
    setShowLangPicker(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const spinStyle = {
    transform: [{
      rotate: swapAnim.interpolate({
        inputRange:  [0, 1],
        outputRange: ['0deg', '180deg'],
      }),
    }],
  }

  if (showLangPicker) {
    return (
      <View style={styles.container}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity onPress={() => setShowLangPicker(null)} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.pickerTitle}>
            {showLangPicker === 'source' ? 'Translate from' : 'Translate to'}
          </Text>
        </View>

        {/* Popular */}
        <Text style={styles.sectionLabel}>Popular</Text>
        <View style={styles.popularRow}>
          {POPULAR_LANGS.filter(c => showLangPicker !== 'source' || c !== 'auto').map(code => {
            const lang = getLang(code)
            const active = showLangPicker === 'source' ? sourceLang === code : targetLang === code
            return (
              <TouchableOpacity
                key={code}
                style={[styles.popularChip, active && styles.chipActive]}
                onPress={() => selectLang(code)}
              >
                <Text style={styles.chipFlag}>{lang.flag}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{lang.name}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.sectionLabel}>All Languages</Text>
        <ScrollView>
          {LANGUAGES
            .filter(l => showLangPicker === 'target' ? l.code !== 'auto' : true)
            .map(lang => {
              const active = showLangPicker === 'source' ? sourceLang === lang.code : targetLang === lang.code
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langRow, active && styles.langRowActive]}
                  onPress={() => selectLang(lang.code)}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langName, active && styles.langNameActive]}>{lang.name}</Text>
                  {active && <Ionicons name="checkmark" size={18} color="#6EE7B7" style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              )
            })}
        </ScrollView>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Language Bar */}
      <View style={styles.langBar}>
        <TouchableOpacity
          style={styles.langBtn}
          onPress={() => setShowLangPicker('source')}
        >
          <Text style={styles.langBtnFlag}>{getLang(sourceLang).flag}</Text>
          <Text style={styles.langBtnText}>{getLang(sourceLang).name}</Text>
          <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
        </TouchableOpacity>

        <Animated.View style={[styles.swapWrap, spinStyle]}>
          <TouchableOpacity
            style={[styles.swapBtn, sourceLang === 'auto' && styles.swapBtnDisabled]}
            onPress={swapLanguages}
            disabled={sourceLang === 'auto'}
          >
            <Ionicons name="swap-horizontal" size={18} color={sourceLang === 'auto' ? '#4B5563' : '#6EE7B7'} />
          </TouchableOpacity>
        </Animated.View>

        <TouchableOpacity
          style={styles.langBtn}
          onPress={() => setShowLangPicker('target')}
        >
          <Text style={styles.langBtnFlag}>{getLang(targetLang).flag}</Text>
          <Text style={styles.langBtnText}>{getLang(targetLang).name}</Text>
          <Ionicons name="chevron-down" size={14} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Source Input */}
      <View style={styles.inputCard}>
        <TextInput
          style={styles.sourceInput}
          placeholder="Enter text to translate…"
          placeholderTextColor="#6B7280"
          multiline
          value={sourceText}
          onChangeText={handleSourceChange}
          returnKeyType="default"
          maxLength={5000}
        />
        {sourceText.length > 0 && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setSourceText(''); setTranslated(null) }}
          >
            <Ionicons name="close-circle" size={18} color="#6B7280" />
          </TouchableOpacity>
        )}
        <Text style={styles.charCount}>{sourceText.length}/5000</Text>
        {!compact && (
          <TouchableOpacity
            style={styles.translateBtn}
            onPress={() => translate(sourceText, sourceLang, targetLang)}
            disabled={!sourceText.trim() || loading}
          >
            <Text style={styles.translateBtnText}>Translate</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Output Card */}
      <View style={styles.outputCard}>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#6EE7B7" />
            <Text style={styles.loadingText}>Translating…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : translated ? (
          <>
            <Text style={styles.translatedText}>{translated.translatedText}</Text>
            <View style={styles.outputFooter}>
              {translated.fromCache && (
                <Text style={styles.cacheTag}>Cached</Text>
              )}
              <TouchableOpacity style={styles.copyBtn} onPress={copyTranslation}>
                <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#6EE7B7' : '#9CA3AF'} />
                <Text style={[styles.copyText, copied && { color: '#6EE7B7' }]}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={styles.placeholderText}>Translation will appear here</Text>
        )}
      </View>

      {/* Recent Translations */}
      {!compact && recents.length > 0 && (
        <View style={styles.recentsSection}>
          <Text style={styles.recentsTitle}>Recent</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentScroll}>
            {recents.slice(0, 5).map(r => (
              <TouchableOpacity
                key={r.id}
                style={styles.recentCard}
                onPress={() => {
                  setSourceText(r.source)
                  setSourceLang(r.sourceLang)
                  setTargetLang(r.targetLang)
                  setTranslated({
                    sourceText:     r.source,
                    translatedText: r.translated,
                    sourceLang:     r.sourceLang,
                    targetLang:     r.targetLang,
                    fromCache:      true,
                  })
                }}
              >
                <Text style={styles.recentSource} numberOfLines={1}>{r.source}</Text>
                <Text style={styles.recentTranslated} numberOfLines={1}>{r.translated}</Text>
                <Text style={styles.recentLangs}>
                  {getLang(r.sourceLang).flag} → {getLang(r.targetLang).flag}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </KeyboardAvoidingView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#0F172A', padding: 16 },

  // Lang bar
  langBar:           { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  langBtn:           { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
                       backgroundColor: '#1E293B', borderRadius: 10, padding: 10 },
  langBtnFlag:       { fontSize: 18 },
  langBtnText:       { color: '#E2E8F0', fontSize: 13, fontWeight: '600', flex: 1 },
  swapWrap:          { marginHorizontal: 8 },
  swapBtn:           { backgroundColor: '#1E293B', borderRadius: 20, padding: 8 },
  swapBtnDisabled:   { opacity: 0.4 },

  // Source input
  inputCard:         { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 12, minHeight: 120 },
  sourceInput:       { color: '#F1F5F9', fontSize: 16, lineHeight: 24, flex: 1, maxHeight: 180 },
  clearBtn:          { position: 'absolute', top: 10, right: 10 },
  charCount:         { color: '#475569', fontSize: 11, marginTop: 6, alignSelf: 'flex-end' },
  translateBtn:      { backgroundColor: '#6EE7B7', borderRadius: 8, paddingVertical: 8,
                       paddingHorizontal: 20, alignSelf: 'flex-end', marginTop: 8 },
  translateBtnText:  { color: '#0F172A', fontWeight: '700', fontSize: 14 },

  // Output
  outputCard:        { backgroundColor: '#1E293B', borderRadius: 14, padding: 14, minHeight: 100, marginBottom: 16 },
  translatedText:    { color: '#6EE7B7', fontSize: 16, lineHeight: 24 },
  outputFooter:      { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  cacheTag:          { backgroundColor: '#1E3A5F', borderRadius: 4, paddingHorizontal: 6,
                       paddingVertical: 2, marginRight: 'auto' },
  copyBtn:           { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  copyText:          { color: '#9CA3AF', fontSize: 13 },
  loadingRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loadingText:       { color: '#6B7280', fontSize: 14 },
  errorText:         { color: '#F87171', fontSize: 14 },
  placeholderText:   { color: '#4B5563', fontSize: 14, fontStyle: 'italic' },

  // Lang picker
  pickerHeader:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn:           { padding: 4 },
  pickerTitle:       { color: '#F1F5F9', fontSize: 18, fontWeight: '700' },
  sectionLabel:      { color: '#6B7280', fontSize: 12, fontWeight: '600',
                       textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 4 },
  popularRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  popularChip:       { flexDirection: 'row', alignItems: 'center', gap: 4,
                       backgroundColor: '#1E293B', borderRadius: 20,
                       paddingHorizontal: 12, paddingVertical: 6 },
  chipActive:        { backgroundColor: '#064E3B', borderColor: '#6EE7B7', borderWidth: 1 },
  chipFlag:          { fontSize: 16 },
  chipLabel:         { color: '#CBD5E1', fontSize: 13 },
  chipLabelActive:   { color: '#6EE7B7', fontWeight: '600' },
  langRow:           { flexDirection: 'row', alignItems: 'center', gap: 12,
                       paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  langRowActive:     { backgroundColor: '#0F2D1C' },
  langFlag:          { fontSize: 22 },
  langName:          { color: '#CBD5E1', fontSize: 15 },
  langNameActive:    { color: '#6EE7B7', fontWeight: '600' },

  // Recents
  recentsSection:    { marginTop: 4 },
  recentsTitle:      { color: '#6B7280', fontSize: 12, fontWeight: '600',
                       textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  recentScroll:      { flexDirection: 'row' },
  recentCard:        { backgroundColor: '#1E293B', borderRadius: 10, padding: 10,
                       marginRight: 10, width: 160 },
  recentSource:      { color: '#94A3B8', fontSize: 12, marginBottom: 2 },
  recentTranslated:  { color: '#E2E8F0', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  recentLangs:       { color: '#475569', fontSize: 11 },
})
