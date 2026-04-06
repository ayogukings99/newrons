import { supabase } from '../lib/supabase'

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, '')

/**
 * Build auth headers by attaching the current Supabase session JWT.
 * Returns an empty object when there is no active session (unauthenticated).
 */
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return {}
  return { Authorization: `Bearer ${session.access_token}` }
}

/**
 * Core fetch wrapper — attaches auth token, sets JSON content-type,
 * and throws a descriptive error on non-2xx responses.
 */
async function request<T = any>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(errBody.error ?? `Request failed: ${response.status}`)
  }

  const json = await response.json()
  // Unwrap envelope `{ data: ... }` if present, otherwise return as-is
  return (json.data ?? json) as T
}

/**
 * Authenticated API client — thin wrapper used by screens and components
 * that need to call the NEXUS backend without setting up a hook.
 *
 * Usage:
 *   const user = await apiClient.get<User>('/users/me')
 *   const order = await apiClient.post<Order>('/orders', { skuId, qty })
 */
export const apiClient = {
  get<T = any>(path: string): Promise<T> {
    return request<T>('GET', path)
  },

  post<T = any>(path: string, body?: unknown): Promise<T> {
    return request<T>('POST', path, body)
  },

  put<T = any>(path: string, body?: unknown): Promise<T> {
    return request<T>('PUT', path, body)
  },

  patch<T = any>(path: string, body?: unknown): Promise<T> {
    return request<T>('PATCH', path, body)
  },

  delete<T = any>(path: string): Promise<T> {
    return request<T>('DELETE', path)
  },
}
