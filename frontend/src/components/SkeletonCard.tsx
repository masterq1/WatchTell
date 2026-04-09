export function SkeletonCard() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-charcoal-800 animate-pulse">
      <div className="w-16 h-10 rounded bg-charcoal-700 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 rounded bg-charcoal-700 w-24" />
        <div className="h-3 rounded bg-charcoal-700 w-36" />
      </div>
      <div className="h-5 w-14 rounded bg-charcoal-700" />
    </div>
  )
}
