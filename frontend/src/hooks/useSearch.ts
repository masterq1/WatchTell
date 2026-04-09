import { useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { PlateEvent } from '@/lib/types'

interface SearchParams {
  plate?: string
  start?: string
  end?: string
}

export function useSearch() {
  const [results, setResults] = useState<PlateEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const search = useCallback(async (params: SearchParams) => {
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const data = await api.search({ ...params, limit: 200 })
      setResults(data.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setResults([])
    setSearched(false)
    setError(null)
  }, [])

  return { results, loading, error, searched, search, clear }
}
