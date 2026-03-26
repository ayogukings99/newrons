import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../utils/supabase'
import { config } from '../utils/config'

export type SessionType = 'group_listen' | 'live_dj' | 'broadcast' | 'ai_dj'
export type DJEffect = 'reverb' | 'echo' | 'vinyl' | 'rewind' | 'none'
export type AIMood = 'energetic' | 'chill' | 'focused' | 'celebratory'
export interface EQSettings { bass: number; mid: number; treble: number }

// In-memory WebSocket room state — maps sessionId → Set of WebSocket connections
// In production this would use Redis pub/sub for multi-instance deployments
const sessionRooms = new Map<string, Set<WebSocket>>()

export class GroupAudioService {
  private claude: Anthropic

  constructor() {
    this.claude = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  }

  /**
   * Create a new group audio session for a hub.
   * Supports group listening, live DJ, broadcast, and AI DJ modes.
   */
  async createSession(params: {
    hostId: string
    hubId: string
    hubType?: string
    sessionType: SessionType
    title?: string
    isPublic?: boolean
  }) {
    const { data: session, error } = await supabase
      .from('audio_sessions')
      .insert({
        host_id: params.hostId,
        hub_id: params.hubId,
        hub_type: params.hubType ?? 'barbershop',
        session_type: params.sessionType,
        title: params.title ?? `${params.sessionType} session`,
        is_live: true,
        current_position_ms: 0,
        playback_speed: 1.0,
        dj_user_id: params.hostId,   // host starts as DJ
        ai_dj_enabled: params.sessionType === 'ai_dj',
        ai_dj_mood: params.sessionType === 'ai_dj' ? 'energetic' : null,
        eq_settings: { bass: 50, mid: 50, treble: 50 },
        active_effect: 'none',
        effect_intensity: 0.5,
        is_public: params.isPublic ?? false,
        max_listeners: 50,
        current_listeners: 0,
        tip_total: 0,
      })
      .select()
      .single()

    if (error) throw new Error(`Failed to create session: ${error.message}`)

    // Initialize in-memory room for WebSocket connections
    sessionRooms.set(session.id, new Set())

    // Add host as first listener
    await supabase.from('audio_session_listeners').insert({
      session_id: session.id,
      user_id: params.hostId,
    })

    return session
  }

  /**
   * Join an audio session as a listener.
   */
  async joinSession(sessionId: string, userId: string) {
    const { data: session } = await supabase
      .from('audio_sessions')
      .select('id, is_live, current_listeners, max_listeners, is_public, host_id')
      .eq('id', sessionId)
      .single()

    if (!session) throw new Error('Session not found')
    if (!session.is_live) throw new Error('Session has ended')
    if (session.current_listeners >= session.max_listeners) {
      throw new Error('Session is full')
    }

    await supabase
      .from('audio_session_listeners')
      .upsert({ session_id: sessionId, user_id: userId, left_at: null }, {
        onConflict: 'session_id,user_id',
      })

    await supabase
      .from('audio_sessions')
      .update({ current_listeners: session.current_listeners + 1 })
      .eq('id', sessionId)

    // Return current sync state so client snaps to the right position immediately
    return this.syncPlayback(sessionId)
  }

  /**
   * Leave an audio session.
   */
  async leaveSession(sessionId: string, userId: string) {
    const { data: session } = await supabase
      .from('audio_sessions')
      .select('current_listeners')
      .eq('id', sessionId)
      .single()

    await supabase
      .from('audio_session_listeners')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', userId)

    if (session) {
      await supabase
        .from('audio_sessions')
        .update({ current_listeners: Math.max(0, session.current_listeners - 1) })
        .eq('id', sessionId)
    }
  }

