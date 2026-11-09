import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, ErrorNote, LoadingBlock, StatusBadge, SuccessNote, TextListEditor, useTitle } from '../components/ui'
import { useAuth } from '../context/AuthProvider'
import { createMilestone, getProject, inviteFreelancer, listProjectPayments, updateProject } from '../lib/api'
import { formatMoney, formatWhen, isMoney, statusHint } from '../lib/format'
import type { Project, ProjectPayment } from '../lib/types'

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const { user } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    setProblem(null)
    getProject(projectId)
      .then(setProject)
      .catch((error: unknown) => setProblem(error))
      .finally(() => setLoading(false))
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  useTitle(project?.title ?? 'Project')

  if (loading) return <LoadingBlock label="Loading project…" />
  if (problem) {
    return (
      <div className="stack">
        <ErrorNote error={problem} />
        <button type="button" className="btn secondary" onClick={load}>
          Try again
        </button>
      </div>
    )
  }
  if (!project || !user) return null

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">Project · {formatWhen(project.createdAt)}</p>
          <h1>{project.title}</h1>
          <p className="lede">{project.description}</p>
        </div>
        <div className="total-block">
          <span>Total from the server</span>
          <strong>{formatMoney(project.totalAmount, project.currency)}</strong>
        </div>
      </header>

      <div className="split">
        <section className="stack">
          {project.milestones.length === 0 && (
            <EmptyState title="No milestones yet">
              {user.role === 'client'
                ? 'Add one by hand, or ask for a draft and edit every field before it is saved.'
                : 'The client has not added milestones yet.'}
            </EmptyState>
          )}
          <ol className="milestone-list">
            {project.milestones.map((milestone) => (
              <li key={milestone.id}>
                <Link to={`/milestones/${milestone.id}`}>
                  <div className="row spread">
                    <StatusBadge status={milestone.status} />
                    <strong>{formatMoney(milestone.amount, milestone.currency)}</strong>
                  </div>
                  <h2>{milestone.title}</h2>
                  <p>{statusHint(milestone.status)}</p>
                  <span className="hint">{milestone.criteria.length} acceptance criteria</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
        <aside className="stack">
          <InviteCard project={project} canInvite={user.role === 'client'} onInvited={setProject} />
          {user.role === 'client' && (
            <>
              <EditProjectCard project={project} onSaved={setProject} />
              <Link className="btn" to={`/projects/${project.id}/generate`}>
                Suggest milestones with AI
              </Link>
              <AddMilestone project={project} onCreated={load} />
            </>
          )}
          <PaymentsCard projectId={project.id} />
        </aside>
      </div>
    </div>
  )
}

function InviteCard({
  project,
  canInvite,
  onInvited,
}: {
  project: Project
  canInvite: boolean
  onInvited: (project: Project) => void
}) {
  const [email, setEmail] = useState('')
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem(null)
    try {
      const next = await inviteFreelancer(project.id, email.trim())
      onInvited(next)
      setDone(true)
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card stack">
      <h2>Freelancer</h2>
      {project.freelancerId ? (
        <p>A freelancer is assigned to this project.</p>
      ) : (
        <p>Nobody is assigned yet. Invite them with the email they registered.</p>
      )}
      {done && <SuccessNote>Invitation saved.</SuccessNote>}
      <ErrorNote error={problem} />
      {canInvite && !project.freelancerId && (
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            Freelancer email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? 'Inviting…' : 'Invite freelancer'}
          </button>
        </form>
      )}
    </section>
  )
}

function EditProjectCard({ project, onSaved }: { project: Project; onSaved: (project: Project) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description)
  const [budget, setBudget] = useState(String(project.totalAmount))
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsedBudget = Number(budget)
    if (!isMoney(parsedBudget)) {
      setProblem(new Error('Enter a valid budget with at most two decimal places.'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const next = await updateProject(project.id, {
        title: title.trim(),
        description: description.trim(),
        totalBudget: parsedBudget,
      })
      onSaved(next)
      setOpen(false)
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Edit project
      </button>
    )
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>Edit project</h2>
      <p className="hint">The budget cannot drop below the milestone amounts already allocated.</p>
      <ErrorNote error={problem} />
      <label className="field">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="field">
        Description
        <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required />
      </label>
      <label className="field">
        Total budget ({project.currency})
        <input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} required />
      </label>
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function PaymentsCard({ projectId }: { projectId: string }) {
  const [payments, setPayments] = useState<ProjectPayment[] | null>(null)
  const [problem, setProblem] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false
    listProjectPayments(projectId)
      .then((rows) => {
        if (!cancelled) setPayments(rows)
      })
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  return (
    <section className="card stack">
      <h2>Transaction history</h2>
      {payments === null && !problem && <p className="hint">Loading payments…</p>}
      <ErrorNote error={problem} />
      {payments && payments.length === 0 && <p className="hint">No payments yet. They appear after a client pays an approved milestone.</p>}
      {payments && payments.length > 0 && (
        <ul className="history">
          {payments.map((payment) => (
            <li key={payment.id}>
              <div className="row spread">
                <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                <span className="chip">{payment.status}</span>
              </div>
              <p className="hint">
                {formatWhen(payment.paidAt ?? payment.createdAt)}
                {payment.orderId ? ` · order ${payment.orderId}` : ''}
                {payment.captureId ? ` · capture ${payment.captureId}` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AddMilestone({ project, onCreated }: { project: Project; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [criteria, setCriteria] = useState([''])
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number(amount)
    if (!isMoney(parsed)) {
      setProblem(new Error('Enter an amount greater than zero, with at most two decimal places.'))
      return
    }
    const cleaned = criteria.map((item) => item.trim()).filter(Boolean)
    if (cleaned.length === 0) {
      setProblem(new Error('Add at least one acceptance criterion.'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await createMilestone(project.id, { title: title.trim(), amount: parsed, criteria: cleaned })
      setTitle('')
      setAmount('')
      setCriteria([''])
      setOpen(false)
      onCreated()
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Add a milestone
      </button>
    )
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>New milestone</h2>
      <p className="hint">It stays a draft until you approve the criteria. Currency is {project.currency}, from the project.</p>
      <ErrorNote error={problem} />
      <label className="field">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <label className="field">
        Amount ({project.currency})
        <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </label>
      <div className="field">
        <span>Acceptance criteria</span>
        <TextListEditor items={criteria} onChange={setCriteria} addLabel="Add criterion" />
      </div>
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        <button className="btn secondary" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  )
}
