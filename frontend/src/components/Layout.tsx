import { NavLink, Outlet } from 'react-router-dom'

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.88v6.24a1 1 0 01-1.447.889L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.88v6.24a1 1 0 01-1.447.889L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
function SearchNavIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

const NAV_LINKS = [
  { to: '/live',     label: 'Live',     Icon: VideoIcon },
  { to: '/events',   label: 'Events',   Icon: ActivityIcon },
  { to: '/search',   label: 'Search',   Icon: SearchNavIcon },
  { to: '/alerts',   label: 'Alerts',   Icon: BellIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
]

export function Layout() {
  return (
    <div className="h-screen w-full flex bg-charcoal-950 text-slate-100 overflow-hidden">

      {/* ── Left sidebar navigation ── */}
      <aside className="w-16 shrink-0 flex flex-col items-center bg-charcoal-900 border-r border-charcoal-700/60">

        {/* Brand */}
        <div className="h-14 w-full flex items-center justify-center border-b border-charcoal-700/60 text-amber-400">
          <CameraIcon />
        </div>

        {/* Nav links */}
        <nav className="flex-1 flex flex-col items-center gap-1 pt-3 w-full px-2" aria-label="Primary navigation">
          {NAV_LINKS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={label}
              className={({ isActive }) =>
                `w-full flex flex-col items-center gap-1.5 py-2.5 rounded-lg transition-all
                ${isActive
                  ? 'bg-amber-500/10 text-amber-400'
                  : 'text-slate-600 hover:bg-charcoal-800 hover:text-slate-300'
                }`
              }
            >
              <Icon />
              <span className="text-[9px] uppercase tracking-wider font-medium leading-none">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* System status */}
        <div className="h-12 flex items-center justify-center" title="System online">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
        </div>
      </aside>

      {/* ── Page content ── */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
