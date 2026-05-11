import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface Camera {
  id: string
  name: string
  stream: string
}

function parseCameras(): Camera[] {
  try {
    return JSON.parse(import.meta.env.VITE_CAMERAS ?? '[]')
  } catch {
    return []
  }
}

const CAMERAS = parseCameras()

const GO2RTC_BASE = (import.meta.env.VITE_GO2RTC_URL ?? '').replace(/\/$/, '')

interface HlsPlayerProps {
  stream: string
  onClick?: () => void
  className?: string
}

function HlsPlayer({ stream, onClick, className }: HlsPlayerProps) {
  const videoRef  = useRef<HTMLVideoElement>(null)
  const hlsRef    = useRef<Hls | null>(null)
  const retryRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let destroyed = false

    function attach() {
      const video = videoRef.current
      if (!video || destroyed) return

      setError(false)
      // Each call re-fetches the master playlist → new go2rtc session ID
      const src = `${GO2RTC_BASE}/stream.m3u8?src=${encodeURIComponent(stream)}`

      if (Hls.isSupported()) {
        hlsRef.current?.destroy()
        const hls = new Hls({
          backBufferLength: 10,
          maxBufferLength: 20,
          liveSyncDurationCount: 3,
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
        })
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
        })
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal && !destroyed) {
            hls.destroy()
            hlsRef.current = null
            setError(true)
            // Auto-retry after 5 s with a fresh session
            retryRef.current = setTimeout(() => { if (!destroyed) attach() }, 5000)
          }
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src
        video.play().catch(() => {})
      }
    }

    attach()

    return () => {
      destroyed = true
      if (retryRef.current) clearTimeout(retryRef.current)
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [stream])

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        onClick={onClick}
        className={className}
      />
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-charcoal-950/80 text-xs text-slate-400 gap-1">
          <span>No signal</span>
          <span className="text-slate-600">Retrying…</span>
        </div>
      )}
    </div>
  )
}

export function LiveFeed() {
  const [expanded, setExpanded] = useState<Camera | null>(null)

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-charcoal-700">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Live
          </h2>
        </div>
        <div className="flex-1 p-3 space-y-3 overflow-y-auto">
          {CAMERAS.length === 0 && (
            <p className="text-xs text-slate-500 text-center pt-4">
              No cameras configured.
            </p>
          )}
          {CAMERAS.map((cam) => (
            <div key={cam.id} className="rounded-lg overflow-hidden bg-charcoal-800 border border-charcoal-700">
              <div
                className="aspect-video bg-charcoal-950 cursor-pointer relative group"
                onClick={() => setExpanded(cam)}
              >
                <HlsPlayer stream={cam.stream} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 pointer-events-none">
                  <span className="text-white text-3xl">⛶</span>
                </div>
              </div>
              <div className="px-3 py-2 text-xs text-slate-400 font-mono">{cam.name}</div>
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
          onClick={() => setExpanded(null)}
        >
          <div
            className="relative w-full max-w-5xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setExpanded(null)}
              className="absolute -top-8 right-0 text-slate-400 hover:text-white text-sm"
            >
              ✕ close
            </button>
            <div className="rounded-xl overflow-hidden shadow-2xl">
              <HlsPlayer
                stream={expanded.stream}
                className="w-full max-h-[80vh] object-contain bg-black"
              />
              <div className="px-4 py-2 bg-charcoal-900 text-xs text-slate-400 font-mono flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {expanded.name}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
