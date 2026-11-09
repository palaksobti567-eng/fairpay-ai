import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorNote, LoadingBlock, TextListEditor, useTitle } from '../components/ui'
import { bulkCreateMilestones, generateMilestones, getProject } from '../lib/api'
import { formatMoney, isMoney, roundMoney } from '../lib/format'
import type { Project } from '../lib/types'

type Draft = {
  key: string
  title: string
  amount: string
  criteria: string[]
}

export function GeneratePage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [description, setDescription] = useState('')
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<unknown>(null)

  useTitle('Suggest milestones')

  useEffect(() => {
    getProject(projectId)
      .then((next) => {
        setProject(next)
        setDescription(next.description)
      })
      .catch((error: unknown) => setLoadError(error))
  }, [projectId])

  const allocatedCents = project
    ? project.milestones.reduce((total, milestone) => total + Math.round(milestone.amount * 100), 0)
    : 0
  const budgetCents = project ? Math.round(project.totalAmount * 100) : 0
  const remainingCents = Math.max(0, budgetCents - allocatedCents)
  const remainingBudget = remainingCents / 100

  async function onGenerate(event: FormEvent) {
    event.preventDefault()
    if (!project) return
    if (!isMoney(remainingBudget)) {
      setProblem(new Error('The project budget is already fully allocated.'))
      return
    }
    setPending(true)
    setProblem(null)
    setDrafts(null)
    try {
      const milestones = await generateMilestones({
        projectId: project.id,
        description: description.trim(),
      })
      setDrafts(
        milestones.map((milestone, index) => ({
          key: `draft-${index}-${milestone.title}`,
          title: milestone.title,
          amount: String(milestone.amount),
          criteria: milestone.criteria.length ? milestone.criteria : [''],
        })),
      )
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  async function onConfirm() {
    if (!project || !drafts) return
    const parsed = drafts.map((draft) => ({
      ...draft,
      amountNumber: Number(draft.amount),
      criteria: draft.criteria.map((item) => item.trim()).filter(Boolean),
    }))
    if (parsed.some((draft) => !draft.title.trim() || !isMoney(draft.amountNumber) || draft.criteria.length === 0)) {
      setProblem(new Error('Each suggestion needs a title, a valid amount, and at least one criterion.'))
      return
    }
    const sumCents = parsed.reduce((total, draft) => total + Math.round(draft.amountNumber * 100), 0)
    if (sumCents <= 0 || sumCents > remainingCents) {
      setProblem(new Error(`These amounts add up to ${formatMoney(sumCents / 100, project.currency)}. They cannot exceed the remaining ${formatMoney(remainingBudget, project.currency)}.`))
      return
    }
    setSaving(true)
    setProblem(null)
    try {
      await bulkCreateMilestones(
        project.id,
        parsed.map((draft) => ({
          title: draft.title.trim(),
          amount: draft.amountNumber,
          criteria: draft.criteria,
        })),
      )
      navigate(`/projects/${project.id}`)
    } catch (error) {
      setProblem(error)
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <ErrorNote error={loadError} />
  if (!project) return <LoadingBlock label="Loading project…" />

  const sum = drafts
    ? roundMoney(drafts.reduce((total, draft) => total + (Number.isFinite(Number(draft.amount)) ? Math.round(Number(draft.amount) * 100) : 0), 0))
    : 0

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">AI draft · nothing is saved yet</p>
          <h1>Suggest milestones</h1>
          <p className="lede">
            Gemini can propose milestones and measurable criteria for {project.title}. Edit every field. The project changes only when you confirm.
          </p>
        </div>
        <Link className="btn secondary" to={`/projects/${project.id}`}>
          Back to project
        </Link>
      </header>
      <form className="card stack" onSubmit={onGenerate}>
        <label className="field">
          Description
          <textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} required />
        </label>
        <div className="field">
          <span>Budget for suggestions ({project.currency})</span>
          <p className="hint">
            Project budget {formatMoney(project.totalAmount, project.currency)}. Remaining for new milestones{' '}
            {formatMoney(remainingBudget, project.currency)}. The server uses the saved project budget.
          </p>
        </div>
        <ErrorNote error={!drafts ? problem : null} />
        <button className="btn" type="submit" disabled={pending || !isMoney(remainingBudget)}>
          {pending ? 'Drafting… this can take up to 30 seconds' : drafts ? 'Try again' : 'Suggest milestones'}
        </button>
        {pending && <LoadingBlock label="Writing milestones and acceptance criteria." />}
      </form>
      {drafts && (
        <section className="stack">
          <div className="row spread">
            <h2>Review the draft</h2>
            <p>
              {formatMoney(sum, project.currency)} of {formatMoney(remainingBudget, project.currency)} remaining
            </p>
          </div>
          <ErrorNote error={problem} />
          {drafts.map((draft, index) => (
            <article className="card stack" key={draft.key}>
              <label className="field">
                Title
                <input
                  value={draft.title}
                  onChange={(event) => update(index, { ...draft, title: event.target.value })}
                />
              </label>
              <label className="field">
                Amount ({project.currency})
                <input
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(event) => update(index, { ...draft, amount: event.target.value })}
                />
              </label>
              <div className="field">
                <span>Acceptance criteria</span>
                <TextListEditor
                  items={draft.criteria}
                  onChange={(criteria) => update(index, { ...draft, criteria })}
                  addLabel="Add criterion"
                />
              </div>
            </article>
          ))}
          <p className="hint">Confirming adds these milestones as drafts in one request. Milestones already on the project stay as they are.</p>
          <button type="button" className="btn" disabled={saving} onClick={() => void onConfirm()}>
            {saving ? 'Saving…' : 'Confirm and save milestones'}
          </button>
        </section>
      )}
    </div>
  )

  function update(index: number, next: Draft) {
    setDrafts((current) => current?.map((item, itemIndex) => (itemIndex === index ? next : item)) ?? null)
  }
}
