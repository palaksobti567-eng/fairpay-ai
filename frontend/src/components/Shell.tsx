import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthProvider'
import { checkHealth } from '../lib/api'
import { apiBaseUrl, dataMode, setDataMode, type DataMode } from '../lib/config'
import { roleLabel } from '../lib/format'
import { Logo } from './ui'

export function Shell() {
  const { user, logout } = useAuth()
  const [health, setHealth] = useState<'checking' | 'demo' | 'ok' | 'down'>('checking')
  const mode = dataMode()

  useEffect(() => {
    let cancelled = false
    checkHealth().then((result) => {
      if (!cancelled) setHealth(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="shell">
      <aside className="side">
        <div>
          <Logo />
          <nav className="side-nav" aria-label="Main">
            <NavLink to="/dashboard" end>
              Projects
            </NavLink>
            {user?.role === 'client' && <NavLink to="/projects/new">New project</NavLink>}
          </nav>
        </div>
        <div className="side-foot">
          <div className="user-card">
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
            <span className="role-pill">{user ? roleLabel(user.role) : ''}</span>
          </div>
          <div className="mode-switch" role="group" aria-label="Data source">
            <button type="button" className={mode === 'mock' ? 'on' : ''} onClick={() => switchMode('mock', mode)}>
              Demo
            </button>
            <button type="button" className={mode === 'live' ? 'on' : ''} onClick={() => switchMode('live', mode)}>
              Backend
            </button>
          </div>
          <p className="health">
            {health === 'checking' && 'Checking the server… a free host can take a minute to wake.'}
            {health === 'demo' && 'Demo data stays in this browser. Switch to Backend when the API is live.'}
            {health === 'ok' && `Backend is awake at ${apiBaseUrl()}.`}
            {health === 'down' && `Cannot reach ${apiBaseUrl()} yet. The first call after idle can take about a minute.`}
          </p>
          <button type="button" className="btn light" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <div className="main">
        <a className="skip" href="#content">
          Skip to content
        </a>
        <div id="content" className="content">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function switchMode(next: DataMode, current: DataMode) {
  if (next === current) return
  setDataMode(next)
}
