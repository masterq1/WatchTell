import { SearchBar } from '@/components/SearchBar'
import { EventCard } from '@/components/EventCard'
import { SkeletonCard } from '@/components/SkeletonCard'
import { useSearch } from '@/hooks/useSearch'

export function SearchPage() {
  const { results, loading, error, searched, search, clear } = useSearch()

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-lg font-semibold text-slate-200">Search Events</h1>

      <SearchBar onSearch={search} loading={loading} />

      {error && (
        <div className="text-sm text-red-400">{error}</div>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-8">No results found.</div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
            <button onClick={clear} className="text-amber-400 hover:text-amber-300">Clear</button>
          </div>
          <div className="space-y-1">
            {results.map((evt) => <EventCard key={evt.EventId} event={evt} />)}
          </div>
        </>
      )}
    </div>
  )
}
