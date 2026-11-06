import { previewUrlError, screenshotError } from './format'
import { SAMPLE_CLIENT, SAMPLE_FREELANCER, SAMPLE_PASSWORD, SAMPLE_PROJECT_ID } from './sample'
import type {
  Criterion,
  Milestone,
  MilestoneSuggestion,
  Payment,
  Project,
  Report,
  Submission,
  User,
} from './types'

type MockUser = User & { password: string }

type StoredReport = Report & { readyAt?: string }

type Db = {
  users: MockUser[]
  projects: Project[]
  milestones: Milestone[]
  submissions: Submission[]
  reports: StoredReport[]
  payments: Payment[]
}

const STORAGE_KEY = 'fairpay.mock.v1'

function emptyDb(): Db {
  return { users: [], projects: [], milestones: [], submissions: [], reports: [], payments: [] }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    const parsed = JSON.parse(raw) as Db
    return {
      users: parsed.users ?? [],
      projects: parsed.projects ?? [],
      milestones: parsed.milestones ?? [],
      submissions: parsed.submissions ?? [],
      reports: parsed.reports ?? [],
      payments: parsed.payments ?? [],
    }
  } catch {
    return emptyDb()
  }
}

function save(db: Db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function now() {
  return new Date().toISOString()
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function publicUser(user: MockUser): User {
  return { id: user.id, name: user.name, email: user.email, role: user.role }
}

function cents(amount: number) {
  return Math.round(amount * 100)
}

function recalc(db: Db, projectId: string) {
  const project = db.projects.find((item) => item.id === projectId)
  if (!project) return
  const total = db.milestones
    .filter((item) => item.projectId === projectId)
    .reduce((sum, item) => sum + cents(item.amount), 0)
  project.totalAmount = total / 100
  project.milestones = db.milestones.filter((item) => item.projectId === projectId)
}

function projectView(db: Db, project: Project): Project {
  return {
    ...project,
    totalAmount: project.totalAmount,
    milestones: db.milestones.filter((item) => item.projectId === project.id),
  }
}

type Result = { status: number; body: unknown }

function fail(status: number, code: string, message: string, details: unknown[] = []): Result {
  return { status, body: { error: { code, message, details } } }
}

function userFromToken(db: Db, token: string | null) {
  if (!token?.startsWith('mock.')) return null
  const userId = token.slice(5)
  return db.users.find((user) => user.id === userId) ?? null
}

function requireUser(db: Db, token: string | null): MockUser | Result {
  const user = userFromToken(db, token)
  if (!user) return fail(401, 'UNAUTHORIZED', 'Your session has ended. Please log in again.')
  return user
}

function isResult(value: MockUser | Result): value is Result {
  return 'status' in value && 'body' in value
}

function projectForMilestone(db: Db, milestoneId: string) {
  const milestone = db.milestones.find((item) => item.id === milestoneId)
  if (!milestone) return null
  const project = db.projects.find((item) => item.id === milestone.projectId)
  if (!project) return null
  return { milestone, project }
}

function isParticipant(user: MockUser, project: Project) {
  return project.clientId === user.id || project.freelancerId === user.id
}

function latestSubmission(db: Db, milestoneId: string) {
  return db.submissions
    .filter((item) => item.milestoneId === milestoneId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

function frame(label: string, wide: boolean) {
  const width = wide ? 960 : 390
  const height = wide ? 560 : 720
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#f6f1e7"/>
    <rect width="100%" height="42" fill="#16362a"/>
    <circle cx="22" cy="21" r="5" fill="#c9897a"/>
    <circle cx="40" cy="21" r="5" fill="#e2b56a"/>
    <circle cx="58" cy="21" r="5" fill="#8fbf9f"/>
    <text x="78" y="26" fill="#f6f1e7" font-family="Georgia, serif" font-size="14">${label}</text>
    <text x="36" y="120" fill="#1b1914" font-family="Georgia, serif" font-size="${wide ? 42 : 32}">Harbor &amp; Co.</text>
    <text x="36" y="158" fill="#6b645a" font-family="Outfit, sans-serif" font-size="16">Clay, light, and a quiet homepage.</text>
    <rect x="36" y="196" width="${wide ? 280 : 240}" height="180" rx="12" fill="#e7dcc8"/>
    <rect x="${wide ? 340 : 36}" y="${wide ? 196 : 396}" width="${wide ? 250 : 240}" height="16" rx="8" fill="#d9cbb4"/>
    <rect x="${wide ? 340 : 36}" y="${wide ? 226 : 424}" width="${wide ? 180 : 160}" height="16" rx="8" fill="#efe4d2"/>
  </svg>`
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function buildResults(milestone: Milestone): Report['results'] {
  return milestone.criteria.map((criterion) => {
    const text = criterion.text.toLowerCase()
    if (/form|submit|inbox|payment|email send|logged in/.test(text)) {
      return {
        criterionId: criterion.id,
        criterion: criterion.text,
        status: 'unverified' as const,
        evidence: 'This needs an action the read-only inspector does not perform.',
        source: 'none',
      }
    }
    if (/video|animation|missing|dark mode|analytics/.test(text)) {
      return {
        criterionId: criterion.id,
        criterion: criterion.text,
        status: 'missing' as const,
        evidence: 'The public page was opened. This item was not found on the page.',
        source: 'browser',
      }
    }
    return {
      criterionId: criterion.id,
      criterion: criterion.text,
      status: 'completed' as const,
      evidence: 'The public page loaded and the inspector found content that matches this criterion.',
      source: 'browser',
    }
  })
}

function settle(db: Db) {
  for (const report of db.reports) {
    if (report.state !== 'running' || !report.readyAt) continue
    if (Date.now() < Date.parse(report.readyAt)) continue
    const found = projectForMilestone(db, latestMilestoneId(db, report.submissionId))
    if (!found) {
      report.state = 'failed'
      report.summary = 'The milestone for this submission could not be found.'
      delete report.readyAt
      continue
    }
    const results = buildResults(found.milestone)
    const completed = results.filter((item) => item.status === 'completed').length
    report.state = 'done'
    report.results = results
    report.summary = `${completed} of ${results.length} criteria completed`
    report.screenshots = { desktop: frame('Desktop', true), mobile: frame('Mobile', false) }
    delete report.readyAt
    if (found.milestone.status === 'verifying') found.milestone.status = 'verified'
  }
}

function latestMilestoneId(db: Db, submissionId: string) {
  return db.submissions.find((item) => item.id === submissionId)?.milestoneId ?? ''
}

function criteriaFrom(input: unknown): Criterion[] | Result {
  if (!Array.isArray(input) || input.length === 0) {
    return fail(400, 'VALIDATION_ERROR', 'Add at least one acceptance criterion.', [
      { field: 'criteria', message: 'At least one criterion is required.' },
    ])
  }
  const criteria: Criterion[] = []
  for (const item of input) {
    const text = typeof item === 'string' ? item : item && typeof item === 'object' && 'text' in item ? String((item as { text: unknown }).text) : ''
    const trimmed = text.trim()
    if (!trimmed) {
      return fail(400, 'VALIDATION_ERROR', 'Every criterion needs text.', [
        { field: 'criteria', message: 'Criterion text cannot be empty.' },
      ])
    }
    const existingId = item && typeof item === 'object' && 'id' in item ? String((item as { id: unknown }).id) : ''
    criteria.push({ id: existingId || id('c'), text: trimmed })
  }
  return criteria
}

function isCriteria(value: Criterion[] | Result): value is Criterion[] {
  return Array.isArray(value)
}

function moneyError(amount: unknown, field: string): Result | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return fail(400, 'VALIDATION_ERROR', 'Enter an amount greater than zero.', [
      { field, message: 'Amount must be a number greater than zero.' },
    ])
  }
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    return fail(400, 'VALIDATION_ERROR', 'Use at most two decimal places.', [
      { field, message: 'Amount supports up to 2 decimals.' },
    ])
  }
  return null
}

function splitBudget(total: number, parts: number) {
  const totalCents = cents(total)
  const base = Math.floor(totalCents / parts)
  const amounts = Array.from({ length: parts }, () => base)
  amounts[parts - 1] += totalCents - base * parts
  return amounts.map((value) => value / 100)
}

function suggestionsFor(description: string, totalBudget: number): MilestoneSuggestion[] {
  const [first, second, third] = splitBudget(totalBudget, 3)
  const topic = description.trim().replace(/\s+/g, ' ').slice(0, 80)
  return [
    {
      title: 'Structure and first screen',
      amount: first,
      criteria: [
        `The public page loads over HTTPS and shows a visible heading about: ${topic}`,
        'The layout can be read on a 390px wide screen without horizontal scrolling',
      ],
    },
    {
      title: 'Main content',
      amount: second,
      criteria: [
        'The primary sections described in the project are present and readable',
        'Images or work samples have visible text alternatives or captions',
      ],
    },
    {
      title: 'Contact and handoff',
      amount: third,
      criteria: [
        'A contact form is visible with name, email, and message fields',
        'The freelancer shares the final public URL in the evidence description',
      ],
    },
  ]
}

export function ensureSample() {
  const db = load()
  if (!db.users.some((user) => user.id === SAMPLE_CLIENT.id)) {
    db.users.push({ ...SAMPLE_CLIENT, password: SAMPLE_PASSWORD })
  }
  if (!db.users.some((user) => user.id === SAMPLE_FREELANCER.id)) {
    db.users.push({ ...SAMPLE_FREELANCER, password: SAMPLE_PASSWORD })
  }
  if (db.projects.some((project) => project.id === SAMPLE_PROJECT_ID)) {
    save(db)
    return
  }

  const createdAt = '2026-11-01T09:30:00.000Z'
  db.projects.push({
    id: SAMPLE_PROJECT_ID,
    title: 'Harbor & Co. studio site',
    description:
      'A public marketing site for a ceramic studio: homepage, gallery, journal, and contact. The preview must be on a public HTTPS address.',
    currency: 'USD',
    clientId: SAMPLE_CLIENT.id,
    freelancerId: SAMPLE_FREELANCER.id,
    totalAmount: 0,
    milestones: [],
    createdAt,
  })
  db.projects.push({
    id: 'proj_workshop',
    title: 'Saturday workshop page',
    description: 'One landing page for a weekend throwing workshop. Dates, price, and a way to ask a question.',
    currency: 'USD',
    clientId: SAMPLE_CLIENT.id,
    freelancerId: null,
    totalAmount: 0,
    milestones: [],
    createdAt: '2026-11-03T15:10:00.000Z',
  })

  const add = (milestone: Milestone, extra?: { submission?: Submission; report?: StoredReport; payment?: Payment }) => {
    db.milestones.push(milestone)
    if (extra?.submission) db.submissions.push(extra.submission)
    if (extra?.report) db.reports.push(extra.report)
    if (extra?.payment) db.payments.push(extra.payment)
  }

  add({
    id: 'ms_brand',
    projectId: SAMPLE_PROJECT_ID,
    title: 'Brand and type on the homepage',
    amount: 300,
    currency: 'USD',
    status: 'draft',
    criteria: [
      { id: 'c_brand_1', text: 'The homepage shows the studio name Harbor & Co. in the hero' },
      { id: 'c_brand_2', text: 'Body text uses a single readable type family' },
    ],
  })

  add({
    id: 'ms_home',
    projectId: SAMPLE_PROJECT_ID,
    title: 'Responsive homepage',
    amount: 450,
    currency: 'USD',
    status: 'criteria_approved',
    criteria: [
      { id: 'c_home_1', text: 'Homepage loads over HTTPS with a visible hero heading' },
      { id: 'c_home_2', text: 'Navigation includes Work, Journal, and Contact' },
      { id: 'c_home_3', text: 'The hero remains readable at a 390px width' },
    ],
  })

  add({
    id: 'ms_gallery',
    projectId: SAMPLE_PROJECT_ID,
    title: 'Project gallery',
    amount: 250,
    currency: 'USD',
    status: 'in_progress',
    criteria: [
      { id: 'c_gal_1', text: 'At least six work images are visible without signing in' },
      { id: 'c_gal_2', text: 'Each image has a caption with the piece name' },
    ],
  })

  const submitted = submission('ms_journal', 'Journal index is up on the preview. Three entries are linked from the homepage.', 'https://harbor-preview.example.com/journal', '2026-11-03T11:00:00.000Z')
  add(
    {
      id: 'ms_journal',
      projectId: SAMPLE_PROJECT_ID,
      title: 'Journal index',
      amount: 300,
      currency: 'USD',
      status: 'submitted',
      criteria: [
        { id: 'c_j_1', text: 'A journal index lists at least three entries' },
        { id: 'c_j_2', text: 'Each entry shows a title and a date' },
      ],
    },
    { submission: submitted },
  )

  const caseSubmission = submission(
    'ms_case',
    'Case study template is on the preview, including the bowl series.',
    'https://harbor-preview.example.com/work/bowl-series',
    '2026-11-02T16:20:00.000Z',
  )
  add(
    {
      id: 'ms_case',
      projectId: SAMPLE_PROJECT_ID,
      title: 'Case study template',
      amount: 400,
      currency: 'USD',
      status: 'verified',
      criteria: [
        { id: 'c_case_1', text: 'Homepage loads over HTTPS with a visible hero heading' },
        { id: 'c_case_2', text: 'The case study shows the piece title and a short story' },
        { id: 'c_case_3', text: 'A contact form submits a message to the studio inbox' },
        { id: 'c_case_4', text: 'The page includes a looping background video' },
      ],
    },
    {
      submission: caseSubmission,
      report: {
        id: 'rep_case',
        submissionId: caseSubmission.id,
        state: 'done',
        summary: '2 of 4 criteria completed',
        results: [
          {
            criterionId: 'c_case_1',
            criterion: 'Homepage loads over HTTPS with a visible hero heading',
            status: 'completed',
            evidence: "Page loaded over HTTPS. Heading 'Harbor & Co.' found at the top.",
            source: 'browser',
          },
          {
            criterionId: 'c_case_2',
            criterion: 'The case study shows the piece title and a short story',
            status: 'completed',
            evidence: "Heading 'Bowl series' and two paragraphs of story text were visible.",
            source: 'browser',
          },
          {
            criterionId: 'c_case_3',
            criterion: 'A contact form submits a message to the studio inbox',
            status: 'unverified',
            evidence: 'Form submission is not checked by the read-only inspector.',
            source: 'none',
          },
          {
            criterionId: 'c_case_4',
            criterion: 'The page includes a looping background video',
            status: 'missing',
            evidence: 'The page was opened on desktop and mobile. No video element was found.',
            source: 'browser',
          },
        ],
        screenshots: { desktop: frame('Desktop', true), mobile: frame('Mobile', false) },
        createdAt: '2026-11-02T16:24:00.000Z',
      },
    },
  )

  const contactSubmission = submission('ms_contact', 'Contact page is live with the fields we agreed.', 'https://harbor-preview.example.com/contact', '2026-11-02T18:00:00.000Z')
  add(
    {
      id: 'ms_contact',
      projectId: SAMPLE_PROJECT_ID,
      title: 'Contact page',
      amount: 350,
      currency: 'USD',
      status: 'approved',
      criteria: [
        { id: 'c_ct_1', text: 'Contact page shows name, email, and message fields' },
        { id: 'c_ct_2', text: 'The studio address is visible as text' },
      ],
    },
    {
      submission: contactSubmission,
      report: doneReport('rep_contact', contactSubmission.id, [
        ['c_ct_1', 'Contact page shows name, email, and message fields', 'completed', 'Name, email, and message fields are visible.', 'browser'],
        ['c_ct_2', 'The studio address is visible as text', 'completed', 'The address line is visible under the form.', 'browser'],
      ], '2026-11-02T18:06:00.000Z'),
    },
  )

  const launchSubmission = submission('ms_launch', 'Launch checklist pages are public.', 'https://harbor-preview.example.com/', '2026-10-28T12:00:00.000Z')
  add(
    {
      id: 'ms_launch',
      projectId: SAMPLE_PROJECT_ID,
      title: 'Launch checklist',
      amount: 250,
      currency: 'USD',
      status: 'paid',
      criteria: [{ id: 'c_ln_1', text: 'The homepage returns a successful HTTPS response' }],
    },
    {
      submission: launchSubmission,
      report: doneReport('rep_launch', launchSubmission.id, [
        ['c_ln_1', 'The homepage returns a successful HTTPS response', 'completed', 'The homepage loaded over HTTPS.', 'browser'],
      ], '2026-10-28T12:10:00.000Z'),
      payment: {
        id: 'pay_launch',
        milestoneId: 'ms_launch',
        orderId: 'ORDER-HARBOR-LAUNCH',
        captureId: 'CAP-HARBOR-LAUNCH',
        status: 'completed',
        amount: 250,
        currency: 'USD',
        paidAt: '2026-10-28T12:16:00.000Z',
      },
    },
  )

  const newsSubmission = submission('ms_news', 'Newsletter block added under the journal.', 'https://harbor-preview.example.com/journal', '2026-11-03T09:40:00.000Z')
  add(
    {
      id: 'ms_news',
      projectId: SAMPLE_PROJECT_ID,
      title: 'Newsletter block',
      amount: 200,
      currency: 'USD',
      status: 'rejected',
      rejectionReason: 'The email field is a static placeholder, so the acceptance criteria are not met. Please resubmit with a working field.',
      criteria: [
        { id: 'c_nw_1', text: 'A newsletter field is visible on the journal page' },
        { id: 'c_nw_2', text: 'The field accepts an email address' },
      ],
    },
    {
      submission: newsSubmission,
      report: doneReport('rep_news', newsSubmission.id, [
        ['c_nw_1', 'A newsletter field is visible on the journal page', 'completed', 'An email field is visible at the bottom of the journal.', 'browser'],
        ['c_nw_2', 'The field accepts an email address', 'unverified', 'Typing into the field is not checked by the read-only inspector.', 'none'],
      ], '2026-11-03T09:44:00.000Z'),
    },
  )

  const analyticsSubmission = submission('ms_analytics', 'Privacy note and footer links are on the preview.', 'https://harbor-preview.example.com/privacy', '2026-11-01T10:12:00.000Z')
  add(
    {
      id: 'ms_analytics',
      projectId: SAMPLE_PROJECT_ID,
      title: 'Privacy note',
      amount: 200,
      currency: 'USD',
      status: 'payment_failed',
      criteria: [{ id: 'c_an_1', text: 'A privacy note is linked from the footer' }],
    },
    {
      submission: analyticsSubmission,
      report: doneReport('rep_analytics', analyticsSubmission.id, [
        ['c_an_1', 'A privacy note is linked from the footer', 'completed', 'A Privacy link in the footer opens a note.', 'browser'],
      ], '2026-11-01T10:20:00.000Z'),
      payment: {
        id: 'pay_analytics',
        milestoneId: 'ms_analytics',
        orderId: 'ORDER-HARBOR-PRIVACY',
        captureId: '',
        status: 'failed',
        amount: 200,
        currency: 'USD',
        paidAt: null,
      },
    },
  )

  recalc(db, SAMPLE_PROJECT_ID)
  recalc(db, 'proj_workshop')
  save(db)
}

function submission(milestoneId: string, description: string, previewUrl: string, createdAt: string): Submission {
  return {
    id: `sub_${milestoneId}`,
    milestoneId,
    description,
    previewUrl,
    screenshots: [],
    createdAt,
  }
}

function doneReport(
  idValue: string,
  submissionId: string,
  rows: Array<[string, string, 'completed' | 'missing' | 'unverified', string, string]>,
  createdAt: string,
): StoredReport {
  const completed = rows.filter((row) => row[2] === 'completed').length
  return {
    id: idValue,
    submissionId,
    state: 'done',
    summary: `${completed} of ${rows.length} criteria completed`,
    results: rows.map(([criterionId, criterion, status, evidence, source]) => ({
      criterionId,
      criterion,
      status,
      evidence,
      source,
    })),
    screenshots: { desktop: frame('Desktop', true), mobile: frame('Mobile', false) },
    createdAt,
  }
}

function readBody(body: unknown) {
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

export async function mockRequest(method: string, rawPath: string, body: unknown, token: string | null): Promise<Result> {
  const path = rawPath.split('?')[0]
  const verb = method.toUpperCase()
  if (path === '/api/ai/generate-milestones') await sleep(1600)
  else await sleep(180)

  const db = load()
  settle(db)
  save(db)

  if (verb === 'GET' && path === '/health') return { status: 200, body: { status: 'ok' } }

  if (verb === 'POST' && path === '/api/auth/register') {
    const data = readBody(body)
    const name = String(data.name ?? '').trim()
    const email = String(data.email ?? '').trim().toLowerCase()
    const password = String(data.password ?? '')
    const role = (data.role as 'client' | 'freelancer') || 'client'
    const details = []
    if (!name) details.push({ field: 'name', message: 'Name is required.' })
    if (!email || !email.includes('@')) details.push({ field: 'email', message: 'Enter a valid email.' })
    if (password.length < 8) details.push({ field: 'password', message: 'Password must be at least 8 characters.' })
    if (role !== 'client' && role !== 'freelancer') details.push({ field: 'role', message: 'Choose client or freelancer.' })
    if (details.length) return fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', details)
    if (db.users.some((user) => user.email === email)) {
      return fail(409, 'EMAIL_TAKEN', 'An account with this email already exists.')
    }
    const user: MockUser = { id: id('user'), name, email, password, role }
    db.users.push(user)
    save(db)
    return { status: 201, body: { user: publicUser(user), token: `mock.${user.id}` } }
  }

  if (verb === 'POST' && path === '/api/auth/login') {
    const data = readBody(body)
    const email = String(data.email ?? '').trim().toLowerCase()
    const password = String(data.password ?? '')
    const user = db.users.find((item) => item.email === email && item.password === password)
    if (!user) return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
    return { status: 200, body: { user: publicUser(user), token: `mock.${user.id}` } }
  }

  if (verb === 'GET' && path === '/api/auth/me') {
    const user = requireUser(db, token)
    if (isResult(user)) return user
    return { status: 200, body: { user: publicUser(user) } }
  }

  const auth = requireUser(db, token)
  if (path.startsWith('/api/') && isResult(auth)) return auth
  if (isResult(auth)) return fail(404, 'NOT_FOUND', 'That page does not exist.')
  const user = auth

  if (verb === 'POST' && path === '/api/projects') {
    if (user.role !== 'client') return fail(403, 'FORBIDDEN', 'Only a client can create a project.')
    const data = readBody(body)
    const title = String(data.title ?? '').trim()
    const description = String(data.description ?? '').trim()
    const currency = String(data.currency ?? '').trim().toUpperCase()
    const details = []
    if (!title) details.push({ field: 'title', message: 'Title is required.' })
    if (!description) details.push({ field: 'description', message: 'Description is required.' })
    if (!/^[A-Z]{3}$/.test(currency)) details.push({ field: 'currency', message: 'Use a 3-letter currency code.' })
    if (details.length) return fail(400, 'VALIDATION_ERROR', 'Check the highlighted fields.', details)
    const project: Project = {
      id: id('proj'),
      title,
      description,
      currency,
      clientId: user.id,
      freelancerId: null,
      totalAmount: 0,
      milestones: [],
      createdAt: now(),
    }
    db.projects.unshift(project)
    save(db)
    return { status: 201, body: project }
  }

  if (verb === 'GET' && path === '/api/projects') {
    const projects = db.projects
      .filter((project) => (user.role === 'client' ? project.clientId === user.id : project.freelancerId === user.id))
      .map((project) => projectView(db, project))
    return { status: 200, body: projects }
  }

  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/)
  if (verb === 'GET' && projectMatch) {
    const project = db.projects.find((item) => item.id === projectMatch[1])
    if (!project) return fail(404, 'NOT_FOUND', 'Project not found.')
    if (!isParticipant(user, project)) return fail(403, 'FORBIDDEN', 'You do not have access to this project.')
    return { status: 200, body: projectView(db, project) }
  }

  const inviteMatch = path.match(/^\/api\/projects\/([^/]+)\/invite$/)
  if (verb === 'POST' && inviteMatch) {
    const project = db.projects.find((item) => item.id === inviteMatch[1])
    if (!project) return fail(404, 'NOT_FOUND', 'Project not found.')
    if (project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client who created this project can invite a freelancer.')
    const email = String(readBody(body).freelancerEmail ?? '').trim().toLowerCase()
    if (!email) return fail(400, 'VALIDATION_ERROR', 'Enter the freelancer email.', [{ field: 'freelancerEmail', message: 'Email is required.' }])
    const freelancer = db.users.find((item) => item.email === email)
    if (!freelancer || freelancer.role !== 'freelancer') {
      return fail(404, 'NOT_FOUND', 'No freelancer account uses that email.')
    }
    if (project.freelancerId && project.freelancerId !== freelancer.id) {
      return fail(409, 'ALREADY_ASSIGNED', 'This project already has a freelancer.')
    }
    project.freelancerId = freelancer.id
    save(db)
    return { status: 200, body: projectView(db, project) }
  }

  const createMilestone = path.match(/^\/api\/projects\/([^/]+)\/milestones$/)
  if (verb === 'POST' && createMilestone) {
    const project = db.projects.find((item) => item.id === createMilestone[1])
    if (!project) return fail(404, 'NOT_FOUND', 'Project not found.')
    if (project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client can add milestones.')
    const data = readBody(body)
    const title = String(data.title ?? '').trim()
    if (!title) return fail(400, 'VALIDATION_ERROR', 'Give the milestone a title.', [{ field: 'title', message: 'Title is required.' }])
    const amountError = moneyError(data.amount, 'amount')
    if (amountError) return amountError
    const criteria = criteriaFrom(data.criteria)
    if (!isCriteria(criteria)) return criteria
    const milestone: Milestone = {
      id: id('ms'),
      projectId: project.id,
      title,
      amount: data.amount as number,
      currency: project.currency,
      status: 'draft',
      criteria,
    }
    db.milestones.push(milestone)
    recalc(db, project.id)
    save(db)
    return { status: 201, body: milestone }
  }

  if (verb === 'POST' && path === '/api/ai/generate-milestones') {
    if (user.role !== 'client') return fail(403, 'FORBIDDEN', 'Only a client can ask for milestone suggestions.')
    const data = readBody(body)
    const project = db.projects.find((item) => item.id === data.projectId)
    if (!project) return fail(404, 'NOT_FOUND', 'Project not found.')
    if (project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'You can only generate milestones for your own project.')
    const description = String(data.description ?? '').trim()
    const currency = String(data.currency ?? '').trim().toUpperCase()
    const details = []
    if (!description) details.push({ field: 'description', message: 'Describe the work first.' })
    const amountError = moneyError(data.totalBudget, 'totalBudget')
    if (!amountError && currency !== project.currency) {
      details.push({ field: 'currency', message: 'Use the project currency.' })
    }
    if (details.length) return fail(400, 'VALIDATION_ERROR', 'Check the suggestion form.', details)
    if (amountError) return amountError
    return {
      status: 200,
      body: { milestones: suggestionsFor(description, data.totalBudget as number) },
    }
  }

  const milestoneMatch = path.match(/^\/api\/milestones\/([^/]+)$/)
  if (milestoneMatch && verb === 'GET') {
    const found = projectForMilestone(db, milestoneMatch[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (!isParticipant(user, found.project)) return fail(403, 'FORBIDDEN', 'You do not have access to this milestone.')
    return { status: 200, body: found.milestone }
  }

  if (milestoneMatch && verb === 'PATCH') {
    const found = projectForMilestone(db, milestoneMatch[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (found.project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client can edit this milestone.')
    if (found.milestone.status !== 'draft') {
      return fail(409, 'INVALID_STATUS', 'Criteria can only be edited while the milestone is a draft.')
    }
    const data = readBody(body)
    if ('title' in data) {
      const title = String(data.title ?? '').trim()
      if (!title) return fail(400, 'VALIDATION_ERROR', 'Give the milestone a title.', [{ field: 'title', message: 'Title is required.' }])
      found.milestone.title = title
    }
    if ('amount' in data) {
      const amountError = moneyError(data.amount, 'amount')
      if (amountError) return amountError
      found.milestone.amount = data.amount as number
    }
    if ('criteria' in data) {
      const criteria = criteriaFrom(data.criteria)
      if (!isCriteria(criteria)) return criteria
      found.milestone.criteria = criteria
    }
    recalc(db, found.project.id)
    save(db)
    return { status: 200, body: found.milestone }
  }

  const approveCriteria = path.match(/^\/api\/milestones\/([^/]+)\/approve-criteria$/)
  if (verb === 'POST' && approveCriteria) {
    const found = projectForMilestone(db, approveCriteria[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (found.project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client can approve criteria.')
    if (found.milestone.status !== 'draft') return fail(409, 'INVALID_STATUS', 'Criteria are already approved.')
    if (found.milestone.criteria.length === 0) {
      return fail(400, 'VALIDATION_ERROR', 'Add at least one criterion before approving.')
    }
    found.milestone.status = 'criteria_approved'
    save(db)
    return { status: 200, body: found.milestone }
  }

  const submissionList = path.match(/^\/api\/milestones\/([^/]+)\/submissions$/)
  if (submissionList && verb === 'GET') {
    const found = projectForMilestone(db, submissionList[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (!isParticipant(user, found.project)) return fail(403, 'FORBIDDEN', 'You do not have access to these submissions.')
    const submissions = db.submissions
      .filter((item) => item.milestoneId === found.milestone.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { status: 200, body: submissions }
  }

  if (submissionList && verb === 'POST') {
    const found = projectForMilestone(db, submissionList[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (user.role !== 'freelancer' || found.project.freelancerId !== user.id) {
      return fail(403, 'FORBIDDEN', 'Only the assigned freelancer can submit evidence.')
    }
    const allowed = found.milestone.status === 'criteria_approved' || found.milestone.status === 'in_progress' || found.milestone.status === 'rejected'
    if (!allowed) return fail(409, 'INVALID_STATUS', 'Evidence cannot be submitted in the current status.')
    const data = readBody(body)
    const description = String(data.description ?? '').trim()
    const previewUrl = String(data.previewUrl ?? '').trim()
    const details = []
    if (!description) details.push({ field: 'description', message: 'Describe what you delivered.' })
    const urlProblem = previewUrlError(previewUrl)
    if (urlProblem) details.push({ field: 'previewUrl', message: urlProblem })
    const screenshots = Array.isArray(data.screenshots) ? data.screenshots.map((item) => String(item).trim()).filter(Boolean) : []
    screenshots.forEach((shot, index) => {
      const problem = screenshotError(shot)
      if (problem) details.push({ field: `screenshots.${index}`, message: problem })
    })
    if (details.length) {
      return fail(400, urlProblem ? 'UNSAFE_URL' : 'VALIDATION_ERROR', urlProblem || 'Check the evidence form.', details)
    }
    const created: Submission = {
      id: id('sub'),
      milestoneId: found.milestone.id,
      description,
      previewUrl,
      screenshots,
      createdAt: now(),
    }
    db.submissions.unshift(created)
    found.milestone.status = 'submitted'
    save(db)
    return { status: 201, body: created }
  }

  const verifyMatch = path.match(/^\/api\/submissions\/([^/]+)\/verify$/)
  if (verb === 'POST' && verifyMatch) {
    const submissionRow = db.submissions.find((item) => item.id === verifyMatch[1])
    if (!submissionRow) return fail(404, 'NOT_FOUND', 'Submission not found.')
    const found = projectForMilestone(db, submissionRow.milestoneId)
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (!isParticipant(user, found.project)) return fail(403, 'FORBIDDEN', 'Only people on this project can start verification.')
    if (found.milestone.status !== 'submitted' && found.milestone.status !== 'verifying') {
      return fail(409, 'INVALID_STATUS', 'Verification starts after evidence is submitted.')
    }
    const existing = db.reports.find((item) => item.submissionId === submissionRow.id && item.state === 'running')
    if (existing) return { status: 200, body: { state: 'running', submissionId: submissionRow.id } }
    db.reports = db.reports.filter((item) => item.submissionId !== submissionRow.id)
    db.reports.push({
      id: id('rep'),
      submissionId: submissionRow.id,
      state: 'running',
      summary: 'Verification is still running.',
      results: [],
      screenshots: { desktop: '', mobile: '' },
      createdAt: now(),
      readyAt: new Date(Date.now() + 4500).toISOString(),
    })
    found.milestone.status = 'verifying'
    save(db)
    return { status: 200, body: { state: 'running', submissionId: submissionRow.id } }
  }

  const reportMatch = path.match(/^\/api\/submissions\/([^/]+)\/report$/)
  if (verb === 'GET' && reportMatch) {
    const submissionRow = db.submissions.find((item) => item.id === reportMatch[1])
    if (!submissionRow) return fail(404, 'NOT_FOUND', 'Submission not found.')
    const found = projectForMilestone(db, submissionRow.milestoneId)
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (!isParticipant(user, found.project)) return fail(403, 'FORBIDDEN', 'You do not have access to this report.')
    const report = db.reports
      .filter((item) => item.submissionId === submissionRow.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    if (!report) return fail(404, 'NOT_FOUND', 'No report yet.')
    const publicReport: Report = {
      id: report.id,
      submissionId: report.submissionId,
      state: report.state,
      summary: report.summary,
      results: report.results,
      screenshots: report.screenshots,
      createdAt: report.createdAt,
    }
    return { status: 200, body: publicReport }
  }

  const approveMatch = path.match(/^\/api\/milestones\/([^/]+)\/approve$/)
  if (verb === 'POST' && approveMatch) {
    const found = projectForMilestone(db, approveMatch[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (found.project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client can approve the work.')
    if (found.milestone.status !== 'verified') return fail(409, 'INVALID_STATUS', 'Approve the work after the report is ready.')
    const reportId = String(readBody(body).reportId ?? '')
    const latest = latestSubmission(db, found.milestone.id)
    const report = latest ? db.reports.find((item) => item.submissionId === latest.id && item.state === 'done') : undefined
    if (!report || report.id !== reportId) return fail(400, 'VALIDATION_ERROR', 'Choose the current report before approving.', [{ field: 'reportId', message: 'Report id does not match the latest report.' }])
    found.milestone.status = 'approved'
    delete found.milestone.rejectionReason
    save(db)
    return { status: 200, body: found.milestone }
  }

  const rejectMatch = path.match(/^\/api\/milestones\/([^/]+)\/reject$/)
  if (verb === 'POST' && rejectMatch) {
    const found = projectForMilestone(db, rejectMatch[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (found.project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client can reject the work.')
    if (found.milestone.status !== 'verified') return fail(409, 'INVALID_STATUS', 'Reject the work after the report is ready.')
    const reason = String(readBody(body).reason ?? '').trim()
    if (!reason) return fail(400, 'VALIDATION_ERROR', 'A reason is required.', [{ field: 'reason', message: 'Tell the freelancer what to change.' }])
    found.milestone.status = 'rejected'
    found.milestone.rejectionReason = reason
    save(db)
    return { status: 200, body: found.milestone }
  }

  if (verb === 'POST' && path === '/api/payments/create-order') {
    if (user.role !== 'client') return fail(403, 'FORBIDDEN', 'Only the client can pay.')
    const milestoneId = String(readBody(body).milestoneId ?? '')
    const found = projectForMilestone(db, milestoneId)
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (found.project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'Only the client on this project can pay.')
    if (found.milestone.status !== 'approved' && found.milestone.status !== 'payment_failed') {
      return fail(409, 'INVALID_STATUS', 'Payment opens after you approve the work.')
    }
    const completed = db.payments.find((item) => item.milestoneId === milestoneId && item.status === 'completed')
    if (completed) return fail(409, 'ALREADY_PAID', 'This milestone is already paid')
    const orderId = `ORDER-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    db.payments = db.payments.filter((item) => item.milestoneId !== milestoneId || item.status === 'failed')
    db.payments.push({
      id: id('pay'),
      milestoneId,
      orderId,
      captureId: '',
      status: 'created',
      amount: found.milestone.amount,
      currency: found.milestone.currency,
      paidAt: null,
    })
    save(db)
    return { status: 201, body: { orderId, amount: found.milestone.amount, currency: found.milestone.currency } }
  }

  if (verb === 'POST' && path === '/api/payments/capture-order') {
    if (user.role !== 'client') return fail(403, 'FORBIDDEN', 'Only the client can capture a payment.')
    const orderId = String(readBody(body).orderId ?? '')
    const payment = db.payments.find((item) => item.orderId === orderId)
    if (!payment) return fail(404, 'NOT_FOUND', 'Order not found.')
    const found = projectForMilestone(db, payment.milestoneId)
    if (!found || found.project.clientId !== user.id) return fail(403, 'FORBIDDEN', 'You cannot capture this order.')
    if (payment.status === 'completed' || found.milestone.status === 'paid') {
      return fail(409, 'ALREADY_PAID', 'This milestone is already paid')
    }
    payment.status = 'completed'
    payment.captureId = `CAP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    payment.paidAt = now()
    payment.amount = found.milestone.amount
    payment.currency = found.milestone.currency
    found.milestone.status = 'paid'
    save(db)
    return { status: 200, body: { payment } }
  }

  const paymentMatch = path.match(/^\/api\/milestones\/([^/]+)\/payment$/)
  if (verb === 'GET' && paymentMatch) {
    const found = projectForMilestone(db, paymentMatch[1])
    if (!found) return fail(404, 'NOT_FOUND', 'Milestone not found.')
    if (!isParticipant(user, found.project)) return fail(403, 'FORBIDDEN', 'You do not have access to this payment.')
    const related = db.payments.filter((item) => item.milestoneId === found.milestone.id)
    const payment = related[related.length - 1]
    if (!payment) return fail(404, 'NOT_FOUND', 'No payment for this milestone.')
    return { status: 200, body: { payment } }
  }

  return fail(404, 'NOT_FOUND', 'That endpoint is not available.')
}
