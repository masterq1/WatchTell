import { useState, useEffect } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { PlateTag } from './PlateTag'
import { VideoModal } from './VideoModal'
import { api } from '@/lib/api'
import type { PlateEvent, ValidationStatus } from '@/lib/types'

interface Props {
  event: PlateEvent
}

/** Normalise timestamps missing colons: 2026-05-10T204912Z → 2026-05-10T20:49:12Z */
function parseTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null
  const normalised = raw.replace(/T(\d{2})(\d{2})(\d{2})Z$/, 'T$1:$2:$3Z')
  const d = new Date(normalised)
  return isNaN(d.getTime()) ? null : d
}

const statusStripColor: Record<ValidationStatus, string> = {
  valid:        '#22c55e',
  expired:      '#f97316',
  suspended:    '#f59e0b',
  stolen:       '#ef4444',
  unregistered: '#334155',
  unknown:      '#1e293b',
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
      <div className="w-full h-full flex items-center justify-center bg-charcoal-800">
        <span className="text-charcoal-600 animate-pulse text-lg">▶</span>
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
  const dateStr = ts ? format(ts, 'dd MMM · HH:mm:ss') : '—'
  const relativeStr = ts ? formatDistanceToNow(ts, { addSuffix: true }) : ''
  const isAlert = event.ValidationStatus === 'stolen' || event.ValidationStatus === 'suspended'
  const stripColor = statusStripColor[event.ValidationStatus] ?? '#1e293b'

  return (
    <>
      <div
        className={`flex items-stretch rounded-xl overflow-hidden border cursor-pointer group transition-all duration-150
          ${isAlert
            ? 'border-red-800/60 bg-red-950/25 hover:bg-red-950/40 hover:border-red-700/80'
            : 'border-charcoal-700/50 bg-charcoal-900 hover:bg-charcoal-800 hover:border-charcoal-600/80'
          }`}
        onClick={() => event.S3Key && setShowVideo(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setShowVideo(true) }}
        aria-label={`Plate ${event.PlateNumber} detected at ${dateStr}`}
      >
        {/* Status strip */}
        <div className="w-1 shrink-0" style={{ background: stripColor }} />

        {/* Thumbnail */}
        <div className="w-36 h-[5.5rem] shrink-0 overflow-hidden bg-charcoal-800 relative">
          {event.S3Key
            ? <Thumbnail s3Key={event.S3Key} />
            : <div className="w-full h-full flex items-center justify-center text-charcoal-700 text-xs">No image</div>
          }
          {/* Confidence badge on thumbnail */}
          {event.Confidence > 0 && (
            <div className="absolute bottom-1.5 right-1.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/80 text-amber-300 leading-none tabular-nums">
              {Number(event.Confidence).toFixed(0)}%
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center px-4 py-3 gap-1.5">
          <PlateTag
            plate={event.PlateNumber}
            status={event.ValidationStatus}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-slate-600 uppercase tracking-wider">
              {event.CameraId}
            </span>
            {event.EventType !== 'unknown' && (
              <span className="text-[10px] font-mono uppercase tracking-wide text-slate-500 px-1.5 py-px rounded border border-charcoal-700/80">
                {event.EventType}
              </span>
            )}
            {isAlert && (
              <span className="text-[10px] font-bold px-1.5 py-px rounded bg-red-900/60 text-red-400 border border-red-700/50 uppercase tracking-wide animate-pulse">
                ⚠ {event.ValidationStatus}
              </span>
            )}
          </div>
        </div>

        {/* Timestamp — right column */}
        <div className="shrink-0 flex flex-col items-end justify-center pr-4 py-3 gap-0.5">
          <span className="text-xs text-slate-400 font-mono tabular-nums">{dateStr}</span>
          <span className="text-[10px] text-slate-600">{relativeStr}</span>
        </div>
      </div>

      {showVideo && (
        <VideoModal s3Key={event.S3Key} onClose={() => setShowVideo(false)} />
      )}
    </>
  )
}
