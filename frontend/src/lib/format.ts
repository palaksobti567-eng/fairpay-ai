import type { MilestoneStatus, User } from './types'

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  draft: 'Draft',
  criteria_approved: 'Criteria approved',
  in_progress: 'In progress',
  submitted: 'Submitted',
  verifying: 'Verifying',
  verified: 'Report ready',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Rejected',
  payment_failed: 'Payment failed',
}

const STATUS_HINT: Record<MilestoneStatus, string> = {
  draft: 'The client can still edit and approve the criteria.',
  criteria_approved: 'Both sides know what done means. The freelancer can start.',
  in_progress: 'Work is underway. The freelancer can submit evidence.',
  submitted: 'Evidence is in. Waiting for verification.',
  verifying: 'The AI check is running.',
  verified: 'The report is ready for the client to review.',
  approved: 'The client approved the work. Payment can start.',
  paid: 'PayPal captured the payment.',
  rejected: 'The client rejected the work. The freelancer can resubmit.',
  payment_failed: 'The payment did not complete. The client can retry.',
}

export function statusLabel(status: MilestoneStatus) {
  return STATUS_LABEL[status]
}

export function statusHint(status: MilestoneStatus) {
  return STATUS_HINT[status]
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hourCycle: 'h23',
  }).format(date)
  return `${formatted} UTC`
}

export function greeting(name: string) {
  const hour = new Date().getHours()
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${hello}, ${name.split(' ')[0]}`
}

export function roleLabel(role: User['role']) {
  return role === 'client' ? 'Client' : 'Freelancer'
}

export function isMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return false
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

export function roundMoney(cents: number) {
  return Math.round(cents) / 100
}

export function previewUrlError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return 'Add a public preview URL.'
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'Enter a full URL, including https://.'
  }
  if (url.protocol !== 'https:') return 'The preview URL must start with https://.'
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::'
  ) {
    return 'Local addresses are not allowed. Use a public https URL.'
  }
  if (isPrivateIp(host)) {
    return 'Private network addresses are not allowed. Use a public https URL.'
  }
  return ''
}

function isPrivateIp(host: string) {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const parts = ipv4.slice(1).map(Number)
  if (parts.some((part) => part > 255)) return true
  const [a, b] = parts
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

export function screenshotError(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.includes('://')) {
    if (/\s/.test(trimmed)) return 'A screenshot id cannot contain spaces.'
    return ''
  }
  return previewUrlError(trimmed).replace('preview URL', 'screenshot URL').replace('The preview URL', 'A screenshot URL')
}
