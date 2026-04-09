import { useEffect, useRef, useCallback } from 'react'

interface UseWebSocketOptions {
  onMessage: (data: unknown) => void
  onError?: (event: Event) => void
  reconnectDelayMs?: number
  enabled?: boolean
}

export function useWebSocket(url: string | null, options: UseWebSocketOptions) {
  const { onMessage, onError, reconnectDelayMs = 3000, enabled = true } = options
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!url || !enabled || !mountedRef.current) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string)
        onMessage(data)
      } catch {
        onMessage(event.data)
      }
    }

    ws.onerror = (event) => {
      onError?.(event)
    }

    ws.onclose = () => {
      if (mountedRef.current) {
        reconnectTimer.current = setTimeout(connect, reconnectDelayMs)
      }
    }
  }, [url, enabled, onMessage, onError, reconnectDelayMs])

  useEffect(() => {
    mountedRef.current = true
    connect()
    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])
}
