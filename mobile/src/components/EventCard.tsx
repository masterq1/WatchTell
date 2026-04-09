import { TouchableOpacity, View, Text, StyleSheet } from 'react-native'
import { PlateTag } from './PlateTag'
import type { PlateEvent } from '../lib/types'

interface Props {
  event: PlateEvent
  onPress?: (event: PlateEvent) => void
}

export function EventCard({ event, onPress }: Props) {
  const ts = new Date(event.Timestamp)
  const dateStr = `${String(ts.getMonth() + 1).padStart(2, '0')}-${String(ts.getDate()).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(event)}
      activeOpacity={0.7}
      accessibilityLabel={`Event: plate ${event.PlateNumber} at ${dateStr}`}
    >
      <View style={styles.thumb}>
        <Text style={styles.thumbIcon}>{event.S3Key ? '▶' : '—'}</Text>
      </View>
      <View style={styles.info}>
        <PlateTag plate={event.PlateNumber} status={event.ValidationStatus} />
        <Text style={styles.meta}>{dateStr} · {event.CameraId} · {event.EventType}</Text>
      </View>
      {(event.ValidationStatus === 'stolen' || event.ValidationStatus === 'suspended') && (
        <View style={styles.alertBadge}>
          <Text style={styles.alertText}>{event.ValidationStatus.toUpperCase()}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1d24',
  },
  thumb: {
    width: 56,
    height: 38,
    borderRadius: 6,
    backgroundColor: '#1a1d24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbIcon: { color: '#475569', fontSize: 14 },
  info: { flex: 1, gap: 4 },
  meta: { fontFamily: 'monospace', fontSize: 11, color: '#64748b' },
  alertBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(153,27,27,0.4)',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  alertText: { color: '#f87171', fontSize: 10, fontWeight: '700' },
})
