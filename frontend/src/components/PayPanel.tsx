import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { capturePaymentOrder, createPaymentOrder } from '../lib/api'
import { dataMode, paypalClientId } from '../lib/config'
import { readError } from '../lib/errors'
import { formatMoney } from '../lib/format'
import type { Milestone, PayPalOrder, Payment } from '../lib/types'
import { ErrorNote } from './ui'

export function PayPanel({
  milestone,
  onPaid,
}: {
  milestone: Milestone
  onPaid: (payment: Payment) => void
}) {
  const clientId = paypalClientId()
  const liveButtons = dataMode() === 'live' && Boolean(clientId)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<unknown>(null)
  const [quote, setQuote] = useState<PayPalOrder | null>(null)
  const [alreadyPaid, setAlreadyPaid] = useState(false)

  async function demoPay() {
    setBusy(true)
    setProblem(null)
    setAlreadyPaid(false)
    try {
      const order = await createPaymentOrder(milestone.id)
      setQuote(order)
      const payment = await capturePaymentOrder(order.orderId)
      onPaid(payment)
    } catch (error) {
      if (readError(error) === 'This milestone is already paid') setAlreadyPaid(true)
      else setProblem(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card pay-card" id="payment">
      <p className="eyebrow">PayPal</p>
      <h2>Pay this milestone</h2>
      <p className="money">{formatMoney(milestone.amount, milestone.currency)}</p>
      <p className="hint">
        The amount comes from the server. This screen never sends a price of its own. The sandbox payment goes to the
        app&apos;s PayPal merchant account. Automatic payout to the freelancer is a next step, not part of this prototype.
      </p>
      {quote && (
        <p className="hint">
          Server confirmed {formatMoney(quote.amount, quote.currency)} on order {quote.orderId}.
        </p>
      )}
      {alreadyPaid && (
        <div className="alert" role="status">
          <p>This milestone is already paid</p>
          <p>
            <Link to={`/milestones/${milestone.id}/receipt`}>Open the receipt</Link>
          </p>
        </div>
      )}
      <ErrorNote error={problem} />
      {liveButtons ? (
        <div className={busy ? 'paypal-slot busy' : 'paypal-slot'}>
          <PayPalScriptProvider
            options={{
              clientId,
              currency: milestone.currency,
              intent: 'capture',
              components: 'buttons',
            }}
          >
            <PayPalButtons
              style={{ layout: 'vertical', shape: 'rect', label: 'pay', color: 'gold' }}
              disabled={busy}
              forceReRender={[milestone.id, milestone.currency]}
              createOrder={async () => {
                setBusy(true)
                setProblem(null)
                setAlreadyPaid(false)
                try {
                  const order = await createPaymentOrder(milestone.id)
                  setQuote(order)
                  return order.orderId
                } catch (error) {
                  setBusy(false)
                  if (readError(error) === 'This milestone is already paid') setAlreadyPaid(true)
                  else setProblem(error)
                  throw error
                }
              }}
              onApprove={async (data) => {
                try {
                  const payment = await capturePaymentOrder(data.orderID)
                  onPaid(payment)
                } catch (error) {
                  if (readError(error) === 'This milestone is already paid') setAlreadyPaid(true)
                  else setProblem(error)
                } finally {
                  setBusy(false)
                }
              }}
              onCancel={() => setBusy(false)}
              onError={() => {
                setBusy(false)
                setProblem(new Error('PayPal could not complete checkout. Nothing was captured. You can try again.'))
              }}
            />
          </PayPalScriptProvider>
        </div>
      ) : dataMode() === 'live' ? (
        <div className="alert">
          <p>Add the public PayPal client id as VITE_PAYPAL_CLIENT_ID, then restart the dev server. The secret stays on the backend.</p>
        </div>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => void demoPay()}>
          {busy ? 'Contacting the server…' : 'Complete demo payment'}
        </button>
      )}
      {dataMode() === 'mock' && (
        <p className="hint">
          Demo mode records the payment through the same create-order and capture-order calls. With Backend mode and a
          PayPal client id, this block becomes PayPal&apos;s official button and the buyer approves the order in PayPal&apos;s popup.
        </p>
      )}
    </section>
  )
}
