import { View, Text, StyleSheet } from 'react-native'

export function LiveScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Live Feed</Text>
      <Text style={styles.sub}>
        Configure camera RTSP URLs in Settings to enable live preview.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#12141a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  label: { color: '#f59e0b', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  sub: { color: '#64748b', textAlign: 'center', fontSize: 14 },
})
