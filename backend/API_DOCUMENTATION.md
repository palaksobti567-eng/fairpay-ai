\# FairPay AI — API Documentation



\*\*Base URL:\*\* `http://localhost:3000`



\*\*API Type:\*\* REST API  

\*\*Content-Type:\*\* `application/json`



\## 1. Authentication



Protected endpoints require a JWT.



Add this header:



```http

Authorization: Bearer YOUR\_JWT\_TOKEN

```



\### 1.1 Register User



\*\*POST\*\* `/api/auth/register`



Registers a new client account.



Request:



```json

{

&#x20; "name": "Palak",

&#x20; "email": "palak@example.com",

&#x20; "password": "your-password"

}

```



Successful response: `201 Created`



```json

{

&#x20; "message": "Registration successful",

&#x20; "token": "JWT\_TOKEN",

&#x20; "user": {

&#x20;   "id": "USER\_ID",

&#x20;   "name": "Palak",

&#x20;   "email": "palak@example.com",

&#x20;   "role": "client"

&#x20; }

}

```



Possible errors:

\- `400` — Invalid registration data.

\- `409` — Email already registered.

\- `500` — Internal server error.



\*\*Note:\*\* The current registration route always creates a client account.



\### 1.2 Login



\*\*POST\*\* `/api/auth/login`



Request:



```json

{

&#x20; "email": "palak@example.com",

&#x20; "password": "your-password"

}

```



Successful response: `200 OK`



```json

{

&#x20; "message": "Login successful",

&#x20; "token": "JWT\_TOKEN",

&#x20; "user": {

&#x20;   "id": "USER\_ID",

&#x20;   "name": "Palak",

&#x20;   "email": "palak@example.com",

&#x20;   "role": "client"

&#x20; }

}

```



Possible errors:

\- `400` — Invalid login data.

\- `401` — Invalid email or password.

\- `500` — Internal server error.



\### 1.3 Get Current User



\*\*GET\*\* `/api/auth/me`



Authentication required.



Successful response: `200 OK`



```json

{

&#x20; "user": {

&#x20;   "id": "USER\_ID",

&#x20;   "name": "Palak",

&#x20;   "email": "palak@example.com",

&#x20;   "role": "client",

&#x20;   "createdAt": "TIMESTAMP"

&#x20; }

}

```



\---



\## 2. Project APIs



\### 2.1 Create Project



\*\*POST\*\* `/api/projects`



Authentication: Client only.



Request:



```json

{

&#x20; "title": "Website Development",

&#x20; "description": "Build a responsive business website with multiple pages.",

&#x20; "currency": "USD",

&#x20; "totalBudget": 1000

}

```



Successful response: `201 Created`



```json

{

&#x20; "project": {

&#x20;   "\_id": "PROJECT\_ID",

&#x20;   "title": "Website Development",

&#x20;   "description": "Build a responsive business website with multiple pages.",

&#x20;   "currency": "USD",

&#x20;   "totalBudget": 1000

&#x20; }

}

```



Possible errors:

\- `400` — Invalid project data.

\- `500` — Could not create project.



\### 2.2 List User Projects



\*\*GET\*\* `/api/projects`



Authentication required.



Returns projects belonging to the logged-in user.



Successful response: `200 OK`



```json

{

&#x20; "projects": \[]

}

```



The response contains the matching project documents.



Possible error:

\- `500` — Could not retrieve projects.



\### 2.3 Get Project Details



\*\*GET\*\* `/api/projects/:id`



Authentication required.



Example:



`GET /api/projects/PROJECT\_ID`



Only the client or assigned freelancer can access the project.



Successful response: `200 OK`



```json

{

&#x20; "project": {

&#x20;   "\_id": "PROJECT\_ID",

&#x20;   "title": "Website Development"

&#x20; }

}

```



The example shows only selected fields; the actual response contains the project document.



Possible errors:

\- `400` — Invalid project ID.

\- `404` — Project not found or user is not a participant.

\- `500` — Could not retrieve project.



\### 2.4 Assign Freelancer



\*\*POST\*\* `/api/projects/:id/invite`



Authentication: Client only.



Request:



```json

{

&#x20; "freelancerEmail": "freelancer@example.com"

}

```



Successful response: `200 OK`



```json

{

&#x20; "message": "Freelancer assigned successfully",

&#x20; "project": {}

}

```



Possible errors:

\- `400` — Invalid invitation data.

\- `404` — Project or freelancer not found.

\- `409` — A freelancer is already assigned.

