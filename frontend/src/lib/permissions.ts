import type { MilestoneStatus, User } from './types'

export function canEditMilestone(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'draft'
}

export function canApproveCriteria(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'draft'
}

export function canSubmitEvidence(user: User, status: MilestoneStatus) {
  return user.role === 'freelancer' && (status === 'criteria_approved' || status === 'in_progress' || status === 'rejected')
}

export function canStartVerification(user: User, status: MilestoneStatus) {
  return (user.role === 'client' || user.role === 'freelancer') && status === 'submitted'
}

export function canDecide(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'verified'
}

export function canPay(user: User, status: MilestoneStatus) {
  return user.role === 'client' && (status === 'approved' || status === 'payment_failed')
}

export function canViewReceipt(status: MilestoneStatus) {
  return status === 'paid'
}
