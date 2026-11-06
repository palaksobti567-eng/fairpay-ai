import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Logo, ErrorNote, useTitle } from '../components/ui'
import { useAuth } from '../context/AuthProvider'
import { login as loginRequest } from '../lib/api'
import { dataMode, setDataMode } from '../lib/config'
import { readError } from '../lib/errors'
import { ensureSample } from '../lib/mock'
import { SAMPLE_CLIENT, SAMPLE_FREELANCER, SAMPLE_PASSWORD } from '../lib/sample'
import type { User } from '../lib/types'

export function LoginPage() {
  useTitle('Log in')
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem(null)
    try {
      await login(email.trim(), password)
      navigate('/')
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthFrame>
      <p className="eyebrow">Welcome back</p>
      <h1>Log in</h1>
      <p className="lede">Use the role on your account. FairPay reads it from the server.</p>
      <ErrorNote error={problem} />
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          Email
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Checking…' : 'Log in'}
        </button>
      </form>
      <p className="hint">
        New here? <Link to="/register">Create an account</Link>
      </p>
      <SampleEntry />
    </AuthFrame>
  )
}

export function RegisterPage() {
  useTitle('Create account')
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<User['role']>('client')
  const [problem, setProblem] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem(null)
    try {
      await register({ name: name.trim(), email: email.trim(), password, role })
      navigate('/')
    } catch (error) {
      setProblem(error)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthFrame>
      <p className="eyebrow">Create an account</p>
      <h1>How will you use FairPay?</h1>
      <p className="lede">Role is chosen once, here. Later requests never send it again.</p>
      <ErrorNote error={problem} />
      <form className="stack" onSubmit={onSubmit}>
        <fieldset className="choice-grid">
          <legend>Role</legend>
          <label className={role === 'client' ? 'choice on' : 'choice'}>
            <input type="radio" name="role" checked={role === 'client'} onChange={() => setRole('client')} />
            <strong>Client</strong>
            <span>Create projects, approve criteria, review reports, and pay.</span>
          </label>
          <label className={role === 'freelancer' ? 'choice on' : 'choice'}>
            <input type="radio" name="role" checked={role === 'freelancer'} onChange={() => setRole('freelancer')} />
            <strong>Freelancer</strong>
            <span>View assigned projects, submit evidence, and follow payment status.</span>
          </label>
        </fieldset>
        <label className="field">
          Name
          <input value={name} autoComplete="name" onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="field">
          Email
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="field">
          Password
          <input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          <span className="hint">At least 8 characters.</span>
        </label>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="hint">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </AuthFrame>
  )
}

function SampleEntry() {
  const { adopt } = useAuth()
  const navigate = useNavigate()
  const [pending, setPending] = useState<'client' | 'freelancer' | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const mode = dataMode()

  async function enter(role: 'client' | 'freelancer') {
    if (mode !== 'mock') {
      setDataMode('mock')
      return
    }
    setPending(role)
    setProblem(null)
    try {
      ensureSample()
      const account = role === 'client' ? SAMPLE_CLIENT : SAMPLE_FREELANCER
      const session = await loginRequest(account.email, SAMPLE_PASSWORD)
      adopt(session.user, session.token)
      navigate('/')
    } catch (error) {
      setProblem(readError(error))
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="sample">
      <p className="eyebrow">Hackathon demo</p>
      <p>Open a workspace that already has every milestone status, a verification report, and a receipt.</p>
      <div className="row wrap">
        <button type="button" className="btn secondary" disabled={pending !== null} onClick={() => void enter('client')}>
          {pending === 'client' ? 'Opening…' : `Enter as ${SAMPLE_CLIENT.name}`}
        </button>
        <button type="button" className="btn secondary" disabled={pending !== null} onClick={() => void enter('freelancer')}>
          {pending === 'freelancer' ? 'Opening…' : `Enter as ${SAMPLE_FREELANCER.name}`}
        </button>
      </div>
      <p className="hint">
        {SAMPLE_CLIENT.email} and {SAMPLE_FREELANCER.email} · password {SAMPLE_PASSWORD}
        {mode === 'live' ? ' · this switches the app to demo data' : ''}
      </p>
      <ErrorNote error={problem} />
    </div>
  )
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-story">
        <Logo />
        <div>
          <p className="eyebrow light">Agree, check, then pay</p>
          <h2>A client and a freelancer, one milestone at a time.</h2>
          <ol className="story">
            <li>Write the criteria together. AI can suggest them. It does not approve them.</li>
            <li>The freelancer submits a public preview and screenshots.</li>
            <li>A read-only browser and the model write a report. Unverified is not a failure.</li>
            <li>The client decides, then pays through PayPal.</li>
          </ol>
        </div>
        <p className="story-note">The model never approves work and never moves money. Only the client does.</p>
      </section>
      <section className="auth-panel">{children}</section>
    </div>
  )
}