  /**
   * Get current playback sync state.
   * All listeners call this every 10 seconds to stay in sync.
   * The server timestamp enables clients to compensate for network latency.
   * Latency target: < 200ms across devices in same hub.
   */
  async syncPlayback(sessionId: string): Promise<{
    trackId: string | null
    positionMs: number
    timestamp: number
    effect: DJEffect
    eq: EQSettings
    aiDjEnabled: boolean
    aiDjMood: AIMood | null
  }> {
    const { data: session, error } = await supabase
      .from('audio_sessions')
      .select(
        'current_track_id, current_position_ms, active_effect, eq_settings, ' +
        'ai_dj_enabled, ai_dj_mood, is_live'
      )
      .eq('id', sessionId)
      .single()

    if (error || !session) throw new Error('Session not found')
    if (!session.is_live) throw new Error('Session has ended')

    return {
      trackId: session.current_track_id ?? null,
      positionMs: session.current_position_ms ?? 0,
      timestamp: Date.now(),  // client subtracts (Date.now() - timestamp) for drift correction
      effect: session.active_effect ?? 'none',
      eq: session.eq_settings ?? { bass: 50, mid: 50, treble: 50 },
      aiDjEnabled: session.ai_dj_enabled ?? false,
      aiDjMood: session.ai_dj_mood ?? null,
    }
  }

  /**
   * Update the current playing track and position.
   * Only the current DJ (or host) can call this.
   */
  async setTrack(sessionId: string, userId: string, params: {
    trackId: string
    positionMs?: number
  }) {
    const session = await this.verifyDJAccess(sessionId, userId)

    const { data, error } = await supabase
      .from('audio_sessions')
      .update({
        current_track_id: params.trackId,
        current_position_ms: params.positionMs ?? 0,
      })
      .eq('id', sessionId)
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Broadcast to all WebSocket listeners in this room
    this.broadcastToRoom(sessionId, {
      type: 'track_change',
      trackId: params.trackId,
      positionMs: params.positionMs ?? 0,
      timestamp: Date.now(),
    })

    return data
  }

  /**
   * Apply a DJ sound effect to the session.
   * Broadcasts immediately to all listeners.
   */
  async applyEffect(sessionId: string, userId: string, effect: DJEffect): Promise<void> {
    await this.verifyDJAccess(sessionId, userId)

    await supabase
      .from('audio_sessions')
      .update({ active_effect: effect })
      .eq('id', sessionId)

    this.broadcastToRoom(sessionId, {
      type: 'effect_applied',
      effect,
      timestamp: Date.now(),
    })
  }

  /**
   * Update EQ settings (bass/mid/treble 0-100).
   * Only the DJ can update EQ.
   */
  async updateEQ(sessionId: string, userId: string, eq: EQSettings): Promise<void> {
    // Clamp all values to 0-100
    const clampedEQ: EQSettings = {
      bass: Math.max(0, Math.min(100, eq.bass)),
      mid: Math.max(0, Math.min(100, eq.mid)),
      treble: Math.max(0, Math.min(100, eq.treble)),
    }

    await this.verifyDJAccess(sessionId, userId)

    await supabase
      .from('audio_sessions')
      .update({ eq_settings: clampedEQ })
      .eq('id', sessionId)

    this.broadcastToRoom(sessionId, {
      type: 'eq_updated',
      eq: clampedEQ,
      timestamp: Date.now(),
    })
  }

  /**
   * Trigger the iconic rewind effect.
   * A staple of dancehall sound systems and Afrobeats parties —
   * the crowd demands a track be restarted from the beginning when they love it.
   * Plays a scratch/rewind sound cue on all clients simultaneously.
   */
  async triggerRewind(sessionId: string, userId: string): Promise<void> {
    await this.verifyDJAccess(sessionId, userId)

    // Reset position to 0 and apply rewind effect
    await supabase
      .from('audio_sessions')
      .update({
        current_position_ms: 0,
        active_effect: 'rewind',
      })
      .eq('id', sessionId)

    this.broadcastToRoom(sessionId, {
      type: 'rewind',
      positionMs: 0,
      timestamp: Date.now(),
    })

    // Clear the rewind effect after 3 seconds (it's a momentary effect)
    setTimeout(async () => {
      await supabase
        .from('audio_sessions')
        .update({ active_effect: 'none' })
        .eq('id', sessionId)

      this.broadcastToRoom(sessionId, {
        type: 'effect_applied',
        effect: 'none',
        timestamp: Date.now(),
      })
    }, 3000)
  }

