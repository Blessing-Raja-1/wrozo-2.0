# Wrozo 2.0 Backend Architecture & Server Trust Specification

## 1. Overview & Purpose
Wrozo 2.0 is a marketplace platform connecting daily-wage workers and contractors.
The backend layer serves as the **authoritative trust boundary** for the application.

```
┌─────────────────────────────────────────┐
│        Mobile Client (Flutter)          │
│             [UNTRUSTED]                 │
└──────────────────┬──────────────────────┘
                   │
                   │ HTTPS / Callable Functions
                   ▼
┌─────────────────────────────────────────┐
│   Firebase Cloud Functions (Node/TS)    │
│              [TRUSTED]                  │
│                                         │
│ • Privileged Role Operations            │
│ • Authoritative Job Lifecycle           │
│ • Application State Transactions        │
│ • Push Notifications (FCM)              │
│ • Payment Order Creation (Razorpay)     │
│ • Webhook Cryptographic Verification    │
└──────┬───────────────────────────┬──────┘
       │                           │
       │ Admin SDK (Server)        │ Cloud Secret Manager
       ▼                           ▼
┌──────────────────┐      ┌─────────────────────────┐
│ Cloud Firestore  │      │ Secrets / Configuration │
│                  │      │ • RAZORPAY_KEY_SECRET   │
│ Rules Enforced   │      │ • RAZORPAY_WEBHOOK_SECR │
│ for Client Writes│      │ (Never committed to Git)│
└──────────────────┘      └─────────────────────────┘
```

---

## 2. Client vs Server Trust Boundary

