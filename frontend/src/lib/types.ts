export type Role = 'client' | 'freelancer'

export type User = {
  id: string
  name: string
  email: string
  role: Role
}

export type MilestoneStatus =
  | 'draft'
  | 'criteria_approved'
  | 'in_progress'
  | 'submitted'
  | 'verifying'
  | 'verified'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'payment_failed'

export type Criterion = {
  id: string
  text: string
}

export type CriterionResultStatus = 'completed' | 'missing' | 'unverified'

export type Milestone = {
  id: string
  projectId: string
  title: string
  amount: number
  currency: string
  status: MilestoneStatus
  criteria: Criterion[]
  rejectionReason?: string
}

export type Project = {
  id: string
  title: string
  description: string
  currency: string
  clientId: string
  freelancerId: string | null
  totalAmount: number
  milestones: Milestone[]
  createdAt: string
}

export type Submission = {
  id: string
  milestoneId: string
  description: string
  previewUrl: string
  screenshots: string[]
  createdAt: string
}

export type CriterionResult = {
  criterionId: string
  criterion: string
  status: CriterionResultStatus
  evidence: string
  source: string
}

export type ReportState = 'running' | 'done' | 'failed'

export type Report = {
  id: string
  submissionId: string
  state: ReportState
  summary: string
  results: CriterionResult[]
  screenshots: {
    desktop: string
    mobile: string
  }
  createdAt: string
}

export type PaymentStatus = 'created' | 'completed' | 'failed'

export type Payment = {
  id: string
  milestoneId: string
  orderId: string
  captureId: string
  status: PaymentStatus
  amount: number
  currency: string
  paidAt: string | null
}

export type MilestoneSuggestion = {
  title: string
  amount: number
  criteria: string[]
}

export type PayPalOrder = {
  orderId: string
  amount: number
  currency: string
}

export type ApiErrorDetail = {
  field?: string
  message?: string
} | string
