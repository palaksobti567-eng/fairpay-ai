# FairPay AI Frontend - Backend Integration Guide

This guide explains how to connect the FairPay AI frontend with the backend API. The frontend is designed to work seamlessly with the backend following the exact API contract specified in the backend documentation.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Environment Configuration](#environment-configuration)
4. [API Contract](#api-contract)
5. [CORS Setup](#cors-setup)
6. [Authentication Flow](#authentication-flow)
7. [Testing the Integration](#testing-the-integration)
8. [Troubleshooting](#troubleshooting)
9. [Deployment](#deployment)

## 🚀 Prerequisites

Before integrating the frontend with the backend, ensure you have:

- Backend API running (Node.js/Express or similar)
- Backend API base URL (e.g., `http://localhost:3000` or production URL)
- PayPal Sandbox Client ID (for payment testing)
- Node.js 18+ installed
- npm or yarn package manager

## ⚡ Quick Start

### Step 1: Clone and Install

```bash
cd Frontend
npm install
```

### Step 2: Configure Environment

Create a `.env` file in the root directory:

```env
# Backend API Configuration
VITE_API_BASE_URL=http://localhost:3000

# PayPal Configuration (Sandbox for testing)
VITE_PAYPAL_CLIENT_ID=your-paypal-sandbox-client-id

# Data Mode: 'false' for live backend, 'true' for mock data
VITE_USE_MOCK=false
```

### Step 3: Start the Frontend

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Step 4: Configure CORS on Backend

The backend must allow CORS from the frontend origin. Add this to your backend:

```javascript
// Express example
app.use(cors({
  origin: 'http://localhost:5173', // Frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

## 🔧 Environment Configuration

### Environment Variables Explained

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_BASE_URL` | Yes | Backend API base URL | `http://localhost:3000` |
| `VITE_PAYPAL_CLIENT_ID` | Yes | PayPal Sandbox Client ID | `AXxxxx...` |
| `VITE_USE_MOCK` | Yes | Use mock data (`true`) or live backend (`false`) | `false` |

### Development Environment (`.env`)

```env
VITE_API_BASE_URL=http://localhost:3000
VITE_PAYPAL_CLIENT_ID=your-sandbox-client-id
VITE_USE_MOCK=false
```

### Production Environment (`.env.production`)

```env
VITE_API_BASE_URL=https://your-backend-api.com
VITE_PAYPAL_CLIENT_ID=your-live-client-id
VITE_USE_MOCK=false
```

## 📡 API Contract

The frontend expects the backend to follow this exact API contract. All endpoints return JSON with `Content-Type: application/json`.

### Error Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": [
      {
        "field": "fieldName",
        "message": "Specific error for this field"
      }
    ]
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Validation Error |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (wrong role or not owner) |
| 404 | Not Found |
| 409 | Conflict (email taken, milestone in wrong status, already paid) |
| 429 | Too Many Requests |
| 500 | Server Error |

### Authentication

All protected endpoints require:
- Header: `Authorization: Bearer <token>`
- Token stored in localStorage as `fairpay.token`

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "client"  // or "freelancer"
}

Response 201:
{
  "user": {
    "id": "user_abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "client"
  },
  "token": "jwt_token_here"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}

Response 200:
{
  "user": {
    "id": "user_abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "client"
  },
  "token": "jwt_token_here"
}
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <token>

Response 200:
{
  "user": {
    "id": "user_abc123",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "client"
  }
}
```

### Projects

#### List Projects
```http
GET /api/projects
Authorization: Bearer <token>

Response 200:
{
  "projects": [
    {
      "id": "proj_abc123",
      "title": "Landing Page",
      "description": "Build a responsive landing page",
      "currency": "USD",
      "clientId": "user_abc123",
      "freelancerId": "user_xyz789",
      "totalAmount": 300,
      "milestones": [],
      "createdAt": "2026-11-04T10:00:00Z"
    }
  ]
}
```

#### Create Project (Client Only)
```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Landing Page",
  "description": "Build a responsive landing page",
  "currency": "USD"
}

Response 201:
{
  "id": "proj_abc123",
  "title": "Landing Page",
  "description": "Build a responsive landing page",
  "currency": "USD",
  "clientId": "user_abc123",
  "freelancerId": null,
  "totalAmount": 0,
  "milestones": [],
  "createdAt": "2026-11-04T10:00:00Z"
}
```

#### Get Project Details
```http
GET /api/projects/:id
Authorization: Bearer <token>

Response 200:
{
  "id": "proj_abc123",
  "title": "Landing Page",
  "description": "Build a responsive landing page",
  "currency": "USD",
  "clientId": "user_abc123",
  "freelancerId": "user_xyz789",
  "totalAmount": 300,
  "milestones": [
    {
      "id": "mile_def456",
      "projectId": "proj_abc123",
      "title": "Homepage",
      "amount": 100,
      "currency": "USD",
      "status": "draft",
      "criteria": [
        {
          "id": "crit_ghi789",
          "text": "Page loads over HTTPS"
        }
      ]
    }
  ],
  "createdAt": "2026-11-04T10:00:00Z"
}
```

#### Invite Freelancer (Client Only)
```http
POST /api/projects/:id/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "freelancerEmail": "freelancer@example.com"
}

Response 200:
{
  "id": "proj_abc123",
  "freelancerId": "user_xyz789",
  ...
}
```

### Milestones

#### Create Milestone (Client Only)
```http
POST /api/projects/:projectId/milestones
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Homepage",
  "amount": 100,
  "criteria": ["Page loads over HTTPS", "Hero section visible"]
}

Response 201:
{
  "id": "mile_def456",
  "projectId": "proj_abc123",
  "title": "Homepage",
  "amount": 100,
  "currency": "USD",
  "status": "draft",
  "criteria": [
    {
      "id": "crit_ghi789",
      "text": "Page loads over HTTPS"
    }
  ]
}
```

#### Update Milestone (Client Only, Draft Only)
```http
PATCH /api/milestones/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Homepage",
  "amount": 150,
  "criteria": ["Page loads over HTTPS", "Hero section visible"]
}

Response 200:
{
  "id": "mile_def456",
  ...
}
```

#### Approve Criteria (Client Only)
```http
POST /api/milestones/:id/approve-criteria
Authorization: Bearer <token>
Content-Type: application/json

{}

Response 200:
{
  "id": "mile_def456",
  "status": "criteria_approved",
  ...
}
```

#### Get Milestone Details
```http
GET /api/milestones/:id
Authorization: Bearer <token>

Response 200:
{
  "id": "mile_def456",
  "projectId": "proj_abc123",
  "title": "Homepage",
  "amount": 100,
  "currency": "USD",
  "status": "criteria_approved",
  "criteria": [...]
}
```

### AI Milestone Generation

#### Generate Milestones (Client Only)
```http
POST /api/ai/generate-milestones
Authorization: Bearer <token>
Content-Type: application/json

{
  "projectId": "proj_abc123",
  "description": "Build a responsive landing page with contact form",
  "totalBudget": 300,
  "currency": "USD"
}

Response 200:
{
  "milestones": [
    {
      "title": "Homepage Design",
      "amount": 100,
      "criteria": [
        "Responsive layout",
        "Hero section with CTA",
        "Navigation menu"
      ]
    },
    {
      "title": "Contact Form",
      "amount": 100,
      "criteria": [
        "Form validation",
        "Email submission",
        "Success message"
      ]
    },
    {
      "title": "Content Pages",
      "amount": 100,
      "criteria": [
        "About page",
        "Services page",
        "FAQ section"
      ]
    }
  ]
}
```

**Note**: This only returns suggestions. The frontend allows the user to edit before saving.

### Submissions (Evidence)

#### Submit Evidence (Freelancer Only)
```http
POST /api/milestones/:milestoneId/submissions
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "Homepage completed with all features",
  "previewUrl": "https://example.com/preview",
  "screenshots": ["https://example.com/screenshot1.jpg", "https://example.com/screenshot2.jpg"]
}

