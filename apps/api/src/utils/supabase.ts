import { createClient } from '@supabase/supabase-js'
import { config } from './config'

// Admin client — full service role access (server-side only)
export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  }
)

// Alias used by services that import supabaseAdmin
export const supabaseAdmin = supabase

// Create a per-request client with user's JWT for RLS
export const createUserClient = (jwt: string) =>
  createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })
