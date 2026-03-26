import { config } from '../utils/config'
import { supabase } from '../utils/supabase'
import * as sdk from 'microsoft-cognitiveservices-speech-sdk'

export interface SupportedLanguage {
  id: string
  code: string
  nameEnglish: string
  nameNative: string
  tier: number
  ttsAvailable: boolean
  sttAvailable: boolean
  translationAvailable: boolean
  isActive: boolean
  communityTrainerCount: number
}

export interface TrainingContribution {
  id: string
  contributorId: string
  languageId: string
  contributionType: 'correction' | 'new_phrase' | 'dialect_variant' | 'pronunciation'
  originalText: string
  aiOutput: string
  correctedText: string
  context?: string
  dialectVariant?: string
  validationCount: number
  validationThreshold: number
  isApplied: boolean
  createdAt: string
}

export class LanguageService {
  /**
   * List all active languages, optionally filtered by tier.
   */
  async listLanguages(tier?: number): Promise<SupportedLanguage[]> {
    let query = supabase
      .from('supported_languages')
      .select('*')
      .eq('is_active', true)
      .order('tier', { ascending: true })
      .order('name_english', { ascending: true })

    if (tier) query = query.eq('tier', tier)

    const { data, error } = await query
    if (error) throw new Error(`Failed to list languages: ${error.message}`)
    return (data ?? []).map(this.mapLanguage)
  }

  /**
   * Detect the language of a text string.
   * Uses Azure Translator detect endpoint.
   */
  async detectLanguage(text: string): Promise<{ code: string; confidence: number }> {
    const response = await fetch(
      `https://api.cognitive.microsofttranslator.com/detect?api-version=3.0`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': config.AZURE_TRANSLATOR_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ text: text.slice(0, 500) }]),
      }
    )

    if (!response.ok) {
      throw new Error(`Language detection failed: ${response.statusText}`)
    }

