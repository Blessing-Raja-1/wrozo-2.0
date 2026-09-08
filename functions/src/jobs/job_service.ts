import { db } from "../config/firebase";
import { requireContractor, AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../shared/errors";
import { logger } from "../shared/logger";
import { JobRecord, JobStatus } from "../shared/types";

/**
 * Job Service (Server-side authoritative job lifecycle management)
 *
 * Belongs in the trusted server layer because:
 * 1. Job completion triggers payment verification, worker history updates, and review eligibility.
 * 2. State transitions must follow a strict finite-state machine (OPEN -> IN_PROGRESS -> COMPLETED).
 * 3. Cannot rely on client claims to transition states without verifying contractor ownership.
 */

export interface UpdateJobStatusInput {
  jobId: string;
  targetStatus: JobStatus;
  reason?: string;
}

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [], // Terminal state
  CANCELLED: [], // Terminal state
};

export const jobService = {
  /**
   * Authoritatively updates job lifecycle status.
   */
  async updateJobStatus(context: AuthContext | undefined, input: UpdateJobStatusInput): Promise<void> {
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
      throw new ForbiddenError("Only the job creator can modify this job's status.");
    }

    const allowedNext = VALID_TRANSITIONS[jobData.status] || [];
    if (!allowedNext.includes(input.targetStatus)) {
      throw new ConflictError(
        `Cannot transition job from ${jobData.status} to ${input.targetStatus}.`
      );
    }

    await jobRef.update({
      status: input.targetStatus,
      updatedAt: new Date(),
      statusReason: input.reason ?? null,
    });

    logger.info("Authoritative job status transitioned", {
      action: "updateJobStatus",
      callerUid: contractorUid,
      jobId: input.jobId,
      previousStatus: jobData.status,
      newStatus: input.targetStatus,
    });
  },
};
