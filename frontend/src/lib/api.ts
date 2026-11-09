import { apiBaseUrl, dataMode } from './config'
import { ApiError, type ApiErrorDetail } from './errors'
import { mockRequest } from './mock'
import type {
  Criterion,
  CriterionResult,
  Milestone,
  MilestoneStatus,
  MilestoneSuggestion,
  Payment,
  PayPalOrder,
  Project,
  ProjectPayment,
  Report,
  ReportState,
  RevisionSuggestion,
  Submission,
  User,
} from './types'

const TOKEN_KEY = 'fairpay.token'

let unauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

type ErrorBody = {
  error?: {
    code?: string
    message?: string
    details?: ApiErrorDetail[]
  }
}

function sessionExpired(path: string, status: number) {
  if (status !== 401) return false
  return path !== '/api/auth/login' && path !== '/api/auth/register'
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  }
}

function throwResponseError(status: number, payload: unknown) {
  const body = (payload ?? {}) as ErrorBody
  throw new ApiError(
    status,
    body.error?.code || 'ERROR',
    body.error?.message || 'Request failed.',
    body.error?.details ?? [],
  )
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (dataMode() === 'mock') {
    const result = await mockRequest(method, path, body ?? null, getToken())
    if (sessionExpired(path, result.status)) {
      setToken(null)
      unauthorizedHandler()
    }
    if (result.status >= 400) throwResponseError(result.status, result.body)
    return result.body as T
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(
      0,
      'NETWORK',
      'The server could not be reached. If it is on the free plan, the first request after a pause can take about a minute.',
    )
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (sessionExpired(path, response.status)) {
    setToken(null)
    unauthorizedHandler()
  }

  if (!response.ok) throwResponseError(response.status, payload)
  return payload as T
}

function asObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function asList<T>(value: unknown, key: string): T[] {
  if (Array.isArray(value)) return value as T[]
  const wrapped = asObject(value)[key]
  return Array.isArray(wrapped) ? (wrapped as T[]) : []
}

function text(value: unknown, fallback = '') {
  return value == null ? fallback : String(value)
}

function normalizeCriteria(value: unknown): Criterion[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return { id: '', text: item.trim() }
      const row = asObject(item)
      return { id: text(row.id), text: text(row.text).trim() }
    })
    .filter((item) => item.text)
    .map((item, index) => ({ ...item, id: item.id || `criterion-${index + 1}` }))
}

function criteriaPayload(criteria: string[]) {
  return criteria.map((textValue) => ({ text: textValue.trim() })).filter((item) => item.text)
}

function normalizeMilestone(value: unknown): Milestone {
  const item = asObject(value)
  return {
    id: text(item.id ?? item._id),
    projectId: text(item.projectId),
    title: text(item.title),
    amount: Number(item.amount ?? 0),
    currency: text(item.currency).toUpperCase(),
    status: (text(item.status, 'draft') || 'draft') as MilestoneStatus,
    criteria: normalizeCriteria(item.criteria),
    rejectionReason: item.rejectionReason == null ? undefined : text(item.rejectionReason),
  }
}

function normalizeProject(value: unknown): Project {
  const item = asObject(value)
  return {
    id: text(item.id ?? item._id),
    title: text(item.title),
    description: text(item.description),
    currency: text(item.currency).toUpperCase(),
    clientId: text(item.clientId),
    freelancerId: item.freelancerId == null ? null : text(item.freelancerId),
    totalAmount: Number(item.totalAmount ?? item.totalBudget ?? 0),
    milestones: Array.isArray(item.milestones)
      ? item.milestones.map(normalizeMilestone)
      : [],
    createdAt: text(item.createdAt),
  }
}

