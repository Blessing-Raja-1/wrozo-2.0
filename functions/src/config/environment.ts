import { defineSecret, defineString } from "firebase-functions/params";

/**
 * Backend Environment Configuration
 *
 * Uses Firebase Functions (2nd Gen / params) parameter definitions.
 *
 * CRITICAL SECURITY ARCHITECTURE RULES:
 * 1. Non-sensitive configuration values use `defineString()`.
 * 2. Sensitive values (API keys, private keys, payment secrets, webhook secrets)
 *    MUST ALWAYS use `defineSecret()` and Google Cloud Secret Manager.
 * 3. Secrets are injected at runtime by Cloud Functions infrastructure and are
 *    never stored in Git, never stored in client builds, and never committed to `.env`.
 * 4. In local development / emulator, secrets can be defined in an untracked
 *    `functions/.secret.local` file which is strictly gitignored.
 */

// Non-sensitive runtime parameters
export const DEPLOYMENT_ENV = defineString("DEPLOYMENT_ENV", {
  default: "development",
  description: "Target deployment environment: development | staging | production",
});

export const APP_REGION = defineString("APP_REGION", {
  default: "asia-south1", // Mumbai / India primary region for Wrozo daily-wage marketplace
  description: "Primary Google Cloud Functions deployment region",
});

// Sensitive secrets (Provisioned via `firebase functions:secrets:set <SECRET_NAME>`)
// NOTE: These secrets are declared here for future trusted payment gateway integration.
// They are NOT initialized with fake values.
export const RAZORPAY_KEY_ID = defineString("RAZORPAY_KEY_ID", {
  default: "",
  description: "Razorpay Public Key Identifier (e.g. rzp_test_xxx or rzp_live_xxx)",
});

export const RAZORPAY_KEY_SECRET = defineSecret("RAZORPAY_KEY_SECRET");
export const RAZORPAY_WEBHOOK_SECRET = defineSecret("RAZORPAY_WEBHOOK_SECRET");

/**
 * Required Production Configuration Checklist:
 *
 * 1. RAZORPAY_KEY_ID:
 *    Set via: firebase functions:config:set or params defineString in production.
 *
 * 2. RAZORPAY_KEY_SECRET:
 *    Set via: firebase functions:secrets:set RAZORPAY_KEY_SECRET
 *    Stored exclusively in Google Cloud Secret Manager.
 *
 * 3. RAZORPAY_WEBHOOK_SECRET:
 *    Set via: firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
 *    Stored exclusively in Google Cloud Secret Manager. Used by webhook handler
 *    to cryptographically verify HMAC-SHA256 signatures before updating payment state.
 */
export interface BackendConfig {
  deploymentEnv: string;
  region: string;
  isProduction: boolean;
}

export function getBackendConfig(): BackendConfig {
  const env = DEPLOYMENT_ENV.value();
  return {
    deploymentEnv: env,
    region: APP_REGION.value(),
    isProduction: env === "production",
  };
}

export function getRazorpayKeyId(): string {
  try {
    return process.env.RAZORPAY_KEY_ID || RAZORPAY_KEY_ID.value() || "";
  } catch {
    return process.env.RAZORPAY_KEY_ID || "";
  }
}

export function getRazorpayKeySecret(): string {
  try {
    return process.env.RAZORPAY_KEY_SECRET || RAZORPAY_KEY_SECRET.value() || "";
  } catch {
    return process.env.RAZORPAY_KEY_SECRET || "";
  }
}

export function getRazorpayWebhookSecret(): string {
  try {
    return process.env.RAZORPAY_WEBHOOK_SECRET || RAZORPAY_WEBHOOK_SECRET.value() || "";
  } catch {
    return process.env.RAZORPAY_WEBHOOK_SECRET || "";
  }
}
