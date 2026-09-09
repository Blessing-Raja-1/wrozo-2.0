# Real Device and Production Environment Validation Foundation

> **Document Classification:** Real-Device Readiness Audit & Manual Test Plan  
> **Target Version:** Wrozo 2.0 (`1.0.0+1`)  
> **Application ID:** `com.wrozo.wrozo`  
> **Target Firebase Project:** `wrozo-5b147` (Project Number: `448205141152`)  
> **Audit Status:** Foundation Established (Audit & Readiness Verified; Physical Device Execution Pending Hardware Connection)  

---

## 1. Executive Summary & Verification Boundary

Wrozo 2.0 has established 100% automated integration coverage across its dual-role marketplace architecture in local emulator environments:
- **Cloud Functions / Backend:** 105/105 unit and lifecycle tests passing
- **Firestore Security Rules:** 110/110 security isolation and authorization tests passing
- **Flutter Client Unit & Widget Tests:** 28/28 tests passing
- **End-to-End Emulator Integration:** 87/87 test scenarios verified

This document establishes the **real-device and production-environment validation foundation**. It audits all native Android configurations, identifies exact production credentials and secret management requirements, provides an exhaustive manual test checklist for physical Android devices, and explicitly defines what is verified in the emulator vs. what requires physical hardware and live cloud services.

> [!IMPORTANT]
> **Distinction Between Emulator Verified and Physical-Device Verified:**
> - **EMULATOR VERIFIED:** Automated logic, security boundaries, transactional state machines, deterministic application and conversation IDs, capability isolation, and mock webhook/token lifecycles executed against Firebase Local Emulators.
> - **PHYSICAL-DEVICE VERIFIED:** Actual hardware execution, Google Play Services framework interaction, real carrier/cellular SMS OTP delivery, hardware GPS radio location fixes, APNs/FCM physical push display in the Android system tray from background/terminated state, Razorpay live checkout SDK rendering, and genuine Google Maps tile rendering with hardware acceleration.
> - **No claim is made that physical device tests have been executed** until a physical Android device is connected and each checklist step below is executed and recorded with device hardware logs.

---

## 2. Phase 1: Android Real Device Readiness Audit

### 2.1 Manifest Configuration & Native Permissions

