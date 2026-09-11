import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";

// Must set DNS servers BEFORE any mongoose / network imports
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const { default: mongoose } = await import("mongoose");
await import("dotenv/config");
const { User } = await import("../src/models/user.model.js");
const { Account } = await import("../src/models/account.model.js");
const { Transaction } = await import("../src/models/transaction.model.js");
const { Ledger } = await import("../src/models/ledger.model.js");
const { PaymentStatus, transitionTransaction } = await import("../src/services/paymentStateMachine.js");
const { createTransaction, reverseTransaction } = await import("../src/controllers/transaction.controller.js");
const { ApiError } = await import("../src/utils/ApiError.js");

describe("Payment Integration - Real Database & Concurrency Tests", () => {
  let isConnected = false;

  // Track created test IDs for guaranteed cleanup
  const createdUserIds = [];
  const createdAccountIds = [];
  const createdTransactionIds = [];

  before(async () => {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      }
      isConnected = mongoose.connection.readyState === 1;
    } catch (err) {
      console.warn("MongoDB Atlas connection warning:", err.message);
      isConnected = false;
    }
  });

  after(async () => {
    if (isConnected) {
      try {
        if (createdTransactionIds.length > 0) {
          await Transaction.deleteMany({ _id: { $in: createdTransactionIds } });
          // Native collection delete to bypass Mongoose Ledger immutability hook
          await Ledger.collection.deleteMany({ transaction: { $in: createdTransactionIds } });
        }
        if (createdAccountIds.length > 0) {
          await Account.deleteMany({ _id: { $in: createdAccountIds } });
          await Ledger.collection.deleteMany({ account: { $in: createdAccountIds } });
        }
        if (createdUserIds.length > 0) {
          await User.deleteMany({ _id: { $in: createdUserIds } });
        }
      } catch (cleanupErr) {
        console.warn("Cleanup warning:", cleanupErr.message);
      } finally {
        await mongoose.disconnect();
      }
    }
  });

  /**
   * Helper that properly awaits controllers wrapped with Express asyncHandler.
   * Resolves when res.json() is invoked or when next(err) is called.
   */
  function executeController(controller, reqOverrides = {}) {
    return new Promise((resolve) => {
      const req = {
        body: {},
        params: {},
        user: null,
        ...reqOverrides,
      };
      const res = {
        statusCode: 200,
        data: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.data = payload;
          resolve({ res, req, error: null });
          return this;
        },
      };
      const next = (err) => {
        resolve({ res, req, error: err || null });
      };

      try {
        controller(req, res, next);
      } catch (syncErr) {
        resolve({ res, req, error: syncErr });
      }
    });
  }

  it("should successfully execute full payment flow: PENDING -> PROCESSING -> SUCCEEDED with real ledger entries", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // 1. Create real test users
    const sender = await User.create({
      name: `Test Sender ${uniqueSuffix}`,
      email: `sender_${uniqueSuffix}@example.com`,
      authProvider: "Local",
    });
    createdUserIds.push(sender._id);

    const receiver = await User.create({
      name: `Test Receiver ${uniqueSuffix}`,
      email: `receiver_${uniqueSuffix}@example.com`,
      authProvider: "Local",
    });
    createdUserIds.push(receiver._id);

    // 2. Create real test accounts
    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: receiver._id,
      username: receiver.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    // 3. Seed funds to sender account (5,000 INR)
    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: senderAccount._id,
      amount: 5000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    const initialSenderBalance = await senderAccount.getBalance();
    assert.equal(initialSenderBalance, 5000);

    // 4. Execute createTransaction via controller
    const { res, error } = await executeController(createTransaction, {
      body: {
        fromAccount: senderAccount._id.toString(),
        toAccount: receiverAccount._id.toString(),
        amount: 2000,
        idempotencyKey: `idemp_${uniqueSuffix}`,
      },
      user: sender,
    });

    assert.equal(error, null);
    assert.equal(res.statusCode, 201);
    assert.ok(res.data);
    const createdTx = res.data.data;
    createdTransactionIds.push(createdTx._id);

    // 5. Verify real database state: Transaction must be SUCCEEDED
    const txInDb = await Transaction.findById(createdTx._id);
    assert.ok(txInDb);
    assert.equal(txInDb.status, PaymentStatus.SUCCEEDED);
    assert.equal(txInDb.amount, 2000);

    // 6. Verify real database state: Exactly two ledger entries exist for this transaction
    const ledgersInDb = await Ledger.find({ transaction: createdTx._id });
    assert.equal(ledgersInDb.length, 2);

    const debitEntry = ledgersInDb.find((l) => l.type === "Debit");
    const creditEntry = ledgersInDb.find((l) => l.type === "Credit");

    assert.ok(debitEntry);
    assert.equal(debitEntry.account.toString(), senderAccount._id.toString());
    assert.equal(debitEntry.amount, 2000);

    assert.ok(creditEntry);
    assert.equal(creditEntry.account.toString(), receiverAccount._id.toString());
    assert.equal(creditEntry.amount, 2000);

    // 7. Verify real derived balances
    const finalSenderBalance = await senderAccount.getBalance();
    const finalReceiverBalance = await receiverAccount.getBalance();

    assert.equal(finalSenderBalance, 3000); // 5000 - 2000
    assert.equal(finalReceiverBalance, 2000); // 0 + 2000
  });

  it("should rollback ledger entries and mark transaction FAILED when processing fails", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // 1. Create real sender and receiver
    const sender = await User.create({
      name: `Fail Sender ${uniqueSuffix}`,
      email: `failsender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const receiver = await User.create({
      name: `Fail Receiver ${uniqueSuffix}`,
      email: `failreceiver_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(receiver._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: receiver._id,
      username: receiver.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    // 2. Seed sender with 1000 INR
    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: senderAccount._id,
      amount: 1000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    const initialSenderBalance = await senderAccount.getBalance();
    assert.equal(initialSenderBalance, 1000);

    const failIdempKey = `idemp_fail_${uniqueSuffix}`;

    // 3. Intercept Ledger.create so Debit succeeds inside the session,
    // but Credit fails with a processing error, driving real controller failure/abort handling
    const originalLedgerCreate = Ledger.create;
    let ledgerCallIndex = 0;
    Ledger.create = async function (...args) {
      ledgerCallIndex++;
      if (ledgerCallIndex === 1) {
        // First call is Debit entry inside session: write to real MongoDB session
        return originalLedgerCreate.apply(this, args);
      }
      // Second call is Credit entry: trigger processing-stage database failure
      throw new Error("Simulated database failure during credit ledger entry");
    };

    let controllerResult;
    try {
      // 4. Invoke the real createTransaction controller flow
      controllerResult = await executeController(createTransaction, {
        body: {
          fromAccount: senderAccount._id.toString(),
          toAccount: receiverAccount._id.toString(),
          amount: 500,
          idempotencyKey: failIdempKey,
        },
        user: sender,
      });
    } finally {
      // Unconditionally restore original Ledger.create
      Ledger.create = originalLedgerCreate;
    }

    // 5. Verify the controller caught the error and routed to failure handler
    assert.ok(controllerResult.error, "createTransaction must reject on processing failure");
    assert.ok(controllerResult.error instanceof ApiError);
    assert.equal(controllerResult.error.statusCode, 404);
    assert.match(controllerResult.error.message, /Last transaction is failed/);

    // 6. Verify in real MongoDB Atlas:
    // A. The transaction document was created and persisted in FAILED status
    const failedTx = await Transaction.findOne({ idempotencyKey: failIdempKey });
    assert.ok(failedTx, "Transaction document must exist in MongoDB Atlas");
    createdTransactionIds.push(failedTx._id);

    assert.equal(failedTx.status, PaymentStatus.FAILED, "Transaction status must end in FAILED");

    // B. Verify FAILED was reached after entering PROCESSING:
    // The state machine only allows PROCESSING -> FAILED. Since the transaction is FAILED,
    // it was successfully moved PENDING -> PROCESSING before session abort.
    assert.equal(failedTx.amount, 500);
    assert.equal(failedTx.fromAccount.toString(), senderAccount._id.toString());
    assert.equal(failedTx.toAccount.toString(), receiverAccount._id.toString());

    // C. Verify the session was aborted: The Debit entry written before the error was rolled back!
    const ledgersForTx = await Ledger.find({ transaction: failedTx._id });
    assert.equal(ledgersForTx.length, 0, "All in-session ledger entries must be rolled back by MongoDB");

    // D. Verify no partial debit or credit remains on sender or receiver accounts
    const finalSenderBalance = await senderAccount.getBalance();
    const finalReceiverBalance = await receiverAccount.getBalance();
    assert.equal(finalSenderBalance, 1000, "Sender balance must not have partial debit");
    assert.equal(finalReceiverBalance, 0, "Receiver balance must not have partial credit");
  });

  it("should successfully execute reversal: SUCCEEDED -> REVERSED with compensating ledger entries", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const sender = await User.create({
      name: `Rev Sender ${uniqueSuffix}`,
      email: `revsender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const receiver = await User.create({
      name: `Rev Receiver ${uniqueSuffix}`,
      email: `revreceiver_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(receiver._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: receiver._id,
      username: receiver.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    // Initial funding to sender
    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: senderAccount._id,
      amount: 1000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    // Complete a transfer of 500 from sender to receiver
    const paymentResult = await executeController(createTransaction, {
      body: {
        fromAccount: senderAccount._id.toString(),
        toAccount: receiverAccount._id.toString(),
        amount: 500,
        idempotencyKey: `idemp_rev_${uniqueSuffix}`,
      },
      user: sender,
    });

    assert.equal(paymentResult.error, null);
    assert.equal(paymentResult.res.statusCode, 201);
    const completedTxId = paymentResult.res.data.data._id;
    createdTransactionIds.push(completedTxId);

    assert.equal(await senderAccount.getBalance(), 500);
    assert.equal(await receiverAccount.getBalance(), 500);

    // Execute reverseTransaction as the authorized sender
    const revResult = await executeController(reverseTransaction, {
      params: { transactionId: completedTxId.toString() },
      user: sender,
    });

    assert.equal(revResult.error, null);
    assert.equal(revResult.res.statusCode, 200);

    // Verify in real MongoDB:
    // 1. Transaction status is REVERSED
    const reversedTx = await Transaction.findById(completedTxId);
    assert.equal(reversedTx.status, PaymentStatus.REVERSED);

    // 2. Exactly 4 ledger entries exist in total for this transaction (2 transfer + 2 reversal)
    const allLedgers = await Ledger.find({ transaction: completedTxId });
    assert.equal(allLedgers.length, 4);

    // 3. Balances are restored to pre-transfer baseline
    const restoredSenderBalance = await senderAccount.getBalance();
    const restoredReceiverBalance = await receiverAccount.getBalance();

    assert.equal(restoredSenderBalance, 1000); // 500 + 500 refund
    assert.equal(restoredReceiverBalance, 0); // 500 - 500 clawback
  });

  it("should enforce reversal balance safety: reject reversal if recipient has insufficient balance", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const sender = await User.create({
      name: `Bal Sender ${uniqueSuffix}`,
      email: `balsender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const receiver = await User.create({
      name: `Bal Receiver ${uniqueSuffix}`,
      email: `balreceiver_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(receiver._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: receiver._id,
      username: receiver.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    // Create a SUCCEEDED transaction of 1000 without receiver having any balance
    const tx = await Transaction.create({
      fromAccount: senderAccount._id,
      toAccount: receiverAccount._id,
      amount: 1000,
      status: PaymentStatus.SUCCEEDED,
      idempotencyKey: `idemp_balsafe_${uniqueSuffix}`,
    });
    createdTransactionIds.push(tx._id);

    // Receiver balance is currently 0 (< 1000)
    const receiverBalance = await receiverAccount.getBalance();
    assert.equal(receiverBalance, 0);

    // Attempt reversal
    const revResult = await executeController(reverseTransaction, {
      params: { transactionId: tx._id.toString() },
      user: sender,
    });

    assert.ok(revResult.error instanceof ApiError);
    assert.equal(revResult.error.statusCode, 400);
    assert.match(revResult.error.message, /Recipient has insufficient balance/);

    // Verify transaction remains SUCCEEDED and no ledger entries were created
    const txAfterReject = await Transaction.findById(tx._id);
    assert.equal(txAfterReject.status, PaymentStatus.SUCCEEDED);

    const ledgers = await Ledger.find({ transaction: tx._id });
    assert.equal(ledgers.length, 0);
  });

  it("should enforce reversal authorization: reject reversal by unauthorized third party", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const sender = await User.create({
      name: `Auth Sender ${uniqueSuffix}`,
      email: `authsender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const attacker = await User.create({
      name: `Attacker ${uniqueSuffix}`,
      email: `attacker_${uniqueSuffix}@example.com`,
      systemUser: false,
    });
    createdUserIds.push(attacker._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: new mongoose.Types.ObjectId(),
      username: "Receiver",
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    const tx = await Transaction.create({
      fromAccount: senderAccount._id,
      toAccount: receiverAccount._id,
      amount: 100,
      status: PaymentStatus.SUCCEEDED,
      idempotencyKey: `idemp_auth_${uniqueSuffix}`,
    });
    createdTransactionIds.push(tx._id);

    // Attacker attempts reversal
    const revResult = await executeController(reverseTransaction, {
      params: { transactionId: tx._id.toString() },
      user: attacker,
    });

    assert.ok(revResult.error instanceof ApiError);
    assert.equal(revResult.error.statusCode, 403);
    assert.match(revResult.error.message, /Forbidden: You are not authorized to reverse this transaction/);
  });

  it("should enforce real atomic concurrency protection: only one transition succeeds between racing calls", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const tx = await Transaction.create({
      fromAccount: new mongoose.Types.ObjectId(),
      toAccount: new mongoose.Types.ObjectId(),
      amount: 100,
      status: PaymentStatus.SUCCEEDED,
      idempotencyKey: `idemp_race_${uniqueSuffix}`,
    });
    createdTransactionIds.push(tx._id);

    // Launch two simultaneous transitions attempting SUCCEEDED -> REVERSED in real MongoDB
    const [result1, result2] = await Promise.allSettled([
      transitionTransaction(tx._id, PaymentStatus.SUCCEEDED, PaymentStatus.REVERSED),
      transitionTransaction(tx._id, PaymentStatus.SUCCEEDED, PaymentStatus.REVERSED),
    ]);

    const fulfilled = [result1, result2].filter((r) => r.status === "fulfilled");
    const rejected = [result1, result2].filter((r) => r.status === "rejected");

    // Exactly one must succeed, and exactly one must fail with 409 Conflict
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const conflictErr = rejected[0].reason;
    assert.ok(conflictErr instanceof ApiError);
    assert.equal(conflictErr.statusCode, 409);
    assert.match(conflictErr.message, /Payment status transition conflict/);

    // Verify final state in database is REVERSED
    const finalTx = await Transaction.findById(tx._id);
    assert.equal(finalTx.status, PaymentStatus.REVERSED);
  });

  it("should prevent concurrent double-spend: two racing transfers exceeding balance cannot both succeed", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    // 1. Create sender with 1000 balance
    const sender = await User.create({
      name: `Race Sender ${uniqueSuffix}`,
      email: `racesender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const receiver1 = await User.create({
      name: `Receiver 1 ${uniqueSuffix}`,
      email: `rec1_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(receiver1._id);

    const receiver2 = await User.create({
      name: `Receiver 2 ${uniqueSuffix}`,
      email: `rec2_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(receiver2._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiver1Account = await Account.create({
      user: receiver1._id,
      username: receiver1.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiver1Account._id);

    const receiver2Account = await Account.create({
      user: receiver2._id,
      username: receiver2.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiver2Account._id);

    // Seed 1000 INR
    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: senderAccount._id,
      amount: 1000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    assert.equal(await senderAccount.getBalance(), 1000);

    // Launch two simultaneous transfers of 800 INR each (Total 1600 > 1000 balance)
    const [result1, result2] = await Promise.all([
      executeController(createTransaction, {
        body: {
          fromAccount: senderAccount._id.toString(),
          toAccount: receiver1Account._id.toString(),
          amount: 800,
          idempotencyKey: `idemp_race1_${uniqueSuffix}`,
        },
        user: sender,
      }),
      executeController(createTransaction, {
        body: {
          fromAccount: senderAccount._id.toString(),
          toAccount: receiver2Account._id.toString(),
          amount: 800,
          idempotencyKey: `idemp_race2_${uniqueSuffix}`,
        },
        user: sender,
      }),
    ]);

    // Check transaction IDs for cleanup
    if (result1.res?.data?.data?._id) createdTransactionIds.push(result1.res.data.data._id);
    if (result2.res?.data?.data?._id) createdTransactionIds.push(result2.res.data.data._id);

    const successes = [result1, result2].filter((r) => r.res.statusCode === 201 && !r.error);
    const failures = [result1, result2].filter((r) => r.error !== null);

    // EXACTLY ONE must succeed; the other must fail!
    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);

    // The failed request must have failed with Insufficient Balance or conflict
    assert.ok(failures[0].error instanceof ApiError);

    // CRITICAL: Final sender balance in MongoDB MUST be 200 INR (1000 - 800), NEVER NEGATIVE (-600)!
    const finalSenderBalance = await senderAccount.getBalance();
    assert.equal(finalSenderBalance, 200);
    assert.ok(finalSenderBalance >= 0, "Account balance must not be negative");
  });

  it("should handle concurrent idempotency race: two simultaneous requests with same idempotencyKey create only one transaction", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const sender = await User.create({
      name: `Idemp Sender ${uniqueSuffix}`,
      email: `idempsender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const receiver = await User.create({
      name: `Idemp Receiver ${uniqueSuffix}`,
      email: `idempreceiver_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(receiver._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: receiver._id,
      username: receiver.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    // Seed 2000 INR
    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: senderAccount._id,
      amount: 2000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    const sameKey = `same_idemp_key_${uniqueSuffix}`;

    // Two requests with identical body and same idempotency key fired simultaneously
    const [result1, result2] = await Promise.all([
      executeController(createTransaction, {
        body: {
          fromAccount: senderAccount._id.toString(),
          toAccount: receiverAccount._id.toString(),
          amount: 500,
          idempotencyKey: sameKey,
        },
        user: sender,
      }),
      executeController(createTransaction, {
        body: {
          fromAccount: senderAccount._id.toString(),
          toAccount: receiverAccount._id.toString(),
          amount: 500,
          idempotencyKey: sameKey,
        },
        user: sender,
      }),
    ]);

    // Both requests must succeed without unhandled E11000 crashes
    assert.equal(result1.error, null);
    assert.equal(result2.error, null);

    // Exactly one created with 201, and the racing request returned 200 or 201
    const statusCodes = [result1.res.statusCode, result2.res.statusCode].sort();
    assert.ok(statusCodes.includes(201)); // At least one 201 Created

    // In MongoDB: EXACTLY ONE transaction exists with this idempotencyKey
    const txsInDb = await Transaction.find({ idempotencyKey: sameKey });
    assert.equal(txsInDb.length, 1);
    createdTransactionIds.push(txsInDb[0]._id);

    // Ledger balance debited exactly once (500), not twice (1000)
    const finalBalance = await senderAccount.getBalance();
    assert.equal(finalBalance, 1500); // 2000 - 500
  });

  it("should reject unauthorized payment initiation when caller does not own fromAccount", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const victim = await User.create({
      name: `Victim ${uniqueSuffix}`,
      email: `victim_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(victim._id);

    const attacker = await User.create({
      name: `Attacker ${uniqueSuffix}`,
      email: `attacker_pay_${uniqueSuffix}@example.com`,
      systemUser: false,
    });
    createdUserIds.push(attacker._id);

    const victimAccount = await Account.create({
      user: victim._id,
      username: victim.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(victimAccount._id);

    const receiverAccount = await Account.create({
      user: attacker._id,
      username: attacker.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    // Attacker attempts to transfer funds from victim's account to attacker's account
    const result = await executeController(createTransaction, {
      body: {
        fromAccount: victimAccount._id.toString(),
        toAccount: receiverAccount._id.toString(),
        amount: 500,
        idempotencyKey: `idemp_unauth_${uniqueSuffix}`,
      },
      user: attacker,
    });

    // Must be rejected with 403 Forbidden
    assert.ok(result.error instanceof ApiError);
    assert.equal(result.error.statusCode, 403);
    assert.match(result.error.message, /Forbidden: You are not authorized to initiate payments/);

    // Zero transactions created in MongoDB
    const txsInDb = await Transaction.find({ idempotencyKey: `idemp_unauth_${uniqueSuffix}` });
    assert.equal(txsInDb.length, 0);
  });
});
