import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import { Layout } from '@/components/Layout'
import { LivePage } from '@/pages/LivePage'
import { EventsPage } from '@/pages/EventsPage'
import { SearchPage } from '@/pages/SearchPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export function App() {
  return (
    <Authenticator hideSignUp>
      {() => (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/live" replace />} />
              <Route path="live"     element={<LivePage />} />
              <Route path="events"   element={<EventsPage />} />
              <Route path="search"   element={<SearchPage />} />
              <Route path="alerts"   element={<AlertsPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      )}
    </Authenticator>
  )
}
