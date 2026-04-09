import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

interface Camera {
  id: string
  name: string
}

function parseCameras(): Camera[] {
  try {
    return JSON.parse(import.meta.env.VITE_CAMERAS ?? '[]')
  } catch {
    return []
  }
}

const CAMERAS = parseCameras()

interface HlsPlayerProps {
  cameraId: string
  onClick?: () => void
  className?: string
}

function HlsPlayer({ cameraId, onClick, className }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<Hls | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const src = `/hls/${cameraId}/index.m3u8`

    if (Hls.isSupported()) {
      const hls = new Hls({
        backBufferLength: 10,
        maxBufferLength: 15,
        liveSyncDurationCount: 3,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {})
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
    }

    return () => {
      hlsRef.current?.destroy()
      hlsRef.current = null
    }
  }, [cameraId])

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      autoPlay
      onClick={onClick}
      className={className}
    />
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
                <HlsPlayer cameraId={cam.id} className="w-full h-full object-cover" />
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
                cameraId={expanded.id}
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
