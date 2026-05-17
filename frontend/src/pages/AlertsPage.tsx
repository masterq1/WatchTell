import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { WatchlistEntry } from '@/lib/types'

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 shrink-0">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  )
}

export function AlertsPage() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newPlate, setNewPlate] = useState('')
  const [newNote, setNewNote] = useState('')
  const [adding, setAdding] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.watchlist.list()
      setWatchlist(data.watchlist)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watchlist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addPlate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlate.trim()) return
    setAdding(true)
    try {
      await api.watchlist.add(newPlate.trim(), newNote.trim())
      setNewPlate('')
      setNewNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add plate')
    } finally {
      setAdding(false)
    }
  }

  const removePlate = async (plate: string) => {
    try {
      await api.watchlist.remove(plate)
      setWatchlist((prev) => prev.filter((w) => w.PlateNumber !== plate))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove plate')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-base font-semibold text-slate-200">Watchlist</h1>
          <p className="text-xs text-slate-500 mt-1">Plates that trigger an SNS alert when detected.</p>
        </div>

        {/* Add form */}
        <div className="bg-charcoal-900 border border-charcoal-700/60 rounded-xl p-4 space-y-4">
          <h2 className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Add to watchlist</h2>
          <form onSubmit={addPlate} className="flex gap-3 items-end">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Plate number</label>
              <input
                type="text"
                value={newPlate}
                onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                placeholder="ABC-1234"
                maxLength={12}
                required
                className="w-full px-3 py-2 rounded-md bg-charcoal-800 border border-charcoal-600 text-slate-100 font-mono text-sm placeholder:text-charcoal-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-colors"
              />
            </div>
            <div className="flex-[2]">
              <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Note</label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. Stolen vehicle, report #4291"
                className="w-full px-3 py-2 rounded-md bg-charcoal-800 border border-charcoal-600 text-slate-300 text-sm placeholder:text-charcoal-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={adding}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 text-charcoal-950 font-semibold text-sm transition-colors"
            >
              <PlusIcon />
              {adding ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>

        {error && (
          <div className="text-xs text-red-400 font-mono bg-red-950/30 border border-red-800/40 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* Watchlist entries */}
        {loading ? (
          <div className="text-xs text-slate-500 font-mono animate-pulse">Loading watchlist…</div>
        ) : watchlist.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600 text-sm gap-2">
            <span className="text-3xl opacity-20">⚑</span>
            <span>Watchlist is empty</span>
            <span className="text-xs text-slate-700">Add a plate above to receive alerts when it's detected.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="text-[10px] text-slate-600 uppercase tracking-widest font-medium px-1 mb-2">
              {watchlist.length} plate{watchlist.length !== 1 ? 's' : ''} flagged
            </div>
            {watchlist.map((entry) => (
              <div
                key={entry.PlateNumber}
                className="flex items-center gap-0 rounded-lg overflow-hidden border border-red-900/40 bg-charcoal-900 hover:border-red-800/60 group transition-colors"
              >
                <div className="w-[3px] self-stretch shrink-0 bg-red-600" />
                <div className="flex items-center gap-3 flex-1 px-3 py-2.5 min-w-0">
                  <span className="font-mono font-bold text-sm text-amber-300 tracking-widest bg-charcoal-800 border border-charcoal-600 px-2 py-0.5 rounded shrink-0">
                    {entry.PlateNumber}
                  </span>
                  <span className="text-sm text-slate-400 min-w-0 truncate">
                    {entry.Note ?? <span className="text-slate-600 italic">No note</span>}
                  </span>
                </div>
                <button
                  onClick={() => removePlate(entry.PlateNumber)}
                  className="flex items-center justify-center w-10 self-stretch text-charcoal-600 hover:text-red-400 hover:bg-red-950/30 transition-colors opacity-0 group-hover:opacity-100"
                  aria-label={`Remove ${entry.PlateNumber} from watchlist`}
                >
                  <TrashIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
