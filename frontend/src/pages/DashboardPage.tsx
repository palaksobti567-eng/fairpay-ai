import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorNote, LoadingBlock, StatusBadge, useTitle } from '../components/ui'
import { useAuth } from '../context/AuthProvider'
import { listProjects } from '../lib/api'
import { formatMoney, formatWhen, greeting } from '../lib/format'
import type { Project } from '../lib/types'

export function DashboardPage() {
  useTitle('Projects')
  const { user } = useAuth()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [problem, setProblem] = useState<unknown>(null)

  function load() {
    setProblem(null)
    setProjects(null)
    listProjects()
      .then(setProjects)
      .catch((error: unknown) => {
        setProjects([])
        setProblem(error)
      })
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{user ? greeting(user.name) : 'Projects'}</h1>
          <p className="lede">
            {user?.role === 'client'
              ? 'Projects you created. Open one to invite a freelancer, set criteria, review a report, or pay.'
              : 'Projects assigned to you. Open one to submit evidence and follow the report.'}
          </p>
        </div>
        {user?.role === 'client' && (
          <Link className="btn" to="/projects/new">
            New project
          </Link>
        )}
      </header>
      <ErrorNote error={problem} />
      {problem ? (
        <button type="button" className="btn secondary" onClick={load}>
          Try again
        </button>
      ) : null}
      {projects === null && <LoadingBlock label="Loading projects…" />}
      {projects && projects.length === 0 && !problem && (
        <EmptyState title={user?.role === 'client' ? 'No projects yet' : 'No assignments yet'}>
          {user?.role === 'client'
            ? 'Create a project, then invite a freelancer by the email they used to register.'
            : 'When a client invites this account, the project will show up here.'}
        </EmptyState>
      )}
      <div className="card-grid">
        {projects?.map((project) => (
          <Link className="card project-card" key={project.id} to={`/projects/${project.id}`}>
            <div className="row spread">
              <p className="eyebrow">{formatWhen(project.createdAt)}</p>
              <strong className="money small">{formatMoney(project.totalAmount, project.currency)}</strong>
            </div>
            <h2>{project.title}</h2>
            <p>{project.description}</p>
            <div className="chip-row">
              {project.milestones.length === 0 && <span className="chip">No milestones</span>}
              {project.milestones.map((milestone) => (
                <StatusBadge key={milestone.id} status={milestone.status} />
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
