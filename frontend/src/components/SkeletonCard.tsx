export function SkeletonCard() {
  return (
    <div className="flex items-stretch rounded-xl overflow-hidden border border-charcoal-700/40 bg-charcoal-900 animate-pulse">
      <div className="w-1 shrink-0 bg-charcoal-700" />
      <div className="w-36 h-[5.5rem] shrink-0 bg-charcoal-800" />
      <div className="flex-1 flex flex-col justify-center px-4 py-3 gap-2">
        <div className="h-6 w-36 rounded bg-charcoal-800" />
        <div className="flex gap-2">
          <div className="h-3 w-16 rounded bg-charcoal-800" />
          <div className="h-3 w-10 rounded bg-charcoal-800" />
        </div>
      </div>
      <div className="shrink-0 flex flex-col justify-center items-end pr-4 py-3 gap-2">
        <div className="h-3 w-28 rounded bg-charcoal-800" />
        <div className="h-2.5 w-16 rounded bg-charcoal-800" />
      </div>
    </div>
  )
}