    const results = await response.json()
    const top = results[0]
    return {
      code: top.language,
      confidence: top.score,
    }
  }

  /**
   * Translate text between two supported languages.
   * Uses Azure Translator (best coverage for African languages).
   * Falls back to Meta SeamlessM4T if self-hosted endpoint is configured.
   */
  async translate(params: {
    text: string
    fromCode: string
    toCode: string
  }): Promise<string> {
    // Prefer SeamlessM4T for African→African translation (better quality)
    if (config.META_SEAMLESS_API_URL && this.isAfricanLanguage(params.fromCode)) {
      return this.translateWithSeamless(params)
    }
    return this.translateWithAzure(params)
  }

  private async translateWithAzure(params: {
    text: string; fromCode: string; toCode: string
  }): Promise<string> {
    const url = new URL('https://api.cognitive.microsofttranslator.com/translate')
    url.searchParams.set('api-version', '3.0')
    url.searchParams.set('from', params.fromCode)
    url.searchParams.set('to', params.toCode)

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.AZURE_TRANSLATOR_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ text: params.text }]),
    })

    if (!response.ok) throw new Error(`Translation failed: ${response.statusText}`)

    const results = await response.json()
    return results[0]?.translations?.[0]?.text ?? params.text
  }

  private async translateWithSeamless(params: {
    text: string; fromCode: string; toCode: string
  }): Promise<string> {
    const response = await fetch(`${config.META_SEAMLESS_API_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        src_text: params.text,
        src_lang: params.fromCode,
        tgt_lang: params.toCode,
        task: 'T2TT', // Text-to-Text Translation
      }),
    })

    if (!response.ok) throw new Error(`SeamlessM4T translation failed`)
    const result = await response.json()
    return result.translation ?? params.text
  }

  /**
   * Convert text to speech using Azure Cognitive Services.
   * Uploads the audio to R2 and returns the public URL.
   */
  async synthesizeSpeech(params: {
    text: string
    languageCode: string
    dialect?: string
    voiceName?: string
  }): Promise<string> {
    const voiceName = params.voiceName ?? this.getDefaultVoice(params.languageCode, params.dialect)

    return new Promise((resolve, reject) => {
      const speechConfig = sdk.SpeechConfig.fromSubscription(
        config.AZURE_SPEECH_KEY,
        config.AZURE_SPEECH_REGION
      )
      speechConfig.speechSynthesisVoiceName = voiceName

      const synthesizer = new sdk.SpeechSynthesizer(speechConfig)
      synthesizer.speakTextAsync(
        params.text,
        async (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            // TODO: Upload audioData (result.audioData) to R2 and return public URL
            // For now return a placeholder — full R2 upload in Phase 2
            synthesizer.close()
            resolve(`data:audio/wav;base64,${Buffer.from(result.audioData).toString('base64')}`)
          } else {
            synthesizer.close()
            reject(new Error(`Speech synthesis failed: ${result.errorDetails}`))
          }
        },
        (err) => {
          synthesizer.close()
          reject(new Error(`Speech synthesis error: ${err}`))
        }
      )
    })
  }

  /**
   * Transcribe speech audio to text.
   * Uses Azure Cognitive Services STT with African language support.
   */
  async transcribeSpeech(params: {
    audioUrl: string
    languageCode: string
    dialect?: string
  }): Promise<string> {
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      config.AZURE_SPEECH_KEY,
      config.AZURE_SPEECH_REGION
    )
    // Map our language code to Azure locale (e.g., 'yo' → 'yo-NG')
    speechConfig.speechRecognitionLanguage = this.toAzureLocale(
      params.languageCode,
      params.dialect
    )

    // Fetch audio from URL
    const audioRes = await fetch(params.audioUrl)
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer())

    const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer as unknown as File)
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig)

    return new Promise((resolve, reject) => {
      recognizer.recognizeOnceAsync(
        (result) => {
          recognizer.close()
          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            resolve(result.text)
          } else {
            reject(new Error(`Transcription failed: ${result.errorDetails}`))
          }
        },
        (err) => {
          recognizer.close()
          reject(new Error(`Transcription error: ${err}`))
        }
      )
    })
  }

  /**
   * Submit a training contribution when the AI misunderstands a phrase.
   * Queued for validation by other native speakers (threshold: 3 validators).
   * Contributor earns community coins on acceptance.
   */
  async submitTrainingContribution(params: {
    contributorId: string
    languageId: string
    type: 'correction' | 'new_phrase' | 'dialect_variant' | 'pronunciation'
    originalText: string
    aiOutput: string
    correctedText: string
    context?: string
    dialectVariant?: string
  }): Promise<TrainingContribution> {
    const { data, error } = await supabase
      .from('language_training_contributions')
      .insert({
        contributor_id: params.contributorId,
        language_id: params.languageId,
        contribution_type: params.type,
        original_text: params.originalText,
        ai_output: params.aiOutput,
        corrected_text: params.correctedText,
        context: params.context ?? null,
        dialect_variant: params.dialectVariant ?? null,
        validation_count: 0,
        validation_threshold: 3,
        is_applied: false,
        reward_paid: false,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to submit contribution: ${error.message}`)
    return this.mapContribution(data)
  }

  /**
   * Get contributions pending validation for a language.
   * Native speakers can vote on these to improve the AI.
   */
  async getPendingContributions(
    languageId: string,
    limit = 20
  ): Promise<TrainingContribution[]> {
    const { data, error } = await supabase
      .from('language_training_contributions')
      .select('*')
      .eq('language_id', languageId)
      .eq('is_applied', false)
      .lt('validation_count', 3)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw new Error(`Failed to fetch contributions: ${error.message}`)
    return (data ?? []).map(this.mapContribution)
  }

  /**
   * Validate (upvote) a training contribution.
   * When validation_count reaches threshold, the contribution is queued for model update.
   */
  async validateContribution(contributionId: string, validatorId: string): Promise<void> {
    // Increment validation count via RPC to avoid race conditions
    const { error } = await supabase.rpc('increment_contribution_validation', {
      p_contribution_id: contributionId,
      p_validator_id: validatorId,
    })

    if (error) throw new Error(`Failed to validate contribution: ${error.message}`)
  }

  /**
   * Get or create user language preferences.
   */
  async getUserPreferences(userId: string) {
    const { data, error } = await supabase
      .from('user_language_preferences')
      .select(`
        *,
        primary_language:supported_languages!primary_language_id (*)
      `)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(`Failed to get preferences: ${error.message}`)
    return data
  }

  /**
   * Update user language preferences.
   */
  async updateUserPreferences(userId: string, prefs: {
    primaryLanguageId?: string
    secondaryLanguages?: string[]
    dialect?: string
    aiResponseLanguage?: 'match_input' | 'primary' | 'english'
    translateContent?: boolean
  }) {
    const { data, error } = await supabase
      .from('user_language_preferences')
      .upsert({
        user_id: userId,
        primary_language_id: prefs.primaryLanguageId,
        secondary_languages: prefs.secondaryLanguages ?? [],
        dialect: prefs.dialect,
        ai_response_language: prefs.aiResponseLanguage ?? 'match_input',
        translate_content: prefs.translateContent ?? true,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to update preferences: ${error.message}`)
    return data
  }

  // ── Helpers ───────────────────────────────────────────────────

  private isAfricanLanguage(code: string): boolean {
    const africanCodes = ['yo', 'ig', 'ha', 'pcm', 'sw', 'zu', 'xh', 'am', 'tw', 'wo', 'sn', 'so', 'om', 'ff', 'ln']
    return africanCodes.includes(code)
  }

  private getDefaultVoice(languageCode: string, dialect?: string): string {
    // Azure Neural voices for African languages
    const voices: Record<string, string> = {
      yo: 'yo-NG-IsAdekunleNeural',     // Yoruba (Nigeria)
      ig: 'ig-NG-EzinneNeural',          // Igbo (Nigeria)
      ha: 'ha-NG-AliNeural',             // Hausa (Nigeria)
      sw: 'sw-KE-ZuriNeural',            // Swahili (Kenya)
      zu: 'zu-ZA-ThandoNeural',          // Zulu (South Africa)
      am: 'am-ET-MekdesNeural',          // Amharic (Ethiopia)
      en: 'en-NG-AbeoNeural',            // English (Nigeria) — for Naijá/Pidgin
    }
    return voices[languageCode] ?? `${languageCode}-NeuralVoice`
  }

  private toAzureLocale(code: string, dialect?: string): string {
    const locales: Record<string, string> = {
      yo: 'yo-NG', ig: 'ig-NG', ha: 'ha-NG',
      sw: 'sw-KE', zu: 'zu-ZA', xh: 'xh-ZA',
      am: 'am-ET', tw: 'tw-GH', wo: 'wo-SN',
      en: 'en-NG',
    }
    return locales[code] ?? `${code}-XX`
  }

  private mapLanguage(row: any): SupportedLanguage {
    return {
      id: String(row.id),
      code: row.code,
      nameEnglish: row.name_english,
      nameNative: row.name_native,
      tier: row.tier,
      ttsAvailable: row.tts_available,
      sttAvailable: row.stt_available,
      translationAvailable: row.translation_available,
      isActive: row.is_active,
      communityTrainerCount: row.community_trainer_count,
    }
  }

  private mapContribution(row: any): TrainingContribution {
    return {
      id: String(row.id),
      contributorId: String(row.contributor_id),
      languageId: String(row.language_id),
      contributionType: row.contribution_type,
      originalText: row.original_text,
      aiOutput: row.ai_output,
      correctedText: row.corrected_text,
      context: row.context ?? undefined,
      dialectVariant: row.dialect_variant ?? undefined,
      validationCount: row.validation_count,
      validationThreshold: row.validation_threshold,
      isApplied: row.is_applied,
      createdAt: row.created_at,
    }
  }
}
