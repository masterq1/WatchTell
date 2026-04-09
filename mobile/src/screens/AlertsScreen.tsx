import { useEffect, useState } from 'react'
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet,
} from 'react-native'
import { api } from '../lib/api'
import type { WatchlistEntry } from '../lib/types'

export function AlertsScreen() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.watchlist.list()
      .then((data) => setWatchlist(data.watchlist))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#f59e0b" />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Watchlist</Text>
      <FlatList
        data={watchlist}
        keyExtractor={(item) => item.PlateNumber}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.plate}>{item.PlateNumber}</Text>
            <Text style={styles.note}>{item.Note ?? ''}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Watchlist is empty.{'\n'}Add plates via the web dashboard.
          </Text>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12141a' },
  heading: { color: '#f1f5f9', fontSize: 16, fontWeight: '600', padding: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1d24',
    gap: 12,
  },
  plate: { color: '#fbbf24', fontFamily: 'monospace', fontSize: 15, fontWeight: '500', width: 120 },
  note: { color: '#94a3b8', fontSize: 13, flex: 1 },
  error: { color: '#f87171', textAlign: 'center', margin: 32 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 64, lineHeight: 22 },
})
