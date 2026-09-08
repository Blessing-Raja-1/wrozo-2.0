# Wrozo 2.0 Current Status

## Project Identity
- **Name:** Wrozo 2.0 (VERIFIED)
- **Type:** Worker / Contractor marketplace platform (VERIFIED)
- **Client:** Flutter + Dart (Android primary target) (VERIFIED)
- **Repository:** https://github.com/Blessing-Raja-1/wrozo-2.0.git (VERIFIED)
- **Local Path:** `C:\Users\bless\Wrozo2` (VERIFIED)

## Current Development Phase
- Authoritative Job Lifecycle & Application Workflow Implemented (VERIFIED: 2026-09-09)

## Current Objective
- Implement payment order creation and webhook processing when Razorpay merchant credentials become available (PLANNED)

## Overall Status
- Authoritative Job Lifecycle finite-state machine (`OPEN` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`) and transactional application acceptance workflow implemented in Firebase Cloud Functions. Atomic capacity limits (`workerCountNeeded`), duplicate application prevention, role guards (`WORKER`, `CONTRACTOR`), and state transition validations fully verified. 42/42 backend unit tests pass. 62/62 Firestore security rules emulator tests pass. 14/14 Flutter tests pass. 272 analyzer issues (baseline maintained, 0 new errors). Android debug APK builds cleanly in 33.4s (`build\app\outputs\flutter-apk\app-debug.apk`) (VERIFIED)

## Completed
- Verified active workspace location and Git remote / branch tracking (VERIFIED)
- Verified repository clean state (`origin/main`) (VERIFIED)
- Initialized project memory (`docs/current-status.md`) and core agent rules (`.agents/rules/wrozo-core.md`) (VERIFIED)
- Completed full codebase audit spanning lib, android, test, pubspec, firestore.rules, and firebase.json (VERIFIED)
- **SEC-01:** Role escalation prevented in `firestore.rules` `/users/{userId}` — role is now immutable once set; initial assignment validated against allowlist; ADMIN is unconditionally rejected (VERIFIED)
- **SEC-01:** Defence-in-depth allowlist guard added to `AuthRepository.setRole()` — rejects ADMIN and invalid roles before any Firestore network call (VERIFIED)
- **SEC-02:** All client writes to `payments/{paymentId}` denied — `allow create: if false`, `allow update: if false`, `allow delete: if false` (VERIFIED)
- **SEC-02:** `PaymentRepository.initiatePayment()` and `markPaymentCompleted()` now throw `UnsupportedError` immediately (VERIFIED)
- **SEC-02:** `PaymentController.payWorker()` updated to call the safe-fail repository method (VERIFIED)
- **SEC-03:** Worker profile create rule now requires `rating == 0`, `reviewCount == 0`, `jobsCompleted == 0` (VERIFIED)
- **SEC-03:** Contractor profile create rule now requires `rating == 0`, `reviewCount == 0`, `isVerified == false` (VERIFIED)
- Security attack scenarios documented in `test/security/security_rules_scenarios.dart` (VERIFIED)
- Pushed security checkpoint commit `c14a85f` to `origin/main` (VERIFIED)
- **BUILD-01 (Widget Test):** Replaced non-existent `MyApp` with `WrozoApp` wrapped in `ProviderScope` with `appUserProvider` override in `test/widget_test.dart`. Test compiles and passes (1/1) (VERIFIED)
- **BUILD-02 (Google Services Plugin):** Added `com.google.gms.google-services:4.4.2` to `android/settings.gradle.kts` and applied in `android/app/build.gradle.kts` (VERIFIED)
- **BUILD-03 (Android Permissions):** Added `INTERNET`, `ACCESS_FINE_LOCATION`, and `ACCESS_COARSE_LOCATION` to `android/app/src/main/AndroidManifest.xml` (VERIFIED)
- Pushed build foundation checkpoint commit `ff00756` to `origin/main` (VERIFIED)
- **FIREBASE-01 (Android Configuration):** Configured official `android/app/google-services.json` containing `com.wrozo.wrozo` matching `android/app/build.gradle.kts` `applicationId` (VERIFIED)
- **SEC-TEST-01 (Firestore Security Rules Dynamic Emulator Testing):**
  - Configured Firestore emulator in `firebase.json` and added `package.json` with `@firebase/rules-unit-testing`.
  - Tightened `firestore.rules`: composite application ID, composite review ID, review rating validation (1..5), self-review prevention, application and review client delete denial.
  - Implemented 45 executable test cases across 5 security domains in `test/security/rules.test.mjs`.
  - Pushed security checkpoint commit `f2aa22f` to `origin/main` (VERIFIED)
- **SEC-CHAT-01 (Chat Messaging Repair & Authorization Hardening):**
  - Hardened `firestore.rules`: canonical 2-participant conversation ID enforced (`minUID_maxUID`), conversation creation gated strictly on server-verified `ACCEPTED` job application (`applications/{applicationId}`), participant/application immutability enforced, message creation requires `senderId == request.auth.uid` and text bounds (1–5000 chars), messages immutable, client delete denied for conversations and messages (VERIFIED)
  - Repaired `ChatRepository`: two-phase flow for initial message (creates parent conversation before message subcollection insertion), metadata-only updates for subsequent messages (never touching `participants`), safe read marker on uncreated conversations, in-memory conversation list sorting by `lastMessageAt` (VERIFIED)
  - Updated `ChatController`: added optional `applicationId` support and loading state management (VERIFIED)
  - Updated `ConversationScreen`: error snackbar notification on failed send, safe peer ID substring handling, loading indicator during message sending (VERIFIED)
  - Updated `ChatInboxScreen`: safe substring handling for short user IDs (VERIFIED)
  - Added 17 executable test cases in `test/security/rules.test.mjs` (Group F: Chat Security) — 17/17 passed (VERIFIED)
- **NAV-01 (Role-Based Dashboard Navigation & Route Wiring):**
  - Wired 4 previously unrouted screens into `lib/core/routing/app_router.dart`:
    - `/jobs/discover` -> `JobDiscoveryScreen`
    - `/jobs/post` -> `JobPostingScreen`
    - `/profile` -> `ProfileSetupScreen`
    - `/applicant_review/:jobId` -> `ApplicantReviewScreen`
  - Rebuilt `HomeScreen` (`lib/features/home/presentation/screens/home_screen.dart`) into a role-tailored dashboard:
    - **Worker:** Find Nearby Jobs (`/jobs/discover`), Complete Profile (`/profile`), Messages (`/chat`), and real-time "My Applications" tracking.
    - **Contractor:** Post a Job (`/jobs/post`), Company Profile (`/profile`), Messages (`/chat`), and real-time "My Posted Jobs" with "Review Applicants" (`/applicant_review/:jobId`) navigation.
    - Preserved logout action via `authRepositoryProvider.signOut()`.
  - Fixed minimal compilation blockers on previously unrouted screens:
    - `worker_profile.dart`: Cast skills dynamic iterable.
    - `job.dart`: Cast skillsRequired dynamic iterable.
    - `job_repository.dart`: Updated `watchNearbyJobs` for `geoflutterfire_plus` 0.0.34 API (`geopointFrom`, query mapping).
    - `profile_setup_screen.dart`, `applicant_review_screen.dart`, `job_discovery_screen.dart`: Corrected broken relative imports using package imports.
  - Added automated tests in `test/navigation/dashboard_navigation_test.dart` verifying role separation and dashboard button existence (3/3 tests passed) (VERIFIED)
  - Pushed dashboard navigation checkpoint commit `0d6924e` to `origin/main` (VERIFIED)
- **SEC-AUDIT-01 (Secrets & Configuration Exposure Audit):**
  - Audited full repository and historical commits `3ba52d7` through `0d6924e` for leaked API keys, tokens, private keys, keystores, and passwords. Zero private secrets or server credentials found.
  - Verified `android/app/google-services.json` and `lib/firebase_options.dart` contain only non-sensitive public client configuration for `com.wrozo.wrozo`.
  - Fortified `.gitignore` with ignore patterns for `.env*`, `key.properties`, `*.keystore`, `*.jks`, `*.pem`, `*.p12`, `*.pfx`, `*.key`, `*.crt`, `*service-account*.json`, and editor backup files.
  - Documented complete secrets taxonomy and storage standards in `docs/security/secrets-and-config.md`.
  - Pushed secrets audit checkpoint commit `e943474` to `origin/main` (VERIFIED)
- **L10N-01 (App Localization Foundation):**
  - Established 5 language ARB files in `lib/core/localization/l10n/` with 40 marketplace terms:
    - `app_en.arb` (English - default)
    - `app_hi.arb` (Hindi)
    - `app_ta.arb` (Tamil)
    - `app_te.arb` (Telugu)
    - `app_mr.arb` (Marathi)
  - Generated standard Flutter localization classes via `flutter gen-l10n`: `AppLocalizations`, `AppLocalizationsEn`, `AppLocalizationsHi`, `AppLocalizationsTa`, `AppLocalizationsTe`, and `AppLocalizationsMr`.
  - Registered `AppLocalizations.localizationsDelegates` and `AppLocalizations.supportedLocales` in `lib/main.dart` with localized `onGenerateTitle`.
  - Added automated tests in `test/localization/localization_test.dart` covering 5-locale lookup resolution, string non-emptiness, unsupported locale fallback, and widget context resolution.
  - Pushed localization checkpoint commit `c2c1069` to `origin/main` (VERIFIED)
- **MAPS-01 (Secure Google Maps Android Configuration):**
  - Configured `android/app/build.gradle.kts` to safely load `local.properties` via `rootProject.file("local.properties")` and inject `MAPS_API_KEY` into `manifestPlaceholders`.
  - Added `com.google.android.geo.API_KEY` meta-data to `android/app/src/main/AndroidManifest.xml` referencing `${MAPS_API_KEY}`.
  - Confirmed merged manifest substitution (`build/app/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml`) replaces placeholder without key leakage.
  - Updated local untracked `android/local.properties` with placeholder template and Google Cloud Console restriction guidance (`com.wrozo.wrozo` + SHA-1 fingerprints) (VERIFIED)
- **BACKEND-01 (Secure Firebase Cloud Functions Backend Foundation):**
  - Configured Firebase Cloud Functions in `firebase.json` (source: `functions`, codebase: `default`, build predeploy) and emulator on port 5001.
  - Established `functions/` directory using TypeScript 5 toolchain targeting Node.js 20 LTS runtime.
  - Created server-side Firebase Admin SDK singleton in `functions/src/config/firebase.ts` with zero hardcoded credentials.
  - Configured runtime environment parameters and Secret Manager bindings in `functions/src/config/environment.ts` (`defineString`, `defineSecret`).
  - Created domain types and interfaces in `functions/src/shared/types.ts` mirroring Firestore collections.
  - Created structured error strategy and safe client-facing error sanitization in `functions/src/shared/errors.ts` (`handleFunctionError`).
  - Created structured logging with automated PII/secret redaction in `functions/src/shared/logger.ts` (`sanitizeLogData`).
  - Implemented reusable server-side authorization guards in `functions/src/auth/auth_helpers.ts` (`requireAuth`, `getUserRecord`, `requireRole`, `requireWorker`, `requireContractor`, `requireAdmin`, `assertNotAdminSelfAssignment`).
  - Established domain service boundaries: `users/user_service.ts`, `jobs/job_service.ts`, `applications/application_service.ts`, `chat/chat_service.ts`, and `payments/payment_service.ts` (Razorpay order creation and HMAC-SHA256 webhook verification blueprint).
  - Created `getBackendStatus` healthcheck callable function in `functions/src/index.ts`.
  - Created `getBackendStatus` healthcheck callable function in `functions/src/index.ts`.
  - Authored comprehensive backend architecture specification in `docs/architecture/backend.md`.
  - Fortified `.gitignore` with `/functions/lib/` and `/functions/.secret.local` (VERIFIED)
- **LIFECYCLE-01 (Authoritative Job Lifecycle & Transactional Application Workflow):**
  - Implemented Authoritative Job Finite-State Machine in `functions/src/jobs/job_service.ts`:
    - `OPEN` -> `IN_PROGRESS`, `OPEN` -> `CANCELLED`
    - `IN_PROGRESS` -> `COMPLETED`, `IN_PROGRESS` -> `CANCELLED`
    - Terminal states (`COMPLETED`, `CANCELLED`); direct transition from `OPEN` to `COMPLETED` strictly forbidden.
    - Precondition validation for `COMPLETED`: requires state `IN_PROGRESS` and verified accepted worker participation.
    - Authoritative job creation (`createJob`) with input validation (title, description, skills, wage, worker count, location).
  - Implemented Transactional Application Workflow in `functions/src/applications/application_service.ts`:
    - Worker application submission (`applyForJob`) with role check, self-job application prevention, non-OPEN job rejection, and composite ID collision prevention.
    - Transactional contractor acceptance (`acceptApplication`) with Firestore `runTransaction`: atomically checks capacity (`acceptedCount < workerCountNeeded`), updates status to `ACCEPTED`, and transitions job `OPEN` -> `IN_PROGRESS` on first accepted worker.
    - Contractor rejection (`rejectApplication`) of PENDING applications.
    - Worker withdrawal (`withdrawApplication`) of PENDING applications (rejection if already ACCEPTED).
  - Exported callable Cloud Functions in `functions/src/index.ts`: `createJob`, `transitionJobStatus`, `applyForJob`, `acceptApplication`, `rejectApplication`, `withdrawApplication`.
  - Added 20 new backend unit tests across `job_service.test.ts` and `application_service.test.ts` (42/42 total backend unit tests passing).
- Executed verification commands:
  - `npm --prefix functions test`: 42/42 unit tests passed across 16 suites (VERIFIED)
  - `npm --prefix functions run build`: TypeScript compiled with 0 errors (VERIFIED)
  - `firebase emulators:exec --only firestore "node --test test/security/rules.test.mjs"`: 62/62 passed (VERIFIED)
  - `flutter test`: 14/14 passed (1 widget + 3 navigation + 10 localization tests) (VERIFIED)
  - `flutter analyze --no-pub`: 272 issues (baseline maintained, 0 new errors) (VERIFIED)
  - `git diff --check`: clean (VERIFIED)
  - `flutter build apk --debug`: Succeeded (`build\app\outputs\flutter-apk\app-debug.apk`) in 33.4s (VERIFIED)

## In Progress
- None (VERIFIED)

## Blocked
- Google Maps live map rendering requires developer to supply a real restricted Google Cloud Console Maps API key in untracked `android/local.properties`. Gradle manifest placeholder wiring is fully implemented and verified (PARTIAL / CONFIGURATION WIRED)

## Known Bugs
- `test/widget_test.dart`: Fixed. References `WrozoApp`, compiles and passes (VERIFIED)
- `ChatRepository.sendMessage` fails against Firestore rules: Fixed. Implemented two-phase creation, metadata-only updates, and hardened rules (VERIFIED)
- Android runtime crash: `AndroidManifest.xml` permissions added (`INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`) (VERIFIED)
- Android runtime crash: `AndroidManifest.xml` lacks Google Maps API key meta-data: Fixed. `com.google.android.geo.API_KEY` meta-data wired through Gradle manifestPlaceholders from untracked `local.properties` (VERIFIED)
- Android build failure: Fixed. Google Services plugin and `google-services.json` aligned with `com.wrozo.wrozo`, debug APK built successfully (VERIFIED)
- Unwired Navigation: Fixed. `HomeScreen` provides role-based navigation and GoRouter routes wired to `JobDiscoveryScreen`, `JobPostingScreen`, `ProfileSetupScreen`, and `ApplicantReviewScreen` (VERIFIED)
- Localization broken: Fixed. `AppLocalizations` delegates registered in `main.dart`; complete ARB files established for `en`, `hi`, `ta`, `te`, `mr` (VERIFIED)

## Security Status
- **FIXED (SEC-01):** Role escalation in `/users/{userId}` — role is now immutable after initial set; ADMIN self-assignment unconditionally rejected at both Firestore rules and client layers; dynamically tested in emulator (11/11 tests passed) (VERIFIED)
- **FIXED (SEC-02):** Payment ledger writes — all client writes to `payments/` are permanently denied in `firestore.rules`; `PaymentRepository` methods throw `UnsupportedError` immediately; dynamically tested in emulator (7/7 tests passed) (VERIFIED)
- **FIXED (SEC-03):** Forged profile metrics — `worker_profiles` and `contractor_profiles` create rules enforce zero metric starting values; `isVerified` must start `false`; dynamically tested in emulator (8/8 tests passed) (VERIFIED)
- **FIXED:** Application Duplication Bypass: Firestore rules enforce composite document ID (`${jobId}_${workerId}`), client delete denied; dynamically tested in emulator (10/10 tests passed) (VERIFIED)
- **FIXED / MITIGATED:** Review Forgery & Tampering: `/reviews/{reviewId}` enforces composite ID (`${jobId}_${reviewerId}`), forbids self-reviews (`reviewerId != revieweeId`), enforces rating bounds (1 to 5), immutable, client delete denied; dynamically tested in emulator (9/9 tests passed) (VERIFIED)
- **FIXED (CHAT-01):** Unauthorized chat creation & spoofing — conversation creation strictly gated on server-verified `ACCEPTED` job application (`/applications/{applicationId}`); participants immutable; `senderId` must match caller UID; messages immutable and client delete denied; non-empty text bounds (1–5000 chars) enforced; dynamically tested in emulator (17/17 chat tests passed) (VERIFIED)
- **FIXED (SEC-AUDIT-01):** Secrets & Configuration Exposure Audit — Zero private keys, OAuth secrets, database passwords, or server-only credentials found across full codebase and 7 Git commits (`3ba52d7`..`0d6924e`); no rotation required; `.gitignore` fortified with comprehensive ignore rules for `.env*`, keystores (`*.keystore`, `*.jks`, `key.properties`), certificates/keys (`*.pem`, `*.p12`, `*.pfx`, `*.key`, `*.crt`), and service accounts (`*service-account*.json`, `*credentials*.json`); standards documented in `docs/security/secrets-and-config.md` (VERIFIED)
- **FIXED (MAPS-01):** Google Maps API Key Exposure Avoided — Key is injected from local-only untracked `local.properties` via Gradle manifest placeholder; never hardcoded in `AndroidManifest.xml` or Dart code (VERIFIED)
- **FIXED (BACKEND-01):** Untrusted Client Vulnerability Neutralized — Firebase Cloud Functions foundation established in TypeScript on Node.js 20 LTS as the authoritative trusted server layer; zero client payment writes; Secret Manager bindings for future payment secrets; strict role guards (VERIFIED)
- **FIXED (LIFECYCLE-01):** Client Lifecycle Tampering Eliminated — Job state machine transitions and application acceptance capacity constraints enforced server-side; race conditions eliminated via transactional acceptance (VERIFIED)
- **MEDIUM (OPEN):** Data Scraping Vulnerability: Worker and Contractor profiles are completely readable by any authenticated user without pagination or field filtering (VERIFIED)

## Testing Status
- **Unit Coverage:** 100% of defined localization and rule unit tests passing (VERIFIED)
- **Widget Coverage:** 100% of defined widget and navigation tests passing (14/14 tests passed: `test/widget_test.dart` [1/1] + `test/navigation/dashboard_navigation_test.dart` [3/3] + `test/localization/localization_test.dart` [10/10]) (VERIFIED)
- **Integration Coverage:** 0% (0 tests) (VERIFIED)
- **Rules Coverage:** 100% of defined security scenarios executable and passing in Firebase Local Emulator (`test/security/rules.test.mjs`: 62/62 tests passed across 6 test suites) (VERIFIED)
- **Backend Coverage:** 100% of defined backend unit tests passing (42/42 tests passed across auth guards, error sanitization, logger redaction, job state machine, and application workflows) (VERIFIED)
- **Authorization Coverage:** 100% of client authorization rules verified via Firebase Local Emulator suite (62/62 passed) (VERIFIED)
- **Payment Coverage:** 100% of client payment write lockdown verified via Firebase Local Emulator suite (7/7 payment tests passed) (VERIFIED)
- **Chat Coverage:** 100% of chat security rules and lifecycle scenarios verified via Firebase Local Emulator suite (17/17 chat tests passed) (VERIFIED)
- **Navigation Coverage:** 100% of role-based dashboard navigation paths tested and passing (3/3 tests passed) (VERIFIED)
- **Localization Coverage:** 100% of supported locales (`en`, `hi`, `ta`, `te`, `mr`) and 40 key marketplace strings verified across unit and widget integration tests (10/10 tests passed) (VERIFIED)
- **Maps Configuration Coverage:** 100% of Gradle manifest placeholder injection verified via debug merged manifest inspection (VERIFIED)

## Architecture Decisions
- **State Management:** Flutter Riverpod (`flutter_riverpod: ^2.4.9`) (VERIFIED)
- **Routing:** GoRouter (`go_router: ^17.5.0`) (VERIFIED)
- **Backend Services:** Firebase Core & Auth & Firestore (VERIFIED)
- **Backend Architecture:** Firebase Cloud Functions (Node.js 20 LTS, TypeScript 5, 2nd Gen API) as the authoritative trusted server layer; zero client payment writes; Secret Manager for payment secrets; strict role guards (VERIFIED)
- **Job Lifecycle Architecture:** Authoritative state machine (`OPEN` -> `IN_PROGRESS` -> `COMPLETED`, `OPEN`/`IN_PROGRESS` -> `CANCELLED`); atomic transactional worker capacity enforcement; server-controlled `completedAt`/`cancelledAt` timestamps (VERIFIED)
- **Location Services:** Geolocator + Geoflutterfire Plus (VERIFIED)
- **Rules Unit Testing:** Firebase Local Emulator + `@firebase/rules-unit-testing` + Node.js test runner (`npm run test:rules`) (VERIFIED)
- **Chat Architecture:** Canonical 1-to-1 conversation IDs (`minUID_maxUID`), application-gated conversation creation, immutable participants, separate initial creation and subsequent metadata updates (VERIFIED)
- **Dashboard Navigation:** Role-segregated `HomeScreen` switching on `UserRole` (Worker vs Contractor) with GoRouter navigation routes to all user-facing screens (VERIFIED)
- **Secrets Management:** Client app restricted to public client identifiers (`google-services.json`, `firebase_options.dart`); server secrets strictly forbidden in Flutter codebase; release signing isolated via `android/key.properties` (VERIFIED)
- **Localization Architecture:** Official Flutter `gen-l10n` toolchain driven by `l10n.yaml`; English template with 40 marketplace terms; native translations for Hindi, Tamil, Telugu, and Marathi; registered via `AppLocalizations.localizationsDelegates` and `AppLocalizations.supportedLocales` in `MaterialApp.router` (VERIFIED)
- **Google Maps Key Injection:** `android/app/build.gradle.kts` reads `MAPS_API_KEY` from untracked `local.properties` and injects it into `manifestPlaceholders["MAPS_API_KEY"]` for substitution into `AndroidManifest.xml` (VERIFIED)

## Architecture Conflicts
- Payment architecture conflicts: Documentation assumes Razorpay integration, but zero backend or client payment gateway code exists; system directly writes fake payment status to Firestore (VERIFIED)
- Job lifecycle conflict: Fixed. Authoritative state machine (`OPEN` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`) and transactional application acceptance workflow implemented in Cloud Functions with capacity checks (VERIFIED)
- Chat transaction conflict: Fixed. Implemented two-phase initial conversation create, metadata-only subsequent updates, and hardened rules (VERIFIED)

