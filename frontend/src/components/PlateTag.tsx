import type { ValidationStatus } from '@/lib/types'

interface Props {
  plate: string
  status: ValidationStatus
  confidence?: number
}

const statusConfig: Record<ValidationStatus, { label: string; classes: string }> = {
  valid:        { label: '✓', classes: 'text-green-400 border-green-600' },
  expired:      { label: '!', classes: 'text-orange-400 border-orange-600' },
  suspended:    { label: '⚠', classes: 'text-amber-400 border-amber-600' },
  stolen:       { label: '⚠', classes: 'text-red-400 border-red-600 animate-pulse' },
  unregistered: { label: '?', classes: 'text-slate-400 border-slate-600' },
  unknown:      { label: '?', classes: 'text-slate-400 border-slate-600' },
}

export function PlateTag({ plate, status, confidence }: Props) {
  const cfg = statusConfig[status] ?? statusConfig.unknown
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-sm px-2 py-0.5 rounded border ${cfg.classes}`}
      title={`${status}${confidence !== undefined ? ` (${confidence.toFixed(0)}%)` : ''}`}
    >
      <span>{plate}</span>
      <span className="text-xs opacity-80">{cfg.label}</span>
    </span>
  )
}