\- `500` — Could not invite freelancer.



The freelancer must already exist with the `freelancer` role.



\### 2.5 Create Single Milestone



\*\*POST\*\* `/api/projects/:id/milestones`



Authentication: Client only.



Request:



```json

{

&#x20; "title": "Homepage Design",

&#x20; "amount": 300,

&#x20; "criteria": \[

&#x20;   {

&#x20;     "text": "Responsive homepage design"

&#x20;   },

&#x20;   {

&#x20;     "text": "Navigation and footer completed"

&#x20;   }

&#x20; ]

}

```



Successful response: `201 Created`



```json

{

&#x20; "milestone": {

&#x20;   "\_id": "MILESTONE\_ID",

&#x20;   "title": "Homepage Design",

&#x20;   "amount": 300,

&#x20;   "currency": "USD",

&#x20;   "status": "draft"

&#x20; }

}

```



Currency is derived from the saved project.



Possible errors:

\- `400` — Invalid project ID or milestone data.

\- `404` — Project not found.

\- `409` — Project budget is not configured or milestone exceeds remaining budget.

\- `500` — Could not create milestone.



\### 2.6 Create Multiple Milestones



\*\*POST\*\* `/api/projects/:id/milestones/bulk`



Authentication: Client only.



Request:



```json

{

&#x20; "milestones": \[

&#x20;   {

&#x20;     "title": "Homepage Design",

&#x20;     "amount": 300,

&#x20;     "criteria": \[

&#x20;       {

&#x20;         "text": "Responsive homepage design"

&#x20;       }

&#x20;     ]

&#x20;   },

&#x20;   {

&#x20;     "title": "Backend Development",

&#x20;     "amount": 500,

&#x20;     "criteria": \[

&#x20;       {

&#x20;         "text": "API development completed"

&#x20;       },

&#x20;       {

&#x20;         "text": "Database integration completed"

&#x20;       }

&#x20;     ]

&#x20;   }

&#x20; ]

}

```



Successful response: `201 Created`



```json

{

&#x20; "milestones": \[]

}

```



The array contains the created milestone documents.



Possible errors:

\- `400` — Invalid project ID or milestone data.

\- `404` — Project not found.

\- `409` — Project budget is not configured or total milestone amount exceeds the remaining budget.

\- `500` — Could not save milestones.



\---



\## 3. AI Milestone Generation



\### 3.1 Generate Milestone Suggestions



\*\*POST\*\* `/api/ai/generate-milestones`



Authentication: Client only.



Generates suggested milestones using the project description and saved project budget.



Request:



```json

{

&#x20; "projectId": "PROJECT\_ID",

&#x20; "description": "Build an e-commerce website with authentication, product listings, shopping cart, and checkout."

}

```



Successful response: `200 OK`



```json

{

&#x20; "milestones": \[

&#x20;   {

&#x20;     "title": "User Authentication",

&#x20;     "amount": 200,

&#x20;     "criteria": \[

&#x20;       "Registration implemented",

&#x20;       "Login implemented",

&#x20;       "Authentication tested"

&#x20;     ]

&#x20;   },

&#x20;   {

&#x20;     "title": "Product Listing",

&#x20;     "amount": 300,

&#x20;     "criteria": \[

&#x20;       "Product listing implemented",

&#x20;       "Product details displayed"

&#x20;     ]

&#x20;   }

&#x20; ]

}

```



The example is illustrative. Actual AI-generated results may differ.



\*\*Important behavior:\*\*

\- The project must belong to the logged-in client.

\- The project budget is retrieved from MongoDB.

\- Currency is retrieved from the project.

\- The request body does not accept a budget or currency.

\- Generated milestones are returned as suggestions.

\- Nothing is automatically saved to the database.



Possible errors:



| HTTP status | Error code | Meaning |

|---|---|---|

| 400 | `VALIDATION\_ERROR` | Invalid request |

| 404 | `NOT\_FOUND` | Project not found or not owned by user |

| 409 | `INVALID\_STATE` | Project budget is not configured |

| 422 | `AI\_INVALID\_OUTPUT` | AI returned invalid output |

| 502 | `AI\_UNAVAILABLE` | AI service unavailable |

| 500 | `INTERNAL\_ERROR` | Unexpected server error |



\---



\## 4. Milestone APIs



Authentication is required for all milestone endpoints.



\### 4.1 Update Draft Milestone



\*\*PATCH\*\* `/api/milestones/:id`



Client only.



Request fields are optional:



