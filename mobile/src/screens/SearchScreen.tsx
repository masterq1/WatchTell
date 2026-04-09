import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, ActivityIndicator, StyleSheet,
} from 'react-native'
import { EventCard } from '../components/EventCard'
import { VideoPlayer } from '../components/VideoPlayer'
import { api } from '../lib/api'
import type { PlateEvent } from '../lib/types'

export function SearchScreen() {
  const [plate, setPlate] = useState('')
  const [results, setResults] = useState<PlateEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<PlateEvent | null>(null)

  const search = async () => {
    if (!plate.trim()) return
    setLoading(true)
    setError(null)
    setSearched(true)
    try {
      const data = await api.search({ plate: plate.trim().toUpperCase() })
      setResults(data.results)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={plate}
          onChangeText={(t) => setPlate(t.toUpperCase())}
          placeholder="Plate number"
          placeholderTextColor="#475569"
          autoCapitalize="characters"
          returnKeyType="search"
          onSubmitEditing={search}
          accessibilityLabel="Plate number input"
        />
        <TouchableOpacity style={styles.btn} onPress={search} accessibilityLabel="Search">
          <Text style={styles.btnText}>GO</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator color="#f59e0b" style={{ marginTop: 32 }} />}
      {error && <Text style={styles.error}>{error}</Text>}
      {!loading && searched && results.length === 0 && (
        <Text style={styles.empty}>No results.</Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.EventId}
        renderItem={({ item }) => <EventCard event={item} onPress={setSelectedEvent} />}
      />

      {selectedEvent?.S3Key && (
        <VideoPlayer s3Key={selectedEvent.S3Key} onClose={() => setSelectedEvent(null)} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12141a' },
  row: { flexDirection: 'row', gap: 8, padding: 16 },
  input: {
    flex: 1,
    backgroundColor: '#1a1d24',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c3140',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f1f5f9',
    fontFamily: 'monospace',
    fontSize: 15,
  },
  btn: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { color: '#12141a', fontWeight: '700', fontSize: 14 },
  error: { color: '#f87171', textAlign: 'center', marginTop: 16 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 40 },
})
