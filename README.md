# FairPay AI

**AI-verified milestone payments for freelancers, paid through PayPal.**

Freelancers and clients often disagree about whether work is "done". FairPay AI turns that into a clear, checkable process: the AI helps define measurable acceptance criteria, checks the delivered work against them, and a **human client** decides whether to pay.

**Flow:** Agreement → Evidence → AI Verification → Human Approval → PayPal Payment → Confirmation

Built for the PayPal AI Hackathon 2026.

## Links

- **Demo video (under 3 min):** `ADD_YOUTUBE_LINK`
- **Hosted demo (frontend):** https://fairpay-ai-frontend.vercel.app
- **Hosted API (backend):** https://fairpay-ai.onrender.com
- **Note:** the demo runs on free hosting. The first request after a pause can take about a minute to wake up.

## What it does

1. **Agreement.** A client creates a project. Gemini suggests milestones with measurable acceptance criteria. The client reviews, edits and approves them.
2. **Evidence.** The freelancer submits a description and a public preview URL for a milestone.
3. **AI verification.** The backend safety-checks the URL, opens it in a read-only KERNEL cloud browser, captures desktop and mobile screenshots, and collects page observations. Gemini compares the evidence with each criterion and marks it **completed**, **missing** or **unverified**.
4. **Human approval.** The client reads the report and explicitly approves.
5. **PayPal payment.** After approval, the client pays with PayPal (sandbox). The backend creates and captures the order.
6. **Confirmation.** Both sides see the payment record.

## How AI is used

| Where | What the AI does | Safety limits |
|---|---|---|
| Milestone generation (Gemini) | Splits a project and budget into milestones with checkable criteria | Suggestions only, nothing is saved until the client confirms. The server re-checks that the amounts add up (in cents) and retries once, then fails. |
| Evidence verification (Gemini) | Compares the freelancer's evidence and the browser observations with each criterion | Never invents evidence. A criterion can be `completed` only with independent browser evidence. Anything it cannot check is `unverified`. The server validates that the result covers exactly the milestone's criteria. |
| PayPal order creation through AI tool calling (PayPal Agent Toolkit + Gemini) | `scripts/paypal-gemini-test.ts` shows Gemini calling the toolkit's `create_order` tool in the sandbox | Fixed test order, explicit human confirmation (`YES`) before the tool runs. The capture tool is not given to the AI. |

**The AI never approves its own verification and never captures or spends money.** Only a logged-in client can approve, and only the backend code behind the approval check can capture a payment.

## How PayPal is used

- PayPal **REST Orders v2 (sandbox)**: OAuth token, create order, get order, capture order.
- **Create order:** the amount and currency come from the database, never from the request. The milestone must be `approved`.
- **Capture order:** the backend checks the user, project ownership, that the order belongs to that milestone, and that the milestone is approved. It re-reads the order from PayPal and compares amount and currency with the database before capturing. A milestone is marked `paid` only when PayPal reports `COMPLETED` with a matching amount.
- **Duplicate protection:** the payment is claimed with one atomic database update, and a second capture returns `409 ALREADY_PAID`.
- The **PayPal Agent Toolkit** was evaluated and used in the Gemini tool-calling script above. The production payment path uses our own REST code so that capture stays behind the approval check.

## Safety rules

- The AI never approves or pays.
- Roles are stored on the server. The frontend is never trusted for the role, the user id, the amount or the currency.
- Every project and milestone route checks ownership. Non-participants get `404`, and the wrong role gets `403`.
- Passwords are hashed with bcrypt. Logins use JWT. Passwords and hashes are never returned.
- Preview URLs must be `https` and are checked before any browser visit. Localhost, private and reserved IP ranges, and URLs with embedded credentials are blocked, and redirects are re-checked.
- The cloud browser is **read-only**: it navigates and reads, and never clicks or submits forms.
- User text and web page content are treated as untrusted data inside AI prompts, and the server validates the AI output.
- Secrets live only in `.env` (not committed). `.env.example` lists the names with empty values.

## Tech stack

- **Backend:** Node.js, Express, TypeScript (run with `tsx`)
- **Database:** MongoDB Atlas with Mongoose
- **AI:** Vercel AI SDK (`ai`) with Google Gemini (`@ai-sdk/google`), zod for output validation
- **Browser inspection:** KERNEL cloud browser (`@onkernel/sdk`)
- **Payments:** PayPal Orders v2 (sandbox) and `@paypal/agent-toolkit`
- **Frontend:** React
- **Hosting:** Render

