import { useState, type FormEvent } from 'react'

interface Props {
  onSearch: (params: { plate?: string; start?: string; end?: string }) => void
  loading?: boolean
}

export function SearchBar({ onSearch, loading }: Props) {
  const [plate, setPlate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSearch({
      plate: plate.trim().toUpperCase() || undefined,
      start: start || undefined,
      end: end || undefined,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap gap-2 items-end"
      role="search"
      aria-label="Search events"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="block text-xs text-slate-500 mb-1">Plate number</label>
        <input
          type="text"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="ABC-1234"
          maxLength={12}
          className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-slate-100 font-mono text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
          aria-label="Plate number"
        />
      </div>

      <div className="min-w-[150px]">
        <label className="block text-xs text-slate-500 mb-1">Start date</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
          aria-label="Start date"
        />
      </div>

      <div className="min-w-[150px]">
        <label className="block text-xs text-slate-500 mb-1">End date</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full px-3 py-2 rounded bg-charcoal-800 border border-charcoal-600 text-slate-100 text-sm focus:outline-none focus:border-amber-500"
          aria-label="End date"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-charcoal-900 font-semibold text-sm transition-colors"
      >
        {loading ? 'Searching…' : 'GO'}
      </button>
    </form>
  )
}
