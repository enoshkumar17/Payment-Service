import { Transaction } from "../models/transaction.model.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * Canonical payment lifecycle states.
 */
export const PaymentStatus = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  REVERSED: "REVERSED",
});

/**
 * Explicit map of valid state transitions.
 * Terminal states (FAILED, REVERSED) have empty transition arrays.
 */
export const VALID_TRANSITIONS = Object.freeze({
  [PaymentStatus.PENDING]: Object.freeze([PaymentStatus.PROCESSING]),
  [PaymentStatus.PROCESSING]: Object.freeze([PaymentStatus.SUCCEEDED, PaymentStatus.FAILED]),
  [PaymentStatus.SUCCEEDED]: Object.freeze([PaymentStatus.REVERSED]),
  [PaymentStatus.FAILED]: Object.freeze([]),
  [PaymentStatus.REVERSED]: Object.freeze([]),
});

/**
 * Checks if a transition from currentStatus to targetStatus is valid.
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @returns {boolean}
 */
export function canTransition(currentStatus, targetStatus) {
  if (!currentStatus || !targetStatus) return false;
  const allowed = VALID_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(targetStatus));
}

/**
 * Asserts that a transition from currentStatus to targetStatus is valid.
 * Throws ApiError(400) if invalid.
 * @param {string} currentStatus
 * @param {string} targetStatus
 */
export function assertValidTransition(currentStatus, targetStatus) {
  if (!canTransition(currentStatus, targetStatus)) {
    throw new ApiError(
      400,
      `Invalid payment status transition from ${currentStatus} to ${targetStatus}`
    );
  }
}

/**
 * Atomically transitions a transaction from fromStatus to toStatus in MongoDB.
 * Uses conditional matching ({ _id: transactionId, status: fromStatus }) to protect
 * against concurrent state modifications.
 *
 * @param {string|mongoose.Types.ObjectId} transactionId
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {object} [options]
 * @param {mongoose.ClientSession} [options.session]
 * @param {object} [options.additionalUpdates]
 * @returns {Promise<Document>} The updated transaction document.
 */
export async function transitionTransaction(
  transactionId,
  fromStatus,
  toStatus,
  { session = null, additionalUpdates = {} } = {}
) {
  assertValidTransition(fromStatus, toStatus);

  const queryOptions = { returnDocument: "after" };
  if (session) {
    queryOptions.session = session;
  }

  const updatedTransaction = await Transaction.findOneAndUpdate(
    { _id: transactionId, status: fromStatus },
    {
      $set: {
        status: toStatus,
        ...additionalUpdates,
      },
    },
    queryOptions
  );

  if (!updatedTransaction) {
    const query = Transaction.findById(transactionId);
    if (session) {
      query.session(session);
    }
    const current = await query;

    if (!current) {
      throw new ApiError(404, "Transaction not found");
    }

    throw new ApiError(
      409,
      `Payment status transition conflict: expected ${fromStatus} but transaction is currently in ${current.status} status`
    );
  }

  return updatedTransaction;
}
