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

## 5. Authoritative Job Lifecycle & Application Workflow

### Authoritative Job Finite-State Machine

```
              ┌───────────────┐
              │     OPEN      │
              └───┬───────┬───┘
                  │       │
       First      │       │ Contractor
       Worker     │       │ Cancels
       Accepted   │       │
                  ▼       ▼
┌──────────────┐     ┌──────────────┐
│ IN_PROGRESS  │     │  CANCELLED   │ (Terminal)
└───┬──────┬───┘     └──────────────┘
    │      │
All │      │ Contractor
Work│      │ Cancels
Done│      │
    ▼      ▼
┌──────────────┐     ┌──────────────┐
│  COMPLETED   │     │  CANCELLED   │ (Terminal)
└──────────────┘     └──────────────┘
  (Terminal)
```

#### Valid Lifecycle Transitions:
- `OPEN` $\rightarrow$ `IN_PROGRESS`: Automatically triggered upon transactional acceptance of the first worker, or via authoritative status update.
- `OPEN` $\rightarrow$ `CANCELLED`: Contractor cancels the job post before work starts. Authoritative `cancelledAt` timestamp and reason recorded.
- `IN_PROGRESS` $\rightarrow$ `COMPLETED`: Contractor marks job completed. **Requires verification that accepted worker participation exists.** Sets authoritative `completedAt` timestamp.
- `IN_PROGRESS` $\rightarrow$ `CANCELLED`: Contractor cancels ongoing job due to unforeseen circumstances. Sets authoritative `cancelledAt` timestamp.
- **Terminal States:** `COMPLETED` and `CANCELLED`. Once entered, no further transitions are permitted.
- **Strictly Prohibited:** Direct transition from `OPEN` to `COMPLETED` without `IN_PROGRESS` and accepted workers; reverting `COMPLETED` or `CANCELLED` back to `OPEN`.

---

### Authoritative Application Workflow

#### 1. Worker Application Submission (`applyForJob`)
- Caller must be authenticated with `role == 'WORKER'`.
- Job must exist and must be in `OPEN` status.
- Worker cannot apply to their own job posting (`job.contractorId != worker.uid`).
- Application document ID is deterministically formed as `${jobId}_${workerId}`.
- If an application already exists for this pair, the request is rejected (`409 Conflict: You have already applied for this job`).
- Initial application status is always `PENDING` with server timestamps (`createdAt`, `updatedAt`).

#### 2. Transactional Application Acceptance (`acceptApplication`)
Executed inside an atomic Firestore transaction (`db.runTransaction`):
1. Verifies caller is authenticated with `role == 'CONTRACTOR'`.
2. Reads application document: must exist and be in `PENDING` status.
3. Verifies contractor owns the job (`job.contractorId == caller.uid`).
4. Reads job document: must be in `OPEN` or `IN_PROGRESS` status.
5. Counts existing accepted applications (`status == 'ACCEPTED'`).
6. **Enforces Capacity Limit:** If `acceptedCount >= job.workerCountNeeded`, transaction aborts with `ConflictError` (`Job capacity reached: all worker positions have been filled`).
7. Updates application document to `ACCEPTED` with authoritative timestamp.
8. If the job was in `OPEN` status, atomically transitions job status to `IN_PROGRESS`.
9. Concurrency race conditions (simultaneous acceptances exceeding worker quota) are eliminated by the transaction boundary.

#### 3. Application Rejection (`rejectApplication`)
- Caller must own the job.
- Application must be in `PENDING` status.
- Transitions status to `REJECTED` with optional rejection reason.

#### 4. Worker Withdrawal (`withdrawApplication`)
- Caller must be the applicant worker.
- Application must be in `PENDING` status.
- **Prohibited:** Cannot withdraw an application that has already been `ACCEPTED` (`ConflictError`).
- Transitions status to `WITHDRAWN`.

---

### Callable Cloud Functions Catalog

