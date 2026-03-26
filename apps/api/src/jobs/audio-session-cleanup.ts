/**
 * Job: audio-session-cleanup
 * Runs: Every 30 minutes
 * Purpose: End stale audio sessions (no listeners for > 30 minutes)
 */
export async function runAudioSessionCleanupJob() {
  // TODO:
  //   1. Find audio_sessions where is_live = true AND updated_at < 30 mins ago
  //      AND current_listeners = 0
  //   2. Set is_live = false, ended_at = now()
  //   3. Clean up associated WebSocket rooms
  console.log('Cleaning up stale audio sessions...')
}