| Domain | Client Permission (Untrusted) | Server Responsibility (Authoritative) |
| :--- | :--- | :--- |
| **Authentication** | Requests OTP, provides Firebase ID token | Verifies caller token, identifies UID, asserts existence |
| **Role Assignment** | May select initial `WORKER` or `CONTRACTOR` | Strictly forbids `ADMIN` assignment; only server or admin CLI grants `ADMIN` |
| **User Status** | Read own profile; register FCM tokens | Suspends/reactivates accounts, audits trust & safety violations |
| **Worker / Contractor Profiles** | Edits name, skills, wage, availability | Enforces metric initialization to 0; client cannot forge rating, reviewCount, jobsCompleted, or isVerified |
| **Jobs** | Contractor creates job (`OPEN`), edits non-status fields | Validates lifecycle finite-state machine (`OPEN` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETED` / `CANCELLED`) |
| **Applications** | Worker submits (`PENDING`), contractor sets `ACCEPTED`/`REJECTED` | Atomic multi-document acceptance, remaining worker slot validation |
| **Chat & Messaging** | Sends messages in accepted conversation | Dispatches FCM push notifications, tracks unread counts |
| **Payments** | **ZERO CLIENT WRITES** (`allow write: if false`) | Creates orders, receives webhooks, cryptographically verifies HMAC signatures, updates payment state |
| **Reviews** | Submits single immutable review with rating 1..5 | Validates job completion and participant eligibility |

---

## 3. Cloud Functions Runtime & Modular Structure

- **Runtime:** Node.js 20 LTS (`"engines": { "node": "20" }`).
- **Language:** TypeScript 5 with strict compiler options.
- **SDK:** `firebase-functions` v6 (2nd Gen API) + `firebase-admin` v12/v13.
- **Directory Structure:**
  ```
  functions/
  ├── package.json
  ├── tsconfig.json
  ├── .gitignore
  └── src/
      ├── index.ts                     # Main entrypoint; exports callables & triggers
      ├── config/
      │   ├── firebase.ts              # Server-side Firebase Admin SDK singleton
      │   └── environment.ts           # Runtime parameters & Secret Manager bindings
      ├── shared/
      │   ├── types.ts                 # Authoritative domain types & interfaces
      │   ├── errors.ts                # AppError hierarchy & client-safe error sanitization
      │   ├── logger.ts                # Structured logger with automatic PII/secret redaction
      │   ├── errors.test.ts           # Unit tests for error handling
      │   └── logger.test.ts           # Unit tests for log sanitization
      ├── auth/
      │   ├── auth_helpers.ts          # requireAuth, requireRole, requireAdmin guards
      │   └── auth_helpers.test.ts     # Unit tests for authorization guards
      ├── users/
      │   └── user_service.ts          # Privileged role updates & account suspension
      ├── jobs/
      │   └── job_service.ts           # Authoritative job finite-state machine
      ├── applications/
      │   └── application_service.ts   # Application review workflows & transaction boundaries
      ├── chat/
      │   └── chat_service.ts          # Server-side notification dispatch (FCM)
      └── payments/
          └── payment_service.ts       # Razorpay order generation & webhook processing blueprint
  ```

---

## 4. Authoritative Firestore Data Models

### 1. `users/{userId}`
- **Document ID:** Firebase Auth UID.
- **Fields:**
  - `phone`: string (E.164 format)
  - `role`: optional `'WORKER' | 'CONTRACTOR' | 'ADMIN'`
  - `status`: `'ACTIVE' | 'SUSPENDED'`
  - `createdAt`: server timestamp
  - `fcmTokens`: optional string array
- **Rules:** Owner read; initial create allows only phone/status/createdAt; update allows setting role once if missing (WORKER or CONTRACTOR only). Client cannot assign ADMIN.

### 2. `worker_profiles/{userId}`
- **Document ID:** Worker UID.
- **Fields:**
  - `name`: string
  - `skills`: string array
  - `expectedWage`: integer (daily wage in INR)
  - `isAvailable`: boolean
  - `rating`: double (server-controlled, initialized to 0.0)
  - `reviewCount`: integer (server-controlled, initialized to 0)
  - `jobsCompleted`: integer (server-controlled, initialized to 0)

### 3. `contractor_profiles/{userId}`
- **Document ID:** Contractor UID.
- **Fields:**
  - `name`: string
  - `companyName`: string
  - `isVerified`: boolean (server-controlled, initialized to false)
  - `rating`: double (server-controlled, initialized to 0.0)
  - `reviewCount`: integer (server-controlled, initialized to 0)

### 4. `jobs/{jobId}`
- **Document ID:** Unique job ID.
- **Fields:**
  - `contractorId`: string (UID of posting contractor)
  - `title`: string
  - `description`: string
  - `skillsRequired`: string array
  - `wage`: integer (INR per day)
  - `status`: `'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'`
  - `workerCountNeeded`: integer
  - `createdAt`: server timestamp
  - `geohash`: optional string
  - `location`: optional GeoPoint

### 5. `applications/{appId}`
- **Composite Document ID:** `${jobId}_${workerId}`.
- **Fields:**
  - `jobId`: string
  - `workerId`: string
  - `contractorId`: string
  - `status`: `'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN'`
  - `createdAt`: server timestamp
  - `updatedAt`: server timestamp

### 6. `conversations/{conversationId}`
- **Canonical Composite Document ID:** Lexicographically sorted `minUID_maxUID`.
- **Fields:**
  - `participants`: array of exactly 2 distinct UIDs
  - `applicationId`: reference to an `ACCEPTED` application
  - `lastMessage`: string snippet
  - `lastMessageAt`: timestamp
  - `unreadCount`: map of UID to unread integer
- **Subcollection:** `conversations/{conversationId}/messages/{messageId}`
  - `senderId`: string (must match caller UID)
  - `text`: string (1..5000 characters)
  - `createdAt`: server timestamp
  - `isRead`: boolean

### 7. `payments/{paymentId}`
- **Document ID:** Unique payment transaction ID.
- **Fields:**
  - `jobId`: string
  - `workerId`: string
  - `contractorId`: string
  - `amount`: integer (amount in paise)
  - `status`: `'PENDING' | 'COMPLETED' | 'FAILED'`
  - `createdAt`: timestamp
  - `completedAt`: optional timestamp
  - `razorpayOrderId`: optional string
  - `razorpayPaymentId`: optional string
- **Rules:** Read allowed to participants; **ALL CLIENT WRITES DENIED** (`allow create, update, delete: if false`).

### 8. `reviews/{reviewId}`
- **Composite Document ID:** `${jobId}_${reviewerId}`.
- **Fields:**
  - `jobId`: string
  - `reviewerId`: string
  - `revieweeId`: string (reviewerId != revieweeId)
  - `rating`: number (1..5)
  - `comment`: string
  - `createdAt`: server timestamp
- **Rules:** Read authenticated; create requires composite ID, rating 1..5, caller is reviewer; updates and deletes denied.

---

## 5. Future Payment & Webhook Architecture (Razorpay Blueprint)

```
[Contractor App]             [Cloud Functions]               [Razorpay API]
       │                             │                              │
       │ 1. Request Payment Order    │                              │
       ├────────────────────────────►│                              │
       │ (jobId, workerId, amount)   │ 2. Validate Ownership & Job  │
       │                             ├─────────────────────────────►│
       │                             │    POST /v1/orders           │
       │                             │◄─────────────────────────────┤
       │                             │ 3. Create Firestore Payment  │
       │                             │    (status: PENDING)         │
       │ 4. Return Order Details     │                              │
       │◄────────────────────────────┤                              │
       │                             │                              │
       │ 5. Open Razorpay Checkout   │                              │
       │    Sheet & Complete Pay     │                              │
       │                             │                              │
       │                             │ 6. Webhook Notification      │
       │                             │    payment.captured          │
       │                             │◄─────────────────────────────┤
       │                             │ 7. Cryptographic HMAC Check  │
       │                             │    (RAZORPAY_WEBHOOK_SECRET) │
       │                             │ 8. Update Firestore Payment  │
       │                             │    (status: COMPLETED)       │
       │                             │ 9. Authoritative Job Update  │
       │                             │                              │
```

1. **Order Creation:** Contractor invokes callable `createPaymentOrder`. Server validates job ownership, invokes Razorpay Orders API, and writes a `PENDING` record in `/payments/{paymentId}` using Admin SDK.
2. **Client Checkout:** Mobile app receives `order_id` and presents the Razorpay native SDK checkout sheet.
3. **Webhook Verification (Crucial):**
   - The payment gateway sends an HTTPS POST event (`payment.captured` or `payment.failed`) to `/handlePaymentWebhook`.
   - The Cloud Function computes the HMAC-SHA256 digest of the raw request payload using `RAZORPAY_WEBHOOK_SECRET`.
   - If and only if the computed signature matches the `x-razorpay-signature` header, the payment status in Firestore is transitioned to `COMPLETED`.
   - Client claims are NEVER used to mark a payment completed.

---

## 6. Error Handling & Structured Logging

### Safe Error Handling Policy
1. Internal errors and database stack traces are caught by `handleFunctionError`.
2. Detailed diagnostics are logged privately to Google Cloud Logging.
3. The client receives only clean, predictable `HttpsError` objects with standardized codes (`unauthenticated`, `permission-denied`, `not-found`, `invalid-argument`, `failed-precondition`, `internal`).
4. Internal database connection strings, credentials, or server file paths are **never** returned in client error responses.

### Structured Logging Policy
1. Functions use `logger.info`, `logger.warn`, and `logger.error` emitting JSON payloads with `action` and `callerUid`.
2. The `sanitizeLogData` filter automatically redacts sensitive keywords:
   - `password`, `token`, `otp`, `secret`, `authorization`, `signature`, `pan`, `aadhaar`, `keySecret`, `webhookSecret`.

---

## 7. Secrets & Environment Configuration Policy

1. **Strict No-Secrets Rule:** No API keys, private keys, service account JSONs, or credentials are saved in Git.
2. **Runtime Parameters:** Non-sensitive parameters (e.g. `DEPLOYMENT_ENV`, `APP_REGION`) are configured via `firebase-functions/params` `defineString()`.
3. **Sensitive Secrets:** Future secrets (e.g. `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are declared via `defineSecret()` and provisioned directly into Google Cloud Secret Manager via:
   ```bash
   firebase functions:secrets:set RAZORPAY_KEY_SECRET
   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
   ```
4. **Local Emulator:** Untracked `functions/.secret.local` is gitignored and used strictly for local emulator testing.

---

## 8. Verification & Testing Strategy

- **Backend Unit Tests:** Run via `npm test` using Node.js built-in test runner (`node:test`, `node:assert`).
  - Covers auth guards, role checks, admin self-assignment blocking, error mapping, and log sanitization.
- **Firestore Security Rules:** Verified against Firebase Local Emulator (`62/62 passing`).
- **Flutter Client Integration:** Verified via `flutter test` (`14/14 passing`).
- **Static Analysis:** Verified via `flutter analyze --no-pub` (272 baseline issues, 0 new errors).

---

## 9. Current Limitations & Roadmap

- **Status:** Backend foundation, TypeScript build system, initialization, authorization helpers, structured logging, safe error handling, and architecture blueprint are fully implemented and verified.
- **Pending Implementation:**
  1. Live Razorpay merchant account configuration in Google Cloud Secret Manager.
  2. Full webhook HTTPS endpoint implementation and transaction handlers.
  3. FCM push notification trigger functions on Firestore subcollections.
