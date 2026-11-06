import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { detailText, isApiError } from '../lib/errors'
import { statusLabel } from '../lib/format'
import type { CriterionResultStatus, MilestoneStatus } from '../lib/types'

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · FairPay AI` : 'FairPay AI'
  }, [title])
}

export function Logo() {
  return (
    <span className="logo">
      <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5" y="6" width="16" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 16.2l2.3 2.3 5-5.2" fill="none" stroke="#e2b56a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        FairPay <em>AI</em>
      </span>
    </span>
  )
}

export function StatusBadge({ status }: { status: MilestoneStatus }) {
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>
}

export function CriterionMark({ status }: { status: CriterionResultStatus }) {
  const label = status === 'completed' ? 'Completed' : status === 'missing' ? 'Missing' : 'Unverified'
  return (
    <span className={`crit crit-${status}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {status === 'completed' && <path d="M3.5 8.2l3 3 6-6.5" />}
        {status === 'missing' && <path d="M4 4l8 8M12 4l-8 8" />}
        {status === 'unverified' && <path d="M8 4.2v4.2M8 11.2h.01" />}
      </svg>
      {label}
    </span>
  )
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null
  const message = isApiError(error)
    ? error.code === 'ALREADY_PAID'
      ? 'This milestone is already paid'
      : error.message
    : error instanceof Error
      ? error.message
      : String(error)
  const details = isApiError(error) ? error.details : []
  return (
    <div className="alert" role="alert">
      <p>{message}</p>
      {details.length > 0 && (
        <ul>
          {details.map((detail, index) => (
            <li key={index}>{detailText(detail)}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return (
    <div className="alert ok" role="status">
      {children}
    </div>
  )
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-back" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function TextListEditor({
  items,
  onChange,
  addLabel,
}: {
  items: string[]
  onChange: (items: string[]) => void
  addLabel: string
}) {
  return (
    <div className="stack tight">
      {items.map((item, index) => (
        <div className="row" key={index}>
          <input
            aria-label={`Criterion ${index + 1}`}
            value={item}
            onChange={(event) => {
              const next = [...items]
              next[index] = event.target.value
              onChange(next)
            }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
            disabled={items.length === 1}
          >
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn secondary" onClick={() => onChange([...items, ''])}>
        {addLabel}
      </button>
    </div>
  )
}

export function FlowRail({ status }: { status: MilestoneStatus }) {
  const steps = [
    { label: 'Agreement', index: 0 },
    { label: 'Evidence', index: 1 },
    { label: 'AI verification', index: 2 },
    { label: 'Client decision', index: 3 },
    { label: 'PayPal', index: 4 },
    { label: 'Confirmation', index: 5 },
  ]
  const current = stepIndex(status)
  return (
    <ol className="rail">
      {steps.map((step) => {
        const state = step.index < current ? 'done' : step.index === current ? 'current' : ''
        return (
          <li key={step.label} className={state}>
            <span>{step.index + 1}</span>
            {step.label}
          </li>
        )
      })}
    </ol>
  )
}

function stepIndex(status: MilestoneStatus) {
  switch (status) {
    case 'draft':
    case 'criteria_approved':
      return 0
    case 'in_progress':
    case 'submitted':
    case 'rejected':
      return 1
    case 'verifying':
      return 2
    case 'verified':
      return 3
    case 'approved':
    case 'payment_failed':
      return 4
    case 'paid':
      return 5
    default:
      return 0
  }
}
