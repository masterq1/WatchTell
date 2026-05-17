import { useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { EventCard } from './EventCard'
import { SkeletonCard } from './SkeletonCard'
import { useEvents } from '@/hooks/useEvents'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { PlateEvent } from '@/lib/types'

const WS_URL = import.meta.env.VITE_WS_URL ?? null

function parseTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null
  const normalised = raw.replace(/T(\d{2})(\d{2})(\d{2})Z$/, 'T$1:$2:$3Z')
  const d = new Date(normalised)
  return isNaN(d.getTime()) ? null : d
}

function StatsBar({ events }: { events: PlateEvent[] }) {
  const alertCount = events.filter(
    (e) => e.ValidationStatus === 'stolen' || e.ValidationStatus === 'suspended'
  ).length

  const latest = events[0]
  const latestTs = latest ? parseTimestamp(latest.Timestamp) : null
  const latestRelative = latestTs ? formatDistanceToNow(latestTs, { addSuffix: true }) : '—'

  return (
    <div className="grid grid-cols-3 divide-x divide-charcoal-700/60 border-b border-charcoal-700/60 shrink-0 bg-charcoal-900/60">
      <div className="px-5 py-3">
        <div className="text-2xl font-bold font-mono tabular-nums text-slate-100">{events.length}</div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Detections</div>
      </div>
      <div className="px-5 py-3">
        <div className={`text-2xl font-bold font-mono tabular-nums ${alertCount > 0 ? 'text-red-400' : 'text-slate-100'}`}>
          {alertCount}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Alerts</div>
      </div>
      <div className="px-5 py-3 min-w-0">
        <div className="text-sm font-bold font-mono text-amber-300 truncate tracking-widest leading-tight">
          {latest?.PlateNumber ?? '—'}
        </div>
        <div className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 truncate">
          Last seen {latestRelative}
        </div>
      </div>
    </div>
  )
}

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

      {/* Stats bar — always visible once data loads */}
      {!loading && events.length > 0 && <StatsBar events={events} />}

      {/* Section header */}
      <div className="px-4 py-2 border-b border-charcoal-700/60 shrink-0 flex items-center gap-3">
        <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Detection Feed
        </h2>
        {WS_URL && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-green-500 uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
            Live
          </span>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="p-4 text-xs text-red-400 font-mono">{error}</div>
        )}

        {!loading && events.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center h-40 text-slate-700 gap-2">
            <span className="text-3xl">◎</span>
            <span className="text-sm">No detections yet</span>
          </div>
        )}

        <div className="p-3 space-y-2">
          {events.map((evt) => (
            <EventCard key={evt.EventId} event={evt} />
          ))}
        </div>

        {nextKey && (
          <div className="px-3 py-4 text-center border-t border-charcoal-800">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="text-[11px] font-mono text-amber-400 hover:text-amber-300 disabled:opacity-40 uppercase tracking-widest"
            >
              {loadingMore ? 'Loading…' : '↓  Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
