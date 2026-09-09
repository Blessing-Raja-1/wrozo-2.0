# Firebase App Check & Backend Abuse-Protection Foundation

> **Document Classification:** Security Architecture & Technical Specification  
> **Target Version:** Wrozo 2.0 (`1.0.0+1`)  
> **Application ID:** `com.wrozo.wrozo`  
> **Target Firebase Project:** `wrozo-5b147` (Project Number: `448205141152`)  
> **Status:** Foundation Implemented (Client & Server Verified; Production Console Attestation Pending)  

---

## 1. Executive Summary & Security Principle

Firebase App Check helps verify that incoming requests originate from a genuine, unaltered Wrozo application and not from unauthorized automated scripts, bots, modified APKs, or scraping utilities.

### 1.1 The Triad of Cloud Security

```
+-------------------------------------------------------------------------------+
|                             REQUEST EVALUATION                                |
|                                                                               |
|  1. Firebase App Check        2. Firebase Authentication    3. Authorization  |
|  ---------------------        --------------------------    ----------------- |
|  "Is this an authentic        "WHO is the user making       "WHAT is this     |
|   Wrozo client build?"         this request?"                user allowed     |
|                                                              to do?"          |
|  Play Integrity / Debug       Phone Auth UID Token          Capabilities &    |
|  Attestation Token                                          Firestore Rules   |
+-------------------------------------------------------------------------------+
```

> [!IMPORTANT]
> **Fundamental Security Principles:**
> 1. **Authentication (Firebase Auth)** proves **WHO** the user is.
> 2. **Authorization (Firestore Rules & Cloud Functions)** determines **WHAT** the user is allowed to do.
> 3. **Firebase App Check** verifies that requests originate from an authentic Wrozo client application.
> 4. **App Check must NEVER replace authentication or authorization.**
> 5. A valid App Check token grants zero permissions, zero capabilities, and zero bypass of Firestore security rules or server-side role checks.

---

## 2. Flutter App Check Integration

### 2.1 Attestation Provider Configuration