function normalizeSubmission(value: unknown): Submission {
  const item = asObject(value)
  return {
    id: text(item.id ?? item._id),
    milestoneId: text(item.milestoneId),
    projectId: item.projectId == null ? undefined : text(item.projectId),
    freelancerId: item.freelancerId == null ? undefined : text(item.freelancerId),
    description: text(item.description),
    previewUrl: text(item.previewUrl),
    screenshots: Array.isArray(item.screenshots) ? item.screenshots.map((shot) => text(shot)).filter(Boolean) : [],
    source: item.source == null ? undefined : text(item.source),
    createdAt: text(item.createdAt),
  }
}

function reportState(value: unknown): ReportState {
  const state = text(value)
  if (state === 'done' || state === 'completed') return 'done'
  if (state === 'failed') return 'failed'
  return 'running'
}

function normalizeReport(value: unknown, screenshotId?: unknown): Report {
  const item = asObject(value)
  const results = asList<Record<string, unknown>>(item.criteriaResults ?? item.results, '')
  const snapshot = asList<Record<string, unknown>>(item.criteriaSnapshot, '')
  const criterionText = new Map(
    snapshot.map((criterion) => [text(criterion.id ?? criterion.criterionId), text(criterion.text ?? criterion.criterion)]),
  )
  const source = text(item.source, 'browser')

  return {
    id: text(item.id ?? item._id),
    submissionId: text(item.submissionId),
    state: reportState(item.state ?? item.status),
    summary: text(item.summary),
    results: results.map((result): CriterionResult => {
      const criterionId = text(result.criterionId ?? result.id)
      return {
        criterionId,
        criterion: text(result.criterion) || criterionText.get(criterionId) || criterionId,
        status: (text(result.status, 'unverified') || 'unverified') as CriterionResult['status'],
        evidence: text(result.evidence ?? result.reason),
        source: text(result.source, source || 'none'),
      }
    }),
    screenshots: {
      desktop: text(asObject(item.screenshots).desktop),
      mobile: text(asObject(item.screenshots).mobile),
    },
    screenshotId: screenshotId == null ? (item.screenshotId == null ? null : text(item.screenshotId)) : text(screenshotId),
    createdAt: text(item.createdAt),
  }
}

function normalizePayment(value: unknown, fallback: { milestoneId?: string; milestoneStatus?: MilestoneStatus } = {}): Payment {
  const item = asObject(value)
  return {
    id: text(item.id ?? item._id),
    milestoneId: text(item.milestoneId ?? fallback.milestoneId),
    orderId: text(item.orderId),
    captureId: text(item.captureId),
    status: (text(item.status, 'created') || 'created') as Payment['status'],
    amount: Number(item.amount ?? 0),
    currency: text(item.currency).toUpperCase(),
    paidAt: item.paidAt == null ? null : text(item.paidAt),
    milestoneStatus: fallback.milestoneStatus,
  }
}

function normalizePayPalOrder(value: unknown): PayPalOrder {
  const body = asObject(value)
  const payment = asObject(body.payment)
  return {
    orderId: text(payment.orderId ?? body.orderId),
    amount: Number(payment.amount ?? body.amount ?? 0),
    currency: text(payment.currency ?? body.currency).toUpperCase(),
    approvalUrl: payment.approvalUrl == null ? (body.approvalUrl == null ? null : text(body.approvalUrl)) : text(payment.approvalUrl),
    orderStatus: body.orderStatus == null ? undefined : text(body.orderStatus),
  }
}

function wrapped<T>(body: unknown, key: string): T {
  const value = asObject(body)[key]
  return (value === undefined ? body : value) as T
}

export async function register(input: { name: string; email: string; password: string; role: User['role'] }) {
  return request<{ user: User; token: string }>('/api/auth/register', 'POST', input)
}

export async function login(email: string, password: string) {
  return request<{ user: User; token: string }>('/api/auth/login', 'POST', { email, password })
}

export async function me() {
  const body = await request<{ user: User }>('/api/auth/me')
  return body.user
}

export async function listProjects() {
  const body = await request<unknown>('/api/projects')
  return asList<unknown>(body, 'projects').map(normalizeProject)
}

