import { Link } from 'react-router-dom'
import { Logo, useTitle } from '../components/ui'

export function LandingPage() {
  useTitle('FairPay AI')
  return (
    <div className="landing">
      <header className="landing-nav">
        <Logo />
        <nav className="row">
          <Link className="btn secondary" to="/login">
            Log in
          </Link>
          <Link className="btn" to="/register">
            Create account
          </Link>
        </nav>
      </header>
      <section className="landing-hero">
        <p className="eyebrow">Work fairly. Verify intelligently. Pay confidently.</p>
        <h1>Milestones, evidence, and payment in one traceable flow.</h1>
        <p className="lede">
          FairPay AI turns agreed freelance requirements into milestones, compares submissions against acceptance
          criteria with an AI-assisted report, and connects client approval to a real PayPal transaction. The AI
          advises — the client decides.
        </p>
        <div className="row wrap">
          <Link className="btn" to="/register">
            Start a project
          </Link>
          <Link className="btn secondary" to="/login">
            I&apos;m a freelancer
          </Link>
        </div>
      </section>
      <section className="card-grid">
        <article className="card">
          <h2>Agree first</h2>
          <p>AI suggests milestones and measurable acceptance criteria from your brief. Nothing starts until both sides can see what done means.</p>
        </article>
        <article className="card">
          <h2>Verify with evidence</h2>
          <p>A read-only browser checks the public preview and writes a criterion-by-criterion report — completed, missing, or honestly unverified.</p>
        </article>
        <article className="card">
          <h2>Pay with confidence</h2>
          <p>The client approves the work, then PayPal Checkout captures the milestone amount. The server verifies every payment.</p>
        </article>
      </section>
      <p className="story-note">FairPay AI is not an escrow product. PayPal processes payments; the client keeps final approval authority.</p>
    </div>
  )
}
