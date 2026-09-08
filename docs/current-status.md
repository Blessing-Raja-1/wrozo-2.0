# Wrozo 2.0 Current Status

## Project Identity
- **Name:** Wrozo 2.0 (VERIFIED)
- **Type:** Worker / Contractor marketplace platform (VERIFIED)
- **Client:** Flutter + Dart (Android primary target) (VERIFIED)
- **Repository:** https://github.com/Blessing-Raja-1/wrozo-2.0.git (VERIFIED)
- **Local Path:** `C:\Users\bless\Wrozo2` (VERIFIED)

## Current Development Phase
- P0 Security Fixes (SEC-01, SEC-02, SEC-03) Applied to `firestore.rules` and client repositories (VERIFIED: 2026-09-08)

## Current Objective
- P0 security rules deployed; next step is to fix remaining P0 build/compilation blockers (Android Gradle, widget_test.dart) (PLANNED)

## Overall Status
- P0 security fixes (SEC-01 role escalation, SEC-02 payment writes, SEC-03 profile metrics) are applied and verified via `flutter analyze`. Pre-existing P0 build blockers (Android Gradle, widget_test.dart, localization) remain open (VERIFIED)

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
- `flutter analyze` run post-changes: zero errors in modified files; 39 pre-existing errors in unrelated files remain (VERIFIED)

## In Progress
- None (VERIFIED)

## Blocked
- Production release blocked by remaining P0 Blockers (see Production Blockers section below) (BLOCKED)

## Known Bugs
- `test/widget_test.dart` does not compile: references non-existent `MyApp` instead of `WrozoApp` (VERIFIED)
- `ChatRepository.sendMessage` fails against Firestore rules: merges `participants` field which violates update rule (`affectedKeys().hasAny(['participants'])`), and first message fails `get()` check on non-existent conversation document (VERIFIED)
- Android runtime crash: `AndroidManifest.xml` lacks `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, and `INTERNET` permissions (VERIFIED)
- Android runtime crash: `AndroidManifest.xml` lacks Google Maps API key meta-data (VERIFIED)
- Android build failure: `settings.gradle.kts` and `app/build.gradle.kts` lack `com.google.gms.google-services` plugin (VERIFIED)
- Unwired Navigation: `HomeScreen` provides no navigation routes or UI links to `JobDiscoveryScreen`, `JobPostingScreen`, `ProfileSetupScreen`, `ApplicantReviewScreen`, or `PaymentScreen` (VERIFIED)
- Localization broken: `AppLocalizations` is not registered in `localizationsDelegates` in `main.dart`; missing arb files for supported locales (`hi`, `ta`, `te`, `mr`) (VERIFIED)

## Security Status
- **FIXED (SEC-01):** Role escalation in `/users/{userId}` — role is now immutable after initial set; ADMIN self-assignment unconditionally rejected at both Firestore rules and client layers (VERIFIED)
- **FIXED (SEC-02):** Payment ledger writes — all client writes to `payments/` are permanently denied in `firestore.rules`; `PaymentRepository` methods throw `UnsupportedError` immediately (VERIFIED)
- **FIXED (SEC-03):** Forged profile metrics — `worker_profiles` and `contractor_profiles` create rules now enforce zero metric starting values; `isVerified` must start `false` (VERIFIED)
- **HIGH (OPEN):** Application Duplication Bypass: Firestore rules do not enforce composite document ID (`${jobId}_${workerId}`), permitting workers to bypass client-side check and spam applications (VERIFIED)
- **HIGH (OPEN):** Review Forgery & Tampering: `/reviews/{reviewId}` allows any user to review anyone without checking job completion or participation, without rating range validation, and with zero aggregate rating calculation (VERIFIED)
- **MEDIUM (OPEN):** Data Scraping Vulnerability: Worker and Contractor profiles are completely readable by any authenticated user without pagination or field filtering (VERIFIED)

## Testing Status
- **Unit Coverage:** 0% (0 tests) (VERIFIED)
- **Widget Coverage:** 0% (1 test broken, fails to compile) (VERIFIED)
- **Integration Coverage:** 0% (0 tests) (VERIFIED)
- **Rules Coverage:** 0% (0 tests) (VERIFIED)
- **Backend Coverage:** 0% (0 tests) (VERIFIED)
- **Authorization Coverage:** 0% (0 tests) (VERIFIED)
- **Payment Coverage:** 0% (0 tests) (VERIFIED)

## Architecture Decisions
- **State Management:** Flutter Riverpod (`flutter_riverpod: ^2.4.9`) (VERIFIED)
- **Routing:** GoRouter (`go_router: ^17.5.0`) (VERIFIED)
- **Backend Services:** Firebase Core & Auth & Firestore (VERIFIED)
- **Location Services:** Geolocator + Geoflutterfire Plus (VERIFIED)

## Architecture Conflicts
- Payment architecture conflicts: Documentation assumes Razorpay integration, but zero backend or client payment gateway code exists; system directly writes fake payment status to Firestore (VERIFIED)
- Job lifecycle conflict: JobStatus enum defines 4 states, but repository and controllers only support `OPEN` creation; no state transition mechanics exist (VERIFIED)
- Chat transaction conflict: Client batch write merges `participants` on conversations, conflicting with Firestore rules forbidding participant changes (VERIFIED)

## Dependencies
- Dart SDK constraint in `pubspec.yaml`: `^3.10.4` (Confuses Flutter SDK version with Dart SDK version) (VERIFIED)
- Web incompatibility risk: `firebase_core_web: 3.11.0` and `web: 1.1.1` require modern Dart 3.4+ `dart:js_interop` (`isA<T>()`), conflicting with older toolchains (VERIFIED)
- Missing dependencies: Razorpay SDK (`razorpay_flutter`) not in `pubspec.yaml` (VERIFIED)

## Latest Git State
- **Branch:** `main` (VERIFIED)
- **Remote:** `https://github.com/Blessing-Raja-1/wrozo-2.0.git` (VERIFIED)
- **Tree:** Dirty — `firestore.rules`, `lib/features/authentication/data/auth_repository.dart`, `lib/features/payments/data/payment_repository.dart`, `lib/features/payments/presentation/payment_controller.dart`, `test/security/security_rules_scenarios.dart` modified/created (VERIFIED)

## Last Completed Task
- Apply P0 security fixes SEC-01 (role escalation), SEC-02 (payment writes), SEC-03 (profile metrics) to `firestore.rules`, `AuthRepository`, `PaymentRepository`, and `PaymentController` (VERIFIED)

## Current Task
- None (VERIFIED)

## Next Task
- Fix P0 Build & Compilation blockers: fix `test/widget_test.dart` (`MyApp` → `WrozoApp`), add Android Gradle plugins, add Android manifest permissions (PLANNED)

## Important Notes
- Wrozo 2.0 cannot be deployed or launched on an Android device in its current state without the remaining P0 configuration fixes.
- Payment features are completely inoperative by design until a server-side Cloud Function + payment gateway webhook integration (Razorpay) is implemented. The client payment code now explicitly fails safe.
- Firestore rules for SEC-01 role immutability have not been verified against the Firebase Local Emulator. Manual staging verification required before production deploy.
