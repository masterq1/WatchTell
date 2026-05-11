import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { PlateTag } from './PlateTag'
import { VideoModal } from './VideoModal'
import { api } from '@/lib/api'
import type { PlateEvent } from '@/lib/types'

interface Props {
  event: PlateEvent
}

/** Normalise timestamps that are missing colons: 2026-05-10T204912Z → 2026-05-10T20:49:12Z */
function parseTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null
  const normalised = raw.replace(/T(\d{2})(\d{2})(\d{2})Z$/, 'T$1:$2:$3Z')
  const d = new Date(normalised)
  return isNaN(d.getTime()) ? null : d
}

function Thumbnail({ s3Key }: { s3Key: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.clips.url(s3Key)
      .then((data) => { if (!cancelled) setUrl(data.url) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [s3Key])

  if (!url) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <span className="text-slate-600 text-xs animate-pulse">▶</span>
      </div>
    )
  }

  return (
    <img
      src={url}
      alt="Event keyframe"
      className="w-full h-full object-cover"
      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
    />
  )
}

export function EventCard({ event }: Props) {
  const [showVideo, setShowVideo] = useState(false)

  const ts = parseTimestamp(event.Timestamp)
  const dateStr = ts ? format(ts, 'MMM d, yyyy  HH:mm:ss') : '—'

  return (
    <>
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-charcoal-700 transition-colors cursor-pointer group"
        onClick={() => event.S3Key && setShowVideo(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setShowVideo(true) }}
        aria-label={`Event: plate ${event.PlateNumber} at ${dateStr}`}
      >
        {/* Thumbnail */}
        <div className="w-20 h-12 rounded bg-charcoal-800 shrink-0 overflow-hidden border border-charcoal-700">
          {event.S3Key
            ? <Thumbnail s3Key={event.S3Key} />
            : <div className="w-full h-full flex items-center justify-center text-slate-600 text-xs">—</div>
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <PlateTag
            plate={event.PlateNumber}
            status={event.ValidationStatus}
            confidence={event.Confidence}
          />
          <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">
            {dateStr} · {event.CameraId}
          </div>
        </div>

        {/* Alert badge */}
        {(event.ValidationStatus === 'stolen' || event.ValidationStatus === 'suspended') && (
          <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-700">
            {event.ValidationStatus.toUpperCase()}
          </span>
        )}
      </div>

      {showVideo && (
        <VideoModal s3Key={event.S3Key} onClose={() => setShowVideo(false)} />
      )}
    </>
  )
}
