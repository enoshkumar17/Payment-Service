import { Transaction } from "../models/transaction.model.js";
import { Ledger } from "../models/ledger.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Account } from "../models/account.model.js";
import { sendTransactionEmail, sendTransactionFailedEmail } from "../services/email.service.js";
import {
  PaymentStatus,
  assertValidTransition,
  transitionTransaction,
} from "../services/paymentStateMachine.js";
import mongoose from "mongoose";

/* 
  Hardened transfer flow with explicit state machine:
  1. Validate input data
  2. Check idempotency key
  3. Validate accounts and status
  4. Check sender balance
  5. Create transaction in PENDING status
  6. Transition PENDING -> PROCESSING
  7. Start MongoDB session
  8. Create debit ledger entry
  9. Create credit ledger entry
  10. Transition PROCESSING -> SUCCEEDED within session
  11. Commit session
  12. Send email notification
  - On failure: Abort session, transition PROCESSING -> FAILED outside session
*/
const createTransaction = asyncHandler(async (req, res) => {
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

  if ([fromAccount, toAccount, amount, idempotencyKey].some((field) => !field)) {
    throw new ApiError(400, "all fields are required to make transation");
  }

  const fromAccountExists = await Account.findById(fromAccount);
  const toAccountExists = await Account.findById(toAccount);

  if (!fromAccountExists || !toAccountExists) {
    throw new ApiError(400, "Invalid fromAccountId or toAccountId");
  }

  // Authorization check: user must own the source account or be a system user
  const isOwner = req.user?._id && fromAccountExists.user.equals(req.user._id);
  const isSystemAdmin = Boolean(req.user?.systemUser);

  if (!isOwner && !isSystemAdmin) {
    throw new ApiError(403, "Forbidden: You are not authorized to initiate payments from this account");
  }

  // Idempotency check against canonical statuses
  const idempotencyKeyExists = await Transaction.findOne({ idempotencyKey });

  if (idempotencyKeyExists) {
    if (idempotencyKeyExists.status === PaymentStatus.FAILED) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction Failed, try again"));
    }
    if (idempotencyKeyExists.status === PaymentStatus.SUCCEEDED) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction Completed"));
    }
    if (
      idempotencyKeyExists.status === PaymentStatus.PENDING ||
      idempotencyKeyExists.status === PaymentStatus.PROCESSING
    ) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction is processing, please wait"));
    }
    if (idempotencyKeyExists.status === PaymentStatus.REVERSED) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction Reversed, try again"));
    }
  }

  // Account status validation
  if (fromAccountExists.status !== "ACTIVE" || toAccountExists.status !== "ACTIVE") {
    throw new ApiError(400, "Both fromAccount or toAccount must be Active");
  }

  // Initial pre-check on sender balance
  const senderBalance = await fromAccountExists.getBalance();

  if (senderBalance < amount) {
    throw new ApiError(403, `Insufficient Balance. Balance amount:${senderBalance}`);
  }

  // 1. Create transaction in PENDING state outside session (preserves record & idempotencyKey if session aborts).
  // Handle concurrent insertion race on identical idempotencyKey:
  let newTransaction;
  try {
    newTransaction = await Transaction.create({
      fromAccount,
      toAccount,
      amount,
      status: PaymentStatus.PENDING,
      idempotencyKey,
    });
  } catch (err) {
    if (err.code === 11000 || (err.name === "MongoServerError" && err.code === 11000)) {
      // Racing concurrent request created the transaction with this idempotencyKey
      const existingTx = await Transaction.findOne({ idempotencyKey });
      if (existingTx) {
        if (existingTx.status === PaymentStatus.SUCCEEDED) {
          return res
            .status(200)
            .json(new ApiResponse(200, existingTx, "Transaction Completed"));
        }
        if (
          existingTx.status === PaymentStatus.PENDING ||
          existingTx.status === PaymentStatus.PROCESSING
        ) {
          return res
            .status(200)
            .json(new ApiResponse(200, existingTx, "Transaction is processing, please wait"));
        }
        if (existingTx.status === PaymentStatus.FAILED) {
          return res
            .status(200)
            .json(new ApiResponse(200, existingTx, "Transaction Failed, try again"));
        }
        if (existingTx.status === PaymentStatus.REVERSED) {
          return res
            .status(200)
            .json(new ApiResponse(200, existingTx, "Transaction Reversed, try again"));
        }
      }
    }
    throw err;
  }

  // 2. Explicitly transition PENDING -> PROCESSING
  newTransaction = await transitionTransaction(
    newTransaction._id,
    PaymentStatus.PENDING,
    PaymentStatus.PROCESSING
  );

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    // Concurrency protection: Acquire write lock on source account within the transaction session.
    // Serializes concurrent payment attempts from the same source account in MongoDB.
    const lockedSourceAccount = await Account.findOneAndUpdate(
      { _id: fromAccount, status: "ACTIVE" },
      { $set: { updatedAt: new Date() } },
      { session, returnDocument: "after" }
    );

    if (!lockedSourceAccount) {
      throw new ApiError(400, "Source account is not active or not found");
    }

    // In-transaction balance check: Evaluates ledger balance within this session's snapshot
    // after acquiring write lock. Any previously committed debit is visible here!
    const sessionBalance = await fromAccountExists.getBalance({ session });
    if (sessionBalance < amount) {
      throw new ApiError(403, `Insufficient Balance. Balance amount:${sessionBalance}`);
    }

    const debitLedgerEntry = await Ledger.create(
      [
        {
          account: fromAccount,
          amount: amount,
          transaction: newTransaction._id,
          type: "Debit",
        },
      ],
      { session }
    );

    // Opt-in simulation delay for concurrency testing (defaults to 0 in production)
    const delayMs = parseInt(process.env.PAYMENT_SIMULATED_DELAY_MS, 10) || 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const creditLedgerEntry = await Ledger.create(
      [
        {
          account: toAccount,
          amount: amount,
          transaction: newTransaction._id,
          type: "Credit",
        },
      ],
      { session }
    );

    // 3. Atomically transition PROCESSING -> SUCCEEDED inside session
    newTransaction = await transitionTransaction(
      newTransaction._id,
      PaymentStatus.PROCESSING,
      PaymentStatus.SUCCEEDED,
      { session }
    );

    await session.commitTransaction();

    try {
      await sendTransactionEmail(
        req.user.email,
        req.user.name,
        amount,
        toAccount,
        newTransaction._id
      );
    } catch (emailErr) {
      console.error("Failed to send transaction confirmation email:", emailErr.message);
    }
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }

    // 4. On failure: Atomically transition PROCESSING -> FAILED outside aborted session
    try {
      newTransaction = await transitionTransaction(
        newTransaction._id,
        PaymentStatus.PROCESSING,
        PaymentStatus.FAILED
      );
    } catch (transitionError) {
      // If already transitioned or conflict, do not override
    }

    try {
      await sendTransactionFailedEmail(
        req.user.email,
        req.user.name,
        amount,
        toAccount,
        newTransaction._id
      );
    } catch (emailError) {
      console.error("Failed to send transaction failure notification email:", emailError.message);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(404, "Last transaction is failed");
  } finally {
    if (session) {
      await session.endSession();
    }
  }

  return res
    .status(201)
    .json(new ApiResponse(201, newTransaction, "Transaction Completed"));
});

