import type { MilestoneStatus, User } from './types'

export function canEditMilestone(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'draft'
}

export function canApproveCriteria(user: User, status: MilestoneStatus) {
  return user.role === 'freelancer' && status === 'draft'
}

export function canStartMilestone(user: User, status: MilestoneStatus) {
  return user.role === 'freelancer' && status === 'criteria_approved'
}

export function canSubmitEvidence(user: User, status: MilestoneStatus) {
  return user.role === 'freelancer' && (status === 'criteria_approved' || status === 'in_progress' || status === 'rejected')
}

export function canStartVerification(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'submitted'
}

export function canRunVerification(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'verifying'
}

export function canCompleteVerification(user: User, status: MilestoneStatus) {
  return user.role === 'client' && status === 'verifying'
}

export function canRejectWork(user: User, status: MilestoneStatus) {
  return user.role === 'client' && (status === 'submitted' || status === 'verifying')
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
