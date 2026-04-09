import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/live',     label: 'Live' },
  { to: '/events',   label: 'Events' },
  { to: '/search',   label: 'Search' },
  { to: '/alerts',   label: 'Alerts' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  const [darkMode, setDarkMode] = useState(true)

  const toggleDark = () => {
    setDarkMode((d) => {
      document.documentElement.classList.toggle('dark', !d)
      return !d
    })
  }

  return (
    <div className="min-h-screen flex flex-col bg-charcoal-900 text-slate-100">
      {/* Top navigation */}
      <header className="flex items-center gap-6 px-4 py-2.5 border-b border-charcoal-700 shrink-0">
        <span className="text-amber-400 font-semibold tracking-wide text-sm font-mono select-none">
          Watching Tell River
        </span>
        <nav className="flex gap-1" aria-label="Primary navigation">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded text-sm transition-colors ${
                  isActive
                    ? 'text-amber-400 bg-charcoal-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-charcoal-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={toggleDark}
          className="ml-auto text-slate-500 hover:text-slate-300 text-sm"
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? '☀' : '🌙'}
        </button>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
