import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Shell } from './components/Shell'
import { LoadingBlock } from './components/ui'
import { useAuth } from './context/AuthProvider'
import { LoginPage, RegisterPage } from './pages/AuthPages'
import { DashboardPage } from './pages/DashboardPage'
import { LandingPage } from './pages/LandingPage'
import { GeneratePage } from './pages/GeneratePage'
import { MilestonePage } from './pages/MilestonePage'
import { NewProjectPage } from './pages/NewProjectPage'
import { ProjectPage } from './pages/ProjectPage'
import { ReceiptPage } from './pages/ReceiptPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeGate />} />
      <Route path="/welcome" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects/new" element={<ClientOnly />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/generate" element={<ClientOnly generate />} />
          <Route path="/milestones/:milestoneId" element={<MilestonePage />} />
          <Route path="/milestones/:milestoneId/receipt" element={<ReceiptPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function HomeGate() {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="splash">
        <LoadingBlock label="Restoring your session…" />
      </div>
    )
  }
  if (!user) return <LandingPage />
  return <Navigate to="/dashboard" replace />
}

function RequireAuth() {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="splash">
        <LoadingBlock label="Restoring your session…" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

function ClientOnly({ generate = false }: { generate?: boolean }) {
  const { user } = useAuth()
  if (user?.role !== 'client') return <Navigate to="/" replace />
  if (generate) return <GeneratePage />
  return <NewProjectPage />
}

export function Guard({ children }: { children: ReactNode }) {
  return children
}
