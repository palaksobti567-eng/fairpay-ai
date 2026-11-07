\# FairPay AI — Backend



FairPay AI is a backend application designed to make freelance project management more transparent through AI-assisted milestone planning, project budgets, work submissions, verification, and payment simulation.



The backend provides REST APIs for clients and freelancers to manage projects and milestones.



> \*\*Payment notice:\*\* The payment workflow is designed for demonstration purposes. A simulated payment does not transfer real money.



\## Features



\### 1. Authentication

\- User registration and login.

\- Password hashing using bcrypt.

\- JWT-based authentication.

\- Retrieve the currently authenticated user.

\- Role-based access control.



\*\*Current limitation:\*\* Public registration creates client accounts. The registration endpoint does not provide freelancer role selection.



\### 2. Project Management

\- Create projects.

\- View projects belonging to the logged-in user.

\- View project details.

\- Assign a freelancer to a project.

\- Store project budget and currency.



\### 3. AI Milestone Generation

\- Generate milestone suggestions from a project description.

\- Use Google Gemini through the AI SDK.

\- Generate suggestions according to the saved project's budget and currency.

\- Validate AI-generated output.

\- Return suggestions without automatically saving them.



\### 4. Milestone Management

\- Create individual milestones.

\- Create multiple milestones in one request.

\- Validate milestone amounts against the project budget.

\- Define milestone acceptance criteria.

\- Update draft milestones.



\### 5. Milestone Workflow



The implemented workflow supports these stages:



`draft → criteria\_approved → in\_progress → submitted → verifying → verified`



The client can then approve or reject the verified work.



\### 6. Payment Simulation



The payment demonstration is intended to record a simulated payment after client approval.



\- Payment simulation is separate from milestone approval.

\- A simulation reference and timestamp can be recorded.

\- No actual financial transaction takes place.



\## Technology Stack



| Technology | Purpose |

|---|---|

| Node.js | JavaScript runtime |

| TypeScript | Type safety |

| Express 5 | REST API framework |

| MongoDB | Database |

| Mongoose 9 | MongoDB object modeling |

| Zod 4 | Request validation |

| bcryptjs | Password hashing |

| jsonwebtoken | JWT authentication |

| Google Gemini | AI milestone generation |

| AI SDK | AI integration |

| tsx | TypeScript development execution |



PayPal and Kernel SDK packages are present in the project dependencies. Their presence alone does not mean that live payment processing or Kernel functionality is implemented.



\## Project Setup



\### Prerequisites



Install:



\- Node.js

\- npm

\- MongoDB Atlas account or an accessible MongoDB instance

\- Cursor or another code editor

\- Postman for API testing



\### 1. Clone or open the project



Open the backend folder:



`C:\\Users\\palak\\Documents\\fairpay-ai\\backend`



\### 2. Install dependencies



Run:



```powershell

npm install

```



\### 3. Configure environment variables



Create a `.env` file in the backend root directory.



Use the following structure:



```env

PORT=3000



\# MongoDB

MONGODB\_URI=your\_mongodb\_connection\_string



\# Gemini

GEMINI\_API\_KEY=your\_gemini\_api\_key

GEMINI\_MODEL=your\_gemini\_model



\# PayPal Sandbox

PAYPAL\_CLIENT\_ID=your\_paypal\_client\_id

PAYPAL\_CLIENT\_SECRET=your\_paypal\_client\_secret



\# Kernel

KERNEL\_API\_KEY=your\_kernel\_api\_key

```



Replace placeholders with your own credentials.



\*\*Security rules:\*\*

\- Never commit `.env` to GitHub.

\- Never share API keys or database credentials.

\- Keep `.env.example` with blank values for documentation.

\- Do not put secrets directly into source code.



\### 4. Start the development server



```powershell

npm run dev

```



The default server port is `3000`.



\### 5. Check server health



Open:



`http://localhost:3000/health`



Expected response:



```json

{

&#x20; "status": "ok"

}

```



\### 6. Build the TypeScript project



```powershell

npm run build

```



\## Available npm Scripts



| Command | Purpose |

|---|---|

| `npm run dev` | Start development server with tsx watch |

| `npm run build` | Compile and type-check TypeScript |

| `npm run test:gemini` | Run the Gemini test script |

| `npm run test:kernel` | Run the Kernel test script |

| `npm run test:paypal` | Run the PayPal test script |



\## API Overview



The backend exposes the following route groups:



| Base URL | Purpose |

|---|---|

| `/api/auth` | Authentication |

| `/api/projects` | Project management |

| `/api/milestones` | Milestone management |

| `/api/ai` | AI milestone generation |

| `/health` | Health check |



For endpoint details, request formats, and response examples, see \*\*API\_DOCUMENTATION.md\*\*.



\## Authentication



Protected endpoints use JWT authentication.



Include the token in the request header:



```http

Authorization: Bearer YOUR\_JWT\_TOKEN

```



The token is returned after successful registration or login.



\## Important Design Decisions



1\. The project's stored budget is the authoritative budget for AI generation and milestone creation.

2\. Project currency is derived from the project.

3\. AI-generated milestone suggestions are not automatically persisted.

4\. Milestone status transitions are controlled by client and freelancer permissions.

5\. Payment simulation is not equivalent to actual payment processing.

6\. Sensitive provider errors and credentials should not be exposed in API responses.



\## Current Limitations



\- Public freelancer registration is not available through the registration endpoint.

\- Payment simulation does not transfer money.

\- A real payment provider integration, verified webhooks, and payment reconciliation are required before using the system for real transactions.

\- Budget checks currently use read-then-create logic; concurrent milestone creation may require stronger database-level protection.

\- Production deployment requires additional security, monitoring, and integration testing.



\## Future Improvements



\- Add a secure freelancer onboarding process.

\- Integrate a real payment gateway.

\- Implement payment webhook verification.

\- Improve budget allocation concurrency protection.

\- Add automated integration tests.

\- Add API documentation tooling.

\- Deploy the backend to a production environment.



\## Project Purpose



FairPay AI demonstrates how AI-assisted planning and structured milestone workflows can improve transparency between clients and freelancers.



It combines backend development, database modeling, authentication, validation, AI integration, and workflow management in one project.



