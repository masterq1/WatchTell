import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

interface Props {
  s3Key: string
  onClose: () => void
}

export function VideoModal({ s3Key, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.clips.url(s3Key)
      .then((data) => setUrl(data.url))
      .catch((err) => setError(err.message))
  }, [s3Key])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Video clip"
    >
      <div
        className="relative max-w-4xl w-full mx-4 rounded-xl overflow-hidden bg-charcoal-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-slate-400 hover:text-white text-xl leading-none"
          aria-label="Close"
        >
          ✕
        </button>
        {error && (
          <div className="p-8 text-center text-red-400">{error}</div>
        )}
        {!error && !url && (
          <div className="p-8 text-center text-slate-400 animate-pulse">Loading clip…</div>
        )}
        {url && (
          <video
            src={url}
            controls
            autoPlay
            className="w-full max-h-[80vh] bg-black"
          />
        )}
      </div>
    </div>
  )
}