Response 201:
{
  "id": "sub_jkl012",
  "milestoneId": "mile_def456",
  "description": "Homepage completed with all features",
  "previewUrl": "https://example.com/preview",
  "screenshots": ["https://example.com/screenshot1.jpg"],
  "createdAt": "2026-11-04T12:00:00Z"
}
```

**Validation Rules**:
- `previewUrl` must be HTTPS
- Cannot be localhost or private IP
- Cannot use unsafe schemes (http, file, etc.)

#### List Submissions
```http
GET /api/milestones/:milestoneId/submissions
Authorization: Bearer <token>

Response 200:
{
  "submissions": [
    {
      "id": "sub_jkl012",
      "milestoneId": "mile_def456",
      "description": "...",
      "previewUrl": "...",
      "screenshots": [...],
      "createdAt": "2026-11-04T12:00:00Z"
    }
  ]
}
```

### Verification

#### Start Verification (Client or Freelancer)
```http
POST /api/submissions/:submissionId/verify
Authorization: Bearer <token>
Content-Type: application/json

{}

Response 200:
{}  // Returns quickly, runs in background
```

The milestone status changes to `verifying`. Poll the report endpoint.

#### Get Verification Report
```http
GET /api/submissions/:submissionId/report
Authorization: Bearer <token>

