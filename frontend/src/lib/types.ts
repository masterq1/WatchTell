export type ValidationStatus =
  | 'valid'
  | 'expired'
  | 'suspended'
  | 'stolen'
  | 'unregistered'
  | 'unknown'

export type EventType = 'entry' | 'exit' | 'unknown'

export interface PlateEvent {
  EventId: string
  Timestamp: string
  CameraId: string
  PlateNumber: string
  Confidence: number
  EventType: EventType
  ValidationStatus: ValidationStatus
  S3Key: string
  StoredAt?: string
}

export interface WatchlistEntry {
  PlateNumber: string
  Note?: string
}

export interface SearchResult {
  results: PlateEvent[]
  count: number
}

export interface EventsPage {
  events: PlateEvent[]
  nextKey: string | null
}
