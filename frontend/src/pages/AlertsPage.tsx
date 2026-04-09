import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { WatchlistEntry } from '@/lib/types'

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
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-lg font-semibold text-slate-200">Watchlist</h1>

      {/* Add form */}
      <form onSubmit={addPlate} className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">Plate number</label>
          <input
            type="text"
            value={newPlate}
            onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
            placeholder="ABC-1234"
            maxLength={12}
            required
            className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-slate-100 font-mono text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1">Note (optional)</label>
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="e.g. Stolen vehicle"
            className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
        <button
          type="submit"
          disabled={adding}
          className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-charcoal-900 font-semibold text-sm"
        >
          {adding ? '…' : 'Add'}
        </button>
      </form>

      {error && <div className="text-sm text-red-400">{error}</div>}

      {/* Watchlist table */}
      {loading ? (
        <div className="text-slate-500 text-sm animate-pulse">Loading watchlist…</div>
      ) : watchlist.length === 0 ? (
        <div className="text-slate-500 text-sm text-center py-8">
          Watchlist is empty. Add plates to receive alerts.
        </div>
      ) : (
        <table className="w-full text-sm" aria-label="Watchlist">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-charcoal-700">
              <th className="pb-2 pr-4 font-medium">Plate</th>
              <th className="pb-2 font-medium">Note</th>
              <th className="pb-2 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-charcoal-800">
            {watchlist.map((entry) => (
              <tr key={entry.PlateNumber} className="hover:bg-charcoal-800/50">
                <td className="py-2.5 pr-4 font-mono text-amber-300">{entry.PlateNumber}</td>
                <td className="py-2.5 text-slate-400">{entry.Note ?? '—'}</td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => removePlate(entry.PlateNumber)}
                    className="text-red-500 hover:text-red-400 text-xs"
                    aria-label={`Remove ${entry.PlateNumber} from watchlist`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
