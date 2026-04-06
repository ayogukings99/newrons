import { createClient } from '@supabase/supabase-js'

/**
 * Shared Supabase client — single instance for the entire mobile app.
 * Import this wherever you need Supabase access instead of constructing
 * a new client each time.
 *
 * Required env vars (set in .env / app.config.ts):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY
 */
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
)