```json

{

&#x20; "title": "Updated Homepage Design",

&#x20; "amount": 350,

&#x20; "criteria": \[

&#x20;   {

&#x20;     "text": "Responsive design completed"

&#x20;   }

&#x20; ]

}

```



The update validator also accepts a three-letter currency value.



Only draft milestones can be updated.



Successful response: `200 OK`



```json

{

&#x20; "milestone": {}

}

```



Possible errors:

\- `400` — Invalid ID or validation error.

\- `403` — User is not authorized.

\- `404` — Milestone or project not found.

\- `409` — Milestone is not in draft state.

\- `500` — Update failed.



\### 4.2 Approve Milestone Criteria



\*\*POST\*\* `/api/milestones/:id/approve-criteria`



Assigned freelancer only.



No request body required.



Changes the milestone status:



`draft → criteria\_approved`



Successful response: `200 OK`



```json

{

&#x20; "message": "Milestone criteria approved successfully",

&#x20; "milestone": {}

}

```



Possible errors:

\- `400` — Invalid ID.

\- `403` — Not the assigned freelancer.

\- `404` — Milestone not found.

\- `409` — Invalid milestone state.



\### 4.3 Start Milestone Work



\*\*POST\*\* `/api/milestones/:id/start`



Assigned freelancer only.



No request body required.



Changes the status:



`criteria\_approved → in\_progress`



Successful response: `200 OK`



```json

{

&#x20; "message": "Milestone work started successfully",

&#x20; "milestone": {}

}

```



Possible errors:

\- `400` — Invalid ID.

\- `403` — Not the assigned freelancer.

\- `404` — Milestone not found.

\- `409` — Criteria must be approved first.



\### 4.4 Submit Completed Work



\*\*POST\*\* `/api/milestones/:id/submit`



Assigned freelancer only.



Request:



```json

{

&#x20; "description": "The homepage has been completed according to the approved requirements.",

&#x20; "evidenceLinks": \[

&#x20;   "https://example.com/project-preview"

&#x20; ]

}

```



Validation:

\- Description: 20–3000 characters.

\- Evidence links: Maximum 10.

\- Evidence links must use HTTP or HTTPS.



Changes the status:



`in\_progress → submitted`



Successful response: `200 OK`



```json

{

&#x20; "milestone": {

&#x20;   "status": "submitted",

&#x20;   "submissionDescription": "The homepage has been completed according to the approved requirements.",

&#x20;   "evidenceLinks": \[

&#x20;     "https://example.com/project-preview"

&#x20;   ]

&#x20; }

}

```



Possible errors:

\- `400` — Invalid ID or submission data.

\- `403` — Not the assigned freelancer.

\- `404` — Milestone not found.

\- `409` — Milestone is not in progress.

\- `500` — Submission failed.



\### 4.5 Start Verification



\*\*POST\*\* `/api/milestones/:id/start-verification`



Client project owner only.



No request body required.



Changes the status:



`submitted → verifying`



Successful response: `200 OK`



```json

{

&#x20; "message": "Verification started",

&#x20; "milestone": {}

}

```



Possible errors:

\- `400` — Invalid ID.

\- `403` — Only the client can verify submissions.

\- `404` — Milestone or project not found.

\- `409` — Only submitted milestones can enter verification.



\### 4.6 Complete Verification



\*\*POST\*\* `/api/milestones/:id/complete-verification`



Client project owner only.



No request body required.



Changes the status:



`verifying → verified`



Successful response: `200 OK`



```json

{

&#x20; "message": "Milestone verified successfully",

&#x20; "milestone": {}

}

```



Possible errors:

\- `400` — Invalid ID.

\- `403` — Only the client can verify submissions.

\- `404` — Milestone or project not found.

\- `409` — Milestone must be under verification first.



\### 4.7 Approve Completed Work



\*\*POST\*\* `/api/milestones/:id/approve`



Client project owner only.



No request body required.



Changes the status:



`verified → approved`



Successful response: `200 OK`



```json

{

&#x20; "message": "Milestone approved successfully",

&#x20; "milestone": {}

}

```



Possible errors:

\- `400` — Invalid ID.

\- `403` — Only the client can approve work.

\- `404` — Milestone or project not found.

\- `409` — Only verified milestones can be approved.



\### 4.8 Reject Completed Work



\*\*POST\*\* `/api/milestones/:id/reject`



Client project owner only.



Request:



```json

{

&#x20; "reason": "The submitted work does not meet the agreed design requirements."

}

```



Validation:

