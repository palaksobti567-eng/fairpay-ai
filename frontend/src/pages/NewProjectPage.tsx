import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorNote, useTitle } from '../components/ui'
import { useAuth } from '../context/AuthProvider'
import { createProject } from '../lib/api'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR']

export function NewProjectPage() {
  useTitle('New project')
  const { user } = useAuth()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [budget, setBudget] = useState('')
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  if (user && user.role !== 'client') {
    return <p>Only a client can create a project.</p>
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem(null)
    try {
      const totalBudget = Number(budget)

if (!Number.isFinite(totalBudget) || totalBudget <= 0 || !Number.isInteger(totalBudget * 100)) {
  setProblem('Enter a valid positive budget with at most 2 decimal places.')
  setPending(false)
  return
}

const project = await createProject({
  title: title.trim(),
  description: description.trim(),
  currency,
  totalBudget,
})
      navigate(`/projects/${project.id}`)
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="narrow stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">New project</p>
          <h1>Start with the work, not the payment.</h1>
          <p className="lede">You can add milestones yourself or ask the model for a draft you will edit before anything is saved.</p>
        </div>
      </header>
      <ErrorNote error={problem} />
      <form className="card stack" onSubmit={onSubmit}>
        <label className="field">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="field">
          Description
          <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
<label className="field">
  Total Budget
  <input
    type="number"
    min="0.01"
    step="0.01"
    value={budget}
    onChange={(event) => setBudget(event.target.value)}
    required
  />
  <span className="hint">Enter the total amount available for this project.</span>
</label>
        <label className="field">
          Currency
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <span className="hint">Milestone amounts use this currency. Payment later uses the amount stored for each milestone.</span>
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create project'}
        </button>
      </form>
    </div>
  )
}
