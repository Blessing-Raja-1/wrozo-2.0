import { Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { requireContractor, requireWorker, AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../shared/errors";
import { logger } from "../shared/logger";
import { notificationService } from "../notifications/notification_service";
import { verifyAppCheck, logAppCheckStatus } from "../security/app_check";
import {
  ApplicationRecord,
  JobRecord,
  JobStatus,
  ApplyForJobInput,
  AcceptApplicationInput,
  RejectApplicationInput,
  WithdrawApplicationInput,
} from "../shared/types";

export const applicationService = {
  /**
   * Authoritative worker application submission.
   */
  async applyForJob(
    context: AuthContext | undefined,
    input: ApplyForJobInput
  ): Promise<{ applicationId: string }> {
    verifyAppCheck(context);
    logAppCheckStatus("applyForJob", context);

    const { uid: workerUid } = await requireWorker(context);

    const jobId = input.jobId?.trim();
    if (!jobId) {
      throw new ValidationError("jobId is required to apply for a job.");
    }
    if (jobId.length > 100) {
      throw new ValidationError("jobId exceeds maximum allowable length.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) {
      throw new NotFoundError(`Job [${jobId}]`);
    }

    const jobData = jobDoc.data() as JobRecord;

    // Worker cannot apply to a non-OPEN job
    if (jobData.status !== "OPEN") {
      throw new ConflictError(`Cannot apply to a job with status [${jobData.status}]. Job must be OPEN.`);
    }

    // Worker cannot apply to their own job
    if (jobData.contractorId === workerUid) {
      throw new ForbiddenError("Workers cannot apply to their own job postings.");
    }

    // Deterministic composite ID
    const applicationId = `${jobId}_${workerUid}`;
    const appRef = db.collection("applications").doc(applicationId);
    const existingApp = await appRef.get();

    if (existingApp.exists) {
      throw new ConflictError("You have already applied for this job.");
    }

    const now = Timestamp.now();
    const newApplication: ApplicationRecord = {
      jobId,
      workerId: workerUid,
      contractorId: jobData.contractorId,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    };

    await appRef.set(newApplication);

    logger.info("Authoritative application created", {
      action: "applyForJob",
      callerUid: workerUid,
      applicationId,
      jobId,
    });

    // Authoritative notification dispatch (non-blocking)
    notificationService
      .notifyNewApplication(jobData.contractorId, jobData.title, jobId)
      .catch((err) => {
        logger.warn("Failed to dispatch new application notification", {
          action: "applyForJob",
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return { applicationId };
  },

  /**
   * Authoritative, transactional contractor application acceptance.
   *
   * Guarantees:
   * 1. Job ownership is strictly verified.
   * 2. Application must be in PENDING state.
   * 3. Capacity limit (workerCountNeeded) is strictly enforced within a transaction.
   * 4. If first accepted worker, job is automatically transitioned from OPEN to IN_PROGRESS.
   * 5. Zero race conditions where concurrent acceptances exceed capacity.
   */
  async acceptApplication(
    context: AuthContext | undefined,
    input: AcceptApplicationInput
  ): Promise<{ applicationId: string; jobStatus: JobStatus }> {
    verifyAppCheck(context);
    logAppCheckStatus("acceptApplication", context);

    const { uid: contractorUid } = await requireContractor(context);

    const applicationId = input.applicationId?.trim();
    if (!applicationId) {
      throw new ValidationError("applicationId is required.");
    }
    if (applicationId.length > 150) {
      throw new ValidationError("applicationId exceeds maximum allowable length.");
    }

    const appRef = db.collection("applications").doc(applicationId);

    const result = await db.runTransaction(async (transaction) => {
      const appDoc = await transaction.get(appRef);
      if (!appDoc.exists) {
        throw new NotFoundError(`Application [${applicationId}]`);
      }

      const appData = appDoc.data() as ApplicationRecord;

      if (appData.contractorId !== contractorUid) {
        throw new ForbiddenError("Only the contractor who posted this job can accept applications.");
      }

      if (appData.status !== "PENDING") {
        throw new ConflictError(
          `Application is currently in status [${appData.status}]. Only PENDING applications can be accepted.`
        );
      }

      const jobRef = db.collection("jobs").doc(appData.jobId);
      const jobDoc = await transaction.get(jobRef);
      if (!jobDoc.exists) {
        throw new NotFoundError(`Job [${appData.jobId}]`);
      }

      const jobData = jobDoc.data() as JobRecord;

      if (jobData.status !== "OPEN" && jobData.status !== "IN_PROGRESS") {
        throw new ConflictError(
          `Cannot accept workers for a job in status [${jobData.status}].`
        );
      }

      // Query currently accepted applications within transaction
      const acceptedQuery = db
        .collection("applications")
        .where("jobId", "==", appData.jobId)
        .where("status", "==", "ACCEPTED");
      const acceptedSnap = await transaction.get(acceptedQuery);
      const acceptedCount = acceptedSnap.size;

      if (acceptedCount >= jobData.workerCountNeeded) {
        throw new ConflictError(
          `Job capacity reached: all ${jobData.workerCountNeeded} worker position(s) have been filled.`
        );
      }

      const now = Timestamp.now();

      // Update application to ACCEPTED
      transaction.update(appRef, {
        status: "ACCEPTED",
        updatedAt: now,
      });

      let updatedJobStatus: JobStatus = jobData.status;

      // If this is the first accepted worker, transition job to IN_PROGRESS
      if (jobData.status === "OPEN") {
        updatedJobStatus = "IN_PROGRESS";
        transaction.update(jobRef, {
          status: "IN_PROGRESS",
          updatedAt: now,
        });
      }

      return {
        applicationId,
        jobStatus: updatedJobStatus,
        acceptedCount: acceptedCount + 1,
        workerCountNeeded: jobData.workerCountNeeded,
        workerId: appData.workerId,
        jobTitle: jobData.title,
        jobId: appData.jobId,
      };
    });

    logger.info("Authoritative application accepted transactionally", {
      action: "acceptApplication",
      callerUid: contractorUid,
      applicationId: result.applicationId,
      newJobStatus: result.jobStatus,
      acceptedCount: result.acceptedCount,
      workerCountNeeded: result.workerCountNeeded,
    });

    // Authoritative notification dispatch after successful transaction commit
    notificationService
      .notifyApplicationAccepted(result.workerId, result.jobTitle, result.jobId)
      .catch((err) => {
        logger.warn("Failed to dispatch application accepted notification", {
          action: "acceptApplication",
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return {
      applicationId: result.applicationId,
      jobStatus: result.jobStatus,
    };
  },

  /**
   * Authoritative contractor application rejection.
   */
  async rejectApplication(
    context: AuthContext | undefined,
    input: RejectApplicationInput
  ): Promise<void> {
    verifyAppCheck(context);
    logAppCheckStatus("rejectApplication", context);

    const { uid: contractorUid } = await requireContractor(context);

    const applicationId = input.applicationId?.trim();
    if (!applicationId) {
      throw new ValidationError("applicationId is required.");
    }
    if (applicationId.length > 150) {
      throw new ValidationError("applicationId exceeds maximum allowable length.");
    }
    if (input.reason && input.reason.length > 500) {
      throw new ValidationError("Rejection reason cannot exceed 500 characters.");
    }

    const appRef = db.collection("applications").doc(applicationId);
    const appDoc = await appRef.get();
    if (!appDoc.exists) {
      throw new NotFoundError(`Application [${applicationId}]`);
    }

    const appData = appDoc.data() as ApplicationRecord;

    if (appData.contractorId !== contractorUid) {
      throw new ForbiddenError("Only the contractor who posted this job can reject applications.");
    }

    if (appData.status !== "PENDING") {
      throw new ConflictError(
        `Application is in status [${appData.status}]. Only PENDING applications can be rejected.`
      );
    }

    const now = Timestamp.now();
    await appRef.update({
      status: "REJECTED",
      updatedAt: now,
      ...(input.reason ? { rejectionReason: input.reason.trim() } : {}),
    });

    logger.info("Authoritative application rejected", {
      action: "rejectApplication",
      callerUid: contractorUid,
      applicationId,
    });

    // Authoritative notification dispatch
    db.collection("jobs")
      .doc(appData.jobId)
      .get()
      .then((jobDoc) => {
        const jobTitle = (jobDoc.data() as JobRecord | undefined)?.title || "Job";
        return notificationService.notifyApplicationRejected(
          appData.workerId,
          jobTitle,
          appData.jobId
        );
      })
      .catch((err) => {
        logger.warn("Failed to dispatch application rejected notification", {
          action: "rejectApplication",
          error: err instanceof Error ? err.message : String(err),
        });
      });
  },

  /**
   * Authoritative worker application withdrawal.
   */
  async withdrawApplication(
    context: AuthContext | undefined,
    input: WithdrawApplicationInput
  ): Promise<void> {
    verifyAppCheck(context);
    logAppCheckStatus("withdrawApplication", context);

    const { uid: workerUid } = await requireWorker(context);

    const applicationId = input.applicationId?.trim();
    if (!applicationId) {
      throw new ValidationError("applicationId is required.");
    }
    if (applicationId.length > 150) {
      throw new ValidationError("applicationId exceeds maximum allowable length.");
    }

    const appRef = db.collection("applications").doc(applicationId);
    const appDoc = await appRef.get();
    if (!appDoc.exists) {
      throw new NotFoundError(`Application [${applicationId}]`);
    }

    const appData = appDoc.data() as ApplicationRecord;

    if (appData.workerId !== workerUid) {
      throw new ForbiddenError("Only the applicant worker can withdraw this application.");
    }

    if (appData.status === "ACCEPTED") {
      throw new ConflictError("Cannot withdraw an application that has already been accepted.");
    }

    if (appData.status !== "PENDING") {
      throw new ConflictError(`Only PENDING applications can be withdrawn (current status: ${appData.status}).`);
    }

    const now = Timestamp.now();
    await appRef.update({
      status: "WITHDRAWN",
      updatedAt: now,
    });

    logger.info("Authoritative application withdrawn", {
      action: "withdrawApplication",
      callerUid: workerUid,
      applicationId,
    });

    // Authoritative notification dispatch
    db.collection("jobs")
      .doc(appData.jobId)
      .get()
      .then((jobDoc) => {
        const jobTitle = (jobDoc.data() as JobRecord | undefined)?.title || "Job";
        return notificationService.notifyApplicationWithdrawn(
          appData.contractorId,
          jobTitle,
          appData.jobId
        );
      })
      .catch((err) => {
        logger.warn("Failed to dispatch application withdrawn notification", {
          action: "withdrawApplication",
          error: err instanceof Error ? err.message : String(err),
        });
      });
  },

  /**
   * Reads application record from Firestore.
   */
  async getApplication(applicationId: string): Promise<ApplicationRecord> {
    const appDoc = await db.collection("applications").doc(applicationId).get();
    if (!appDoc.exists) {
      throw new NotFoundError(`Application [${applicationId}]`);
    }
    return appDoc.data() as ApplicationRecord;
  },
};
