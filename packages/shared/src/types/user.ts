export interface User {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  bio?: string
  walletBalance: number
  currency: string
  trustScore: number
  verificationLevel: 'none' | 'basic' | 'verified' | 'professional'
  createdAt: string
}

export interface UserProfile extends User {
  languagePreferences?: LanguagePreference
  communityCoins: number
  pillarsActive: number[]  // which pillars this user actively uses
}

export interface LanguagePreference {
  primaryLanguageCode: string
  secondaryLanguages: string[]
  dialect?: string
  aiResponseLanguage: 'match_input' | 'primary' | 'english'
}