Response 200:
{
  "id": "rep_mno345",
  "submissionId": "sub_jkl012",
  "state": "done",  // "running", "done", or "failed"
  "summary": "2 of 3 criteria completed",
  "results": [
    {
      "criterionId": "crit_ghi789",
      "criterion": "Page loads over HTTPS",
      "status": "completed",  // "completed", "missing", or "unverified"
      "evidence": "Page loaded; heading found at top",
      "source": "browser"
    },
    {
      "criterionId": "crit_pqr678",
      "criterion": "Contact form works",
      "status": "unverified",
      "evidence": "Form submission is not checked by the read-only inspector",
      "source": "none"
    }
  ],
  "screenshots": {
    "desktop": "https://example.com/desktop.jpg",
    "mobile": "https://example.com/mobile.jpg"
  },
  "createdAt": "2026-11-04T12:05:00Z"
}
```

**Polling**: While `state` is `running`, poll every 3 seconds until `done` or `failed`.

### Human Approval

#### Approve Milestone (Client Only)
```http
POST /api/milestones/:id/approve
Authorization: Bearer <token>
Content-Type: application/json

{
  "reportId": "rep_mno345",
  "note": "Great work! All criteria met."
}

Response 200:
{
  "id": "mile_def456",
  "status": "approved",
  ...
}
```

#### Reject Milestone (Client Only)
```http
POST /api/milestones/:id/reject
Authorization: Bearer <token>
Content-Type: application/json

{
  "reason": "Contact form is not functional"
}

Response 200:
{
  "id": "mile_def456",
  "status": "rejected",
  "rejectionReason": "Contact form is not functional",
  ...
}
```

### Payments (PayPal)

#### Create Order (Client Only)
```http
POST /api/payments/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "milestoneId": "mile_def456"
}

Response 201:
{
  "orderId": "ORDER_ABC123",
  "amount": 100,
  "currency": "USD"
}
```

**Important**: The amount comes from the server, never from the frontend.

#### Capture Order (Client Only)
```http
POST /api/payments/capture-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": "ORDER_ABC123"
}

Response 200:
{
  "payment": {
    "id": "pay_stu678",
    "milestoneId": "mile_def456",
    "orderId": "ORDER_ABC123",
    "captureId": "CAPTURE_XYZ789",
    "status": "completed",
    "amount": 100,
    "currency": "USD",
    "paidAt": "2026-11-04T13:00:00Z"
  }
}
```

**Error Handling**: If already paid, returns 409 with code `ALREADY_PAID`.

#### Get Payment
```http
GET /api/milestones/:milestoneId/payment
Authorization: Bearer <token>

Response 200:
{
  "payment": {
    "id": "pay_stu678",
    "milestoneId": "mile_def456",
    "orderId": "ORDER_ABC123",
    "captureId": "CAPTURE_XYZ789",
    "status": "completed",
    "amount": 100,
    "currency": "USD",
    "paidAt": "2026-11-04T13:00:00Z"
  }
}
```

If no payment exists, returns 404.

### Health Check

```http
GET /health

