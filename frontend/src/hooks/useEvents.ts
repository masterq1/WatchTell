import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { PlateEvent } from '@/lib/types'

export function useEvents(limit = 50) {
  const [events, setEvents] = useState<PlateEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nextKey, setNextKey] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.events.list(limit)
      setEvents(page.events)
      setNextKey(page.nextKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events')
    } finally {
      setLoading(false)
    }
  }, [limit])

  const loadMore = useCallback(async () => {
    if (!nextKey || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await api.events.list(limit, nextKey)
      setEvents((prev) => [...prev, ...page.events])
      setNextKey(page.nextKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more events')
    } finally {
      setLoadingMore(false)
    }
  }, [nextKey, loadingMore, limit])

  // Prepend a new real-time event (called from WebSocket handler)
  const prependEvent = useCallback((event: PlateEvent) => {
    setEvents((prev) => [event, ...prev])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { events, loading, error, nextKey, loadingMore, loadMore, prependEvent, refresh: load }
}
