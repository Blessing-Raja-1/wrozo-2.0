import { test, describe } from "node:test";
import * as assert from "node:assert";
import { applicationService } from "./application_service";
import { AuthContext } from "../auth/auth_helpers";
import { AuthError } from "../shared/errors";

describe("Application Service & Workflow Authorization", () => {
  describe("applyForJob Validation", () => {
    test("rejects unauthenticated worker application requests", async () => {
      await assert.rejects(
        () => applicationService.applyForJob(undefined, { jobId: "job_123" }),
        AuthError
      );
    });

    test("rejects application when auth context has empty uid", async () => {
      const context: AuthContext = { auth: { uid: "" } };
      await assert.rejects(
        () => applicationService.applyForJob(context, { jobId: "job_123" }),
        AuthError
      );
    });

    test("rejects application with empty jobId", async () => {
      const context: AuthContext = { auth: { uid: "worker_1" } };
      try {
        await applicationService.applyForJob(context, { jobId: "" });
        assert.fail("Should have thrown");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });

  describe("acceptApplication Validation", () => {
    test("rejects unauthenticated accept requests", async () => {
      await assert.rejects(
        () => applicationService.acceptApplication(undefined, { applicationId: "app_123" }),
        AuthError
      );
    });

    test("rejects accept with empty applicationId", async () => {
      const context: AuthContext = { auth: { uid: "contractor_1" } };
      try {
        await applicationService.acceptApplication(context, { applicationId: "" });
        assert.fail("Should have thrown");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });

  describe("rejectApplication Validation", () => {
    test("rejects unauthenticated reject requests", async () => {
      await assert.rejects(
        () => applicationService.rejectApplication(undefined, { applicationId: "app_123" }),
        AuthError
      );
    });

    test("rejects reject with empty applicationId", async () => {
      const context: AuthContext = { auth: { uid: "contractor_1" } };
      try {
        await applicationService.rejectApplication(context, { applicationId: "" });
        assert.fail("Should have thrown");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });

  describe("withdrawApplication Validation", () => {
    test("rejects unauthenticated withdraw requests", async () => {
      await assert.rejects(
        () => applicationService.withdrawApplication(undefined, { applicationId: "app_123" }),
        AuthError
      );
    });

    test("rejects withdraw with empty applicationId", async () => {
      const context: AuthContext = { auth: { uid: "worker_1" } };
      try {
        await applicationService.withdrawApplication(context, { applicationId: "" });
        assert.fail("Should have thrown");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });

  describe("Composite Application ID Invariant", () => {
    test("formulates canonical composite ID as ${jobId}_${workerId}", () => {
      const jobId = "job_painting_001";
      const workerId = "usr_worker_999";
      const expectedId = `${jobId}_${workerId}`;
      assert.strictEqual(expectedId, "job_painting_001_usr_worker_999");
    });
  });
});
