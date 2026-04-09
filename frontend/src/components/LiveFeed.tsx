import { useEffect, useRef } from 'react'
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

function HlsPlayer({ cameraId }: { cameraId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef   = useRef<Hls | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // HLS segments are written to S3 by the EC2 HLS relay and served via CloudFront
    const src = `/hls/${cameraId}/index.m3u8`

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 10 })
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
      className="w-full h-full object-cover"
    />
  )
}

export function LiveFeed() {
  return (
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
            <div className="aspect-video bg-charcoal-950">
              <HlsPlayer cameraId={cam.id} />
            </div>
            <div className="px-3 py-2 text-xs text-slate-400 font-mono">{cam.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