\- Rejection reason must contain 10–1000 characters.



Changes the status:



`verified → rejected`



Successful response: `200 OK`



```json

{

&#x20; "message": "Milestone rejected",

&#x20; "milestone": {

&#x20;   "status": "rejected",

&#x20;   "rejectionReason": "The submitted work does not meet the agreed design requirements."

&#x20; }

}

```



Possible errors:

\- `400` — Invalid ID or rejection reason.

\- `403` — Only the client can reject work.

\- `404` — Milestone or project not found.

\- `409` — Only verified milestones can be rejected.



\### 4.9 Get Milestone Details



\*\*GET\*\* `/api/milestones/:id`



Authentication required.



Only the client or assigned freelancer can access the milestone.



Successful response: `200 OK`



```json

{

&#x20; "milestone": {}

}

```



The response contains the milestone document.



Possible errors:

\- `400` — Invalid ID.

\- `403` — User is not a participant.

\- `404` — Milestone or project not found.

\- `500` — Could not retrieve milestone.



\---



\## 5. Simulated Payment



> \*\*Demo functionality only. This is not a real payment gateway. No actual money is transferred.\*\*



\### 5.1 Simulate Payment



\*\*POST\*\* `/api/milestones/:id/simulate-payment`



Client project owner only.



No request body required.



Preconditions:

\- The milestone must exist.

\- The logged-in client must own its project.

\- The milestone must have status `approved`.

\- The payment must not already have been simulated.



Successful response: `200 OK`



```json

{

&#x20; "message": "Simulated payment recorded successfully",

&#x20; "payment": {

&#x20;   "status": "simulated",

&#x20;   "reference": "SIM-generated-reference",

&#x20;   "simulatedAt": "TIMESTAMP",

&#x20;   "realMoneyTransferred": false

&#x20; },

&#x20; "milestone": {}

}

```



Possible errors:



| HTTP status | Meaning |

|---|---|

| 400 | Invalid milestone ID |

| 403 | Only the client can initiate payment |

| 404 | Milestone or project not found |

| 409 | Milestone not approved or payment already simulated |

| 500 | Payment simulation error |



\*\*Implementation status:\*\* Include this endpoint in the active API list only after confirming that the route and model fields are saved and `npm run build` succeeds.



A real payment integration would require a payment provider, server-side verification, verified webhooks, and reconciliation. A simulated payment must never be represented as an actual transfer.



\---



\## 6. Health Check



\### Check Server Status



\*\*GET\*\* `/health`



No authentication required.



Successful response: `200 OK`



```json

{

&#x20; "status": "ok"

}

```



\---



\## 7. Standard Error Response



The backend uses a common error response structure.



Example:



```json

{

&#x20; "error": {

&#x20;   "code": "VALIDATION\_ERROR",

&#x20;   "message": "Invalid request data",

&#x20;   "details": \[]

&#x20; }

}

```



The `details` array may contain validation information.



Common HTTP status codes:



| Code | Meaning |

|---|---|

| 200 | Request successful |

| 201 | Resource created |

| 400 | Invalid request |

| 401 | Authentication required or invalid credentials |

| 403 | Permission denied |

| 404 | Resource not found |

| 409 | Conflict or invalid workflow state |

| 422 | Invalid AI output |

| 502 | AI service unavailable |

| 500 | Internal server error |



\---



\## 8. Important API Rules



1\. Protected routes require a valid JWT.

2\. Clients can manage their own projects.

3\. Only assigned freelancers can approve criteria, start work, and submit work.

4\. Only the client project owner can verify, approve, or reject submitted work.

5\. AI generation does not save milestones automatically.

6\. Project budget and currency are taken from the database.

7\. Milestone amounts must not exceed the remaining project budget according to the current budget checks.

8\. Payment simulation does not transfer real money.

9\. Users should not receive sensitive credentials or raw AI provider errors.



\---



\## 9. API Testing



Recommended tool: Postman.



Suggested testing order:



1\. Register a client.

2\. Log in and obtain the JWT.

3\. Create a project.

4\. Generate AI milestone suggestions.

5\. Save milestones using the single or bulk creation endpoint.

6\. Assign a freelancer.

7\. Approve milestone criteria.

8\. Start milestone work.

9\. Submit completed work.

10\. Start verification.

11\. Complete verification.

12\. Approve or reject the milestone.

13\. Test simulated payment only after approval and after confirming the route is implemented.



Use the JWT in the Authorization header for protected requests.



\*\*End of API Documentation.\*\*



