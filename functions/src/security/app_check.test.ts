import { describe, it, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  shouldEnforceAppCheck,
  verifyAppCheck,
  logAppCheckStatus,
} from "./app_check";
import { AuthError, ConflictError, ValidationError, ForbiddenError } from "../shared/errors";
import { jobService } from "../jobs/job_service";
import { applicationService } from "../applications/application_service";
import { paymentService } from "../payments/payment_service";
import { userService } from "../users/user_service";
import { tokenService } from "../notifications/token_service";
import { AuthContext } from "../auth/auth_helpers";

describe("Firebase App Check & Abuse Protection Foundation", () => {
  const originalEnv = process.env.ENFORCE_APP_CHECK;
  const originalDeployEnv = process.env.DEPLOYMENT_ENV;

  after(() => {
    process.env.ENFORCE_APP_CHECK = originalEnv;
    process.env.DEPLOYMENT_ENV = originalDeployEnv;
  });

  describe("shouldEnforceAppCheck Environment Evaluation", () => {
    it("returns true when ENFORCE_APP_CHECK is explicitly 'true'", () => {
      process.env.ENFORCE_APP_CHECK = "true";
      assert.strictEqual(shouldEnforceAppCheck(), true);
    });

    it("returns false when ENFORCE_APP_CHECK is explicitly 'false'", () => {
      process.env.ENFORCE_APP_CHECK = "false";
      assert.strictEqual(shouldEnforceAppCheck(), false);
    });

    it("defaults to false in development/test environment when unset", () => {
      delete process.env.ENFORCE_APP_CHECK;
      process.env.DEPLOYMENT_ENV = "development";
      assert.strictEqual(shouldEnforceAppCheck(), false);
    });
  });

  describe("verifyAppCheck Core Invariants", () => {
    beforeEach(() => {
      delete process.env.ENFORCE_APP_CHECK;
    });

    it("1. accepts request with valid App Check token", () => {
      const context: AuthContext = {
        auth: { uid: "user_worker_1" },
        app: {
          token: { app_id: "com.wrozo.wrozo", sub: "com.wrozo.wrozo" },
          alreadyConsumed: false,
        },
      };

      const result = verifyAppCheck(context, { required: true });
      assert.strictEqual(result.verified, true);
      assert.strictEqual(result.appId, "com.wrozo.wrozo");
      assert.strictEqual(result.alreadyConsumed, false);
    });

    it("2. rejects request with missing App Check token when required", () => {
      const context: AuthContext = {
        auth: { uid: "user_worker_1" },
      };

      assert.throws(
        () => verifyAppCheck(context, { required: true }),
        (err) => err instanceof AuthError && err.message.includes("App Check verification failed")
      );
    });

    it("3. rejects request when App Check token is already consumed (replay protection)", () => {
      const context: AuthContext = {
        auth: { uid: "user_contractor_1" },
        app: {
          token: { app_id: "com.wrozo.wrozo" },
          alreadyConsumed: true,
        },
      };

      assert.throws(
        () => verifyAppCheck(context, { rejectReplay: true }),
        (err) => err instanceof ConflictError && err.message.includes("already been consumed")
      );
    });

    it("4. permits development/emulator traffic without App Check when enforcement is disabled", () => {
      const context: AuthContext = {
        auth: { uid: "user_dev_1" },
      };

      const result = verifyAppCheck(context, { required: false });
      assert.strictEqual(result.verified, false);
      assert.strictEqual(result.appId, undefined);
    });

    it("5. logAppCheckStatus executes without throwing regardless of attestation presence", () => {
      assert.doesNotThrow(() => {
        logAppCheckStatus("testOperation", undefined);
        logAppCheckStatus("testOperation", { auth: { uid: "u1" } });
        logAppCheckStatus("testOperation", {
          auth: { uid: "u1" },
          app: { token: { app_id: "com.wrozo.wrozo" }, alreadyConsumed: false },
        });
      });
    });
  });

  describe("Security Principle: App Check NEVER Replaces Authentication or Authorization", () => {
    it("6. App Check token alone does NOT grant access without user authentication", async () => {
      // Valid App Check token from genuine Wrozo app, but unauthenticated caller
      const unauthenticatedWithAppCheck: AuthContext = {
        app: {
          token: { app_id: "com.wrozo.wrozo" },
          alreadyConsumed: false,
        },
      };

      // Attempting createJob without user auth must fail with AuthError
      await assert.rejects(
        () =>
          jobService.createJob(unauthenticatedWithAppCheck, {
            title: "Plumbing Assistant Needed",
            description: "Need help with emergency plumbing repair.",
            skillsRequired: ["Plumbing"],
            wage: 800,
            workerCountNeeded: 1,
          }),
        (err) => err instanceof AuthError
      );

      // Attempting applyForJob without user auth must fail with AuthError
      await assert.rejects(
        () =>
          applicationService.applyForJob(unauthenticatedWithAppCheck, {
            jobId: "job_123",
          }),
        (err) => err instanceof AuthError
      );
    });

    it("7. App Check token does NOT grant authorization if caller lacks required capability", async () => {
      // Mock worker context with valid App Check token
      const workerWithAppCheck: AuthContext = {
        auth: { uid: "non_existent_or_worker_only_user" },
        app: {
          token: { app_id: "com.wrozo.wrozo" },
          alreadyConsumed: false,
        },
      };

      // Worker attempting contractor createJob must fail authorization (NotFoundError or ForbiddenError)
      await assert.rejects(
        () =>
          jobService.createJob(workerWithAppCheck, {
            title: "Electrician Job",
            description: "Industrial wiring assistant needed.",
            skillsRequired: ["Wiring"],
            wage: 1000,
            workerCountNeeded: 1,
          }),
        (err) => err instanceof Error
      );
    });

    it("8. App Check token does NOT permit self-assignment of ADMIN or privileged capabilities", async () => {
      const userWithAppCheck: AuthContext = {
        auth: { uid: "test_user_dual_1" },
        app: {
          token: { app_id: "com.wrozo.wrozo" },
          alreadyConsumed: false,
        },
      };

      // Client attempting to self-assign ADMIN capability must fail with ForbiddenError
      await assert.rejects(
        () =>
          userService.setupAccountCapabilities(userWithAppCheck, {
            capabilities: {
              worker: true,
              // @ts-expect-error testing unauthorized key injection
              admin: true,
            },
          }),
        (err) => err instanceof ForbiddenError
      );
    });

    it("8b. Payment order creation rejects already-consumed App Check token (replay protection)", async () => {
      const consumedAppCheckCtx: AuthContext = {
        auth: { uid: "contractor_test_uid" },
        app: {
          token: { app_id: "com.wrozo.wrozo" },
          alreadyConsumed: true,
        },
      };

      await assert.rejects(
        () =>
          paymentService.createPaymentOrder(consumedAppCheckCtx, {
            jobId: "job_test_100",
            workerId: "worker_test_100",
          }),
        (err) => err instanceof ConflictError && err.message.includes("already been consumed")
      );
    });
  });

  describe("Abuse-Protection Input Validation & Limits", () => {
    it("9. rejects job creation with excessive skillsRequired (> 20 items)", async () => {
      const mockContractorCtx: AuthContext = {
        auth: { uid: "contractor_test_uid" },
      };

      const oversizedSkills = Array.from({ length: 25 }, (_, i) => `Skill_${i}`);

      await assert.rejects(
        () =>
          jobService.createJob(mockContractorCtx, {
            title: "Big Construction Site",
            description: "Looking for workers for multi-skill site.",
            skillsRequired: oversizedSkills,
            wage: 900,
            workerCountNeeded: 2,
          }),
        (err) =>
          err instanceof ValidationError ||
          err instanceof Error
      );
    });

    it("10. rejects job creation with excessive wage (> ₹10,00,000)", async () => {
      const mockContractorCtx: AuthContext = {
        auth: { uid: "contractor_test_uid" },
      };

      await assert.rejects(
        () =>
          jobService.createJob(mockContractorCtx, {
            title: "High Paying Scam Job",
            description: "Get rich quick with unreasonable wage.",
            skillsRequired: ["General"],
            wage: 50_000_000, // ₹5 Crore
            workerCountNeeded: 1,
          }),
        (err) => err instanceof ValidationError || err instanceof Error
      );
    });

    it("11. rejects job creation with excessive workerCountNeeded (> 100 workers)", async () => {
      const mockContractorCtx: AuthContext = {
        auth: { uid: "contractor_test_uid" },
      };

      await assert.rejects(
        () =>
          jobService.createJob(mockContractorCtx, {
            title: "Massive Worker Request",
            description: "Need an entire army of workers.",
            skillsRequired: ["General"],
            wage: 500,
            workerCountNeeded: 500,
          }),
        (err) => err instanceof ValidationError || err instanceof Error
      );
    });

    it("12. validates device token max length bounds (<= 500 characters)", async () => {
      const userCtx: AuthContext = {
        auth: { uid: "user_test_token" },
      };

      const oversizedToken = "a".repeat(501);

      await assert.rejects(
        () =>
          tokenService.registerToken(userCtx, {
            token: oversizedToken,
          }),
        (err) => err instanceof ValidationError && err.message.includes("exceeds maximum allowable length")
      );
    });

    it("13. rejects application request with oversized jobId (> 100 characters)", async () => {
      const workerCtx: AuthContext = {
        auth: { uid: "worker_test_uid" },
      };

      const oversizedJobId = "job_".padEnd(105, "x");

      await assert.rejects(
        () =>
          applicationService.applyForJob(workerCtx, {
            jobId: oversizedJobId,
          }),
        (err) => err instanceof ValidationError || err instanceof Error
      );
    });
  });
});
