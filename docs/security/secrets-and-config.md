# Wrozo 2.0 Secrets & Configuration Architecture

This document establishes the security, isolation, and handling standards for configuration values, credentials, and secrets across Wrozo 2.0.

---

## 1. Classification Taxonomy

Configuration values in Wrozo 2.0 are classified into three strict categories:

### A. SAFE CLIENT CONFIG
Values that are public identifiers intended to be embedded in the Flutter mobile application package (APK/AAB).
* **Characteristics:** Do not grant administrative access; serve purely to identify the project or client application to backend cloud endpoints.
* **Examples in Wrozo 2.0:**
  * Firebase Project ID: `wrozo-5b147`
  * Firebase Android Mobile SDK App ID: `1:448205141152:android:ef65a8aa23d0113fe3c5c5`
  * Firebase Messaging Sender ID: `448205141152`
  * Firebase Storage Bucket: `wrozo-5b147.firebasestorage.app`
  * Firebase Client API Key (in `android/app/google-services.json` and `lib/firebase_options.dart`): Per official Google Firebase security architecture, client API keys identify the project to Google backend services and are not access secrets. Access to database, storage, and authentication resources is governed by server-side Firebase Security Rules and Firebase Auth tokens.
  * Razorpay Key ID (when implemented): Public merchant key used by client checkout UI to identify the merchant account.

### B. SECRET / SERVER-ONLY
Values that grant administrative authority, database access, or transaction verification capability.
* **CRITICAL MOBILE RULE:** Anything shipped in a Flutter client package (APK/AAB) can be decompiled and extracted. **These values must NEVER be shipped in Flutter code, assets, or client `.env` files.**
* **Examples in Wrozo 2.0:**
  * **Firebase Admin SDK Service Account Keys:** Private JSON credentials containing RSA private keys (`BEGIN PRIVATE KEY`). Must only exist in protected backend environments (e.g., Cloud Functions or secure backend servers).
  * **Razorpay Key Secret:** Used to generate and verify payment signatures. Must strictly reside in Cloud Functions / backend webhooks.
  * **Razorpay Webhook Secret:** Used to verify cryptographic HMAC signatures on incoming payment webhooks from Razorpay. Must only reside in backend webhook endpoints.
  * **Database Passwords / Master Connection Strings:** Direct database credentials must never be shared with client devices.

### C. CONFIGURATION / LOCAL DEVELOPMENT SECRETS
Values required at build time or local run time that vary per environment or machine.
* **Characteristics:** Must not be checked into Git source control. Must be supplied via local configuration files or CI/CD secret runners.
* **Examples in Wrozo 2.0:**
  * `android/local.properties`: Contains developer machine paths (`sdk.dir`, `flutter.sdk`).
  * `android/key.properties`: Contains release keystore passwords, alias, and path.
  * Release Keystore files (`*.keystore`, `*.jks`).
  * Restricted Google Maps Android API Key (injected via `local.properties` and Gradle manifest placeholders).

---

## 2. Mobile Security Rules

1. **Untrusted Client Boundary:** The client application is considered untrusted. Security boundaries are enforced exclusively on backend services (Firestore Security Rules, Firebase Auth, and Cloud Functions).
2. **No Server Secrets in Client Files:** No private keys, webhook secrets, payment secrets, or admin service accounts may ever be placed in `.env` files, asset bundles, or Dart source code.
3. **Fail-Safe Client Payments:** Client-side payment repository methods are hardcoded to throw `UnsupportedError` until an authoritative server-side webhook/cloud-function backend verifies payment captures.

---

## 3. Detailed Component Audits

### A. Firebase Configuration Status
* **Files:** `android/app/google-services.json`, `lib/firebase_options.dart`, `firebase.json`
* **Status:** Verified clean.
* **Package Identity:** Matches `com.wrozo.wrozo` in `android/app/build.gradle.kts`.
* **Credentials:** Contains standard, non-sensitive Firebase client identifiers and client Web/Android API keys.
* **Admin SDK:** No Firebase Admin SDK or service-account private keys are present in Flutter source or repository assets.
* **Rotation Required:** None.

