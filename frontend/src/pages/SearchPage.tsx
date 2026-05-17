import { SearchBar } from '@/components/SearchBar'
import { EventCard } from '@/components/EventCard'
import { SkeletonCard } from '@/components/SkeletonCard'
import { useSearch } from '@/hooks/useSearch'

export function SearchPage() {
  const { results, loading, error, searched, search, clear } = useSearch()

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-base font-semibold text-slate-200">Search Events</h1>
          <p className="text-xs text-slate-500 mt-1">Filter by plate number, date range, or both.</p>
        </div>

        {/* Search form card */}
        <div className="bg-charcoal-900 border border-charcoal-700/60 rounded-xl p-4">
          <SearchBar onSearch={search} loading={loading} />
        </div>

        {error && (
          <div className="text-xs text-red-400 font-mono bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-600 text-sm gap-2">
            <span className="text-3xl opacity-20">◎</span>
            <span>No results found</span>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clear}
                className="text-[11px] font-mono text-amber-400 hover:text-amber-300 uppercase tracking-wide"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1.5">
              {results.map((evt) => <EventCard key={evt.EventId} event={evt} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
