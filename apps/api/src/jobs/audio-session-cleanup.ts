/**
 * Job: audio-session-cleanup
 * Runs: Every 30 minutes
 * Purpose: End stale audio sessions (empty for > 30 min, or live for > 8 hours)
 */
import { supabase } from '../utils/supabase'

export async function runAudioSessionCleanupJob(): Promise<void> {
  console.log('[audio-session-cleanup] Starting...')

  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()

  // 1. End sessions with 0 listeners that have been empty for > 30 minutes
  const { data: emptySessions, error: fetchError } = await supabase
    .from('audio_sessions')
    .select('id')
    .eq('is_live', true)
    .eq('current_listeners', 0)
    .lt('updated_at', thirtyMinsAgo)

  if (fetchError) {
    console.error('[audio-session-cleanup] Failed to fetch empty sessions:', fetchError.message)
  } else if (emptySessions && emptySessions.length > 0) {
    const emptyIds = emptySessions.map(s => s.id)
    await supabase
      .from('audio_sessions')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .in('id', emptyIds)

    console.log(`[audio-session-cleanup] Ended ${emptyIds.length} empty session(s)`)
  }

  // 2. End sessions that have been live for more than 8 hours (prevent runaway sessions)
  const { data: staleSessions, error: staleError } = await supabase
    .from('audio_sessions')
    .select('id')
    .eq('is_live', true)
    .lt('created_at', eightHoursAgo)

  if (staleError) {
    console.error('[audio-session-cleanup] Failed to fetch stale sessions:', staleError.message)
  } else if (staleSessions && staleSessions.length > 0) {
    const staleIds = staleSessions.map(s => s.id)
    await supabase
      .from('audio_sessions')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .in('id', staleIds)

    // Mark all remaining listeners as left
    await supabase
      .from('audio_session_listeners')
      .update({ left_at: new Date().toISOString() })
      .in('session_id', staleIds)
      .is('left_at', null)

    console.log(`[audio-session-cleanup] Ended ${staleIds.length} stale session(s) (>8h)`)
  }

  console.log('[audio-session-cleanup] Done')
}