### B. Google Maps Android Configuration Status
* **Files:** `android/app/src/main/AndroidManifest.xml`, `lib/core/services/location_service.dart`
* **Status:** No API key is currently hardcoded or committed.
* **Required Implementation Pattern:**
  1. Acquire a Google Maps API Key from the Google Cloud Console.
  2. Enforce strict Cloud Console Restrictions:
     * **Application Restriction:** Android apps only $\rightarrow$ Package Name: `com.wrozo.wrozo` + SHA-1 certificate fingerprint (both debug and release keystores).
     * **API Restriction:** Restrict key exclusively to "Maps SDK for Android".
  3. Secure Local Injection:
     * Place the key in developer `android/local.properties`: `MAPS_API_KEY=your_restricted_key`
     * In `android/app/build.gradle.kts`, read `local.properties` and inject into `manifestPlaceholders`:
       ```kotlin
       val localProperties = java.util.Properties().apply {
           val file = rootProject.file("local.properties")
           if (file.exists()) load(file.inputStream())
       }
       defaultConfig {
           manifestPlaceholders["MAPS_API_KEY"] = localProperties.getProperty("MAPS_API_KEY") ?: ""
       }
       ```
     * In `android/app/src/main/AndroidManifest.xml`:
       ```xml
       <meta-data
           android:name="com.google.android.geo.API_KEY"
           android:value="${MAPS_API_KEY}" />
       ```
  4. Never commit an unrestricted or hardcoded key to source control.
* **Rotation Required:** None (no key has ever been committed).

### C. Payment Gateway (Razorpay) Status
* **Files:** `lib/features/payments/data/payment_repository.dart`, `lib/features/payments/presentation/payment_controller.dart`
* **Status:** Verified clean.
* **Finding:** Zero Razorpay keys, secrets, or SDK packages exist in the client repository. Client payment writes are locked down at `firestore.rules`, and repository methods fail safe.
* **Future Implementation Pattern:**
  * Client app may only receive the public `Key ID` (via `--dart-define=RAZORPAY_KEY_ID=...`).
  * The `Key Secret` and `Webhook Secret` must exclusively be stored in Firebase Cloud Functions environment variables / Secret Manager (`functions.config().razorpay.secret` or Google Cloud Secret Manager).
* **Rotation Required:** None.

### D. Android Release Signing Status
* **Files:** `android/app/build.gradle.kts`, `android/.gitignore`
* **Status:** Verified clean.
* **Finding:** `android/app/build.gradle.kts` currently points release builds to the debug keystore placeholder. No production keystores (`*.jks`, `*.keystore`) or passwords are present in the repository.
* **Required Production Signing Pattern:**
  1. Generate signing keystore locally (`upload-keystore.jks`).
  2. Define credentials in `android/key.properties` (gitignored):
     ```properties
     storePassword=...
     keyPassword=...
     keyAlias=upload
     storeFile=upload-keystore.jks
     ```
  3. Load properties in Gradle conditionally without committing secrets.
* **Rotation Required:** None.

---

## 4. Files That Must Never Be Committed

The following file patterns must remain excluded from Git at all times:

| Pattern | Purpose |
|---|---|
| `.env`, `.env.*`, `*.env` | Local environment variables |
| `key.properties`, `**/key.properties` | Android release signing credentials |
| `*.keystore`, `*.jks` | Java/Android cryptographic signing keystores |
| `*.pem`, `*.p12`, `*.pfx`, `*.key`, `*.crt` | Cryptographic private keys and certificates |
| `*service-account*.json`, `*serviceAccount*.json` | Cloud provider administrative service accounts |
| `*credentials*.json`, `client_secret*.json` | OAuth client secrets and credentials dumps |
| `android/local.properties` | Machine-specific paths and local overrides |
| `*.bak`, `*.backup`, `*~` | Editor and system backup files |

---

## 5. Repository & Git History Audit Verification

An exhaustive audit was conducted across the current working tree and all 7 Git commits (`3ba52d7` through `0d6924e`):

1. **Keyword Analysis:** Scanned repository for `password`, `secret`, `private_key`, `key_secret`, `BEGIN PRIVATE KEY`, `token`, and `razorpay`. All occurrences were confined to code comments, documentation, and security rules.
2. **File Pattern Analysis:** Checked `git ls-files` for all secret extensions (`*.pem`, `*.jks`, `*.keystore`, `*.key`, `*.env`, `*.p12`). Zero matches found.
3. **Commit History Scan:** Audited commit diffs and log history across all 7 commits. No private secrets or credentials have ever been committed.
4. **Git Protection Verification:** Verified that `git check-ignore` correctly matches `.env`, `test.keystore`, `android/key.properties`, `firebase-service-account.json`, `secret.pem`, and `backup.bak`.
5. **Rotation Required Items:** **None.**