The Flutter client integrates the official `firebase_app_check` plugin via [`lib/core/security/app_check_service.dart`](file:///c:/Users/bless/Wrozo2/lib/core/security/app_check_service.dart), initialized in [`lib/main.dart`](file:///c:/Users/bless/Wrozo2/lib/main.dart) immediately following `Firebase.initializeApp()`:

| Platform | Environment | Attestation Provider | Security & Behavioral Characteristics |
| :--- | :--- | :--- | :--- |
| **Android** | Production (`kReleaseMode`) | `AndroidProvider.playIntegrity` | Leverages Google Play Integrity API to verify binary hash, signing certificate, device integrity, and Google Play licensing. |
| **Android** | Development / Debug | `AndroidProvider.debug` | Generates a local App Check debug token in device logs for development without requiring Google Play licensing. |
| **iOS / macOS** | Production (`kReleaseMode`) | `AppleProvider.appAttestWithDeviceCheckFallback` | Modern Apple App Attest service with seamless hardware DeviceCheck fallback. |
| **iOS / macOS** | Development / Debug | `AppleProvider.debug` | Debug token provider for Xcode simulator environments. |

### 2.2 Safe App Startup Initialization

The client initialization is wrapped in defensive exception handling:
```dart
try {
  await FirebaseAppCheck.instance.activate(
    androidProvider: isDebug ? AndroidProvider.debug : AndroidProvider.playIntegrity,
    appleProvider: isDebug ? AppleProvider.debug : AppleProvider.appAttestWithDeviceCheckFallback,
  );
} catch (e, stack) {
  // In development, emulators without Play Services, or offline devices,
  // log warning without crashing the client application startup.
}
```

---

## 3. Backend & Cloud Functions Architecture

### 3.1 Protected Sensitive Callable Functions

Ten high-value, sensitive callable Cloud Functions in [`functions/src/index.ts`](file:///c:/Users/bless/Wrozo2/functions/src/index.ts) are configured with App Check enforcement:

```typescript
{
  region: "asia-south1",
  cors: true,
  enforceAppCheck: shouldEnforceAppCheck(),
}
```

1. **`setupAccountCapabilities`**: Configures worker/contractor capabilities for user accounts.
2. **`createJob`**: Publishes new job postings with wage and worker capacity.
3. **`transitionJobStatus`**: Authoritative job state machine transitions (`OPEN` -> `IN_PROGRESS` -> `COMPLETED`/`CANCELLED`).
4. **`applyForJob`**: Submits worker job applications.
5. **`acceptApplication`**: Transactionally accepts applicants with atomic capacity checks.
6. **`rejectApplication`**: Rejects pending applicants.
7. **`withdrawApplication`**: Allows applicants to withdraw pending applications.
8. **`createPaymentOrder`**: Generates authoritative Razorpay orders (also configured with `consumeAppCheckToken: shouldEnforceAppCheck()` for replay protection).
9. **`registerDeviceToken`**: Registers FCM device tokens.
10. **`unregisterDeviceToken`**: Unregisters FCM device tokens on logout.

### 3.2 Non-Enforced Endpoints

- **`getBackendStatus`**: Healthcheck and system diagnostics endpoint (accessible without attestation).
- **`handlePaymentWebhook`**: Server-to-server HTTP webhook invoked directly by Razorpay infrastructure (authenticated via cryptographic HMAC-SHA256 signature verification rather than mobile App Check tokens).
- **`onChatMessageCreated`**: Background Firestore document creation trigger (operates in trusted backend runtime).

### 3.3 Replay Protection for Financial Operations

For `createPaymentOrder`, App Check token consumption is enabled:
- `consumeAppCheckToken: shouldEnforceAppCheck()`
- The Cloud Function runtime consumes the token on first use.
- Replay attempts present an already-consumed token (`request.app.alreadyConsumed === true`).
- `paymentService.createPaymentOrder()` explicitly rejects consumed tokens with `ConflictError("App Check token has already been consumed. Replay attempt rejected.")`.

---

## 4. Development vs. Production Behavior

To maintain local developer productivity, automated testing, and CI/CD pipelines without requiring hardware attestation:

```typescript
export function shouldEnforceAppCheck(): boolean {
  if (process.env.ENFORCE_APP_CHECK === "true") return true;
  if (process.env.ENFORCE_APP_CHECK === "false") return false;
  return getBackendConfig().isProduction;
}
```

- **Production Environment (`DEPLOYMENT_ENV="production"`):**
  - Cloud Functions infrastructure auto-responds with `401 Unauthorized` if App Check is missing or invalid.
  - Replays of consumed tokens on payment orders are rejected.
- **Local Emulators / Test Environment (`DEPLOYMENT_ENV="development"`):**
  - `shouldEnforceAppCheck()` resolves to `false`.
  - Automated integration tests and unit tests run unimpeded without requiring mock App Check headers.
  - Invariant tests explicitly pass `{ required: true }` or set `ENFORCE_APP_CHECK="true"` to verify failure modes.

---

## 5. Abuse Protection Audit & Hardened Invariants

Beyond App Check client verification, Wrozo 2.0 enforces defense-in-depth abuse protections across all services:

### 5.1 Implemented Protections

| Domain | Abuse Vector | Enforced Protection | Location |
| :--- | :--- | :--- | :--- |
| **Job Posting** | Spamming thousands of open jobs | Cap of 50 active `OPEN` jobs per contractor account. Excess returns `ConflictError`. | [`job_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/jobs/job_service.ts#L69-L78) |
| **Job Posting** | Unbounded skills array / strings | Max 20 skills; max 50 chars per skill string. Excess returns `ValidationError`. | [`job_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/jobs/job_service.ts#L53-L58) |
| **Job Posting** | Absurd wage values / overflows | Max wage capped at ₹10,00,000 (positive integer). Excess returns `ValidationError`. | [`job_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/jobs/job_service.ts#L63-L65) |
| **Job Posting** | Absurd worker counts | Max `workerCountNeeded` capped at 100 workers. Excess returns `ValidationError`. | [`job_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/jobs/job_service.ts#L68-L70) |
| **Applications** | Duplicate spam applications | Deterministic ID `${jobId}_${workerId}` rejects duplicate applications with `ConflictError`. | [`application_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/applications/application_service.ts#L50-L57) |
| **Applications** | Oversized identifiers | `jobId` capped at 100 chars; `applicationId` capped at 150 chars. | [`application_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/applications/application_service.ts#L30) |
| **Payments** | Unbounded unpaid orders / Replay | Idempotent reuse of active orders; duplicate block on `CAPTURED`; App Check replay rejection. | [`payment_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/payments/payment_service.ts#L112-L125) |
| **Device Tokens** | Unbounded subcollection growth | Max 10 registered device tokens per user; oldest token auto-pruned upon 11th registration. | [`token_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/notifications/token_service.ts#L70-L90) |
| **Chat** | Text flooding / message spam | Firestore rules enforce message text between 1 and 5000 characters; requires `ACCEPTED` application. | [`firestore.rules`](file:///c:/Users/bless/Wrozo2/firestore.rules#L210-L240) |
| **Capabilities** | Privilege self-escalation | Rejects any unrecognized keys (e.g. `admin`); capabilities direct writes denied in rules. | [`user_service.ts`](file:///c:/Users/bless/Wrozo2/functions/src/users/user_service.ts#L118-L123) |

### 5.2 Future Rate Limiting Requirements (Recommended Infrastructure)

For high-scale public operations, the following rate-limiting patterns are planned for post-launch infrastructure:
1. **Redis / Memorystore Token Bucket:** Distributed sliding-window rate limiting on OTP request endpoints (e.g., max 3 OTP requests per phone number per hour).
2. **Cloud Armor / WAF:** Rate limiting IP-level requests on the Razorpay webhook HTTPS endpoint to protect against distributed DoS attacks.
3. **Firestore Rate Limit Counters:** Distributed counter sharding for contractor job posting frequency if spam volume exceeds single-document write quotas.

---

## 6. What App Check Does NOT Protect

To maintain architectural clarity, developers and security auditors must remember:
1. **App Check does NOT replace Firebase Authentication:** A compromised device or emulator running genuine code can still submit requests with valid App Check; authentication confirms user identity.
2. **App Check does NOT validate business permissions:** An authentic app build can still be operated by a worker trying to perform contractor actions; capability authorization is mandatory.
3. **App Check does NOT sanitize inputs:** Valid App Check traffic can contain malicious payloads; server-side type and bounds validation is mandatory.
4. **App Check does NOT prevent compromised accounts:** Stolen credentials on a real phone will pass App Check.

---

## 7. Firebase Console Configuration Requirements (Production Readiness)

Before enabling App Check enforcement in production, the following steps must be completed in the Firebase Console:

1. **Google Play Integrity API:**
   - Link Google Play Console project to Firebase project `wrozo-5b147`.
   - In Firebase Console -> App Check -> Apps -> Android (`com.wrozo.wrozo`) -> Register Play Integrity.
2. **Debug Tokens (For Testing on Physical Devices & Emulators):**
   - In debug mode, App Check prints a debug token to Logcat:
     `D/AppCheckService: Enter this debug secret into the allow list in the Firebase Console: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
   - Add this debug token in Firebase Console -> App Check -> Apps -> Manage debug tokens.
3. **Enforcement Mode:**
   - Initially set App Check to **Metrics Only (Monitoring Mode)** in Firebase Console to monitor unverified traffic without dropping requests.
   - After confirming 99%+ of production traffic is verified, enable **Enforce** mode.
