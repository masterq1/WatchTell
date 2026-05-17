import type { ValidationStatus } from '@/lib/types'

interface Props {
  plate: string
  status: ValidationStatus
  confidence?: number
}

const statusConfig: Record<ValidationStatus, { label: string; dot: string; text: string }> = {
  valid:        { label: 'Valid',        dot: 'bg-green-500',             text: 'text-green-400' },
  expired:      { label: 'Expired',      dot: 'bg-orange-500',            text: 'text-orange-400' },
  suspended:    { label: 'Suspended',    dot: 'bg-amber-500',             text: 'text-amber-400' },
  stolen:       { label: 'Stolen',       dot: 'bg-red-500 animate-pulse', text: 'text-red-400' },
  unregistered: { label: 'Unregistered', dot: 'bg-slate-600',             text: 'text-slate-500' },
  unknown:      { label: 'Unknown',      dot: 'bg-slate-700',             text: 'text-slate-500' },
}

export function PlateTag({ plate, status, confidence }: Props) {
  const cfg = statusConfig[status] ?? statusConfig.unknown
  return (
    <span className="inline-flex items-baseline gap-3 font-mono" title={`${status}${confidence !== undefined ? ` · ${Number(confidence).toFixed(0)}%` : ''}`}>
      <span className="text-xl font-bold text-white tracking-widest leading-none">
        {plate}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full inline-block shrink-0 ${cfg.dot}`} />
        <span className={`text-[11px] font-sans font-semibold uppercase tracking-wide ${cfg.text}`}>
          {cfg.label}
        </span>
        {confidence !== undefined && confidence > 0 && (
          <span className="text-[11px] font-mono text-slate-500">
            {Number(confidence).toFixed(0)}%
          </span>
        )}
      </span>
    </span>
  )
}
