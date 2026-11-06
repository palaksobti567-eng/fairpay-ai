import type { ApiErrorDetail } from './types'

export class ApiError extends Error {
  status: number
  code: string
  details: ApiErrorDetail[]

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function readError(error: unknown) {
  if (isApiError(error)) {
    if (error.code === 'ALREADY_PAID') return 'This milestone is already paid'
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong. Please try again.'
}

export function detailText(detail: ApiErrorDetail) {
  if (typeof detail === 'string') return detail
  if (detail.field && detail.message) return `${detail.field}: ${detail.message}`
  return detail.message || detail.field || 'Check this field and try again.'
}

export type { ApiErrorDetail }
