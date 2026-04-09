import { fetchAuthSession } from 'aws-amplify/auth'
import type { EventsPage, PlateEvent, SearchResult, WatchlistEntry } from './types'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

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
    throw new Error(err.error ?? `HTTP ${resp.status}`)
  }
  return resp.json() as Promise<T>
}

export const api = {
  events: {
    list: (limit = 50, lastKey?: string): Promise<EventsPage> => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (lastKey) params.set('lastKey', lastKey)
      return apiFetch(`/events?${params}`)
    },
    get: (id: string): Promise<PlateEvent> => apiFetch(`/events/${id}`),
  },

  plates: {
    history: (plate: string, limit = 50): Promise<{ plate: string; events: PlateEvent[] }> =>
      apiFetch(`/plates/${encodeURIComponent(plate)}?limit=${limit}`),
  },

  watchlist: {
    list: (): Promise<{ watchlist: WatchlistEntry[] }> => apiFetch('/watchlist'),
    add: (plate: string, note = ''): Promise<{ added: string }> =>
      apiFetch('/watchlist', {
        method: 'POST',
        body: JSON.stringify({ plate, note }),
      }),
    remove: (plate: string): Promise<{ deleted: string }> =>
      apiFetch(`/watchlist/${encodeURIComponent(plate)}`, { method: 'DELETE' }),
  },

  search: (params: {
    plate?: string
    start?: string
    end?: string
    limit?: number
  }): Promise<SearchResult> => {
    const q = new URLSearchParams()
    if (params.plate) q.set('plate', params.plate)
    if (params.start) q.set('start', params.start)
    if (params.end) q.set('end', params.end)
    if (params.limit) q.set('limit', String(params.limit))
    return apiFetch(`/search?${q}`)
  },

  clips: {
    url: (id: string): Promise<{ url: string; expires_in: number }> =>
      apiFetch(`/clips/${encodeURIComponent(id)}`),
  },
}
