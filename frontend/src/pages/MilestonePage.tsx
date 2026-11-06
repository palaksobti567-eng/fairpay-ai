import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PayPanel } from '../components/PayPanel'
import {
  CriterionMark,
  ErrorNote,
  FlowRail,
  LoadingBlock,
  Modal,
  StatusBadge,
  SuccessNote,
  TextListEditor,
  useTitle,
} from '../components/ui'
import { useAuth } from '../context/AuthProvider'
import {
  approveCriteria,
  approveMilestone,
  getMilestone,
  getPayment,
  getReport,
  listSubmissions,
  rejectMilestone,
  startVerification,
  submitEvidence,
  updateMilestone,
} from '../lib/api'
import { isApiError } from '../lib/errors'
import { formatMoney, formatWhen, isMoney, previewUrlError, screenshotError, statusHint } from '../lib/format'
import {
  canApproveCriteria,
  canDecide,
  canEditMilestone,
  canPay,
  canStartVerification,
  canSubmitEvidence,
  canViewReceipt,
} from '../lib/permissions'
import type { Milestone, Payment, Report, Submission } from '../lib/types'

export function MilestonePage() {
  const { milestoneId = '' } = useParams()
  const { user } = useAuth()
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setProblem(null)
    const [nextMilestone, nextSubmissions] = await Promise.all([
      getMilestone(milestoneId),
      listSubmissions(milestoneId),
    ])
    setMilestone(nextMilestone)
    setSubmissions(nextSubmissions)
    const latest = nextSubmissions[0]
    if (!latest) {
      setReport(null)
    } else {
      try {
        setReport(await getReport(latest.id))
      } catch (error) {
        if (isApiError(error) && error.status === 404) setReport(null)
        else throw error
      }
    }
    if (nextMilestone.status === 'paid' || nextMilestone.status === 'approved' || nextMilestone.status === 'payment_failed') {
      try {
        setPayment(await getPayment(milestoneId))
      } catch (error) {
        if (isApiError(error) && error.status === 404) setPayment(null)
        else throw error
      }
    } else {
      setPayment(null)
    }
    return nextMilestone
  }, [milestoneId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .catch((error: unknown) => {
        if (!cancelled) setProblem(error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  useEffect(() => {
    if (milestone?.status !== 'verifying') return
    const submissionId = submissions[0]?.id
    if (!submissionId) return
    let cancelled = false
    let timer = 0
    const tick = async () => {
      try {
        const next = await getReport(submissionId)
        if (cancelled) return
        setReport(next)
        if (next.state === 'done' || next.state === 'failed') {
          await load()
          return
        }
      } catch (error) {
        if (!(isApiError(error) && error.status === 404) && !cancelled) setProblem(error)
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), 3000)
    }
    timer = window.setTimeout(() => void tick(), 3000)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [load, milestone?.status, submissions])

  useTitle(milestone?.title ?? 'Milestone')

  if (loading) return <LoadingBlock label="Loading milestone…" />
  if (!milestone || !user) {
    return (
      <div className="stack">
        <ErrorNote error={problem ?? new Error('Milestone not found.')} />
        <Link to="/">Back to projects</Link>
      </div>
    )
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            <Link to={`/projects/${milestone.projectId}`}>Project</Link>
            {' · '}
            <StatusBadge status={milestone.status} />
          </p>
          <h1>{milestone.title}</h1>
          <p className="lede">{statusHint(milestone.status)}</p>
        </div>
        <div className="total-block">
          <span>Milestone amount</span>
          <strong>{formatMoney(milestone.amount, milestone.currency)}</strong>
        </div>
      </header>
      <FlowRail status={milestone.status} />
      <ErrorNote error={problem} />
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {milestone.rejectionReason && (
        <div className="alert">
          <p>Rejection note</p>
          <p>{milestone.rejectionReason}</p>
        </div>
      )}

      <section className="card stack">
        <h2>Acceptance criteria</h2>
        {canEditMilestone(user, milestone.status) ? (
          <CriteriaEditor
            milestone={milestone}
            onSaved={async (message) => {
              setNotice(message)
              await load()
            }}
          />
        ) : (
          <ol className="criteria">
            {milestone.criteria.map((criterion) => (
              <li key={criterion.id}>{criterion.text}</li>
            ))}
          </ol>
        )}
        {canApproveCriteria(user, milestone.status) && !canEditMilestone(user, milestone.status) ? null : null}
      </section>

      {milestone.status === 'draft' && user.role === 'freelancer' && (
        <p className="hint">The client is still reviewing the criteria. You can submit evidence after they approve them.</p>
      )}
      {milestone.status === 'criteria_approved' && user.role === 'client' && (
        <p className="hint">Criteria are locked. The freelancer can submit evidence when the work is ready.</p>
      )}

      {canSubmitEvidence(user, milestone.status) && (
        <EvidenceForm
          milestoneId={milestone.id}
          onSubmitted={async () => {
            setNotice('Evidence submitted. You can start verification, or wait for the client to start it.')
            await load()
          }}
        />
      )}

      {submissions.length > 0 && (
        <section className="card stack">
          <h2>Evidence</h2>
          {submissions.map((submission) => (
            <article key={submission.id} className="history">
              <p className="hint">{formatWhen(submission.createdAt)}</p>
              <p>{submission.description}</p>
              <p>
                <a href={submission.previewUrl} target="_blank" rel="noreferrer">
                  {submission.previewUrl}
                </a>
              </p>
              {submission.screenshots.length > 0 && (
                <ul>
                  {submission.screenshots.map((shot) => (
                    <li key={shot}>{shot}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          {canStartVerification(user, milestone.status) && submissions[0] && (
            <VerifyButton
              submissionId={submissions[0].id}
              onStarted={async () => {
                setNotice('Verification is running. This page checks the report every 3 seconds.')
                await load()
              }}
            />
          )}
        </section>
      )}

      {milestone.status === 'verifying' && (
        <LoadingBlock label="The read-only browser is checking the public page. This view refreshes every 3 seconds." />
      )}

      {report?.state === 'failed' && (
        <div className="alert">
          <p>{report.summary || 'Verification did not finish.'}</p>
          <p>You can start it again once the milestone is ready for another check.</p>
        </div>
      )}

      {report && report.state === 'done' && <ReportView report={report} />}

      {canDecide(user, milestone.status) && report?.state === 'done' && (
        <Decision
          milestoneId={milestone.id}
          reportId={report.id}
          onDone={async (message) => {
            setNotice(message)
            await load()
          }}
        />
      )}

      {milestone.status === 'verified' && user.role === 'freelancer' && (
        <p className="hint">The report is with the client. Only they can approve or reject the work.</p>
      )}
      {milestone.status === 'approved' && user.role === 'freelancer' && (
        <p className="hint">The client approved this milestone. Payment has not been captured yet.</p>
      )}
      {milestone.status === 'payment_failed' && user.role === 'freelancer' && (
        <p className="hint">The last payment did not complete. The client can try PayPal again.</p>
      )}

      {canPay(user, milestone.status) && (
        <PayPanel
          milestone={milestone}
          onPaid={async () => {
            setNotice('Payment captured.')
            await load()
          }}
        />
      )}

      {payment?.status === 'failed' && user.role === 'client' && milestone.status === 'payment_failed' && (
        <p className="hint">The last payment did not complete. Nothing is paid until a capture succeeds.</p>
      )}

      {canViewReceipt(milestone.status) && (
        <Link className="btn" to={`/milestones/${milestone.id}/receipt`}>
          Open confirmation
        </Link>
      )}
    </div>
  )
}

function CriteriaEditor({
  milestone,
  onSaved,
}: {
  milestone: Milestone
  onSaved: (message: string) => Promise<void>
}) {
  const [title, setTitle] = useState(milestone.title)
  const [amount, setAmount] = useState(String(milestone.amount))
  const [criteria, setCriteria] = useState(milestone.criteria.map((item) => item.text))
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const dirty =
    title.trim() !== milestone.title ||
    Number(amount) !== milestone.amount ||
    criteria.map((item) => item.trim()).join('\n') !== milestone.criteria.map((item) => item.text).join('\n')

  async function save(event?: FormEvent) {
    event?.preventDefault()
    const parsed = Number(amount)
    const cleaned = criteria.map((item) => item.trim()).filter(Boolean)
    if (!title.trim() || !isMoney(parsed) || cleaned.length === 0) {
      setProblem(new Error('Keep a title, a valid amount, and at least one criterion.'))
      return false
    }
    setPending(true)
    setProblem(null)
    try {
      await updateMilestone(milestone.id, { title: title.trim(), amount: parsed, criteria: cleaned })
      await onSaved('Draft saved.')
      return true
    } catch (error) {
      setProblem(error)
      return false
    } finally {
      setPending(false)
    }
  }

  async function approve() {
    setPending(true)
    setProblem(null)
    try {
      await approveCriteria(milestone.id)
      setConfirming(false)
      await onSaved('Criteria approved. The freelancer can see what done means.')
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="stack" onSubmit={(event) => void save(event)}>
      <ErrorNote error={problem} />
      <label className="field">
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="field">
        Amount ({milestone.currency})
        <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </label>
      <TextListEditor items={criteria.length ? criteria : ['']} onChange={setCriteria} addLabel="Add criterion" />
      <div className="row wrap">
        <button className="btn secondary" type="submit" disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        <button className="btn" type="button" disabled={pending || dirty} onClick={() => setConfirming(true)}>
          Approve criteria
        </button>
      </div>
      {dirty && <p className="hint">Save changes before approving criteria.</p>}
      {confirming && (
        <Modal title="Approve these criteria?" onClose={() => setConfirming(false)}>
          <p>Approving locks the criteria. Both sides will use them as the definition of done for this milestone.</p>
          <div className="row">
            <button type="button" className="btn" disabled={pending} onClick={() => void approve()}>
              {pending ? 'Approving…' : 'Approve criteria'}
            </button>
            <button type="button" className="btn secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </form>
  )
}

function EvidenceForm({ milestoneId, onSubmitted }: { milestoneId: string; onSubmitted: () => Promise<void> }) {
  const [description, setDescription] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [shots, setShots] = useState<string[]>([''])
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const urlProblem = previewUrlError(previewUrl)
    const shotProblems = shots.map((shot) => screenshotError(shot)).filter(Boolean)
    if (!description.trim() || urlProblem || shotProblems.length) {
      setProblem(new Error(urlProblem || shotProblems[0] || 'Describe what you delivered.'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await submitEvidence(milestoneId, {
        description: description.trim(),
        previewUrl: previewUrl.trim(),
        screenshots: shots.map((shot) => shot.trim()).filter(Boolean),
      })
      await onSubmitted()
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>Submit evidence</h2>
      <p className="hint">
        The preview must be a public https address. Localhost and private IPs are rejected. File upload will be connected
        when the backend confirms that method. Until then, add a public screenshot URL or an id.
      </p>
      <ErrorNote error={problem} />
      <label className="field">
        What was delivered
        <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} required />
      </label>
      <label className="field">
        Public preview URL
        <input
          type="url"
          placeholder="https://example.com/preview"
          value={previewUrl}
          onChange={(event) => setPreviewUrl(event.target.value)}
          required
        />
      </label>
      <div className="field">
        <span>Screenshots</span>
        <TextListEditor items={shots} onChange={setShots} addLabel="Add screenshot URL or id" />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit evidence'}
      </button>
    </form>
  )
}

function VerifyButton({ submissionId, onStarted }: { submissionId: string; onStarted: () => Promise<void> }) {
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<unknown>(null)

  return (
    <div className="stack tight">
      <ErrorNote error={problem} />
      <button
        type="button"
        className="btn"
        disabled={pending}
        onClick={() => {
          setPending(true)
          setProblem(null)
          startVerification(submissionId)
            .then(() => onStarted())
            .catch((error: unknown) => setProblem(error))
            .finally(() => setPending(false))
        }}
      >
        {pending ? 'Starting…' : 'Start AI verification'}
      </button>
      <p className="hint">Either person on the project can start the check. It runs in the background and does not approve the work.</p>
    </div>
  )
}

function ReportView({ report }: { report: Report }) {
  return (
    <section className="card stack">
      <p className="eyebrow">Verification report</p>
      <h2>{report.summary}</h2>
      <p className="note">AI-assisted report. The client makes the final decision.</p>
      <div className="legend">
        <CriterionMark status="completed" />
        <CriterionMark status="missing" />
        <CriterionMark status="unverified" />
        <span className="hint">Unverified means the system could not check it. That is not a failure.</span>
      </div>
      <div className="shots">
        <Shot label="Desktop" url={report.screenshots.desktop} />
        <Shot label="Mobile" url={report.screenshots.mobile} />
      </div>
      <ul className="results">
        {report.results.map((result) => (
          <li key={result.criterionId}>
            <div className="row spread">
              <CriterionMark status={result.status} />
              <span className="hint">{result.source}</span>
            </div>
            <p className="criterion-text">{result.criterion}</p>
            <p>{result.evidence}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Shot({ label, url }: { label: string; url: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <figure>
      <figcaption>{label}</figcaption>
      {url && !broken ? (
        <img src={url} alt={`${label} screenshot from the read-only check`} onError={() => setBroken(true)} />
      ) : (
        <div className="shot-empty">No screenshot captured</div>
      )}
    </figure>
  )
}

function Decision({
  milestoneId,
  reportId,
  onDone,
}: {
  milestoneId: string
  reportId: string
  onDone: (message: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<unknown>(null)

  async function approve() {
    setPending(true)
    setProblem(null)
    try {
      await approveMilestone(milestoneId, { reportId, note })
      setMode(null)
      await onDone('You approved the work. Payment is now available.')
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  async function reject() {
    if (!reason.trim()) {
      setProblem(new Error('A reason is required.'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await rejectMilestone(milestoneId, reason.trim())
      setMode(null)
      await onDone('The milestone was sent back to the freelancer.')
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="card stack">
      <h2>Your decision</h2>
      <p>The report is a reading aid. Approving or rejecting is your action, not the model&apos;s.</p>
      <ErrorNote error={problem} />
      <div className="row wrap">
        <button type="button" className="btn" onClick={() => setMode('approve')}>
          Approve work
        </button>
        <button type="button" className="btn danger" onClick={() => setMode('reject')}>
          Reject work
        </button>
      </div>
      {mode === 'approve' && (
        <Modal title="You confirm the work meets the criteria. Continue to payment?" onClose={() => setMode(null)}>
          <label className="field">
            Note, optional
            <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn" disabled={pending} onClick={() => void approve()}>
              {pending ? 'Approving…' : 'Continue to payment'}
            </button>
            <button type="button" className="btn secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {mode === 'reject' && (
        <Modal title="Reject this milestone" onClose={() => setMode(null)}>
          <label className="field">
            Reason
            <textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} required />
          </label>
          <div className="row">
            <button type="button" className="btn danger" disabled={pending || !reason.trim()} onClick={() => void reject()}>
              {pending ? 'Sending…' : 'Reject and send back'}
            </button>
            <button type="button" className="btn secondary" onClick={() => setMode(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}