| Function Name | Allowed Role | Input Interface | Output | Description |
| :--- | :--- | :--- | :--- | :--- |
| `getBackendStatus` | Any / Anonymous | `{}` | Status & Region | Verifies backend connectivity and deployment environment |
| `createJob` | `CONTRACTOR` | `CreateJobInput` | `{ jobId }` | Authoritatively validates parameters and creates an OPEN job |
| `transitionJobStatus` | `CONTRACTOR` | `TransitionJobStatusInput` | `{ success }` | Enforces state machine transitions (COMPLETED, CANCELLED) |
| `applyForJob` | `WORKER` | `ApplyForJobInput` | `{ applicationId }` | Verifies eligibility, composite ID, and creates PENDING application |
| `acceptApplication` | `CONTRACTOR` | `AcceptApplicationInput` | `{ applicationId, jobStatus }` | Transactionally accepts worker and enforces capacity limits |
| `rejectApplication` | `CONTRACTOR` | `RejectApplicationInput` | `{ success }` | Authoritatively rejects a PENDING application |
| `withdrawApplication` | `WORKER` | `WithdrawApplicationInput` | `{ success }` | Allows worker to withdraw a PENDING application |

---

## 6. Authoritative Payment & Webhook Architecture (Razorpay Foundation)

```
[Contractor App]             [Cloud Functions]               [Razorpay API]
       │                             │                              │
       │ 1. createPaymentOrder()     │                              │
       ├────────────────────────────►│                              │
       │ (jobId, workerId)           │ 2. Authoritative Amount      │
       │                             │    Derivation (wage * 100)   │
       │                             │ 3. Check Accepted App & State│
       │                             ├─────────────────────────────►│
       │                             │    POST /v1/orders           │
       │                             │◄─────────────────────────────┤
       │                             │ 4. Create Firestore Payment  │
       │                             │    (status: CREATED)         │
       │ 5. Return Order Details     │                              │
       │◄────────────────────────────┤                              │
       │ (orderId, amount, keyId)    │                              │
       │                             │                              │
       │ 6. Open Razorpay Checkout   │                              │
       │    Sheet & Complete Pay     │                              │
       │                             │                              │
       │                             │ 7. Webhook Notification      │
       │                             │    payment.captured / etc.   │
       │                             │◄─────────────────────────────┤
       │                             │ 8. Timing-Safe HMAC Check    │
       │                             │    (RAZORPAY_WEBHOOK_SECRET) │
       │                             │ 9. Deduplicate via eventId   │
       │                             │    (/webhook_events/{id})    │
       │                             │ 10. Check State Machine      │
       │                             │ 11. Update Firestore Payment │
       │                             │    (status: CAPTURED)        │
       │                             │                              │
```

### 1. Server-Side Order Creation (`createPaymentOrder`)
- Contractor invokes callable Cloud Function `createPaymentOrder({ jobId, workerId })`.
- **Authoritative Amount:** Client amounts are ignored; the server derives `amountInPaise = Math.round(job.wage * 100)` from the verified job document.
- **Preconditions:** Caller must own the job; job status must be `IN_PROGRESS` or `COMPLETED`; worker must have an `ACCEPTED` application (`applications/${jobId}_${workerId}`).
- **Idempotency:** Rejects duplicate payment attempts for `CAPTURED` jobs; reuses existing active order if in `CREATED` status.
- **Secrets Isolation:** Key secret resides strictly in Google Cloud Secret Manager; only public `keyId` is sent to the client.

