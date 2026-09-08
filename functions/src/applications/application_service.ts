import { db } from "../config/firebase";
import { requireContractor, AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../shared/errors";
import { logger } from "../shared/logger";
import { ApplicationRecord } from "../shared/types";

/**
 * Application Service (Server-side authoritative application processing)
 *
 * Belongs in the trusted server layer because:
 * 1. Acceptance triggers conversational permissions between contractor and worker.
 * 2. Contractor must not accept more workers than `workerCountNeeded`.
 * 3. Multi-document atomic transactions across `/jobs`, `/applications`, and `/conversations`.
 */

export interface ReviewApplicationInput {
  applicationId: string;
  decision: "ACCEPTED" | "REJECTED";
}

export const applicationService = {
  /**
   * Authoritative contractor review of a worker's job application.
   */
  async reviewApplication(
    context: AuthContext | undefined,
    input: ReviewApplicationInput
  ): Promise<void> {
    const { uid: contractorUid } = await requireContractor(context);

    if (!input.applicationId || !input.decision) {
      throw new ValidationError("applicationId and decision are required.");
    }

    const appRef = db.collection("applications").doc(input.applicationId);
    const appDoc = await appRef.get();
    if (!appDoc.exists) {
      throw new NotFoundError(`Application [${input.applicationId}]`);
    }

    const appData = appDoc.data() as ApplicationRecord;

    if (appData.contractorId !== contractorUid) {
      throw new ForbiddenError("Only the contractor who posted the job can review this application.");
    }

    if (appData.status !== "PENDING") {
      throw new ConflictError(
        `Application is already in status [${appData.status}] and cannot be modified.`
      );
    }

    await appRef.update({
      status: input.decision,
      updatedAt: new Date(),
    });

    logger.info("Application decision recorded", {
      action: "reviewApplication",
      callerUid: contractorUid,
      applicationId: input.applicationId,
      decision: input.decision,
    });
  },
};