## Dependencies
- Dart SDK constraint in `pubspec.yaml`: `^3.10.4` (Confuses Flutter SDK version with Dart SDK version) (VERIFIED)
- Web incompatibility risk: `firebase_core_web: 3.11.0` and `web: 1.1.1` require modern Dart 3.4+ `dart:js_interop` (`isA<T>()`), conflicting with older toolchains (VERIFIED)
- Missing dependencies: Razorpay SDK (`razorpay_flutter`) not in `pubspec.yaml` (VERIFIED)

## Latest Git State
- **Branch:** `main` (VERIFIED)
- **Remote:** `https://github.com/Blessing-Raja-1/wrozo-2.0.git` (VERIFIED)
- **Commit:** `feat: implement authoritative job lifecycle` (PENDING PUSH) (VERIFIED)

## Last Completed Task
- Implement authoritative server-side Job Lifecycle and Application workflow in Firebase Cloud Functions (state machine, transactional acceptance with capacity checks, 42/42 backend tests passed, 62/62 emulator tests passed, 14/14 Flutter tests passed, debug APK verified) (VERIFIED)

## Current Task
- None (VERIFIED)

## Next Task
- Configure Razorpay merchant account and Secret Manager secrets for payment order creation and webhook processing (PLANNED)

## Important Notes
- Android debug APK build is fully verified and functioning (`build\app\outputs\flutter-apk\app-debug.apk`).
- Payment features are completely inoperative by design until a server-side Cloud Function + payment gateway webhook integration (Razorpay) is implemented. The client payment code now explicitly fails safe.
- Firestore security rules are now dynamically tested and verified against the Firebase Local Emulator with 62 automated unit tests passing across all security boundaries including chat messaging.
- Role-based dashboard navigation is verified with 4/4 passing tests; workers and contractors have clean, segregated access to all feature screens.
- Full 5-language localization foundation (`en`, `hi`, `ta`, `te`, `mr`) is active and verified; `AppLocalizations` delegates and supported locales are wired into `main.dart`.
- Zero secrets or server credentials have ever been committed; `.gitignore` actively prevents future commits of `.env`, keystores, certificates, and service account JSONs.
- Google Maps manifest placeholder injection is verified in debug merged manifest. No API keys are hardcoded in source control.
- Authoritative Job Lifecycle & Application Workflow is verified with 42/42 backend unit tests passing, transactional capacity enforcement, and zero secrets committed.