Response 200:
{
  "status": "ok"
}
```

## 🔐 CORS Setup

The backend must allow CORS from the frontend origin. Here's how to configure it:

### Express Example

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:5173',  // Development
    'https://your-frontend.com'  // Production
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Other Frameworks

Check your framework's CORS middleware documentation. The key requirements:
- Allow origin: `http://localhost:5173` (or your frontend URL)
- Allow methods: GET, POST, PATCH, DELETE
- Allow headers: Content-Type, Authorization
- Allow credentials: true (for cookies if used)

## 🔑 Authentication Flow

### Registration & Login Flow

1. User registers with name, email, password, and role
2. Backend returns user object and JWT token
3. Frontend stores token in localStorage (`fairpay.token`)
4. Frontend includes token in Authorization header for all requests
5. On 401 response, frontend clears token and redirects to login

### Token Management

The frontend handles tokens automatically:

```typescript
// Token is stored in localStorage
localStorage.setItem('fairpay.token', token)

// Token is sent with every request
headers: {
  'Authorization': `Bearer ${token}`
}

// On 401, token is cleared and user redirected
if (response.status === 401) {
  localStorage.removeItem('fairpay.token')
  window.location.href = '/login'
}
```

## 🧪 Testing the Integration

### Step 1: Test Mock Mode First

```env
VITE_USE_MOCK=true
```

This uses the built-in mock data to verify the frontend works without a backend.

### Step 2: Test Backend Connection

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:3000
```

Test each endpoint:

1. **Health Check**: Open browser console, the frontend checks `/health` automatically
2. **Register**: Create a test user
3. **Login**: Log in with the test user
4. **Create Project**: As client, create a project
5. **Invite Freelancer**: Add a freelancer by email
6. **Create Milestone**: Add a milestone with criteria
7. **Generate Milestones**: Test AI generation (if implemented)
8. **Submit Evidence**: As freelancer, submit evidence
9. **Start Verification**: Trigger AI verification
10. **Approve/Reject**: As client, review and decide
11. **Process Payment**: Test PayPal flow

### Step 3: Check Network Tab

Open browser DevTools → Network tab to:
- Verify requests are going to correct backend URL
- Check request headers include Authorization token
- Verify response format matches API contract
- Check for CORS errors

## 🐛 Troubleshooting

### Issue: "Cannot reach backend"

**Cause**: Backend not running or wrong URL

**Solution**:
1. Verify backend is running: `curl http://localhost:3000/health`
2. Check `VITE_API_BASE_URL` in `.env`
3. Ensure no firewall blocking the connection

### Issue: CORS Error

**Cause**: Backend not allowing frontend origin

**Solution**:
1. Add CORS middleware to backend
2. Allow origin: `http://localhost:5173`
3. Restart backend after changes

### Issue: 401 Unauthorized

**Cause**: Token missing, invalid, or expired

**Solution**:
1. Check localStorage for `fairpay.token`
2. Verify token is sent in Authorization header
3. Token might be expired - user needs to login again

### Issue: 403 Forbidden

**Cause**: User doesn't have permission for this action

**Solution**:
1. Verify user role (client vs freelancer)
2. Check if user is the project owner
3. Review permission rules in backend documentation

### Issue: PayPal Button Not Showing

**Cause**: PayPal Client ID not configured

**Solution**:
1. Set `VITE_PAYPAL_CLIENT_ID` in `.env`
2. Get client ID from PayPal Developer Dashboard
3. Restart dev server after changing `.env`

### Issue: Payment Amount Wrong

**Cause**: Frontend sending amount instead of using server value

**Solution**:
- The frontend NEVER sends payment amounts
- Verify backend returns correct amount in create-order response
- Check PayPal button configuration

### Issue: Mock Mode Works But Live Doesn't

**Cause**: Backend API contract mismatch

**Solution**:
1. Compare backend responses with API contract in this guide
2. Check response format (nested vs flat objects)
3. Verify field names match exactly
4. Check error format matches expected structure