### 2. Authoritative Payment State Machine
```
               ┌───────────────┐
               │    CREATED    │
               └──┬────┬─────┬─┘
                  │    │     │
                  │    │     └──────────────┐
                  ▼    ▼                    ▼
     ┌───────────────┐ ┌───────────────┐ ┌──────────────┐
     │  AUTHORIZED   │ │   CAPTURED    │ │    FAILED    │ (Terminal)
     └──┬────────────┘ └───────┬───────┘ └──────────────┘
        │      ▲               │
        │      │               │ Contractor/Admin
        │      │               │ Refunds
        ▼      │               ▼
 ┌─────────────┴─┐     ┌───────────────┐
 │    FAILED     │     │   REFUNDED    │ (Terminal)
 └───────────────┘     └───────────────┘
    (Terminal)
```
- **Valid Transitions:**
  - `CREATED` $\rightarrow$ `AUTHORIZED`, `CREATED` $\rightarrow$ `CAPTURED`, `CREATED` $\rightarrow$ `FAILED`
  - `AUTHORIZED` $\rightarrow$ `CAPTURED`, `AUTHORIZED` $\rightarrow$ `FAILED`
  - `CAPTURED` $\rightarrow$ `REFUNDED`
- **Illegal Transitions Blocked:** `CAPTURED` cannot become `FAILED`; `FAILED` cannot become `CAPTURED`; `REFUNDED` cannot transition to any status.

### 3. Webhook Handling & Cryptographic Verification (`handlePaymentWebhook`)
- Gateway posts HTTPS event payload to `/handlePaymentWebhook`.
- **HMAC-SHA256 Timing-Safe Verification:** Computes HMAC digest with `RAZORPAY_WEBHOOK_SECRET` and compares with `x-razorpay-signature` header using `crypto.timingSafeEqual` to neutralize timing side-channel attacks.
- **Replay & Duplicate Protection:** Deduplicates event deliveries against `/webhook_events/{eventId}`. Redeliveries return 200 `{ status: "ignored", reason: "duplicate_event" }`.
- **Tampering Detection:** Validates consistency of `order_id`, `amount`, and `jobId`/`workerId` metadata against the stored Firestore payment record.


---

## 7. Error Handling & Structured Logging

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

## 8. Secrets & Environment Configuration Policy

1. **Strict No-Secrets Rule:** No API keys, private keys, service account JSONs, or credentials are saved in Git.
2. **Runtime Parameters:** Non-sensitive parameters (e.g. `DEPLOYMENT_ENV`, `APP_REGION`) are configured via `firebase-functions/params` `defineString()`.
3. **Sensitive Secrets:** Future secrets (e.g. `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) are declared via `defineSecret()` and provisioned directly into Google Cloud Secret Manager via:
   ```bash
   firebase functions:secrets:set RAZORPAY_KEY_SECRET
   firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
   ```
4. **Local Emulator:** Untracked `functions/.secret.local` is gitignored and used strictly for local emulator testing.

---

## 9. Verification & Testing Strategy

- **Backend Unit Tests:** Run via `npm test` using Node.js built-in test runner (`node:test`, `node:assert`).
  - Covers auth guards, role checks, admin self-assignment blocking, error mapping, log sanitization, job finite-state machine, and application workflows (42/42 tests passing).
- **Firestore Security Rules:** Verified against Firebase Local Emulator (`62/62 passing`).
- **Flutter Client Integration:** Verified via `flutter test` (`14/14 passing`).
- **Static Analysis:** Verified via `flutter analyze --no-pub` (272 baseline issues, 0 new errors).
- **Debug APK Build:** Verified via `flutter build apk --debug`.

---

## 10. Current Limitations & Roadmap

- **Status:** Backend foundation, TypeScript build system, authorization helpers, structured logging, safe error handling, authoritative job lifecycle finite-state machine, transactional application acceptance, authoritative Razorpay payment foundation (`createPaymentOrder`), timing-safe webhook HMAC-SHA256 verification (`handlePaymentWebhook`), and idempotent event deduplication (`webhook_events/{eventId}`) are fully implemented and verified.
- **Pending Implementation:**
  1. Live Razorpay merchant account credentials provisioned in production Google Cloud Secret Manager (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`).
  2. Live webhook URL registration in Razorpay Merchant Dashboard pointing to `/handlePaymentWebhook`.
  3. FCM push notification trigger functions on Firestore subcollections.