  /**
   * Add a track to the queue.
   */
  async queueTrack(sessionId: string, userId: string, trackId: string) {
    // Get current max queue position
    const { data: lastItem } = await supabase
      .from('audio_session_queue')
      .select('queue_position')
      .eq('session_id', sessionId)
      .is('played_at', null)
      .order('queue_position', { ascending: false })
      .limit(1)
      .single()

    const nextPosition = (lastItem?.queue_position ?? 0) + 1

    const { data, error } = await supabase
      .from('audio_session_queue')
      .insert({
        session_id: sessionId,
        track_id: trackId,
        requested_by: userId,
        queue_position: nextPosition,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    this.broadcastToRoom(sessionId, {
      type: 'track_queued',
      trackId,
      position: nextPosition,
      requestedBy: userId,
    })

    return data
  }

  /**
   * Get the current queue for a session.
   */
  async getQueue(sessionId: string) {
    const { data, error } = await supabase
      .from('audio_session_queue')
      .select('id, track_id, requested_by, queue_position, created_at')
      .eq('session_id', sessionId)
      .is('played_at', null)
      .order('queue_position', { ascending: true })

    if (error) throw new Error(error.message)
    return data ?? []
  }

  /**
   * Run the AI DJ for this session.
   *
   * Claude selects the next track based on:
   *   - Current mood setting
   *   - Time of day
   *   - Hub type (barbershop → Afrobeats, study → lo-fi, etc.)
   *   - What's already been played
   *   - Listener reaction data (if available)
   *
   * This picks from the hub's connected playlist/library.
   */
  async runAIDJ(sessionId: string, hostId: string): Promise<void> {
    const { data: session } = await supabase
      .from('audio_sessions')
      .select(
        'hub_type, ai_dj_mood, current_track_id, host_id, dj_user_id'
      )
      .eq('id', sessionId)
      .single()

    if (!session) throw new Error('Session not found')
    if (session.host_id !== hostId) throw new Error('Only the host can activate AI DJ')

    // Get recently played tracks (last 10)
    const { data: recentlyPlayed } = await supabase
      .from('audio_session_queue')
      .select('track_id')
      .eq('session_id', sessionId)
      .not('played_at', 'is', null)
      .order('played_at', { ascending: false })
      .limit(10)

    const recentTrackIds = (recentlyPlayed ?? []).map(r => r.track_id)

    // Get available tracks from the hub's library
    const { data: availableTracks } = await supabase
      .from('creator_content')
      .select('id, title, genre, mood_tags, bpm')
      .limit(50)

    if (!availableTracks || availableTracks.length === 0) return

    const hour = new Date().getHours()
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night'

    // Ask Claude to pick the next track
    const prompt = `You are the AI DJ for a NEXUS ${session.hub_type} session.

Current mood: ${session.ai_dj_mood}
Time of day: ${timeOfDay}
Recently played track IDs (avoid these): ${JSON.stringify(recentTrackIds)}

Available tracks:
${JSON.stringify(availableTracks.map(t => ({
  id: t.id,
  title: t.title,
  genre: t.genre,
  mood: t.mood_tags,
  bpm: t.bpm,
})), null, 2)}

Pick the single best next track for this session. Consider the mood, time, hub context (${session.hub_type}),
and what has already been played. Prioritize Afrobeats, Afro-fusion, Amapiano, and Highlife genres
appropriate for the hub type and mood.

Respond with ONLY a JSON object: {"trackId": "<id>", "reason": "<one sentence>"}`

    const message = await this.claude.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

    try {
      const parsed = JSON.parse(responseText.trim())
      const chosenTrackId = parsed.trackId

      if (chosenTrackId && availableTracks.find(t => t.id === chosenTrackId)) {
        await this.queueTrack(sessionId, 'ai_dj', chosenTrackId)
        console.log(`[AI DJ] Queued ${chosenTrackId} for session ${sessionId}: ${parsed.reason}`)
      }
    } catch {
      console.error('[AI DJ] Failed to parse Claude response:', responseText)
    }
  }

  /**
   * Enable or disable AI DJ mode, and set the mood.
   */
  async setAIDJMode(sessionId: string, hostId: string, params: {
    enabled: boolean
    mood?: AIMood
  }) {
    const { data: session } = await supabase
      .from('audio_sessions')
      .select('host_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.host_id !== hostId) {
      throw new Error('Only the host can toggle AI DJ mode')
    }

    await supabase
      .from('audio_sessions')
      .update({
        ai_dj_enabled: params.enabled,
        ...(params.mood && { ai_dj_mood: params.mood }),
      })
      .eq('id', sessionId)

    this.broadcastToRoom(sessionId, {
      type: 'ai_dj_updated',
      enabled: params.enabled,
      mood: params.mood,
    })
  }

  /**
   * Pass the DJ role to another user in the session.
   */
  async passDJRole(sessionId: string, currentDjId: string, newDjId: string): Promise<void> {
    await this.verifyDJAccess(sessionId, currentDjId)

    // Verify new DJ is in the session
    const { data: listener } = await supabase
      .from('audio_session_listeners')
      .select('user_id')
      .eq('session_id', sessionId)
      .eq('user_id', newDjId)
      .is('left_at', null)
      .single()

    if (!listener) throw new Error('That user is not in this session')

    await supabase
      .from('audio_sessions')
      .update({ dj_user_id: newDjId })
      .eq('id', sessionId)

    this.broadcastToRoom(sessionId, {
      type: 'dj_changed',
      newDjId,
      previousDjId: currentDjId,
    })
  }

  /**
   * End a session (host only).
   */
  async endSession(sessionId: string, hostId: string) {
    const { data: session } = await supabase
      .from('audio_sessions')
      .select('host_id')
      .eq('id', sessionId)
      .single()

    if (!session || session.host_id !== hostId) {
      throw new Error('Only the host can end the session')
    }

    await supabase
      .from('audio_sessions')
      .update({ is_live: false, ended_at: new Date().toISOString() })
      .eq('id', sessionId)

    // Mark all listeners as left
    await supabase
      .from('audio_session_listeners')
      .update({ left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .is('left_at', null)

    this.broadcastToRoom(sessionId, { type: 'session_ended' })

    // Clean up in-memory room
    sessionRooms.delete(sessionId)
  }

  /**
   * Get active sessions for a hub.
   */
  async getHubSessions(hubId: string) {
    const { data, error } = await supabase
      .from('audio_sessions')
      .select(
        'id, session_type, title, host_id, current_listeners, is_public, ' +
        'ai_dj_enabled, ai_dj_mood, created_at'
      )
      .eq('hub_id', hubId)
      .eq('is_live', true)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return data ?? []
  }

  /**
   * Register a WebSocket connection for a session room.
   * Called when a client connects via WS at /audio/:sessionId
   */
  registerWebSocket(sessionId: string, ws: WebSocket): void {
    if (!sessionRooms.has(sessionId)) {
      sessionRooms.set(sessionId, new Set())
    }
    sessionRooms.get(sessionId)!.add(ws)

    ws.addEventListener('close', () => {
      sessionRooms.get(sessionId)?.delete(ws)
    })
  }

  /**
   * Broadcast a message to all WebSocket connections in a session room.
   */
  private broadcastToRoom(sessionId: string, message: object): void {
    const room = sessionRooms.get(sessionId)
    if (!room) return

    const payload = JSON.stringify(message)
    for (const ws of room) {
      if ((ws as any).readyState === 1) {  // OPEN
        try {
          ws.send(payload)
        } catch {
          room.delete(ws)
        }
      }
    }
  }

  /**
   * Verify user has DJ access to a session.
   * DJ access = current DJ or host.
   */
  private async verifyDJAccess(sessionId: string, userId: string) {
    const { data: session } = await supabase
      .from('audio_sessions')
      .select('id, host_id, dj_user_id, is_live')
      .eq('id', sessionId)
      .single()

    if (!session) throw new Error('Session not found')
    if (!session.is_live) throw new Error('Session has ended')
    if (session.dj_user_id !== userId && session.host_id !== userId) {
      throw new Error('Only the DJ or host can perform this action')
    }

    return session
  }
}

export const groupAudioService = new GroupAudioService()
