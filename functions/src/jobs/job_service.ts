import { Timestamp, GeoPoint } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { requireContractor, AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../shared/errors";
import { logger } from "../shared/logger";
import { notificationService } from "../notifications/notification_service";
import { JobRecord, JobStatus, CreateJobInput, TransitionJobStatusInput } from "../shared/types";

/**
 * Authoritative Job Finite State Machine
 *
 * Valid Transitions:
 * - OPEN -> IN_PROGRESS, CANCELLED
 * - IN_PROGRESS -> COMPLETED, CANCELLED
 * Terminal States:
 * - COMPLETED
 * - CANCELLED
 */
export const VALID_JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
};

export const jobService = {
  /**
   * Authoritatively creates a new job post in OPEN status.
   */
  async createJob(
    context: AuthContext | undefined,
    input: CreateJobInput
  ): Promise<{ jobId: string }> {
    const { uid: contractorUid } = await requireContractor(context);

    // Validate title
    const title = input.title?.trim();
    if (!title || title.length < 3 || title.length > 200) {
      throw new ValidationError("Job title must be between 3 and 200 characters.");
    }

    // Validate description
    const description = input.description?.trim();
    if (!description || description.length < 10 || description.length > 5000) {
      throw new ValidationError("Job description must be between 10 and 5000 characters.");
    }

    // Validate skills required
    if (!Array.isArray(input.skillsRequired) || input.skillsRequired.length === 0) {
      throw new ValidationError("At least one required skill must be specified.");
    }
    const skillsRequired = input.skillsRequired
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0);
    if (skillsRequired.length === 0) {
      throw new ValidationError("Skills required cannot contain only empty strings.");
    }

    // Validate wage (INR positive integer)
    const wage = Math.floor(Number(input.wage));
    if (isNaN(wage) || wage <= 0) {
      throw new ValidationError("Job wage must be a positive integer amount in INR.");
    }

    // Validate worker count needed
    const workerCountNeeded = Math.floor(Number(input.workerCountNeeded));
    if (isNaN(workerCountNeeded) || workerCountNeeded < 1) {
      throw new ValidationError("workerCountNeeded must be at least 1.");
    }

    // Optional GeoPoint location
    let location: GeoPoint | undefined = undefined;
    if (input.latitude !== undefined && input.longitude !== undefined) {
      const lat = Number(input.latitude);
      const lng = Number(input.longitude);
      if (isNaN(lat) || lat < -90 || lat > 90 || isNaN(lng) || lng < -180 || lng > 180) {
        throw new ValidationError("Invalid latitude/longitude coordinates.");
      }
      location = new GeoPoint(lat, lng);
    }

    const docRef = db.collection("jobs").doc();
    const now = Timestamp.now();

    const jobRecord: JobRecord = {
      contractorId: contractorUid,
      title,
      description,
      skillsRequired,
      wage,
      status: "OPEN",
      workerCountNeeded,
      createdAt: now,
      updatedAt: now,
      ...(input.geohash ? { geohash: input.geohash } : {}),
      ...(location ? { location } : {}),
    };

    await docRef.set(jobRecord);

    logger.info("Authoritative job created", {
      action: "createJob",
      callerUid: contractorUid,
      jobId: docRef.id,
      wage,
      workerCountNeeded,
    });

    return { jobId: docRef.id };
  },

  /**
   * Authoritatively transitions a job to a new lifecycle status.
   */
  async transitionJobStatus(
    context: AuthContext | undefined,
    input: TransitionJobStatusInput
  ): Promise<void> {
    const { uid: contractorUid } = await requireContractor(context);

    if (!input.jobId || !input.targetStatus) {
      throw new ValidationError("jobId and targetStatus are required.");
    }

    const jobRef = db.collection("jobs").doc(input.jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) {
      throw new NotFoundError(`Job [${input.jobId}]`);
    }

    const jobData = jobDoc.data() as JobRecord;

    if (jobData.contractorId !== contractorUid) {
      throw new ForbiddenError("Only the contractor who posted this job can modify its status.");
    }

    const currentStatus = jobData.status;
    const targetStatus = input.targetStatus;

    if (currentStatus === targetStatus) {
      return; // Idempotent no-op
    }

    const allowedNext = VALID_JOB_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(targetStatus)) {
      throw new ConflictError(
        `Cannot transition job from ${currentStatus} to ${targetStatus}.`
      );
    }

    const now = Timestamp.now();
    const updatePayload: Partial<JobRecord> & { updatedAt: Timestamp } = {
      status: targetStatus,
      updatedAt: now,
    };

    // Transition-specific preconditions
    if (targetStatus === "COMPLETED") {
      if (currentStatus !== "IN_PROGRESS") {
        throw new ConflictError("Only jobs in IN_PROGRESS status can be completed.");
      }

      // Authoritative verification: accepted worker participation must exist
      const acceptedSnap = await db
        .collection("applications")
        .where("jobId", "==", input.jobId)
        .where("status", "==", "ACCEPTED")
        .limit(1)
        .get();

      if (acceptedSnap.empty) {
        throw new ConflictError(
          "Cannot complete job: no accepted workers found for this job."
        );
      }

      updatePayload.completedAt = now;
    } else if (targetStatus === "CANCELLED") {
      updatePayload.cancelledAt = now;
      if (input.reason) {
        updatePayload.statusReason = input.reason.trim();
      }
    }

    await jobRef.update(updatePayload);

    logger.info("Authoritative job status transitioned", {
      action: "transitionJobStatus",
      callerUid: contractorUid,
      jobId: input.jobId,
      previousStatus: currentStatus,
      newStatus: targetStatus,
    });

    // Authoritative notification dispatch (non-blocking)
    if (targetStatus === "COMPLETED") {
      db.collection("applications")
        .where("jobId", "==", input.jobId)
        .where("status", "==", "ACCEPTED")
        .get()
        .then((snap) => {
          const workerIds = snap.docs.map((d) => (d.data() as { workerId: string }).workerId);
          return notificationService.notifyJobCompleted(workerIds, jobData.title, input.jobId);
        })
        .catch((err) => {
          logger.warn("Failed to dispatch job completed notifications", {
            action: "transitionJobStatus",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } else if (targetStatus === "CANCELLED") {
      db.collection("applications")
        .where("jobId", "==", input.jobId)
        .get()
        .then((snap) => {
          const workerIds = snap.docs.map((d) => (d.data() as { workerId: string }).workerId);
          return notificationService.notifyJobCancelled(workerIds, jobData.title, input.jobId);
        })
        .catch((err) => {
          logger.warn("Failed to dispatch job cancelled notifications", {
            action: "transitionJobStatus",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  },

  /**
   * Reads job record from Firestore.
   */
  async getJob(jobId: string): Promise<JobRecord> {
    const jobDoc = await db.collection("jobs").doc(jobId).get();
    if (!jobDoc.exists) {
      throw new NotFoundError(`Job [${jobId}]`);
    }
    return jobDoc.data() as JobRecord;
  },
};
