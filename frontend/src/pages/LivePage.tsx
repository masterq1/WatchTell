import { LiveFeed } from '@/components/LiveFeed'
import { EventFeed } from '@/components/EventFeed'
import { SearchBar } from '@/components/SearchBar'
import { useSearch } from '@/hooks/useSearch'
import { EventCard } from '@/components/EventCard'
import { SkeletonCard } from '@/components/SkeletonCard'

/**
 * Main dashboard: left panel = live camera feeds, right panel = real-time event feed.
 * Bottom bar = quick search.
 *
 * Desktop (≥1280px): full split-panel
 * Tablet (768–1279px): collapsible left panel
 * Mobile (<768px): single column
 */
export function LivePage() {
  const { results, loading, search } = useSearch()

  return (
    <div className="h-full flex flex-col">
      {/* Main panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: live camera feeds */}
        <aside className="hidden md:flex flex-col w-64 xl:w-72 shrink-0 border-r border-charcoal-700">
          <LiveFeed />
        </aside>

        {/* Right: event feed */}
        <section className="flex-1 overflow-hidden">
          <EventFeed />
        </section>
      </div>

      {/* Bottom: search bar */}
      <div className="shrink-0 border-t border-charcoal-700 px-4 py-3 space-y-3">
        <SearchBar onSearch={search} loading={loading} />

        {loading && (
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map((evt) => <EventCard key={evt.EventId} event={evt} />)}
          </div>
        )}
      </div>
    </div>
  )
}
