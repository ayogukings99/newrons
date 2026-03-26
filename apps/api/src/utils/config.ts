import 'dotenv/config'

export const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:8081',

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET!,
  DATABASE_URL: process.env.DATABASE_URL!,

  // Cloudflare R2
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID!,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID!,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY!,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || 'nexus-assets',
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL!,

  // AI
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY!,
  COHERE_API_KEY: process.env.COHERE_API_KEY!,
  VECTOR_NAMESPACE_PREFIX: process.env.VECTOR_NAMESPACE_PREFIX || 'nexus_kb_',

  // 3D Reconstruction
  LUMA_AI_API_KEY: process.env.LUMA_AI_API_KEY!,
  LUMA_AI_API_URL: process.env.LUMA_AI_API_URL || 'https://api.lumalabs.ai',

  // Language AI
  AZURE_SPEECH_KEY: process.env.AZURE_SPEECH_KEY!,
  AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'westeurope',
  AZURE_TRANSLATOR_KEY: process.env.AZURE_TRANSLATOR_KEY!,
  META_SEAMLESS_API_URL: process.env.META_SEAMLESS_API_URL,

  // Audio
  AUDIO_SYNC_WS_PATH: process.env.AUDIO_SYNC_WS_PATH || '/audio',
  AUDIO_SYNC_MAX_LISTENERS: parseInt(process.env.AUDIO_SYNC_MAX_LISTENERS || '200'),

  // Security
  SECURITY_REPORT_EXPIRY_HOURS: parseInt(process.env.SECURITY_REPORT_EXPIRY_HOURS || '72'),
  SECURITY_VALIDATION_THRESHOLD: parseInt(process.env.SECURITY_VALIDATION_THRESHOLD || '3'),
  SAFETY_COMPANION_MAX_HOURS: parseInt(process.env.SAFETY_COMPANION_MAX_HOURS || '8'),

  // NFC
  NFC_OFFLINE_QUEUE_MAX: parseInt(process.env.NFC_OFFLINE_QUEUE_MAX || '50'),

  // PDF
  GOTENBERG_URL: process.env.GOTENBERG_URL!,

  // Quiz
  QUIZ_SHORT_ANSWER_CONFIDENCE_THRESHOLD: parseFloat(
    process.env.QUIZ_SHORT_ANSWER_CONFIDENCE_THRESHOLD || '0.7'
  ),
}
