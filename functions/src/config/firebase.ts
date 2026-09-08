import * as admin from "firebase-admin";

/**
 * Server-side singleton initialization of Firebase Admin SDK.
 *
 * In production Google Cloud Functions, credentials are automatically discovered
 * via Google Cloud Application Default Credentials (ADC).
 * In the local Firebase Emulator Suite, the emulator host environment variables
 * are automatically recognized.
 *
 * CRITICAL SECURITY INVARIANT:
 * Zero private keys, service-account JSONs, or database credentials must ever
 * be passed into initializeApp() or committed to source control.
 */
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const app = admin.app();
export const db = admin.firestore();
export const auth = admin.auth();

export default admin;