## API overview (backend)

All endpoints are under `/api`. Errors always look like `{ "error": { "code", "message", "details" } }`. Protected routes need `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Projects | `POST /projects`, `GET /projects`, `GET /projects/:id`, `POST /projects/:id/invite` |
| Milestones | `POST /projects/:id/milestones`, `PATCH /milestones/:id`, `POST /milestones/:id/approve-criteria`, `GET /milestones/:id` |
| AI | `POST /ai/generate-milestones` |
| Evidence and verification | `POST /milestones/:id/submissions`, `POST /submissions/:id/verify`, `GET /submissions/:id/report` |
| Approval | `POST /milestones/:id/approve` |
| Payments | `POST /payments/create-order`, `POST /payments/capture-order`, `GET /milestones/:id/payment` |
| Health | `GET /health` |

Milestone statuses move forward through: `draft` → `criteria_approved` → `in_progress` → `submitted` → `verifying` → `verified` → `approved` → `paid`. Side exits: `rejected`, `payment_failed`.

## Setup and run locally

**Requirements:** Node.js 18+, a MongoDB Atlas database, a Gemini API key, a KERNEL API key and a PayPal sandbox app.

```bash
git clone https://github.com/palaksobti567-eng/fairpay-ai.git
cd fairpay-ai/backend
npm install
```

Create your environment file and fill in the values:

```bash
cp .env.example .env
```

On Windows PowerShell use `Copy-Item .env.example .env`.

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default 3000) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key |
| `GEMINI_MODEL` | Gemini model name, for example `gemini-3.5-flash-lite` |
| `KERNEL_API_KEY` | KERNEL cloud browser key |
| `PAYPAL_CLIENT_ID` | PayPal sandbox client id |
| `PAYPAL_CLIENT_SECRET` | PayPal sandbox secret (backend only) |
| `JWT_SECRET` | Long random string used to sign login tokens |
| `FRONTEND_URL` | Allowed frontend address for CORS (if set up) |

Never commit `.env`.

Start the backend:

```bash
npm run dev
```

Check it at `http://localhost:3000/health`. It should return `{ "status": "ok" }`.

**Frontend** (in the `frontend/` folder):

```bash
cd ../frontend
npm install
npm run dev
```

It needs the backend address (`VITE_API_BASE_URL`) and the PayPal sandbox **client id** only, never the secret. Put them in the frontend's own `.env` file, which is not committed.

**Useful scripts** (in `backend/`):

```bash
npm run test:gemini     # Gemini structured milestone test
npm run test:kernel     # KERNEL browser screenshot test
npx tsx scripts/paypal-test.ts          # PayPal sandbox REST test
npx tsx scripts/paypal-gemini-test.ts   # Gemini + PayPal Agent Toolkit create_order (asks for YES)
npm run build           # TypeScript check
```

## Try the demo

Use **sandbox accounts only**. No real money or real PayPal accounts are involved.

1. Register one **client** and one **freelancer** account.
2. As the client, create a project and invite the freelancer by email.
3. Generate milestones with AI, review them, and approve the criteria.
4. As the freelancer, submit a public `https` preview URL for the milestone.
5. Run verification and read the report (completed, missing, unverified, with screenshots).
6. As the client, approve the milestone and pay with a PayPal **sandbox buyer** account.
7. Check the confirmation and the payment record.

Sandbox test credentials are provided in the hackathon submission form.

## Limitations (honest notes)

- **Not an escrow service.** FairPay AI does not hold funds. Payments are sandbox payments captured to the app's PayPal merchant account.
- **Freelancer payout is a next step.** Automatic payout to the freelancer is not part of this prototype.
- **PayPal webhooks are a next step.** The backend verifies the capture result directly from PayPal's response. Webhook signature verification is planned.
- **Read-only browser checks.** Criteria that need interaction, such as "submitting the form shows a success message", stay `unverified`.
- **Free hosting.** The server can sleep when idle, and the free database cluster pauses when idle.
- **Gemini model choice.** Larger models can be slower. The default listed above was chosen because it responded reliably.

## Next steps

- PayPal webhooks with signature verification
- Payouts to freelancers
- Wrapping more backend services as AI agent tools, with capture always staying human-approved
- Rate limits, automated tests and a Postman collection
- Screenshot uploads as a fallback evidence source

## License

MIT. See [LICENSE](LICENSE).
