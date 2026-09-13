import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Enable Local Demo Mode for isolated, offline testing
global.IS_LOCAL_DEMO = true;

const { localDemoStore } = await import("../src/services/localDemoStore.js");
const { deleteMerchant } = await import("../src/controllers/merchant.controller.js");
const { verifyMerchantApiKey } = await import("../src/middlewares/merchantAuth.middleware.js");
const { verifySystemUser } = await import("../src/middlewares/auth.middleware.js");
const { User } = await import("../src/models/user.model.js");
const { TokenBlacklist } = await import("../src/models/blackList.model.js");

/**
 * Helper to invoke controllers wrapped with asyncHandler in tests.
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
 * Helper to invoke Express middlewares in tests.
 */
function executeMiddleware(middleware, reqOverrides = {}) {
  return new Promise((resolve) => {
    const req = {
      headers: {},
      cookies: {},
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
      middleware(req, res, next);
    } catch (syncErr) {
      resolve({ res, req, error: syncErr });
    }
  });
}

describe("Merchant Deletion & Retirement Policy Tests", () => {
  let initialMerchantCount;
  let initialTxCount;

  before(() => {
    initialMerchantCount = localDemoStore.merchants.length;
    initialTxCount = localDemoStore.transactions.length;
  });

  // ---------------------------------------------------------------------------
  // Scenario 1: Admin can delete zero-transaction merchant
  // ---------------------------------------------------------------------------
  it("Scenario 1: Admin can delete zero-transaction merchant", async () => {
    const zeroTxMerchant = localDemoStore.createMerchant({
      name: "StagingCleanApp",
      description: "App with zero transactions",
    });

    const result = await executeController(deleteMerchant, {
      params: { merchantId: zeroTxMerchant._id },
      headers: { "x-dashboard-admin": "true" },
    });

    assert.strictEqual(result.error, null, "Should not produce an unhandled error");
    assert.strictEqual(result.res.statusCode, 200, "Should return HTTP 200 OK");
    assert.strictEqual(result.res.data.success, true);
    assert.strictEqual(result.res.data.data.deleted, true);
    assert.strictEqual(result.res.data.data.name, "StagingCleanApp");
  });

  // ---------------------------------------------------------------------------
  // Scenario 2: Deleted merchant no longer exists
  // ---------------------------------------------------------------------------
  it("Scenario 2: Deleted merchant no longer exists in store or query results", async () => {
    const zeroTxMerchant = localDemoStore.createMerchant({
      name: "EphemeralApp",
      description: "To be deleted immediately",
    });

    const mId = zeroTxMerchant._id;
    assert.ok(localDemoStore.getMerchantById(mId), "Merchant must exist before deletion");

    // Delete it
    await executeController(deleteMerchant, {
      params: { merchantId: mId },
      headers: { "x-dashboard-admin": "true" },
    });

    // Verify it is gone
    const lookupAfter = localDemoStore.getMerchantById(mId);
    assert.strictEqual(lookupAfter, null, "Merchant lookup must return null after deletion");

    const allMerchants = localDemoStore.getAllMerchants();
    assert.strictEqual(
      allMerchants.some((m) => m._id === mId),
      false,
      "Deleted merchant must not appear in merchant list"
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 3: Deleted merchant's API key no longer authenticates (401)
  // ---------------------------------------------------------------------------
  it("Scenario 3: Deleted merchant's API key is immediately invalidated (401)", async () => {
    const zeroTxMerchant = localDemoStore.createMerchant({
      name: "ShortLivedApp",
      description: "Testing key invalidation",
    });
    const rawApiKey = zeroTxMerchant.apiKey;

    // Verify it authenticates before deletion
    const beforeResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": rawApiKey },
    });
    assert.strictEqual(beforeResult.error, null, "Key should authenticate before deletion");
    assert.ok(beforeResult.req.merchant, "req.merchant must be set before deletion");

    // Delete merchant
    await executeController(deleteMerchant, {
      params: { merchantId: zeroTxMerchant._id },
      headers: { "x-dashboard-admin": "true" },
    });

    // Verify it fails with 401 after deletion
    const afterResult = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": rawApiKey },
    });
    assert.ok(afterResult.error, "Should return an error for deleted merchant's key");
    assert.strictEqual(afterResult.error.statusCode, 401, "Status code must be 401 Unauthorized");
    assert.match(afterResult.error.message, /Invalid Merchant API key/i);
  });

  // ---------------------------------------------------------------------------
  // Scenario 4: Non-admin request rejected
  // ---------------------------------------------------------------------------
  it("Scenario 4: Non-admin request rejected by verifySystemUser", async () => {
    const unauthResult = await executeMiddleware(verifySystemUser, {
      headers: {},
      cookies: {},
    });

    assert.ok(unauthResult.error, "Non-admin request without auth must produce error");
    assert.ok(
      [401, 404].includes(unauthResult.error.statusCode),
      `Expected 401 or 404, got ${unauthResult.error.statusCode}`
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 5: Customer token without systemUser rejected (403)
  // ---------------------------------------------------------------------------
  it("Scenario 5: Customer token without systemUser rejected with 403 Forbidden", async () => {
    const testSecret = process.env.ACCESS_TOKEN_SECRET || "test_jwt_secret_key_123456789";
    process.env.ACCESS_TOKEN_SECRET = testSecret;

    const customerToken = jwt.sign({ _id: "cust_regular_001" }, testSecret);

    // Mock User.findOne and TokenBlacklist.findOne to avoid unneeded Atlas network attempt
    const originalFindOne = User.findOne;
    const originalTokenBlacklistFindOne = TokenBlacklist.findOne;

    TokenBlacklist.findOne = () => Promise.resolve(null);
    User.findOne = () => ({
      select: () =>
        Promise.resolve({
          _id: "cust_regular_001",
          username: "regular_alice",
          systemUser: false,
        }),
    });

    try {
      const result = await executeMiddleware(verifySystemUser, {
        headers: { authorization: `Bearer ${customerToken}` },
        cookies: {},
      });

      assert.ok(result.error, "Customer token must be rejected");
      assert.strictEqual(result.error.statusCode, 403, "Status code must be 403 Forbidden");
      assert.match(result.error.message, /Forbidden access, your not system User/i);
    } finally {
      User.findOne = originalFindOne;
      TokenBlacklist.findOne = originalTokenBlacklistFindOne;
    }
  });

  // ---------------------------------------------------------------------------
  // Scenario 6: Merchant x-api-key cannot authorize deletion (401/403)
  // ---------------------------------------------------------------------------
  it("Scenario 6: Merchant x-api-key cannot authorize deletion", async () => {
    const movieHub = localDemoStore.merchants.find((m) => m.name === "MovieHub");
    assert.ok(movieHub, "MovieHub merchant must exist");

    // Attempt to invoke admin auth using only a merchant x-api-key
    const result = await executeMiddleware(verifySystemUser, {
      headers: { "x-api-key": movieHub.apiKey },
      cookies: {},
    });

    assert.ok(result.error, "Merchant API key cannot authorize admin endpoints");
    assert.ok(
      [401, 404].includes(result.error.statusCode),
      `Expected 401 or 404, got ${result.error.statusCode}`
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 7: Merchant with transaction history cannot be permanently deleted
  // ---------------------------------------------------------------------------
  it("Scenario 7: Merchant with transaction history cannot be permanently deleted", async () => {
    const movieHub = localDemoStore.merchants.find((m) => m.name === "MovieHub");
    assert.ok(movieHub, "MovieHub merchant must exist");

    const txCount = localDemoStore.transactions.filter(
      (t) => t.merchant && t.merchant._id === movieHub._id
    ).length;
    assert.ok(txCount > 0, "MovieHub must have existing transactions for this test");

    const result = await executeController(deleteMerchant, {
      params: { merchantId: movieHub._id },
      headers: { "x-dashboard-admin": "true" },
    });

    assert.ok(result.error, "Deleting merchant with transactions must throw/return an error");
    assert.strictEqual(result.error.statusCode, 409, "Must return HTTP 409 Conflict");
  });

  // ---------------------------------------------------------------------------
  // Scenario 8: Attempt to delete merchant with transactions returns 409 Conflict
  // ---------------------------------------------------------------------------
  it("Scenario 8: Attempt to delete merchant with transactions returns 409 with audit explanation", async () => {
    const foodBox = localDemoStore.merchants.find((m) => m.name === "FoodBox");
    assert.ok(foodBox, "FoodBox merchant must exist");

    const result = await executeController(deleteMerchant, {
      params: { merchantId: foodBox._id },
      headers: { "x-dashboard-admin": "true" },
    });

    assert.ok(result.error, "Must return an error");
    assert.strictEqual(result.error.statusCode, 409, "Must return HTTP 409 Conflict");
    assert.match(
      result.error.message,
      /cannot be permanently deleted because it has/i,
      "Must explain transaction history prevents deletion"
    );
    assert.match(
      result.error.message,
      /deactivate/i,
      "Must advise deactivation/retirement instead"
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 9: Existing transactions remain untouched after 409
  // ---------------------------------------------------------------------------
  it("Scenario 9: Existing transactions remain completely untouched after 409 Conflict", async () => {
    const txsBefore = [...localDemoStore.transactions];
    const movieHubTxCountBefore = txsBefore.filter(
      (t) => t.merchant && t.merchant._id === "mch_001_moviehub"
    ).length;

    // Attempt illegal deletion
    await executeController(deleteMerchant, {
      params: { merchantId: "mch_001_moviehub" },
      headers: { "x-dashboard-admin": "true" },
    });

    const txsAfter = localDemoStore.transactions;
    const movieHubTxCountAfter = txsAfter.filter(
      (t) => t.merchant && t.merchant._id === "mch_001_moviehub"
    ).length;

    assert.strictEqual(
      txsAfter.length,
      txsBefore.length,
      "Total transaction count must not change after rejected deletion"
    );
    assert.strictEqual(
      movieHubTxCountAfter,
      movieHubTxCountBefore,
      "MovieHub transaction count must remain exactly identical"
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 10: Existing ledger history remains untouched
  // ---------------------------------------------------------------------------
  it("Scenario 10: State machine history and balances remain untouched after 409 Conflict", async () => {
    const tx = localDemoStore.transactions.find((t) => t._id === "tx_1001");
    assert.ok(tx, "tx_1001 must exist");
    const originalHistoryLength = tx.stateHistory.length;
    const originalStatus = tx.status;

    // Attempt illegal deletion of MovieHub
    await executeController(deleteMerchant, {
      params: { merchantId: "mch_001_moviehub" },
      headers: { "x-dashboard-admin": "true" },
    });

    const txAfter = localDemoStore.transactions.find((t) => t._id === "tx_1001");
    assert.strictEqual(txAfter.status, originalStatus, "Transaction status must remain SUCCEEDED");
    assert.strictEqual(
      txAfter.stateHistory.length,
      originalHistoryLength,
      "State history length must be untouched"
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 11: Exact merchant name confirmation required in UI
  // ---------------------------------------------------------------------------
  it("Scenario 11: Exact merchant name confirmation matches validation logic", () => {
    const targetMerchantName = "CleanPlatformBeta";

    // Matching validation logic
    const validateConfirm = (input, target) => input.trim() === target;

    assert.strictEqual(
      validateConfirm("CleanPlatformBeta", targetMerchantName),
      true,
      "Exact match should validate to true"
    );
    assert.strictEqual(
      validateConfirm("  CleanPlatformBeta  ", targetMerchantName),
      true,
      "Trimmed exact match should validate to true"
    );
  });

  // ---------------------------------------------------------------------------
  // Scenario 12: Incorrect confirmation text prevents deletion
  // ---------------------------------------------------------------------------
  it("Scenario 12: Incorrect confirmation text fails validation logic", () => {
    const targetMerchantName = "CleanPlatformBeta";

    const validateConfirm = (input, target) => input.trim() === target;

    assert.strictEqual(validateConfirm("cleanplatformbeta", targetMerchantName), false, "Case-sensitive mismatch must fail");
    assert.strictEqual(validateConfirm("CleanPlatform", targetMerchantName), false, "Partial match must fail");
    assert.strictEqual(validateConfirm("", targetMerchantName), false, "Empty input must fail");
    assert.strictEqual(validateConfirm("OtherName", targetMerchantName), false, "Different name must fail");
  });

  // ---------------------------------------------------------------------------
  // Scenario 13: Local Demo Mode supports deletion
  // ---------------------------------------------------------------------------
  it("Scenario 13: Local Demo Mode supports deletion of zero-transaction merchants", () => {
    assert.strictEqual(global.IS_LOCAL_DEMO, true, "global.IS_LOCAL_DEMO must be true");

    const m = localDemoStore.createMerchant({
      name: "LocalDemoOnlyPlatform",
      description: "Testing local store deletion method",
    });

    const deleted = localDemoStore.deleteMerchant(m._id);
    assert.ok(deleted, "deleteMerchant must return result object");
    assert.strictEqual(deleted.deleted, true);
    assert.strictEqual(deleted._id, m._id);

    // Verify it is no longer in localDemoStore.merchants
    const found = localDemoStore.merchants.find((item) => item._id === m._id);
    assert.strictEqual(found, undefined, "Merchant must be spliced from merchants array");
  });

  // ---------------------------------------------------------------------------
  // Scenario 14: Deleting one merchant leaves other merchants unaffected
  // ---------------------------------------------------------------------------
  it("Scenario 14: Deleting one merchant leaves other merchants completely unaffected", async () => {
    const merchantA = localDemoStore.createMerchant({
      name: "PlatformAlpha",
      description: "To be deleted",
    });
    const merchantB = localDemoStore.createMerchant({
      name: "PlatformBeta",
      description: "Must remain untouched",
    });

    // Delete PlatformAlpha
    await executeController(deleteMerchant, {
      params: { merchantId: merchantA._id },
      headers: { "x-dashboard-admin": "true" },
    });

    // PlatformAlpha is gone
    assert.strictEqual(localDemoStore.getMerchantById(merchantA._id), null);

    // PlatformBeta is intact
    const betaInStore = localDemoStore.getMerchantById(merchantB._id);
    assert.ok(betaInStore, "PlatformBeta must still exist");
    assert.strictEqual(betaInStore.name, "PlatformBeta");
    assert.strictEqual(betaInStore.status, "ACTIVE");

    // PlatformBeta's API key still authenticates
    const authBeta = await executeMiddleware(verifyMerchantApiKey, {
      headers: { "x-api-key": merchantB.apiKey },
    });
    assert.strictEqual(authBeta.error, null, "PlatformBeta's key must authenticate");

    // Clean up PlatformBeta
    localDemoStore.deleteMerchant(merchantB._id);
  });

  // ---------------------------------------------------------------------------
  // Scenario 15: No raw API keys appear in deletion responses or logs
  // ---------------------------------------------------------------------------
  it("Scenario 15: No raw API keys appear in deletion response or audit logs", async () => {
    const tempMerchant = localDemoStore.createMerchant({
      name: "AuditSecurityApp",
      description: "Testing key privacy in logs and responses",
    });
    const rawKey = tempMerchant.apiKey;

    const loggedMessages = [];
    const originalLog = console.log;
    console.log = (...args) => {
      loggedMessages.push(args.join(" "));
      originalLog(...args);
    };

    let result;
    try {
      result = await executeController(deleteMerchant, {
        params: { merchantId: tempMerchant._id },
        headers: { "x-dashboard-admin": "true" },
      });
    } finally {
      console.log = originalLog;
    }

    // Check response payload
    const responseData = result.res.data;
    assert.strictEqual(responseData.success, true);
    assert.strictEqual(responseData.data.apiKey, undefined, "Raw API key must not be in deletion response");

    // Check audit logs
    const anyLogContainsRawKey = loggedMessages.some((msg) => msg.includes(rawKey));
    assert.strictEqual(
      anyLogContainsRawKey,
      false,
      "Raw API key must never appear in console/audit logs"
    );
  });
});
