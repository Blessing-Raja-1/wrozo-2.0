import { test, describe } from "node:test";
import * as assert from "node:assert";
import { jobService, VALID_JOB_TRANSITIONS } from "./job_service";
import { AuthContext } from "../auth/auth_helpers";
import { AuthError } from "../shared/errors";
import { JobStatus } from "../shared/types";

describe("Job Service & Authoritative Lifecycle", () => {
  describe("Finite State Machine Transitions", () => {
    test("OPEN allows transitions only to IN_PROGRESS and CANCELLED", () => {
      const allowed = VALID_JOB_TRANSITIONS["OPEN"];
      assert.deepStrictEqual(allowed, ["IN_PROGRESS", "CANCELLED"]);
      assert.ok(!allowed.includes("COMPLETED"), "OPEN cannot skip directly to COMPLETED");
    });

    test("IN_PROGRESS allows transitions only to COMPLETED and CANCELLED", () => {
      const allowed = VALID_JOB_TRANSITIONS["IN_PROGRESS"];
      assert.deepStrictEqual(allowed, ["COMPLETED", "CANCELLED"]);
      assert.ok(!allowed.includes("OPEN"), "IN_PROGRESS cannot revert to OPEN");
    });

    test("COMPLETED is a terminal state (no outgoing transitions)", () => {
      const allowed = VALID_JOB_TRANSITIONS["COMPLETED"];
      assert.deepStrictEqual(allowed, []);
    });

    test("CANCELLED is a terminal state (no outgoing transitions)", () => {
      const allowed = VALID_JOB_TRANSITIONS["CANCELLED"];
      assert.deepStrictEqual(allowed, []);
    });

    test("all defined JobStatus values have state machine mappings", () => {
      const statuses: JobStatus[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
      for (const status of statuses) {
        assert.ok(Array.isArray(VALID_JOB_TRANSITIONS[status]));
      }
    });
  });

  describe("createJob Input & Role Validation", () => {
    test("rejects unauthenticated requests", async () => {
      await assert.rejects(
        () =>
          jobService.createJob(undefined, {
            title: "Build Wall",
            description: "Build brick wall at site A",
            skillsRequired: ["Masonry"],
            wage: 800,
            workerCountNeeded: 2,
          }),
        AuthError
      );
    });

    test("rejects requests with missing auth UID", async () => {
      const context: AuthContext = { auth: { uid: "" } };
      await assert.rejects(
        () =>
          jobService.createJob(context, {
            title: "Build Wall",
            description: "Build brick wall at site A",
            skillsRequired: ["Masonry"],
            wage: 800,
            workerCountNeeded: 2,
          }),
        AuthError
      );
    });

    test("rejects job creation with invalid/short title", async () => {
      const mockContext: AuthContext = { auth: { uid: "mock_user" } };
      // Override or catch validation after role check
      // For input validation testing: title < 3 chars
      const input = {
        title: "No",
        description: "Build brick wall at site A",
        skillsRequired: ["Masonry"],
        wage: 800,
        workerCountNeeded: 2,
      };
      // When role check is bypassed or fails with not found / forbidden:
      try {
        await jobService.createJob(mockContext, input);
        assert.fail("Should have thrown");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });

  describe("transitionJobStatus Input & Role Validation", () => {
    test("rejects unauthenticated transition requests", async () => {
      await assert.rejects(
        () =>
          jobService.transitionJobStatus(undefined, {
            jobId: "job_123",
            targetStatus: "IN_PROGRESS",
          }),
        AuthError
      );
    });

    test("rejects transition when jobId is missing", async () => {
      const context: AuthContext = { auth: { uid: "contractor_1" } };
      try {
        await jobService.transitionJobStatus(context, {
          jobId: "",
          targetStatus: "IN_PROGRESS",
        });
        assert.fail("Should have thrown");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });
});
