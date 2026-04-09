import { View, Text, StyleSheet } from 'react-native'
import type { ValidationStatus } from '../lib/types'

interface Props {
  plate: string
  status: ValidationStatus
}

const STATUS_COLORS: Record<ValidationStatus, { border: string; text: string; badge: string }> = {
  valid:        { border: '#16a34a', text: '#4ade80', badge: '✓' },
  expired:      { border: '#ea580c', text: '#fb923c', badge: '!' },
  suspended:    { border: '#d97706', text: '#fbbf24', badge: '⚠' },
  stolen:       { border: '#dc2626', text: '#f87171', badge: '⚠' },
  unregistered: { border: '#475569', text: '#94a3b8', badge: '?' },
  unknown:      { border: '#475569', text: '#94a3b8', badge: '?' },
}

export function PlateTag({ plate, status }: Props) {
  const cfg = STATUS_COLORS[status] ?? STATUS_COLORS.unknown
  return (
    <View style={[styles.container, { borderColor: cfg.border }]}>
      <Text style={[styles.plate, { color: cfg.text }]}>{plate}</Text>
      <Text style={[styles.badge, { color: cfg.text }]}>{cfg.badge}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  plate: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    fontSize: 12,
    opacity: 0.85,
  },
})