export async function createProject(input: {
  title: string
  description: string
  currency: string
  totalBudget: number
}) {
  const body = await request<unknown>('/api/projects', 'POST', input)
  return normalizeProject(wrapped<unknown>(body, 'project'))
}

export async function getProject(id: string) {
  const body = await request<unknown>(`/api/projects/${id}`)
  return normalizeProject(wrapped<unknown>(body, 'project'))
}

export async function updateProject(
  id: string,
  input: { title?: string; description?: string; totalBudget?: number },
) {
  const body = await request<unknown>(`/api/projects/${id}`, 'PATCH', input)
  return normalizeProject(wrapped<unknown>(body, 'project'))
}

export async function listProjectPayments(projectId: string) {
  const body = await request<unknown>(`/api/projects/${projectId}/payments`)
  return asList<unknown>(body, 'payments').map((value): ProjectPayment => {
    const item = asObject(value)
    return {
      id: text(item.id ?? item._id),
      milestoneId: text(item.milestoneId),
      orderId: item.orderId == null ? null : text(item.orderId),
      captureId: item.captureId == null ? null : text(item.captureId),
      status: (text(item.status, 'created') || 'created') as ProjectPayment['status'],
      amount: Number(item.amount ?? 0),
      currency: text(item.currency).toUpperCase(),
      paidAt: item.paidAt == null ? null : text(item.paidAt),
      createdAt: text(item.createdAt),
    }
  })
}

export async function inviteFreelancer(projectId: string, freelancerEmail: string) {
  const body = await request<unknown>(`/api/projects/${projectId}/invite`, 'POST', { freelancerEmail })
  return normalizeProject(wrapped<unknown>(body, 'project'))
}