## 🚀 Deployment

### Build for Production

```bash
npm run build
```

This creates a `dist/` folder with optimized files.

### Environment Variables for Production

Create `.env.production`:

```env
VITE_API_BASE_URL=https://your-backend-api.com
VITE_PAYPAL_CLIENT_ID=your-live-paypal-client-id
VITE_USE_MOCK=false
```

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Add environment variables in Vercel dashboard.

### Deploy to Netlify

```bash
npm run build
netlify deploy --prod --dir=dist
```

Add environment variables in Netlify dashboard.

### Configure Production CORS

Update backend CORS to allow production frontend:

```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://your-frontend.vercel.app'  // Production URL
  ],
  credentials: true
}));
```

## 📞 Support

If you encounter issues during integration:

1. Check this guide's troubleshooting section
2. Review browser console for errors
3. Check Network tab for failed requests
4. Verify backend API matches the contract
5. Test with mock mode first to isolate the issue

## 📝 API Contract Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/register` | POST | None | Register user |
| `/api/auth/login` | POST | None | Login user |
| `/api/auth/me` | GET | Any | Get current user |
| `/api/projects` | GET | Any | List my projects |
| `/api/projects` | POST | Client | Create project |
| `/api/projects/:id` | GET | Participant | Project details |
| `/api/projects/:id/invite` | POST | Client | Invite freelancer |
| `/api/projects/:id/milestones` | POST | Client | Create milestone |
| `/api/milestones/:id` | PATCH | Client | Update milestone |
| `/api/milestones/:id/approve-criteria` | POST | Client | Approve criteria |
| `/api/milestones/:id` | GET | Participant | Milestone details |
| `/api/ai/generate-milestones` | POST | Client | AI suggestions |
| `/api/milestones/:id/submissions` | POST | Freelancer | Submit evidence |
| `/api/milestones/:id/submissions` | GET | Participant | List submissions |
| `/api/submissions/:id/verify` | POST | Participant | Start verification |
| `/api/submissions/:id/report` | GET | Participant | Get report |
| `/api/milestones/:id/approve` | POST | Client | Approve milestone |
| `/api/milestones/:id/reject` | POST | Client | Reject milestone |
| `/api/payments/create-order` | POST | Client | Create PayPal order |
| `/api/payments/capture-order` | POST | Client | Capture payment |
| `/api/milestones/:id/payment` | GET | Participant | Get payment |
| `/health` | GET | None | Health check |

## ✅ Integration Checklist

Before going live, ensure:

- [ ] Backend API is running and accessible
- [ ] CORS is configured to allow frontend origin
- [ ] Environment variables are set correctly
- [ ] Authentication flow works (register, login, logout)
- [ ] Project creation and management works
- [ ] Milestone CRUD operations work
- [ ] AI milestone generation works (if implemented)
- [ ] Evidence submission works
- [ ] Verification polling works
- [ ] Approval/rejection flow works
- [ ] PayPal payment flow works
- [ ] Error handling works for all endpoints
- [ ] 401 redirects to login
- [ ] Token is cleared on logout
- [ ] Production build is tested
- [ ] Environment variables are set in production

## 🎯 Key Points to Remember

1. **Amounts Always Come from Server**: Never send payment amounts from frontend
2. **Role-Based Access**: Frontend shows/hides buttons based on role, but backend enforces permissions
3. **No Escrow Language**: UI must not use words like "escrow", "guaranteed", or "held funds"
4. **AI Never Approves**: Only humans can approve work and move money
5. **HTTPS Only**: Evidence URLs must be HTTPS, no localhost or private IPs
6. **Token Management**: Store token in localStorage, send in Authorization header
7. **Error Format**: All errors follow the same structure with code, message, and details
8. **Polling**: Verification report should be polled every 3 seconds while state is "running"
9. **PayPal Integration**: Use official PayPal SDK, amounts from server only
10. **Status Flow**: Milestone status moves forward only (draft → criteria_approved → in_progress → submitted → verifying → verified → approved → paid)

---

**Good luck with the integration!** If you have questions, refer to the backend documentation or contact the backend team.