/*
  Concurrency-safe minimal reversal flow:
  1. Validates caller authorization (must own source account or be system user)
  2. Validates recipient balance safety (recipient must have sufficient balance)
  3. Validates SUCCEEDED -> REVERSED transition rule
  4. Inside a MongoDB session, atomically transitions SUCCEEDED -> REVERSED
  5. Writes compensating ledger entries (Credit sender, Debit receiver)
  6. Commits session
  - Prevents race conditions from generating duplicate compensating ledger entries.
*/
const reverseTransaction = asyncHandler(async (req, res) => {
  const { transactionId } = req.params;

  if (!transactionId) {
    throw new ApiError(400, "Transaction ID is required for reversal");
  }

  const originalTransaction = await Transaction.findById(transactionId);
  if (!originalTransaction) {
    throw new ApiError(404, "Transaction not found");
  }

  // 1. Authorization check: user must own the source account or be a system user
  const fromAccountRecord = await Account.findById(originalTransaction.fromAccount);
  if (!fromAccountRecord) {
    throw new ApiError(404, "Original source account not found");
  }

  const isOwner = req.user?._id && fromAccountRecord.user.equals(req.user._id);
  const isSystemAdmin = Boolean(req.user?.systemUser);

  if (!isOwner && !isSystemAdmin) {
    throw new ApiError(403, "Forbidden: You are not authorized to reverse this transaction");
  }

  // 2. Balance safety check: recipient must have sufficient balance to be debited
  const toAccountRecord = await Account.findById(originalTransaction.toAccount);
  if (!toAccountRecord) {
    throw new ApiError(404, "Original recipient account not found");
  }

  const recipientBalance = await toAccountRecord.getBalance();
  if (recipientBalance < originalTransaction.amount) {
    throw new ApiError(
      400,
      `Cannot reverse transaction: Recipient has insufficient balance (Current: ${recipientBalance}, Required: ${originalTransaction.amount})`
    );
  }

  // 3. Verify transition eligibility upfront
  assertValidTransition(originalTransaction.status, PaymentStatus.REVERSED);

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    // Atomic conditional update inside session:
    // If a concurrent request already reversed this, findOneAndUpdate will fail with 409
    const reversedTransaction = await transitionTransaction(
      transactionId,
      PaymentStatus.SUCCEEDED,
      PaymentStatus.REVERSED,
      { session }
    );

    // Compensating double-entry ledger entries:
    // 1. Return funds to original sender (Credit)
    await Ledger.create(
      [
        {
          account: originalTransaction.fromAccount,
          amount: originalTransaction.amount,
          transaction: originalTransaction._id,
          type: "Credit",
        },
      ],
      { session }
    );

    // 2. Withdraw funds from original receiver (Debit)
    await Ledger.create(
      [
        {
          account: originalTransaction.toAccount,
          amount: originalTransaction.amount,
          transaction: originalTransaction._id,
          type: "Debit",
        },
      ],
      { session }
    );

    await session.commitTransaction();

    return res
      .status(200)
      .json(new ApiResponse(200, reversedTransaction, "Transaction reversed successfully"));
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

const createInitialFundTransaction = asyncHandler(async (req, res) => {
  const { toAccount, amount, idempotencyKey } = req.body;

  if ([toAccount, amount, idempotencyKey].some((field) => !field)) {
    throw new ApiError(400, "All fields are required for transaction");
  }

  if (amount === 0) {
    throw new ApiError(400, "Amount Cannot be Zero");
  }

  const toUserAccountExists = await Account.findOne({ _id: toAccount });

  if (!toUserAccountExists) {
    throw new ApiError(400, "Invalid Receiver Account");
  }

  const idempotencyKeyExists = await Transaction.findOne({ idempotencyKey });

  if (idempotencyKeyExists) {
    if (
      idempotencyKeyExists.status === PaymentStatus.PENDING ||
      idempotencyKeyExists.status === PaymentStatus.PROCESSING
    ) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction is processing, please wait"));
    }
    if (idempotencyKeyExists.status === PaymentStatus.SUCCEEDED) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction Completed"));
    }
    if (idempotencyKeyExists.status === PaymentStatus.FAILED) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction Failed, try again"));
    }
    if (idempotencyKeyExists.status === PaymentStatus.REVERSED) {
      return res
        .status(200)
        .json(new ApiResponse(200, idempotencyKeyExists, "Transaction Reversed, try again"));
    }
  }

  const fromUserAccountExists = await Account.findOne({
    user: req.user._id,
  });

  if (!fromUserAccountExists) {
    throw new ApiError(404, "Sysytem User Account doesnt Exists");
  }

  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();

    let newTransaction = new Transaction({
      fromAccount: fromUserAccountExists._id,
      toAccount,
      amount,
      idempotencyKey,
      status: PaymentStatus.PROCESSING,
    });

    await newTransaction.save({ session });

    await Ledger.create(
      [
        {
          account: fromUserAccountExists._id,
          amount,
          transaction: newTransaction._id,
          type: "Debit",
        },
      ],
      { session }
    );

    await Ledger.create(
      [
        {
          account: toAccount,
          amount,
          transaction: newTransaction._id,
          type: "Credit",
        },
      ],
      { session }
    );

    newTransaction = await transitionTransaction(
      newTransaction._id,
      PaymentStatus.PROCESSING,
      PaymentStatus.SUCCEEDED,
      { session }
    );

    await session.commitTransaction();

    try {
      await sendTransactionEmail(
        req.user.email,
        req.user.name,
        amount,
        toAccount,
        newTransaction._id
      );
    } catch (emailErr) {
      console.error("Failed to send initial funds transaction confirmation email:", emailErr.message);
    }

    return res
      .status(201)
      .json(
        new ApiResponse(201, newTransaction, "Initial funds transaction completed")
      );
  } catch (error) {
    if (session) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

export {
  createTransaction,
  reverseTransaction,
  createInitialFundTransaction,
};
