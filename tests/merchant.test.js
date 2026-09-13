import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";

// Must set DNS servers BEFORE any network / mongoose imports on Windows
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const { default: mongoose } = await import("mongoose");
await import("dotenv/config");
const { User } = await import("../src/models/user.model.js");
const { Account } = await import("../src/models/account.model.js");
const { Transaction } = await import("../src/models/transaction.model.js");
const { Ledger } = await import("../src/models/ledger.model.js");
const { Merchant } = await import("../src/models/merchant.model.js");
const {
  createMerchant,
  getAllMerchants,
  getMerchantById,
  updateMerchantStatus,
  rotateMerchantApiKey,
  getPlatformStatistics,
  getMerchantStatistics,
} = await import("../src/controllers/merchant.controller.js");
const {
  createTransaction,
  getTransactions,
} = await import("../src/controllers/transaction.controller.js");
const {
  verifyMerchantApiKey,
  optionalMerchantAuth,
} = await import("../src/middlewares/merchantAuth.middleware.js");
const { ApiError } = await import("../src/utils/ApiError.js");

describe("Multi-Merchant Payment Infrastructure Tests", () => {
  let isConnected = false;

  // Track created IDs for guaranteed cleanup
  const createdUserIds = [];
  const createdAccountIds = [];
  const createdTransactionIds = [];
  const createdMerchantIds = [];

  before(async () => {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 20000,
        });
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
          await Ledger.collection.deleteMany({
            transaction: { $in: createdTransactionIds },
          });
        }
        if (createdAccountIds.length > 0) {
          await Account.deleteMany({ _id: { $in: createdAccountIds } });
          await Ledger.collection.deleteMany({
            account: { $in: createdAccountIds },
          });
        }
        if (createdUserIds.length > 0) {
          await User.deleteMany({ _id: { $in: createdUserIds } });
        }
        if (createdMerchantIds.length > 0) {
          await Merchant.deleteMany({ _id: { $in: createdMerchantIds } });
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
   */
  function executeController(controller, reqOverrides = {}) {
    return new Promise((resolve) => {
      const req = {
        body: {},
        params: {},
        query: {},
        headers: {},
        header(name) {
          return this.headers[name.toLowerCase()] || this.headers[name] || null;
        },
        user: null,
        merchant: null,
        ...reqOverrides,
      };
      if (!req.header) {
        req.header = function (name) {
          return this.headers[name.toLowerCase()] || this.headers[name] || null;
        };
      }
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

  /**
   * Helper that properly awaits middlewares.
   */
  function executeMiddleware(middleware, reqOverrides = {}) {
    return new Promise((resolve) => {
      const req = {
        headers: {},
        header(name) {
          return this.headers[name.toLowerCase()] || this.headers[name] || null;
        },
        merchant: null,
        user: null,
        ...reqOverrides,
      };
      if (!req.header) {
        req.header = function (name) {
          return this.headers[name.toLowerCase()] || this.headers[name] || null;
        };
      }
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.data = payload;
          return this;
        },
      };
      const next = (err) => {
        resolve({ req, res, error: err || null });
      };

      try {
        middleware(req, res, next);
      } catch (syncErr) {
        resolve({ req, res, error: syncErr });
      }
    });
  }

  // --------------------------------------------------
  // 1. Merchant Creation
  // --------------------------------------------------
  it("1. should create a new merchant and return the raw API key once", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);
    const merchantName = `MovieHub_${uniqueSuffix}`;

    const result = await executeController(createMerchant, {
      body: {
        name: merchantName,
        description: "Movie ticket booking platform",
      },
    });

    assert.equal(result.error, null);
    assert.equal(result.res.statusCode, 201);
    assert.ok(result.res.data?.data);

    const created = result.res.data.data;
    createdMerchantIds.push(created._id);

    assert.equal(created.name, merchantName);
    assert.equal(created.description, "Movie ticket booking platform");
    assert.equal(created.status, "ACTIVE");
    assert.ok(created.apiKey);
    assert.match(created.apiKey, /^mch_live_[a-f0-9]{48}$/);
  });

  // --------------------------------------------------
  // 2. API Key Generation Format
  // --------------------------------------------------
  it("2. should generate an API key with correct format mch_live_<48_hex_chars>", () => {
    const key1 = Merchant.generateApiKey();
    const key2 = Merchant.generateApiKey();

    assert.match(key1, /^mch_live_[a-f0-9]{48}$/);
    assert.match(key2, /^mch_live_[a-f0-9]{48}$/);
    assert.notEqual(key1, key2, "Generated keys must be cryptographically unique");
  });

  // --------------------------------------------------
  // 3. API Key Authentication (Success)
  // --------------------------------------------------
  it("3. should authenticate valid active merchant API key and attach req.merchant", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const rawKey = Merchant.generateApiKey();
    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const merchant = await Merchant.create({
      name: `FoodBox_${uniqueSuffix}`,
      description: "Food delivery application",
      apiKey: rawKey,
      status: "ACTIVE",
    });
    createdMerchantIds.push(merchant._id);

    const midResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": rawKey },
    });

    assert.equal(midResult.error, null);
    assert.ok(midResult.req.merchant);
    assert.equal(midResult.req.merchant._id.toString(), merchant._id.toString());
    assert.equal(midResult.req.merchant.name, merchant.name);
    assert.equal(midResult.req.merchant.apiKey, undefined, "Full API key must not be exposed on req.merchant");
  });

  // --------------------------------------------------
  // 4. Missing API Key Rejection (401)
  // --------------------------------------------------
  it("4. should reject missing API key with 401", async () => {
    const midResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: {},
    });

    assert.ok(midResult.error instanceof ApiError);
    assert.equal(midResult.error.statusCode, 401);
    assert.match(midResult.error.message, /Merchant API key is required/);
  });

  // --------------------------------------------------
  // 5. Invalid API Key Rejection (401)
  // --------------------------------------------------
  it("5. should reject invalid API key with 401", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const midResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": "mch_live_invalid_nonexistent_key_1234567890" },
    });

    assert.ok(midResult.error instanceof ApiError);
    assert.equal(midResult.error.statusCode, 401);
    assert.match(midResult.error.message, /Invalid Merchant API key/);
  });

  // --------------------------------------------------
  // 6. Inactive Merchant Rejection (403)
  // --------------------------------------------------
  it("6. should reject inactive merchant with 403", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const rawKey = Merchant.generateApiKey();
    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const inactiveMerchant = await Merchant.create({
      name: `InactiveApp_${uniqueSuffix}`,
      description: "Deactivated app",
      apiKey: rawKey,
      status: "INACTIVE",
    });
    createdMerchantIds.push(inactiveMerchant._id);

    const midResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": rawKey },
    });

    assert.ok(midResult.error instanceof ApiError);
    assert.equal(midResult.error.statusCode, 403);
    assert.match(midResult.error.message, /Merchant account is INACTIVE/);
  });

  // --------------------------------------------------
  // 7. API Key Masked in Listing and Details
  // --------------------------------------------------
  it("7. should mask API key in merchant listings and details (mch_live_...xxxx)", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const rawKey = Merchant.generateApiKey();
    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const merchant = await Merchant.create({
      name: `MaskTest_${uniqueSuffix}`,
      apiKey: rawKey,
      status: "ACTIVE",
    });
    createdMerchantIds.push(merchant._id);

    // Test getMerchantById
    const detailResult = await executeController(getMerchantById, {
      params: { merchantId: merchant._id.toString() },
    });

    assert.equal(detailResult.error, null);
    const data = detailResult.res.data.data;
    assert.equal(data.apiKey, undefined, "Raw apiKey must not be present");
    assert.ok(data.apiKeyMasked);
    assert.equal(data.apiKeyMasked, `mch_live_...${rawKey.slice(-4)}`);

    // Test getAllMerchants
    const listResult = await executeController(getAllMerchants, { query: {} });
    assert.equal(listResult.error, null);
    const found = listResult.res.data.data.find(
      (m) => m._id.toString() === merchant._id.toString()
    );
    assert.ok(found);
    assert.equal(found.apiKey, undefined);
    assert.equal(found.apiKeyMasked, `mch_live_...${rawKey.slice(-4)}`);
  });

  // --------------------------------------------------
  // 8. API Key Rotation
  // --------------------------------------------------
  it("8. should rotate merchant API key, invalidate old key, and return new key once", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const oldKey = Merchant.generateApiKey();
    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const merchant = await Merchant.create({
      name: `RotateTest_${uniqueSuffix}`,
      apiKey: oldKey,
      status: "ACTIVE",
    });
    createdMerchantIds.push(merchant._id);

    // Rotate API Key
    const rotateResult = await executeController(rotateMerchantApiKey, {
      params: { merchantId: merchant._id.toString() },
    });

    assert.equal(rotateResult.error, null);
    assert.equal(rotateResult.res.statusCode, 200);
    const newKey = rotateResult.res.data.data.apiKey;
    assert.ok(newKey);
    assert.notEqual(newKey, oldKey);
    assert.match(newKey, /^mch_live_[a-f0-9]{48}$/);

    // Verify old key no longer authenticates
    const oldAuthResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": oldKey },
    });
    assert.ok(oldAuthResult.error instanceof ApiError);
    assert.equal(oldAuthResult.error.statusCode, 401);

    // Verify new key authenticates successfully
    const newAuthResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": newKey },
    });
    assert.equal(newAuthResult.error, null);
    assert.equal(newAuthResult.req.merchant._id.toString(), merchant._id.toString());
  });

  // --------------------------------------------------
  // 9. MovieHub Transaction Associated with MovieHub
  // --------------------------------------------------
  it("9. should associate transaction with MovieHub when initiated with MovieHub API key", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    // Create MovieHub merchant
    const movieHubKey = Merchant.generateApiKey();
    const movieHub = await Merchant.create({
      name: `MovieHub_${uniqueSuffix}`,
      apiKey: movieHubKey,
      status: "ACTIVE",
    });
    createdMerchantIds.push(movieHub._id);

    // Create customer and receiver accounts
    const customer = await User.create({
      name: `Customer Movie_${uniqueSuffix}`,
      email: `custmovie_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(customer._id);

    const customerAccount = await Account.create({
      user: customer._id,
      username: customer.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(customerAccount._id);

    const cinemaAccount = await Account.create({
      user: new mongoose.Types.ObjectId(),
      username: "Cinema Tickets",
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(cinemaAccount._id);

    // Fund customer account with 1000 INR
    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: customerAccount._id,
      amount: 1000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    // Create transaction using MovieHub merchant
    const result = await executeController(createTransaction, {
      body: {
        fromAccount: customerAccount._id.toString(),
        toAccount: cinemaAccount._id.toString(),
        amount: 500,
        idempotencyKey: `idemp_movie_${uniqueSuffix}`,
      },
      user: customer,
      merchant: movieHub, // Attached via merchantAuth middleware
    });

    assert.equal(result.error, null);
    assert.equal(result.res.statusCode, 201);
    const txId = result.res.data.data._id;
    createdTransactionIds.push(txId);

    // Verify in real MongoDB Atlas: transaction.merchant matches MovieHub._id
    const txInDb = await Transaction.findById(txId);
    assert.ok(txInDb.merchant);
    assert.equal(txInDb.merchant.toString(), movieHub._id.toString());
    assert.equal(txInDb.status, "SUCCEEDED");
  });

  // --------------------------------------------------
  // 10. FoodBox Transaction Associated with FoodBox
  // --------------------------------------------------
  it("10. should associate transaction with FoodBox when initiated with FoodBox API key", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const foodBoxKey = Merchant.generateApiKey();
    const foodBox = await Merchant.create({
      name: `FoodBox_${uniqueSuffix}`,
      apiKey: foodBoxKey,
      status: "ACTIVE",
    });
    createdMerchantIds.push(foodBox._id);

    const customer = await User.create({
      name: `Customer Food_${uniqueSuffix}`,
      email: `custfood_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(customer._id);

    const customerAccount = await Account.create({
      user: customer._id,
      username: customer.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(customerAccount._id);

    const restaurantAccount = await Account.create({
      user: new mongoose.Types.ObjectId(),
      username: "Pizza Restaurant",
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(restaurantAccount._id);

    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: customerAccount._id,
      amount: 1000,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    const result = await executeController(createTransaction, {
      body: {
        fromAccount: customerAccount._id.toString(),
        toAccount: restaurantAccount._id.toString(),
        amount: 350,
        idempotencyKey: `idemp_food_${uniqueSuffix}`,
      },
      user: customer,
      merchant: foodBox,
    });

    assert.equal(result.error, null);
    assert.equal(result.res.statusCode, 201);
    const txId = result.res.data.data._id;
    createdTransactionIds.push(txId);

    const txInDb = await Transaction.findById(txId);
    assert.ok(txInDb.merchant);
    assert.equal(txInDb.merchant.toString(), foodBox._id.toString());
    assert.equal(txInDb.status, "SUCCEEDED");
  });

  // --------------------------------------------------
  // 11. Direct/Internal Transaction Has merchant: null
  // --------------------------------------------------
  it("11. should preserve merchant: null for direct payments without merchant API key", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const sender = await User.create({
      name: `Direct Sender_${uniqueSuffix}`,
      email: `directsender_${uniqueSuffix}@example.com`,
    });
    createdUserIds.push(sender._id);

    const senderAccount = await Account.create({
      user: sender._id,
      username: sender.name,
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(senderAccount._id);

    const receiverAccount = await Account.create({
      user: new mongoose.Types.ObjectId(),
      username: "Peer Receiver",
      currency: "INR",
      status: "ACTIVE",
    });
    createdAccountIds.push(receiverAccount._id);

    const seedTxId = new mongoose.Types.ObjectId();
    await Ledger.create({
      account: senderAccount._id,
      amount: 500,
      transaction: seedTxId,
      type: "Credit",
    });
    createdTransactionIds.push(seedTxId);

    // Direct payment without merchant
    const result = await executeController(createTransaction, {
      body: {
        fromAccount: senderAccount._id.toString(),
        toAccount: receiverAccount._id.toString(),
        amount: 200,
        idempotencyKey: `idemp_direct_${uniqueSuffix}`,
      },
      user: sender,
      merchant: null,
    });

    assert.equal(result.error, null);
    const txId = result.res.data.data._id;
    createdTransactionIds.push(txId);

    const txInDb = await Transaction.findById(txId);
    assert.equal(txInDb.merchant, null, "Direct transaction merchant must be null");
    assert.equal(txInDb.status, "SUCCEEDED");
  });

  // --------------------------------------------------
  // 12. Transaction Filtering by merchantId
  // --------------------------------------------------
  it("12. should filter transactions by merchantId", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const targetMerchant = await Merchant.create({
      name: `FilterTarget_${uniqueSuffix}`,
      apiKey: Merchant.generateApiKey(),
      status: "ACTIVE",
    });
    createdMerchantIds.push(targetMerchant._id);

    const otherMerchant = await Merchant.create({
      name: `FilterOther_${uniqueSuffix}`,
      apiKey: Merchant.generateApiKey(),
      status: "ACTIVE",
    });
    createdMerchantIds.push(otherMerchant._id);

    const dummyAcc1 = new mongoose.Types.ObjectId();
    const dummyAcc2 = new mongoose.Types.ObjectId();

    // Create 2 tx for targetMerchant, 1 for otherMerchant
    const tx1 = await Transaction.create({
      fromAccount: dummyAcc1,
      toAccount: dummyAcc2,
      amount: 100,
      status: "SUCCEEDED",
      idempotencyKey: `filter_tx1_${uniqueSuffix}`,
      merchant: targetMerchant._id,
    });
    createdTransactionIds.push(tx1._id);

    const tx2 = await Transaction.create({
      fromAccount: dummyAcc1,
      toAccount: dummyAcc2,
      amount: 200,
      status: "SUCCEEDED",
      idempotencyKey: `filter_tx2_${uniqueSuffix}`,
      merchant: targetMerchant._id,
    });
    createdTransactionIds.push(tx2._id);

    const tx3 = await Transaction.create({
      fromAccount: dummyAcc1,
      toAccount: dummyAcc2,
      amount: 300,
      status: "SUCCEEDED",
      idempotencyKey: `filter_tx3_${uniqueSuffix}`,
      merchant: otherMerchant._id,
    });
    createdTransactionIds.push(tx3._id);

    // Query transactions filtered by targetMerchant._id
    const filterResult = await executeController(getTransactions, {
      query: { merchantId: targetMerchant._id.toString() },
    });

    assert.equal(filterResult.error, null);
    const { transactions, totalCount } = filterResult.res.data.data;
    assert.equal(totalCount, 2);
    assert.equal(transactions.length, 2);
    assert.ok(
      transactions.every(
        (tx) => tx.merchant?._id.toString() === targetMerchant._id.toString()
      )
    );
  });

  // --------------------------------------------------
  // 13. Transaction Filtering by status
  // --------------------------------------------------
  it("13. should filter transactions by status (SUCCEEDED, FAILED, etc.)", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const merchant = await Merchant.create({
      name: `StatusFilter_${uniqueSuffix}`,
      apiKey: Merchant.generateApiKey(),
      status: "ACTIVE",
    });
    createdMerchantIds.push(merchant._id);

    const dummyAcc = new mongoose.Types.ObjectId();

    const succTx = await Transaction.create({
      fromAccount: dummyAcc,
      toAccount: dummyAcc,
      amount: 150,
      status: "SUCCEEDED",
      idempotencyKey: `st_succ_${uniqueSuffix}`,
      merchant: merchant._id,
    });
    createdTransactionIds.push(succTx._id);

    const failTx = await Transaction.create({
      fromAccount: dummyAcc,
      toAccount: dummyAcc,
      amount: 150,
      status: "FAILED",
      idempotencyKey: `st_fail_${uniqueSuffix}`,
      merchant: merchant._id,
    });
    createdTransactionIds.push(failTx._id);

    // Filter by FAILED and merchantId
    const filterResult = await executeController(getTransactions, {
      query: {
        merchantId: merchant._id.toString(),
        status: "FAILED",
      },
    });

    assert.equal(filterResult.error, null);
    const { transactions, totalCount } = filterResult.res.data.data;
    assert.equal(totalCount, 1);
    assert.equal(transactions[0].status, "FAILED");
    assert.equal(transactions[0]._id.toString(), failTx._id.toString());
  });

  // --------------------------------------------------
  // 14. Platform-Wide Dashboard Statistics
  // --------------------------------------------------
  it("14. should aggregate platform dashboard statistics including merchantsBreakdown", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const statsResult = await executeController(getPlatformStatistics, {});

    assert.equal(statsResult.error, null);
    assert.equal(statsResult.res.statusCode, 200);

    const data = statsResult.res.data.data;
    assert.ok(typeof data.totalTransactions === "number");
    assert.ok(typeof data.totalSuccessfullyProcessedAmount === "number");
    assert.ok(typeof data.succeededCount === "number");
    assert.ok(typeof data.pendingCount === "number");
    assert.ok(typeof data.processingCount === "number");
    assert.ok(typeof data.failedCount === "number");
    assert.ok(typeof data.reversedCount === "number");
    assert.ok(typeof data.totalMerchantCount === "number");
    assert.ok(typeof data.activeMerchantCount === "number");
    assert.ok(Array.isArray(data.merchantsBreakdown));

    // Breakdown elements have required student dashboard fields
    if (data.merchantsBreakdown.length > 0) {
      const first = data.merchantsBreakdown[0];
      assert.ok(first.merchantId);
      assert.ok(first.name);
      assert.ok(typeof first.transactionCount === "number");
      assert.ok(typeof first.successfulAmount === "number");
    }
  });

  // --------------------------------------------------
  // 15. Merchant-Specific Statistics
  // --------------------------------------------------
  it("15. should aggregate merchant-specific statistics accurately", async (t) => {
    if (!isConnected) return t.skip("Atlas not connected");

    const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 6);

    const merchant = await Merchant.create({
      name: `SpecificStats_${uniqueSuffix}`,
      apiKey: Merchant.generateApiKey(),
      status: "ACTIVE",
    });
    createdMerchantIds.push(merchant._id);

    const dummyAcc = new mongoose.Types.ObjectId();

    // 2 successful (amount: 500 each), 1 failed (amount: 200)
    const t1 = await Transaction.create({
      fromAccount: dummyAcc,
      toAccount: dummyAcc,
      amount: 500,
      status: "SUCCEEDED",
      idempotencyKey: `spec_t1_${uniqueSuffix}`,
      merchant: merchant._id,
    });
    createdTransactionIds.push(t1._id);

    const t2 = await Transaction.create({
      fromAccount: dummyAcc,
      toAccount: dummyAcc,
      amount: 500,
      status: "SUCCEEDED",
      idempotencyKey: `spec_t2_${uniqueSuffix}`,
      merchant: merchant._id,
    });
    createdTransactionIds.push(t2._id);

    const t3 = await Transaction.create({
      fromAccount: dummyAcc,
      toAccount: dummyAcc,
      amount: 200,
      status: "FAILED",
      idempotencyKey: `spec_t3_${uniqueSuffix}`,
      merchant: merchant._id,
    });
    createdTransactionIds.push(t3._id);

    const statsResult = await executeController(getMerchantStatistics, {
      params: { merchantId: merchant._id.toString() },
    });

    assert.equal(statsResult.error, null);
    assert.equal(statsResult.res.statusCode, 200);

    const stats = statsResult.res.data.data;
    assert.equal(stats.merchant._id.toString(), merchant._id.toString());
    assert.equal(stats.merchant.name, merchant.name);
    assert.equal(stats.totalTransactions, 3);
    assert.equal(stats.totalSuccessfullyProcessedAmount, 1000); // 500 + 500
    assert.equal(stats.succeededCount, 2);
    assert.equal(stats.failedCount, 1);
    assert.equal(stats.pendingCount, 0);
  });
});
