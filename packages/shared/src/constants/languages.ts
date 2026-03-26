/** All supported languages across tiers */
export const SUPPORTED_LANGUAGES = {
  // Tier 1 — Launch
  yo: { name: 'Yoruba', native: 'Yorùbá', tier: 1 },
  ig: { name: 'Igbo', native: 'Asụsụ Igbo', tier: 1 },
  ha: { name: 'Hausa', native: 'Harshen Hausa', tier: 1 },
  pcm: { name: 'Nigerian Pidgin', native: 'Naijá', tier: 1 },
  sw: { name: 'Swahili', native: 'Kiswahili', tier: 1 },
  // Tier 2 — Month 3
  zu: { name: 'Zulu', native: 'isiZulu', tier: 2 },
  xh: { name: 'Xhosa', native: 'isiXhosa', tier: 2 },
  am: { name: 'Amharic', native: 'አማርኛ', tier: 2 },
  tw: { name: 'Twi', native: 'Twi', tier: 2 },
  wo: { name: 'Wolof', native: 'Wolof', tier: 2 },
  // Tier 3 — Month 6
  sn: { name: 'Shona', native: 'chiShona', tier: 3 },
  so: { name: 'Somali', native: 'Af Soomaali', tier: 3 },
  om: { name: 'Oromo', native: 'Afaan Oromoo', tier: 3 },
  ff: { name: 'Fula', native: 'Fulfulde', tier: 3 },
  ln: { name: 'Lingala', native: 'Lingála', tier: 3 },
  nd: { name: 'Ndebele', native: 'isiNdebele', tier: 3 },
} as const

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES

export const TIER_1_LANGUAGES = Object.entries(SUPPORTED_LANGUAGES)
  .filter(([, v]) => v.tier === 1)
  .map(([code]) => code as LanguageCode)
