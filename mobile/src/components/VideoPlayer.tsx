import { useEffect, useState } from 'react'
import { Modal, View, TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { Video, ResizeMode } from 'expo-av'
import { api } from '../lib/api'

interface Props {
  s3Key: string
  onClose: () => void
}

export function VideoPlayer({ s3Key, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.clips.url(s3Key)
      .then((data) => setUrl(data.url))
      .catch((err: Error) => setError(err.message))
  }, [s3Key])

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeTxt}>✕  Close</Text>
        </TouchableOpacity>

        {!url && !error && (
          <ActivityIndicator size="large" color="#f59e0b" style={{ flex: 1 }} />
        )}
        {error && (
          <Text style={styles.error}>{error}</Text>
        )}
        {url && (
          <Video
            source={{ uri: url }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  closeBtn: { padding: 16, paddingTop: 48 },
  closeTxt: { color: '#f59e0b', fontSize: 16 },
  video: { flex: 1 },
  error: { color: '#f87171', textAlign: 'center', margin: 32 },
})
