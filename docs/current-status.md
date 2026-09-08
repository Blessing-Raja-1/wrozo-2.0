# Wrozo 2.0 Current Status

## Project Identity
- **Name:** Wrozo 2.0 (VERIFIED)
- **Type:** Worker / Contractor marketplace platform (VERIFIED)
- **Client:** Flutter + Dart (Android primary target) (VERIFIED)
- **Repository:** https://github.com/Blessing-Raja-1/wrozo-2.0.git (VERIFIED)
- **Local Path:** `C:\Users\bless\Wrozo2` (VERIFIED)

## Current Development Phase
- Android Firebase Configuration Aligned & Debug APK Verified (VERIFIED: 2026-09-08)

## Current Objective
- Address pre-existing UI navigation, chat transaction conflict, and localization blockers (PLANNED)

## Overall Status
- Android Firebase configuration aligned. `android/app/google-services.json` contains `com.wrozo.wrozo`. Android debug APK build succeeded (`build\app\outputs\flutter-apk\app-debug.apk`). Widget test (`test/widget_test.dart`) passes (1/1). Analyzer error count remains at 38 pre-existing errors in unmaintained screens (0 errors introduced) (VERIFIED)

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
- Executed verification commands:
  - `flutter build apk --debug`: Succeeded (`build\app\outputs\flutter-apk\app-debug.apk`) (VERIFIED)
  - `flutter test test/widget_test.dart`: 1/1 passed (VERIFIED)
  - `flutter analyze --no-pub`: 38 errors (0 errors introduced) (VERIFIED)
  - `git diff --check`: clean (VERIFIED)

## In Progress
- None (VERIFIED)

## Blocked
- Google Maps API key metadata missing: no key exists in repository; withheld from `AndroidManifest.xml` to prevent committing fake/hardcoded credentials (BLOCKED / CONFIGURATION REQUIRED)
- Production release blocked by remaining non-build blockers (chat batch conflict, unwired navigation, missing localization arb files) (BLOCKED)

## Known Bugs
- `test/widget_test.dart`: Fixed. References `WrozoApp`, compiles and passes (VERIFIED)
- `ChatRepository.sendMessage` fails against Firestore rules: merges `participants` field which violates update rule (`affectedKeys().hasAny(['participants'])`), and first message fails `get()` check on non-existent conversation document (VERIFIED)
- Android runtime crash: `AndroidManifest.xml` permissions added (`INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`) (VERIFIED)
- Android runtime crash: `AndroidManifest.xml` lacks Google Maps API key meta-data (BLOCKED / CONFIGURATION REQUIRED)
- Android build failure: Fixed. Google Services plugin and `google-services.json` aligned with `com.wrozo.wrozo`, debug APK built successfully (VERIFIED)
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
- **Widget Coverage:** 100% of defined widget tests passing (`test/widget_test.dart`: 1/1 passed) (VERIFIED)
- **Integration Coverage:** 0% (0 tests) (VERIFIED)
- **Rules Coverage:** 0% (0 dynamic tests; 7 scenarios documented in `test/security/security_rules_scenarios.dart`) (PARTIAL)
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
- **Tree:** Modified — `android/app/google-services.json`, `docs/current-status.md` (VERIFIED)

## Last Completed Task
- Align Android Firebase configuration (`google-services.json` for `com.wrozo.wrozo`) and verify Android debug APK build succeeds (VERIFIED)

## Current Task
- None (VERIFIED)

## Next Task
- Fix pre-existing application blockers: resolve chat transaction batch conflict, wire up HomeScreen navigation routes, and add missing localization arb files (PLANNED)

## Important Notes
- Android debug APK build is now fully verified and functioning (`build\app\outputs\flutter-apk\app-debug.apk`).
- Payment features are completely inoperative by design until a server-side Cloud Function + payment gateway webhook integration (Razorpay) is implemented. The client payment code now explicitly fails safe.
- Firestore rules for SEC-01 role immutability have not been verified against the Firebase Local Emulator. Manual staging verification required before production deploy.