export async function createMilestone(
  projectId: string,
  input: { title: string; amount: number; criteria: string[] },
) {
  const body = await request<unknown>(`/api/projects/${projectId}/milestones`, 'POST', {
    title: input.title,
    amount: input.amount,
    criteria: criteriaPayload(input.criteria),
  })
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function bulkCreateMilestones(
  projectId: string,
  milestones: { title: string; amount: number; criteria: string[] }[],
) {
  const body = await request<unknown>(`/api/projects/${projectId}/milestones/bulk`, 'POST', {
    milestones: milestones.map((milestone) => ({
      title: milestone.title,
      amount: milestone.amount,
      criteria: criteriaPayload(milestone.criteria),
    })),
  })
  return asList<unknown>(body, 'milestones').map(normalizeMilestone)
}

export async function updateMilestone(id: string, input: { title: string; amount: number; criteria: string[] }) {
  const body = await request<unknown>(`/api/milestones/${id}`, 'PATCH', {
    title: input.title,
    amount: input.amount,
    criteria: criteriaPayload(input.criteria),
  })
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function approveCriteria(id: string) {
  const body = await request<unknown>(`/api/milestones/${id}/approve-criteria`, 'POST', {})
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function startMilestone(id: string) {
  const body = await request<unknown>(`/api/milestones/${id}/start`, 'POST', {})
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function getMilestone(id: string) {
  const body = await request<unknown>(`/api/milestones/${id}`)
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function generateMilestones(input: { projectId: string; description: string }) {
  const body = await request<{ milestones: unknown[] }>('/api/ai/generate-milestones', 'POST', input)
  const rows = Array.isArray(body.milestones) ? body.milestones : []
  return rows.map((row) => {
    const item = asObject(row)
    return {
      title: text(item.title),
      amount: typeof item.amount === 'number' ? item.amount : Number(item.amount ?? 0),
      criteria: Array.isArray(item.criteria)
        ? item.criteria
            .map((criterion) => {
              if (typeof criterion === 'string') return criterion.trim()
              return text(asObject(criterion).text).trim()
            })
            .filter(Boolean)
        : [],
    } satisfies MilestoneSuggestion
  })
}

export async function getRevisionSuggestions(milestoneId: string) {
  const body = await request<{ suggestions?: unknown[] }>('/api/ai/revision-suggestions', 'POST', { milestoneId })
  const rows = Array.isArray(body.suggestions) ? body.suggestions : []
  return rows.map((row): RevisionSuggestion => {
    const item = asObject(row)
    return {
      criterionId: text(item.criterionId),
      criterion: text(item.criterion),
      suggestion: text(item.suggestion),
    }
  })
}

export async function submitEvidence(
  milestoneId: string,
  input: { description: string; previewUrl: string; screenshots: string[] },
) {
  const body = await request<unknown>(`/api/milestones/${milestoneId}/submissions`, 'POST', input)
  return normalizeSubmission(wrapped<unknown>(body, 'submission'))
}

export async function listSubmissions(milestoneId: string) {
  const body = await request<unknown>(`/api/milestones/${milestoneId}/submissions`)
  return asList<unknown>(body, 'submissions').map(normalizeSubmission)
}

export async function startVerification(submissionId: string) {
  const body = await request<unknown>(`/api/submissions/${submissionId}/verify`, 'POST', {})
  const report = asObject(body).report
  return report ? normalizeReport(report, asObject(body).screenshotId) : null
}

export async function getReport(submissionId: string) {
  const body = await request<unknown>(`/api/submissions/${submissionId}/report`)
  const wrappedReport = asObject(body).report
  return normalizeReport(wrappedReport ?? body, asObject(body).screenshotId)
}

export async function startMilestoneVerification(milestoneId: string) {
  const body = await request<unknown>(`/api/milestones/${milestoneId}/start-verification`, 'POST', {})
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function completeMilestoneVerification(milestoneId: string, reportId: string) {
  const body = await request<unknown>(`/api/milestones/${milestoneId}/complete-verification`, 'POST', { reportId })
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function approveMilestone(id: string, input: { reportId: string }) {
  const body = await request<unknown>(`/api/milestones/${id}/approve`, 'POST', { reportId: input.reportId })
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function rejectMilestone(id: string, reason: string) {
  const body = await request<unknown>(`/api/milestones/${id}/reject`, 'POST', { reason })
  return normalizeMilestone(wrapped<unknown>(body, 'milestone'))
}

export async function createPaymentOrder(milestoneId: string) {
  const body = await request<unknown>('/api/payments/create-order', 'POST', { milestoneId })
  return normalizePayPalOrder(body)
}

export async function capturePaymentOrder(orderId: string) {
  const body = await request<unknown>('/api/payments/capture-order', 'POST', { orderId })
  return normalizePayment(wrapped<unknown>(body, 'payment'))
}

export async function getPayment(milestoneId: string) {
  const body = await request<unknown>(`/api/milestones/${milestoneId}/payment`)
  const payment = asObject(body).payment
  if (payment == null) return null
  return normalizePayment(payment, {
    milestoneId: text(asObject(body).milestoneId ?? milestoneId),
    milestoneStatus: asObject(body).milestoneStatus as MilestoneStatus | undefined,
  })
}

export async function getScreenshot(screenshotId: string, device: 'desktop' | 'mobile') {
  if (dataMode() === 'mock') {
    throw new ApiError(404, 'NOT_FOUND', 'Screenshot not found')
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}/api/screenshots/${screenshotId}?device=${device}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
  } catch {
    throw new ApiError(0, 'NETWORK', 'The screenshot could not be loaded.')
  }

  if (!response.ok) {
    const textBody = await response.text()
    let payload: unknown = null
    try {
      payload = textBody ? JSON.parse(textBody) : null
    } catch {
      payload = null
    }
    throwResponseError(response.status, payload)
  }

  return response.blob()
}

export async function checkHealth() {
  if (dataMode() === 'mock') return 'demo' as const
  try {
    const response = await fetch(`${apiBaseUrl()}/health`, { signal: AbortSignal.timeout(65000) })
    if (!response.ok) return 'down' as const
    return 'ok' as const
  } catch {
    return 'down' as const
  }
}
