import { useState, useCallback } from 'react'
import { supabase } from '@supabase/supabase-js'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'

interface ApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * useApi — core hook for authenticated API calls.
 * Automatically attaches the Supabase session JWT to every request.
 *
 * Usage:
 *   const { data, loading, error, execute } = useApi<LineupEntry[]>()
 *   execute('/barbershops/123/lineup')
 */
export function useApi<T = any>() {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: false, error: null })

  const execute = useCallback(async (
    path: string,
    options?: RequestInit & { skipAuth?: boolean }
  ): Promise<T | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }))

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers as Record<string, string>,
      }

      // Attach JWT if not explicitly skipped (e.g. anonymous security queries)
      if (!options?.skipAuth) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }
      }

      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errBody.error ?? `Request failed: ${response.status}`)
      }

      const result = await response.json()
      const data = result.data ?? result

      setState({ data, loading: false, error: null })
      return data
    } catch (err: any) {
      const errorMsg = err.message ?? 'An unexpected error occurred'
      setState({ data: null, loading: false, error: errorMsg })
      return null
    }
  }, [])

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null })
  }, [])

  return { ...state, execute, reset }
}

/**
 * Convenience wrapper for GET requests.
 */
export function useGet<T = any>(path: string) {
  const api = useApi<T>()
  const fetch = useCallback(() => api.execute(path), [path])
  return { ...api, fetch }
}

/**
 * Convenience wrapper for POST requests.
 */
export function usePost<T = any>(path: string) {
  const api = useApi<T>()
  const post = useCallback((body: Record<string, any>, skipAuth = false) =>
    api.execute(path, {
      method: 'POST',
      body: JSON.stringify(body),
      skipAuth,
    }), [path])
  return { ...api, post }
}

export { API_BASE_URL }
