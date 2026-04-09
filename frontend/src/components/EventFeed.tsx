import { useCallback } from 'react'
import { EventCard } from './EventCard'
import { SkeletonCard } from './SkeletonCard'
import { useEvents } from '@/hooks/useEvents'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { PlateEvent } from '@/lib/types'

const WS_URL = import.meta.env.VITE_WS_URL ?? null

export function EventFeed() {
  const { events, loading, error, nextKey, loadingMore, loadMore, prependEvent } = useEvents(50)

  const handleWsMessage = useCallback((data: unknown) => {
    if (data && typeof data === 'object' && 'EventId' in data) {
      prependEvent(data as PlateEvent)
    }
  }, [prependEvent])

  useWebSocket(WS_URL, { onMessage: handleWsMessage })

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-charcoal-700">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Event Feed
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="p-4 text-sm text-red-400">{error}</div>
        )}

        {!loading && events.length === 0 && (
          <div className="p-4 text-sm text-slate-500 text-center">No events yet.</div>
        )}

        <div className="p-2 space-y-1">
          {events.map((evt) => (
            <EventCard key={evt.EventId} event={evt} />
          ))}
        </div>

        {nextKey && (
          <div className="p-3 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-sm text-amber-400 hover:text-amber-300 disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
