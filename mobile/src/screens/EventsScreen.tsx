import { useEffect, useState } from 'react'
import { FlatList, View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { EventCard } from '../components/EventCard'
import { VideoPlayer } from '../components/VideoPlayer'
import { api } from '../lib/api'
import type { PlateEvent } from '../lib/types'

export function EventsScreen() {
  const [events, setEvents] = useState<PlateEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<PlateEvent | null>(null)

  useEffect(() => {
    api.events.list(50)
      .then((data) => setEvents(data.events))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#f59e0b" />
  if (error) return <Text style={styles.error}>{error}</Text>

  return (
    <View style={styles.container}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.EventId}
        renderItem={({ item }) => (
          <EventCard event={item} onPress={setSelectedEvent} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No events yet.</Text>}
      />
      {selectedEvent?.S3Key && (
        <VideoPlayer s3Key={selectedEvent.S3Key} onClose={() => setSelectedEvent(null)} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#12141a' },
  error: { color: '#f87171', textAlign: 'center', margin: 32 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 64 },
})