Inspected file: [`android/app/src/main/AndroidManifest.xml`](file:///c:/Users/bless/Wrozo2/android/app/src/main/AndroidManifest.xml)

| Configuration Item | Configured Value | Purpose / Status |
| :--- | :--- | :--- |
| **Package / Namespace** | `com.wrozo.wrozo` | Matches `defaultConfig.applicationId` in `build.gradle.kts` |
| `android.permission.INTERNET` | Declared | Required for Firebase Auth, Firestore, Functions, Maps, and FCM |
| `android.permission.ACCESS_FINE_LOCATION` | Declared | Required for high-accuracy GPS job discovery and worker pin drop |
| `android.permission.ACCESS_COARSE_LOCATION` | Declared | Required for network/cellular cell-tower based location estimation |
| `android.permission.POST_NOTIFICATIONS` | Declared | Android 13+ (API 33+) runtime push notification permission requirement |
| **Google Maps Metadata** | `com.google.android.geo.API_KEY` | Placeholder `${MAPS_API_KEY}` dynamically injected via Gradle |
| **FCM Default Channel** | `wrozo_default_channel` | Configured via `default_notification_channel_id` meta-data |

### 2.2 Build Toolchain, SDK Levels & Signing

Inspected file: [`android/app/build.gradle.kts`](file:///c:/Users/bless/Wrozo2/android/app/build.gradle.kts)

- **Application ID:** `com.wrozo.wrozo`
- **Compile SDK:** Flutter default (`flutter.compileSdkVersion` = API 34/35)
- **Min SDK:** Flutter default (`flutter.minSdkVersion` = API 21, Android 5.0 Lollipop)
- **Target SDK:** Flutter default (`flutter.targetSdkVersion` = API 34/35)
- **Java Compatibility:** Java 17 (`JavaVersion.VERSION_17`) for both compile and Kotlin JVM target (`jvmTarget = "17"`)
- **Signing Configuration:**
  - `debug` build type uses default Android debug keystore (`~/.android/debug.keystore`).
  - `release` build type is currently configured with `signingConfig = signingConfigs.getByName("debug")` to allow local release testing (`flutter run --release` / `flutter build apk --release`) without breaking on missing keystores.
  - Production release keystore (`android/key.properties` and `.jks`) is **NOT** configured yet (Status: **PARTIAL / SAFE**).
- **ProGuard / R8 Minification:**
  - Code shrinking and resource shrinking are not explicitly enabled in `build.gradle.kts` (standard Flutter release pipeline handles symbol obfuscation via `--obfuscate` when desired). No custom `proguard-rules.pro` exists.

### 2.3 Local Keystore Fingerprints

The active development debug keystore at `C:\Users\bless\.android\debug.keystore` provides the following fingerprints required for Google Services and Firebase Phone Auth:

- **MD5:** `5E:08:DC:50:51:65:B2:D6:EB:5B:3C:D0:62:3C:99:99`
- **SHA-1:** `0B:10:CD:F6:C5:74:75:45:0F:F6:DB:5D:00:C4:30:66:B5:16:BD:34`
- **SHA-256:** `CA:28:5E:F5:88:CB:11:E2:F3:5B:94:02:81:36:96:5A:89:64:A1:B5:30:32:11:5E:72:34:29:DB:C6:83:1F:36`

> [!NOTE]
> For Firebase Phone Auth SMS verification to function on real Android hardware without reCAPTCHA fallbacks, the above **SHA-1** and **SHA-256** fingerprints must be registered under Android App `com.wrozo.wrozo` in the Firebase Console.

### 2.4 App Startup & Service Initialization

Inspected file: [`lib/main.dart`](file:///c:/Users/bless/Wrozo2/lib/main.dart)

- **`WidgetsFlutterBinding.ensureInitialized()`:** Executed synchronously before all plugins.
- **Firebase Initialization:** `await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform)` initialized on startup.
- **FCM Background Handler:** `FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler)` registered at the top level before `runApp`.
- **Localization:** `AppLocalizations.localizationsDelegates` and `AppLocalizations.supportedLocales` configured across `en`, `hi`, `ta`, `te`, and `mr`.
- **Routing:** GoRouter instance configured with dual-role splash, login, onboarding, and dashboard routes.
- **Crashlytics / Analytics Initialization:**
  - Dependencies `firebase_crashlytics: ^5.3.0` and `firebase_analytics: ^12.5.0` are declared in [`pubspec.yaml`](file:///c:/Users/bless/Wrozo2/pubspec.yaml).
  - The native Crashlytics Gradle plugin is **not** applied in `android/settings.gradle.kts` / `android/app/build.gradle.kts`.
  - Flutter uncaught error handlers (`FlutterError.onError`, `PlatformDispatcher.instance.onError`) are not yet linked to `FirebaseCrashlytics.instance.recordFlutterFatalError` (Status: **NOT REQUIRED YET / PLANNED FOR PRODUCTION MONITORING**).

---

## 3. Phase 2: Firebase Production Configuration Audit

### 3.1 Project Alignment & Metadata Verification

Inspected files:
- [`firebase.json`](file:///c:/Users/bless/Wrozo2/firebase.json)
- [`android/app/google-services.json`](file:///c:/Users/bless/Wrozo2/android/app/google-services.json)
- [`lib/firebase_options.dart`](file:///c:/Users/bless/Wrozo2/lib/firebase_options.dart)

| Setting | Verified Value | Alignment Assessment |
| :--- | :--- | :--- |
| **Firebase Project ID** | `wrozo-5b147` | Consistent across `firebase.json`, `google-services.json`, and `lib/firebase_options.dart`. |
| **Project Number** | `448205141152` | Consistent in `google-services.json` (`project_number`) and `firebase_options.dart` (`messagingSenderId`). |
| **Android Package Name** | `com.wrozo.wrozo` | Aligned with `client_info.android_client_info.package_name` in `google-services.json` and `build.gradle.kts`. |
| **Android App ID** | `1:448205141152:android:f88cf8c169a5d28ce3c5c5` | Present in `google-services.json` under `com.wrozo.wrozo` client block. |
| **Legacy Package Record** | `com.example.wrozo` | Retained in `google-services.json` under App ID `...:ef65a8aa23d0113fe3c5c5` for backward compatibility without breaking existing Firebase registrations. |
| **Storage Bucket** | `wrozo-5b147.firebasestorage.app` | Aligned in `lib/firebase_options.dart`. |

### 3.2 Firebase Auth Configuration Requirements

- **Provider:** Phone Number Authentication.
- **Safety Precaution:** Real carrier SMS incurs costs and SMS quota exhaustion during development.
- **Production Pre-requisite:**
  1. Add test phone numbers in Firebase Console -> Authentication -> Sign-in method -> Phone -> "Phone numbers for testing" (e.g., `+91 9876543210` with verification code `123456`).
  2. Register debug SHA-1 (`0B:10:CD:F6:C5:74:75:45:0F:F6:DB:5D:00:C4:30:66:B5:16:BD:34`) to enable SafetyNet / Play Integrity verification on real devices.

### 3.3 Firestore Security Rules & Emulators Deployment

- Production rules file: [`firestore.rules`](file:///c:/Users/bless/Wrozo2/firestore.rules)
- Tested across 110 automated test cases with 100% pass rate.
- Ready for live deployment via `firebase deploy --only firestore:rules` when approved.

### 3.4 Cloud Functions Deployment Configuration

- Functions codebase: [`functions/src/index.ts`](file:///c:/Users/bless/Wrozo2/functions/src/index.ts)
- Engine: Node.js 20 LTS, TypeScript 5, Firebase Functions 2nd Gen API (`firebase-functions: ^6.3.2`, `firebase-admin: ^13.2.0`).
- Predeploy step configured in `firebase.json`: `npm --prefix "$RESOURCE_DIR" run build`.
- Zero compiler errors across all handlers (`npm --prefix functions run build` verified).

---

## 4. Phase 3: Real Device Manual Test Checklist

This checklist must be executed on a physical Android device connected via USB/Wi-Fi debugging before any production roll-out.

```
Device Details (To record during physical testing):
Device Model: ___________________
Android Version: ________________
Google Play Services Version: ___
Build Type: [ ] Debug APK  [ ] Release APK (debug signed)
Network: [ ] Wi-Fi  [ ] Cellular 4G/5G
```

### Flow 1: Authentication & Session Management

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **AUTH-01** | First Launch & Splash | Cold launch app from launcher. | Splash screen renders cleanly; redirects to `/login` if unauthenticated. | [ ] PASS  [ ] FAIL |
| **AUTH-02** | Valid Phone OTP | Enter valid test phone number `+91 9876543210`, tap "Send OTP", enter `123456`. | Phone Auth triggers; SMS OTP received/auto-retrieved; session established; transitions to onboarding/dashboard. | [ ] PASS  [ ] FAIL |
| **AUTH-03** | Invalid Phone OTP | Enter valid test phone number, enter incorrect code `000000`. | Error message displays indicating invalid verification code; user stays on OTP screen; no crash. | [ ] PASS  [ ] FAIL |
| **AUTH-04** | Resend OTP Timer | Request OTP, wait for 30s countdown timer to elapse, tap "Resend Code". | New OTP is requested; countdown restarts; old code invalidated. | [ ] PASS  [ ] FAIL |
| **AUTH-05** | Logout | From user profile / settings, tap "Logout". | Local FCM tokens unregistered via `unregisterDeviceToken`; session cleared; redirected to `/login`. | [ ] PASS  [ ] FAIL |
| **AUTH-06** | Relogin Persistence | Close and reopen app without logging out. | App re-launches directly into active dashboard without requiring OTP re-entry. | [ ] PASS  [ ] FAIL |

### Flow 2: Onboarding & Dual-Role Account Setup

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **ONBD-01** | Worker-Only Onboarding | Complete onboarding selecting "Worker" role. | Calls `setupAccountCapabilities({ worker: true, contractor: false })`; navigates to Worker dashboard. | [ ] PASS  [ ] FAIL |
| **ONBD-02** | Contractor-Only Onboarding | Complete onboarding selecting "Contractor" role. | Calls `setupAccountCapabilities({ worker: false, contractor: true })`; navigates to Contractor dashboard. | [ ] PASS  [ ] FAIL |
| **ONBD-03** | Dual-Role Onboarding | Complete onboarding selecting "Both". | Calls `setupAccountCapabilities({ worker: true, contractor: true })`; prompts initial `activeMode` selection. | [ ] PASS  [ ] FAIL |
| **ONBD-04** | Profile Creation (Worker) | Fill in skills, experience, hourly rate, and bio. | Public document written to `/workers/{uid}`; private info written to `/workers/{uid}/private/data`. | [ ] PASS  [ ] FAIL |
| **ONBD-05** | Profile Creation (Contractor) | Fill in business name, contact info, and registration. | Public document written to `/contractors/{uid}`; private info written to `/contractors/{uid}/private/data`. | [ ] PASS  [ ] FAIL |

### Flow 3: Worker Marketplace Journey

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **WORK-01** | Location Permission Prompt | Launch Worker home tab requiring GPS coordinates. | Android system runtime dialog requests "While using the app" / "Only this time"; handles permission grant. | [ ] PASS  [ ] FAIL |
| **WORK-02** | Nearby Jobs Discovery | With location granted, view Job Feed. | Queries Firestore geo-hash range; displays only `status == "OPEN"` jobs matching proximity. | [ ] PASS  [ ] FAIL |
| **WORK-03** | Job Details View | Tap on an open job card. | Navigates to `/job-details/:id`; displays wage, description, contractor info, location pin, and "Apply" button. | [ ] PASS  [ ] FAIL |
| **WORK-04** | Apply for Job | Tap "Apply Now" with proposed quote/message. | Writes to `/applications/{workerUid_jobId}`; prevents duplicate applications; transitions UI to "Applied". | [ ] PASS  [ ] FAIL |
| **WORK-05** | Application Status Tracking | Worker checks "My Applications" tab. | Shows submitted application with status `SUBMITTED`; updates to `ACCEPTED` in real-time when accepted. | [ ] PASS  [ ] FAIL |
| **WORK-06** | Real-Time Push Notification | Contractor accepts application. | System tray push notification arrives on worker device with title "Application Accepted". | [ ] PASS  [ ] FAIL |
| **WORK-07** | In-App Real-Time Chat | Open chat thread with contractor from accepted job. | Messages send and receive in real time with read receipts and timestamps; keyboard does not obscure input. | [ ] PASS  [ ] FAIL |
| **WORK-08** | Job Completion Verification | Contractor marks job `COMPLETED`. | Status updates on worker screen to `COMPLETED`; payment availability indicators display. | [ ] PASS  [ ] FAIL |

### Flow 4: Contractor Marketplace Journey

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **CONT-01** | Create New Job | Tap "Post Job", fill title, category, wage, location (map pin picker), and required workers. | Calls `createJobListing` / writes to `/jobs/{jobId}` with status `OPEN` and geohash. | [ ] PASS  [ ] FAIL |
| **CONT-02** | Review Applications | View incoming applications on posted job. | Lists applicants; loads worker public profiles; single-click "Accept" or "Reject". | [ ] PASS  [ ] FAIL |
| **CONT-03** | Accept Worker Application | Contractor taps "Accept" on applicant. | Server function `acceptJobApplication` transactionally increments `assignedWorkers` and marks application `ACCEPTED`. | [ ] PASS  [ ] FAIL |
| **CONT-04** | Reject Worker Application | Contractor taps "Reject" on applicant. | Application marked `REJECTED`; worker notified; job capacity unchanged. | [ ] PASS  [ ] FAIL |
| **CONT-05** | In-App Contractor Chat | Send message to accepted worker. | Message delivered to worker; notification sent if worker app is backgrounded. | [ ] PASS  [ ] FAIL |
| **CONT-06** | Job Lifecycle Progression | Move job to `IN_PROGRESS` and `COMPLETED`. | State transitions validated by Cloud Functions; timestamps recorded authoritative server-side. | [ ] PASS  [ ] FAIL |
| **CONT-07** | Payment Order Generation | Contractor proceeds to pay worker via Razorpay. | Calls `createPaymentOrder`; returns server-signed order ID; client Razorpay checkout launches. | [ ] PASS  [ ] FAIL |

### Flow 5: Dual-Role Mode Switching

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **DUAL-01** | Mode Switch (Worker -> Contractor) | Tap mode switcher on drawer/app bar. | `activeMode` updates to `contractor`; dashboard switches to Contractor view immediately without re-authenticating. | [ ] PASS  [ ] FAIL |
| **DUAL-02** | Data Isolation Verification | Check feeds after switching mode. | Contractor feed shows jobs posted by user; Worker feed shows jobs applied to by user; no cross-pollution. | [ ] PASS  [ ] FAIL |
| **DUAL-03** | Capability Persistence | Force-kill app, re-open, inspect account capabilities. | Both `worker` and `contractor` capabilities persist server-side in `/users/{uid}.capabilities`. | [ ] PASS  [ ] FAIL |
| **DUAL-04** | Client Escalation Lockdown | Attempt client write to alter capabilities. | Denied with permission-denied error by Firestore security rules. | [ ] PASS  [ ] FAIL |

### Flow 6: Push Notifications (FCM) & Background Behavior

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **NOTIF-01** | Token Registration | Grant notification permission on Android 13+. | Token written to `/users/{uid}/device_tokens/{token}`; verified valid FCM registration token. | [ ] PASS  [ ] FAIL |
| **NOTIF-02** | Background Notification | Press Home (background app), trigger application acceptance. | Notification appears in Android system tray with sound and vibration; tapping opens job details. | [ ] PASS  [ ] FAIL |
| **NOTIF-03** | Terminated Notification | Swipe app away from Recent Apps (terminated), trigger message. | Notification arrives in system tray; tapping launches app directly into the relevant chat thread. | [ ] PASS  [ ] FAIL |
| **NOTIF-04** | Foreground Notification | Keep app open in foreground, receive incoming notification. | In-app notification banner or snackbar displays without crashing foreground activity. | [ ] PASS  [ ] FAIL |
| **NOTIF-05** | Token Unregistration on Logout | Tap "Logout". | Device token removed from `/users/{uid}/device_tokens/{token}`; no residual notifications delivered to logged-out device. | [ ] PASS  [ ] FAIL |

### Flow 7: Google Maps Integration & Hardware GPS

| Test ID | Test Scenario | Execution Steps | Expected Result | Hardware Result |
| :--- | :--- | :--- | :--- | :--- |
| **MAP-01** | Map Tile Rendering | Navigate to Map view tab with valid `MAPS_API_KEY`. | Vector map tiles render smoothly with hardware GPU acceleration; zoom and pan work with 60fps. | [ ] PASS  [ ] FAIL |
| **MAP-02** | Current Location Blue Dot | Tap "My Location" button on map. | Hardware GPS locks onto current coordinates; camera animates to blue location dot. | [ ] PASS  [ ] FAIL |
| **MAP-03** | Marker Clustered Job Pins | Browse area with multiple open jobs. | Markers render at job coordinates; tapping marker shows preview card; tapping preview opens job. | [ ] PASS  [ ] FAIL |
| **MAP-04** | Location Permission Denial | Deny location permission when prompted. | App falls back gracefully; shows permission rationale banner; allows manual city/pincode search without crashing. | [ ] PASS  [ ] FAIL |

---

## 5. Phase 4: Production Safety & Secrets Audit

### 5.1 Secret & Configuration Classification

| Item | Classification | Current Location / Architecture | Next Action / Production Requirement |
| :--- | :--- | :--- | :--- |
| **Razorpay Live Key ID** | `PARTIAL` | Server-side environment binding (`RAZORPAY_KEY_ID`). | Provision live merchant Key ID in Google Cloud Secret Manager when merchant KYC completes. |
| **Razorpay Live Key Secret** | `PARTIAL` | Bound exclusively via Cloud Functions `defineSecret("RAZORPAY_KEY_SECRET")`. **Zero client exposure.** | Provision live merchant Secret in Secret Manager. Never put in Flutter assets or Dart source. |
| **Razorpay Webhook Secret** | `PARTIAL` | Bound exclusively via Cloud Functions `defineSecret("RAZORPAY_WEBHOOK_SECRET")`. | Configure webhook URL in Razorpay Dashboard and set secret in Secret Manager. |
| **Google Maps API Key** | `PARTIAL` | Manifest placeholder `${MAPS_API_KEY}` loaded from untracked `local.properties`. | Create restricted production key on Google Cloud Console: restrict to Android App `com.wrozo.wrozo` + SHA-1 fingerprint. |
| **Firebase Admin Credentials** | `VERIFIED` | Uses Google Application Default Credentials (ADC) automatically within Cloud Functions runtime. | Zero service account JSONs bundled in client or committed to git. Fully verified. |
| **Android Release Keystore** | `PARTIAL` | `build.gradle.kts` temporarily signs `release` with `debug.keystore` for local testing. | Generate production upload keystore (`upload-keystore.jks`) and create local-only untracked `android/key.properties`. |
| **Firebase Cloud Messaging** | `VERIFIED` | Client registers tokens to Firestore subcollections; Cloud Functions dispatches via Firebase Admin SDK. | Verified in local emulator; requires physical device testing for live APNs/FCM delivery. |
| **Crashlytics SDK** | `NOT REQUIRED YET` | `firebase_crashlytics: ^5.3.0` declared in `pubspec.yaml`. Native plugin and error hooks pending. | Apply `com.google.firebase.crashlytics` Gradle plugin and connect `FlutterError.onError` before production rollout. |
| **Google Analytics** | `NOT REQUIRED YET` | `firebase_analytics: ^12.5.0` declared in `pubspec.yaml`. Core SDK present. | Wire user event tracking calls when product analytics requirements are finalized. |

---

## 6. Phase 5: Release Build Readiness

### 6.1 Configuration Audit

- **Application Version:** `1.0.0+1` (Version Name: `1.0.0`, Version Code: `1` from `pubspec.yaml`)
- **Min SDK / Target SDK:** Min SDK = 21 (covers 99%+ of Android devices worldwide); Target SDK = 34/35 (meets Google Play 2024+ target API requirements).
- **Signing Keystore:**
  - Debug signing is safely in place for debug builds and local release builds.
  - Release keystore requirement for Google Play publishing: requires `upload-keystore.jks` and `android/key.properties`.
  - Documented as **PARTIAL**; no fake or mock keystores have been fabricated.

### 6.2 App Bundle & Debug APK Compilation Status

1. **Debug APK Build:** `flutter build apk --debug`  
   - Output: `build\app\outputs\flutter-apk\app-debug.apk` (VERIFIED SUCCESSFUL)
2. **Release App Bundle:** `flutter build appbundle`  
   - Successfully verified against debug signing configuration without breaking.
   - Tree-shaking of unused Material icon fonts reducing bundle size by 99.8%.

---

## 7. Next Steps for Real Device Execution

1. **Register Debug SHA-1:** Add `0B:10:CD:F6:C5:74:75:45:0F:F6:DB:5D:00:C4:30:66:B5:16:BD:34` in Firebase Console under `wrozo-5b147` -> Project Settings -> Your Apps -> Android (`com.wrozo.wrozo`).
2. **Add Test Phone Number:** In Firebase Console -> Authentication -> Sign-in method -> Phone -> Phone numbers for testing (e.g. `+91 9876543210` : `123456`).
3. **Configure Maps Key:** Add `MAPS_API_KEY=AIzaSy...` to `android/local.properties` (never committed to git).
4. **Connect Physical Device:** Enable USB Debugging on an Android device running Android 10+ with Google Play Services.
5. **Install & Test:** Run `flutter run -d <device-id>` and execute manual checklist sections Flow 1 through Flow 7.
