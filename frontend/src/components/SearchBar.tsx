import { useState, type FormEvent } from 'react'

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

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
      className="flex flex-wrap gap-3 items-end"
      role="search"
      aria-label="Search events"
    >
      <div className="flex-1 min-w-[160px]">
        <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider font-medium">Plate number</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="ABC-1234"
            maxLength={12}
            className="w-full pl-8 pr-3 py-2 rounded-md bg-charcoal-800 border border-charcoal-600 text-slate-100 font-mono text-sm placeholder:text-charcoal-600 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-colors"
            aria-label="Plate number"
          />
        </div>
      </div>

      <div className="min-w-[160px]">
        <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider font-medium">From</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-charcoal-800 border border-charcoal-600 text-slate-300 text-sm focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          aria-label="Start date"
        />
      </div>

      <div className="min-w-[160px]">
        <label className="block text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider font-medium">To</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-charcoal-800 border border-charcoal-600 text-slate-300 text-sm focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/20 transition-colors"
          aria-label="End date"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-5 py-2 rounded-md bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 text-charcoal-950 font-semibold text-sm uppercase tracking-wide transition-colors"
      >
        {loading ? '…' : 'Search'}
      </button>
    </form>
  )
}
