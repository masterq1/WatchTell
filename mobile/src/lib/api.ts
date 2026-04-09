import { fetchAuthSession } from 'aws-amplify/auth'
import type { PlateEvent, WatchlistEntry } from './types'

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? ''

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders()
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...init.headers },
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error((err as { error: string }).error ?? `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export const api = {
  events: {
    list: (limit = 30): Promise<{ events: PlateEvent[]; nextKey: string | null }> =>
      apiFetch(`/events?limit=${limit}`),
  },
  search: (params: { plate?: string; start?: string; end?: string }): Promise<{ results: PlateEvent[] }> => {
    const q = new URLSearchParams()
    if (params.plate) q.set('plate', params.plate)
    if (params.start) q.set('start', params.start)
    if (params.end) q.set('end', params.end)
    return apiFetch(`/search?${q}`)
  },
  watchlist: {
    list: (): Promise<{ watchlist: WatchlistEntry[] }> => apiFetch('/watchlist'),
  },
  clips: {
    url: (id: string): Promise<{ url: string }> =>
      apiFetch(`/clips/${encodeURIComponent(id)}`),
  },
}
