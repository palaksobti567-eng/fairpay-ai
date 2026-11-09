# FairPay AI

**Work fairly. Verify intelligently. Pay confidently.**

AI-assisted milestone management and PayPal payments for freelancers. The AI advises — the client decides; PayPal processes the money. Not an escrow product.

**Flow:** Client creates project → AI suggests milestones → freelancer approves criteria → submits evidence → AI browser verification report → client approves/rejects → PayPal Sandbox checkout → server-verified payment record.

## Repo layout

- `frontend/` — React + Vite + TypeScript (deployed on Vercel)
- `backend/` — Node.js + Express + TypeScript + MongoDB/Mongoose (deployed on Render)

## Run locally

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill in every value
npm run dev            # http://localhost:3000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # VITE_USE_MOCK=true runs the full app with demo data, no backend needed
npm run dev            # http://localhost:5173
```

Demo mode: open the app, click **Enter as client/freelancer** on the login page.

## Deploy

### Backend on Render

1. Render → **New → Blueprint** → connect this repo. `backend/render.yaml` configures everything (`npm install && npm run build`, `npm start`, health check `/health`).
2. Set the env vars marked `sync: false` in `render.yaml` (see `backend/.env.example` for the full list): `MONGODB_URI`, `JWT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GEMINI_MODEL`, `KERNEL_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `FRONTEND_URL`.
3. Copy the backend URL (e.g. `https://fairpay-ai-backend.onrender.com`).

### Frontend on Vercel

1. Vercel → **Import** this repo → set **Root Directory** to `frontend`.
2. Environment variables:
   - `VITE_API_BASE_URL` = your Render backend URL
   - `VITE_USE_MOCK` = `false` for live mode (`true` keeps demo mode)
   - `VITE_PAYPAL_CLIENT_ID` = PayPal **client id only** (public, never the secret)
3. Deploy. `vercel.json` already handles SPA routing.

### PayPal webhook (optional but recommended)

In the PayPal developer dashboard, register `https://<backend>/api/payments/webhook` for `PAYMENT.CAPTURE.*` events, then set `PAYPAL_WEBHOOK_ID` on Render. The backend verifies signatures and ignores duplicate events.

## Docs

- `backend/README.md` — API details
- `backend/API_DOCUMENTATION.md` — endpoint reference
- `frontend/BACKEND_INTEGRATION_GUIDE.md` — frontend/backend contract
