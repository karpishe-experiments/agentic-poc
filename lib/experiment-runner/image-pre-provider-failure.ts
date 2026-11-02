import type { ExperimentOperationDocument } from "@/db/documents";

/** No provider may run without the transactional authorization reservation.
 * Terminal remote identity must additionally be read back before approval. */
export function isUnclaimedImageFailure(op: ExperimentOperationDocument) {
  return op.mode === "real" && op.role === "image" && op.providerKind === "image" &&
    op.state === "failed" && op.safeFailure === "definite_failure" && op.remoteStatus === "failed" &&
    op.reservationCount === 0 && !!op.workflowRunId && op.dispatchStartedAtMs != null &&
    !!op.realImagePreparation && !op.realImageReservation && !op.m4Reservation && !op.realImageObservation &&
    !op.verifiedWorkflowId && !op.authorizationClaim && !op.resultFinalizationClaim && !op.imageCompletionClaim &&
    !op.resultJson && !op.materializationJson;
}
