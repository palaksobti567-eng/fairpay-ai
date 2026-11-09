import { apiBaseUrl, dataMode } from './config'
import { ApiError, type ApiErrorDetail } from './errors'
import { mockRequest } from './mock'
import type {
  Milestone,
  MilestoneSuggestion,
  PayPalOrder,
  Payment,
  Project,
  Report,
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

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (dataMode() === 'mock') {
    const result = await mockRequest(method, path, body ?? null, getToken())
    if (sessionExpired(path, result.status)) {
      setToken(null)
      unauthorizedHandler()
    }
    if (result.status >= 400) {
      const payload = result.body as ErrorBody
      throw new ApiError(
        result.status,
        payload.error?.code || 'ERROR',
        payload.error?.message || 'Request failed.',
        payload.error?.details ?? [],
      )
    }
    return result.body as T
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
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

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ErrorBody
    throw new ApiError(
      response.status,
      errorBody.error?.code || 'ERROR',
      errorBody.error?.message || 'Request failed.',
      errorBody.error?.details ?? [],
    )
  }

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

function criteriaTexts(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && 'text' in item) return String((item as { text: unknown }).text)
      return ''
    })
    .map((item) => item.trim())
    .filter(Boolean)
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
  return asList<Project>(body, 'projects')
}

export async function createProject(input: {
  title: string
  description: string
  currency: string
  totalBudget: number
}) {
  const body = await request<Project | { project: Project }>(
    '/api/projects',
    'POST',
    input
  )
  const wrapped = asObject(body).project
  return (wrapped as Project | undefined) ?? (body as Project)
}
export async function getProject(id: string) {
  const body = await request<Project | { project: Project }>(`/api/projects/${id}`)
  const wrapped = asObject(body).project
  return (wrapped as Project | undefined) ?? (body as Project)
}

export async function inviteFreelancer(projectId: string, freelancerEmail: string) {
  const body = await request<Project | { project: Project }>(`/api/projects/${projectId}/invite`, 'POST', { freelancerEmail })
  const wrapped = asObject(body).project
  return (wrapped as Project | undefined) ?? (body as Project)
}

export async function createMilestone(
  projectId: string,
  input: { title: string; amount: number; criteria: string[] },
) {
  const body = await request<Milestone | { milestone: Milestone }>(`/api/projects/${projectId}/milestones`, 'POST', input)
  const wrapped = asObject(body).milestone
  return (wrapped as Milestone | undefined) ?? (body as Milestone)
}

export async function updateMilestone(id: string, input: { title: string; amount: number; criteria: string[] }) {
  const body = await request<Milestone | { milestone: Milestone }>(`/api/milestones/${id}`, 'PATCH', input)
  const wrapped = asObject(body).milestone
  return (wrapped as Milestone | undefined) ?? (body as Milestone)
}

export async function approveCriteria(id: string) {
  const body = await request<Milestone | { milestone: Milestone }>(`/api/milestones/${id}/approve-criteria`, 'POST', {})
  const wrapped = asObject(body).milestone
  return (wrapped as Milestone | undefined) ?? (body as Milestone)
}

export async function getMilestone(id: string) {
  const body = await request<Milestone | { milestone: Milestone }>(`/api/milestones/${id}`)
  const wrapped = asObject(body).milestone
  return (wrapped as Milestone | undefined) ?? (body as Milestone)
}

export async function generateMilestones(input: {
  projectId: string
  description: string
  totalBudget: number
  currency: string
}) {
  const body = await request<{ milestones: unknown[] }>('/api/ai/generate-milestones', 'POST', input)
  const rows = Array.isArray(body.milestones) ? body.milestones : []
  return rows.map((row) => {
    const item = asObject(row)
    return {
      title: String(item.title ?? ''),
      amount: typeof item.amount === 'number' ? item.amount : Number(item.amount ?? 0),
      criteria: criteriaTexts(item.criteria),
    } satisfies MilestoneSuggestion
  })
}

export async function submitEvidence(
  milestoneId: string,
  input: { description: string; previewUrl: string; screenshots: string[] },
) {
  return request<Submission>(`/api/milestones/${milestoneId}/submissions`, 'POST', input)
}

export async function listSubmissions(milestoneId: string) {
  const body = await request<unknown>(`/api/milestones/${milestoneId}/submissions`)
  return asList<Submission>(body, 'submissions')
}

export async function startVerification(submissionId: string) {
  await request(`/api/submissions/${submissionId}/verify`, 'POST', {})
}

export async function getReport(submissionId: string) {
  return request<Report>(`/api/submissions/${submissionId}/report`)
}

export async function approveMilestone(id: string, input: { reportId: string; note?: string }) {
  const payload: { reportId: string; note?: string } = { reportId: input.reportId }
  if (input.note?.trim()) payload.note = input.note.trim()
  return request<Milestone>(`/api/milestones/${id}/approve`, 'POST', payload)
}

export async function rejectMilestone(id: string, reason: string) {
  return request<Milestone>(`/api/milestones/${id}/reject`, 'POST', { reason })
}

export async function createPaymentOrder(milestoneId: string) {
  return request<PayPalOrder>('/api/payments/create-order', 'POST', { milestoneId })
}

export async function capturePaymentOrder(orderId: string) {
  const body = await request<{ payment: Payment } | Payment>('/api/payments/capture-order', 'POST', { orderId })
  const wrapped = asObject(body).payment
  return (wrapped as Payment | undefined) ?? (body as Payment)
}

export async function getPayment(milestoneId: string) {
  const body = await request<{ payment: Payment } | Payment>(`/api/milestones/${milestoneId}/payment`)
  const wrapped = asObject(body).payment
  return (wrapped as Payment | undefined) ?? (body as Payment)
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
