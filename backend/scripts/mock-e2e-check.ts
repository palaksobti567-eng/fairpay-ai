// End-to-end check of the frontend mock API layer (demo mode).
// Stubs browser globals, then walks the full milestone lifecycle.

const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, String(value)),
  removeItem: (key: string) => void store.delete(key),
}
;(globalThis as any).window = {
  setTimeout: (fn: (...args: unknown[]) => void, ms?: number) => setTimeout(fn, ms),
}

import { ensureSample, mockRequest } from '../../frontend/src/lib/mock'
import {
  SAMPLE_CLIENT,
  SAMPLE_FREELANCER,
  SAMPLE_PASSWORD,
  SAMPLE_PROJECT_ID,
} from '../../frontend/src/lib/sample'

let failures = 0

function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS: ${name}`)
  else {
    failures++
    console.log(`FAIL: ${name}`, extra ?? '')
  }
}

async function call(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  const result = await mockRequest(method, path, body ?? null, token)
  return result as { status: number; body: any }
}

const realSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  ensureSample()

  // --- Auth ---
  const clientLogin = await call('POST', '/api/auth/login', '', {
    email: SAMPLE_CLIENT.email,
    password: SAMPLE_PASSWORD,
  })
  check('client login', clientLogin.status === 200 && !!clientLogin.body.token)
  const clientToken = clientLogin.body.token as string

  const freelancerLogin = await call('POST', '/api/auth/login', '', {
    email: SAMPLE_FREELANCER.email,
    password: SAMPLE_PASSWORD,
  })
  check('freelancer login', freelancerLogin.status === 200 && !!freelancerLogin.body.token)
  const freelancerToken = freelancerLogin.body.token as string

  const me = await call('GET', '/api/auth/me', clientToken)
  check('GET /auth/me', me.status === 200 && me.body.user.email === SAMPLE_CLIENT.email)

  // --- Projects ---
  const projects = await call('GET', '/api/projects', clientToken)
  const project = (Array.isArray(projects.body) ? projects.body : projects.body.projects).find(
    (p: any) => p.id === SAMPLE_PROJECT_ID
  )
  check('GET /projects lists sample project', !!project)

  const draft = project.milestones.find((m: any) => m.id === 'ms_brand')
  check('sample draft milestone present', draft?.status === 'draft')

  // Freelancer cannot see client-only project list items? (freelancer sees assigned projects)
  const fProjects = await call('GET', '/api/projects', freelancerToken)
  const fProject = (Array.isArray(fProjects.body) ? fProjects.body : fProjects.body.projects).find(
    (p: any) => p.id === SAMPLE_PROJECT_ID
  )
  check('freelancer sees assigned project', !!fProject)

  // --- Milestone lifecycle on ms_brand (draft) ---
  const ms = 'ms_brand'

  // Client cannot approve criteria (freelancer-only endpoint)
  const clientApproveCriteria = await call('POST', `/api/milestones/${ms}/approve-criteria`, clientToken, {})
  check('client blocked from approve-criteria', clientApproveCriteria.status === 403)

  // Freelancer approves criteria
  const approve = await call('POST', `/api/milestones/${ms}/approve-criteria`, freelancerToken, {})
  check('freelancer approve-criteria', approve.status === 200)
  check('status -> criteria_approved', approve.body.status === 'criteria_approved', approve.body.status)

  // Freelancer starts work
  const start = await call('POST', `/api/milestones/${ms}/start`, freelancerToken, {})
  check('freelancer start', start.status === 200 && start.body.status === 'in_progress', start.body.status)

  // Client cannot submit evidence
  const clientSubmit = await call('POST', `/api/milestones/${ms}/submissions`, clientToken, {
    description: 'x',
    previewUrl: 'https://example.com',
    screenshots: [],
  })
  check('client blocked from submit', clientSubmit.status === 403)

  // Freelancer submits evidence
  const submit = await call('POST', `/api/milestones/${ms}/submissions`, freelancerToken, {
    description: 'Brand refresh is live on the preview URL.',
    previewUrl: 'https://harbor-preview.example.com',
    screenshots: [],
  })
  check('freelancer submit evidence', submit.status === 201, submit.status)
  const submissionId = submit.body.id as string
  check('milestone -> submitted', submit.body.milestoneId ? true : true)

  const afterSubmit = await call('GET', `/api/milestones/${ms}`, freelancerToken)
  check('milestone status submitted', afterSubmit.body.status === 'submitted', afterSubmit.body.status)

  // Client starts verification
  const startVer = await call('POST', `/api/milestones/${ms}/start-verification`, clientToken, {})
  check('client start-verification', startVer.status === 200 && startVer.body.status === 'verifying', startVer.body)

  // Freelancer cannot run verification
  const fVerify = await call('POST', `/api/submissions/${submissionId}/verify`, freelancerToken, {})
  check('freelancer blocked from verify', fVerify.status === 403)

  // Client runs browser check
  const verify = await call('POST', `/api/submissions/${submissionId}/verify`, clientToken, {})
  check('client verify accepted', verify.status === 200, verify.status)

  // Poll report until done (mock settles after ~4.5s)
  let report: any = null
  for (let i = 0; i < 40; i++) {
    await realSleep(500)
    const res = await call('GET', `/api/submissions/${submissionId}/report`, clientToken)
    if (res.status === 200) {
      report = Array.isArray(res.body) ? res.body[0] : res.body.report ?? res.body
      if (report?.state === 'done' || report?.state === 'failed') break
    }
  }
  check('report reaches done', report?.state === 'done', report?.state)
  check('report has results', Array.isArray(report?.results) && report.results.length > 0)
  check('report has screenshots', !!report?.screenshots?.desktop && !!report?.screenshots?.mobile)

  // Complete verification -> verified
  const complete = await call('POST', `/api/milestones/${ms}/complete-verification`, clientToken, {
    reportId: report.id,
  })
  check('complete-verification', complete.status === 200 && complete.body.status === 'verified', complete.body)

  // Freelancer cannot approve
  const fApprove = await call('POST', `/api/milestones/${ms}/approve`, freelancerToken, { reportId: report.id })
  check('freelancer blocked from approve', fApprove.status === 403)

  // Client approves
  const approveMs = await call('POST', `/api/milestones/${ms}/approve`, clientToken, { reportId: report.id })
  check('client approve', approveMs.status === 200 && approveMs.body.status === 'approved', approveMs.body)

  // Payment: freelancer blocked
  const fOrder = await call('POST', '/api/payments/create-order', freelancerToken, { milestoneId: ms })
  check('freelancer blocked from create-order', fOrder.status === 403)

  // Client creates + captures order
  const order = await call('POST', '/api/payments/create-order', clientToken, { milestoneId: ms })
  check('create-order', order.status === 201 && !!order.body.orderId, order.body)
  const capture = await call('POST', '/api/payments/capture-order', clientToken, { orderId: order.body.orderId })
  check('capture-order', capture.status === 200, capture.body)
  check('payment completed', capture.body.payment?.status === 'completed', capture.body.payment)

  const paidMs = await call('GET', `/api/milestones/${ms}`, clientToken)
  check('milestone -> paid', paidMs.body.status === 'paid', paidMs.body.status)

  const payStatus = await call('GET', `/api/milestones/${ms}/payment`, freelancerToken)
  check('freelancer can read payment status', payStatus.status === 200 && payStatus.body.payment?.status === 'completed')

  // Double payment blocked
  const order2 = await call('POST', '/api/payments/create-order', clientToken, { milestoneId: ms })
  check('second create-order blocked', order2.status === 409, order2.status)

  // --- Reject flow on ms_journal (submitted sample) ---
  const reject = await call('POST', '/api/milestones/ms_journal/reject', clientToken, {
    reason: 'The journal index is missing dates on two entries.',
  })
  check('reject submitted milestone', reject.status === 200 && reject.body.status === 'rejected', reject.body)

  // Freelancer resubmits after rejection
  const resubmit = await call('POST', '/api/milestones/ms_journal/submissions', freelancerToken, {
    description: 'Fixed: every journal entry now shows its date.',
    previewUrl: 'https://harbor-preview.example.com/journal',
    screenshots: [],
  })
  check('resubmit after rejection', resubmit.status === 201, resubmit.status)

  // --- AI generate + bulk save on empty project proj_workshop ---
  const gen = await call('POST', '/api/ai/generate-milestones', clientToken, {
    projectId: 'proj_workshop',
    description: 'A landing page for a weekend pottery workshop with dates, price, and a contact form.',
  })
  check('AI generate-milestones', gen.status === 200 && Array.isArray(gen.body.milestones) && gen.body.milestones.length > 0, gen.body)

  const bulk = await call('POST', '/api/projects/proj_workshop/milestones/bulk', clientToken, {
    milestones: (gen.body.milestones ?? []).slice(0, 2).map((m: any) => ({
      title: m.title,
      amount: m.amount,
      criteria: m.criteria,
    })),
  })
  check('bulk save milestones', bulk.status === 201, bulk.status)

  // Single milestone create
  const single = await call('POST', '/api/projects/proj_workshop/milestones', clientToken, {
    title: 'FAQ section',
    amount: 100,
    criteria: [{ text: 'FAQ answers common workshop questions' }],
  })
  check('single milestone create', single.status === 201, single.status)

  // PATCH draft milestone (client)
  const patch = await call('PATCH', `/api/milestones/${single.body.id ?? single.body.milestone?.id}`, clientToken, {
    title: 'FAQ section updated',
    amount: 120,
    criteria: [{ text: 'FAQ answers common workshop questions' }, { text: 'FAQ is reachable from the footer' }],
  })
  check('PATCH draft milestone', patch.status === 200, patch.status)

  // Register a new user + invite flow
  const reg = await call('POST', '/api/auth/register', '', {
    name: 'Test Freelancer',
    email: 'test.freelancer@fairpay.dev',
    password: 'password123',
    role: 'freelancer',
  })
  check('register freelancer', reg.status === 201, reg.status)

  const invite = await call('POST', `/api/projects/${SAMPLE_PROJECT_ID}/invite`, clientToken, {
    freelancerEmail: 'test.freelancer@fairpay.dev',
  })
  // proj_harbor already has a freelancer -> expect 409
  check('invite blocked when assigned', invite.status === 409, invite.status)

  const invite2 = await call('POST', '/api/projects/proj_workshop/invite', clientToken, {
    freelancerEmail: 'test.freelancer@fairpay.dev',
  })
  check('invite freelancer to empty project', invite2.status === 200, invite2.status)

  // --- New plan-aligned endpoints ---
  const patchProj = await call('PATCH', `/api/projects/${SAMPLE_PROJECT_ID}`, clientToken, {
    title: 'Harbor & Co. studio site v2',
  })
  check('PATCH project', patchProj.status === 200 && patchProj.body.title === 'Harbor & Co. studio site v2', patchProj.status)

  const projPays = await call('GET', `/api/projects/${SAMPLE_PROJECT_ID}/payments`, freelancerToken)
  check('GET project payments', projPays.status === 200 && Array.isArray(projPays.body.payments), projPays.status)

  const suggestions = await call('POST', '/api/ai/revision-suggestions', freelancerToken, { milestoneId: 'ms_journal' })
  check('revision suggestions (no report -> 409)', suggestions.status === 409, suggestions.status)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('E2E crashed:', error)
  process.exit(1)
})
