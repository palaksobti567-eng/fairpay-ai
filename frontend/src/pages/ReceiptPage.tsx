import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorNote, LoadingBlock, useTitle } from '../components/ui'
import { getMilestone, getPayment } from '../lib/api'
import { isApiError } from '../lib/errors'
import { formatMoney, formatWhen } from '../lib/format'
import type { Milestone, Payment } from '../lib/types'

export function ReceiptPage() {
  useTitle('Confirmation')
  const { milestoneId = '' } = useParams()
  const [payment, setPayment] = useState<Payment | null>(null)
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getMilestone(milestoneId), getPayment(milestoneId)])
      .then(([nextMilestone, nextPayment]) => {
        if (cancelled) return
        setMilestone(nextMilestone)
        setPayment(nextPayment)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (isApiError(error) && error.status === 404) {
          setProblem(new Error('No payment has been captured for this milestone.'))
        } else setProblem(error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [milestoneId])

  if (loading) return <LoadingBlock label="Loading confirmation…" />
  if (problem || !payment) {
    return (
      <div className="stack">
        <ErrorNote error={problem} />
        <Link to={`/milestones/${milestoneId}`}>Back to the milestone</Link>
      </div>
    )
  }

  return (
    <article className="receipt">
      <p className="eyebrow">Confirmation</p>
      <h1>{payment.status === 'completed' ? 'Payment captured' : 'Payment record'}</h1>
      <p className="lede">{milestone?.title}</p>
      <p className="money">{formatMoney(payment.amount, payment.currency)}</p>
      <dl>
        <div>
          <dt>Status</dt>
          <dd>{payment.status}</dd>
        </div>
        <div>
          <dt>Currency</dt>
          <dd>{payment.currency}</dd>
        </div>
        <div>
          <dt>Order id</dt>
          <dd>{payment.orderId || '—'}</dd>
        </div>
        <div>
          <dt>Capture id</dt>
          <dd>{payment.captureId || '—'}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatWhen(payment.paidAt)}</dd>
        </div>
      </dl>
      <p className="hint">
        PayPal captured this amount for the app merchant account. Automatic payout to the freelancer is a next step, not part of this prototype.
      </p>
      <Link className="btn secondary" to={`/milestones/${milestoneId}`}>
        Back to the milestone
      </Link>
    </article>
  )
}
