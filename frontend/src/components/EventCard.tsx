import { useState } from 'react'
import { format } from 'date-fns'
import { PlateTag } from './PlateTag'
import { VideoModal } from './VideoModal'
import type { PlateEvent } from '@/lib/types'

interface Props {
  event: PlateEvent
}

export function EventCard({ event }: Props) {
  const [showVideo, setShowVideo] = useState(false)

  const ts = new Date(event.Timestamp)
  const dateStr = format(ts, 'MM-dd HH:mm')

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
        {/* Thumbnail placeholder */}
        <div className="w-16 h-10 rounded bg-charcoal-700 shrink-0 flex items-center justify-center text-slate-600 group-hover:text-slate-400 transition-colors overflow-hidden">
          {event.S3Key ? (
            <span className="text-xs">▶</span>
          ) : (
            <span className="text-xs">—</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <PlateTag
            plate={event.PlateNumber}
            status={event.ValidationStatus}
            confidence={event.Confidence}
          />
          <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">
            {dateStr} · {event.CameraId} · {event.EventType}
          </div>
        </div>

        {/* Status badge for stolen/flagged */}
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
