import crypto from "node:crypto";
import { PaymentStatus } from "./paymentStateMachine.js";

/**
 * In-memory fallback store used when MongoDB Atlas is unreachable (e.g. on college Wi-Fi).
 * Provides realistic pre-seeded data for MovieHub, FoodBox, EventBook, customer accounts,
 * and realistic transactions across all canonical statuses.
 */
class LocalDemoStore {
  constructor() {
    this.reset();
  }

  reset() {
    this.merchants = [
      {
        _id: "mch_001_moviehub",
        name: "MovieHub",
        description: "Online movie ticket booking platform",
        status: "ACTIVE",
        apiKey: "mch_live_4b8f72a1e0c395d821f06a92cb71a39d84e1a0b3f5c9e2d1",
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
      {
        _id: "mch_002_foodbox",
        name: "FoodBox",
        description: "On-demand food delivery and restaurant orders",
        status: "ACTIVE",
        apiKey: "mch_live_8f1c32b5a0e4d9c721a983b4fe62c0d51a89b7c2e3f4a5b6",
        createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        _id: "mch_003_eventbook",
        name: "EventBook",
        description: "Live concerts, music festivals, and tech pass booking",
        status: "INACTIVE",
        apiKey: "mch_live_3c9d71e2f4a5b6c810d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    ];

    this.accounts = [
      {
        _id: "acc_cust_001",
        name: "Demo Customer Account",
        user: { _id: "usr_cust_001", username: "alex_customer", email: "alex@example.com" },
        currency: "INR",
        status: "ACTIVE",
        balance: 15000,
      },
      {
        _id: "acc_mch_001",
        name: "MovieHub Settlement Account",
        merchant: "mch_001_moviehub",
        currency: "INR",
        status: "ACTIVE",
        balance: 42500,
      },
      {
        _id: "acc_mch_002",
        name: "FoodBox Settlement Account",
        merchant: "mch_002_foodbox",
        currency: "INR",
        status: "ACTIVE",
        balance: 62000,
      },
      {
        _id: "acc_mch_003",
        name: "EventBook Settlement Account",
        merchant: "mch_003_eventbook",
        currency: "INR",
        status: "INACTIVE",
        balance: 18000,
      },
    ];

    this.transactions = this._generateSeedTransactions();
  }

  _generateSeedTransactions() {
    const now = Date.now();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    return [
      {
        _id: "tx_1001",
        amount: 250,
        merchant: this.merchants[0],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_001", status: "ACTIVE" },
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "idem_moviehub_ticket_9921",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 15 * minute) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 14 * minute) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 14 * minute) },
        ],
        createdAt: new Date(now - 15 * minute),
        updatedAt: new Date(now - 14 * minute),
      },
      {
        _id: "tx_1002",
        amount: 420,
        merchant: this.merchants[1],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_002", status: "ACTIVE" },
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "idem_foodbox_order_4412",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 45 * minute) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 44 * minute) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 44 * minute) },
        ],
        createdAt: new Date(now - 45 * minute),
        updatedAt: new Date(now - 44 * minute),
      },
      {
        _id: "tx_1003",
        amount: 1200,
        merchant: this.merchants[2],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_003", status: "INACTIVE" },
        status: PaymentStatus.FAILED,
        idempotencyKey: "idem_eventbook_pass_1182",
        failureReason: "Merchant account is inactive",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 2 * hour) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 2 * hour) },
          { status: PaymentStatus.FAILED, timestamp: new Date(now - 2 * hour) },
        ],
        createdAt: new Date(now - 2 * hour),
        updatedAt: new Date(now - 2 * hour),
      },
      {
        _id: "tx_1004",
        amount: 550,
        merchant: this.merchants[0],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_001", status: "ACTIVE" },
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "idem_moviehub_ticket_9922",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 5 * hour) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 5 * hour) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 5 * hour) },
        ],
        createdAt: new Date(now - 5 * hour),
        updatedAt: new Date(now - 5 * hour),
      },
      {
        _id: "tx_1005",
        amount: 310,
        merchant: this.merchants[1],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_002", status: "ACTIVE" },
        status: PaymentStatus.REVERSED,
        idempotencyKey: "idem_foodbox_order_4413",
        reversalReason: "Order cancelled by customer before restaurant accepted",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 8 * hour) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 8 * hour) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 8 * hour) },
          { status: PaymentStatus.REVERSED, timestamp: new Date(now - 7 * hour) },
        ],
        createdAt: new Date(now - 8 * hour),
        updatedAt: new Date(now - 7 * hour),
      },
      {
        _id: "tx_1006",
        amount: 750,
        merchant: this.merchants[0],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_001", status: "ACTIVE" },
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "idem_moviehub_ticket_9923",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 1 * day) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 1 * day) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 1 * day) },
        ],
        createdAt: new Date(now - 1 * day),
        updatedAt: new Date(now - 1 * day),
      },
      {
        _id: "tx_1007",
        amount: 180,
        merchant: this.merchants[1],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_002", status: "ACTIVE" },
        status: PaymentStatus.PROCESSING,
        idempotencyKey: "idem_foodbox_order_4414",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 20 * minute) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 18 * minute) },
        ],
        createdAt: new Date(now - 20 * minute),
        updatedAt: new Date(now - 18 * minute),
      },
      {
        _id: "tx_1008",
        amount: 600,
        merchant: null, // Legacy / direct payment without merchant API key
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_001", status: "ACTIVE" },
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "idem_direct_transfer_001",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 2 * day) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 2 * day) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 2 * day) },
        ],
        createdAt: new Date(now - 2 * day),
        updatedAt: new Date(now - 2 * day),
      },
      {
        _id: "tx_1009",
        amount: 2500,
        merchant: this.merchants[2],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_003", status: "INACTIVE" },
        status: PaymentStatus.PENDING,
        idempotencyKey: "idem_eventbook_pass_1183",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 10 * minute) },
        ],
        createdAt: new Date(now - 10 * minute),
        updatedAt: new Date(now - 10 * minute),
      },
      {
        _id: "tx_1010",
        amount: 890,
        merchant: this.merchants[1],
        fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
        toAccount: { _id: "acc_mch_002", status: "ACTIVE" },
        status: PaymentStatus.SUCCEEDED,
        idempotencyKey: "idem_foodbox_order_4415",
        stateHistory: [
          { status: PaymentStatus.PENDING, timestamp: new Date(now - 3 * day) },
          { status: PaymentStatus.PROCESSING, timestamp: new Date(now - 3 * day) },
          { status: PaymentStatus.SUCCEEDED, timestamp: new Date(now - 3 * day) },
        ],
        createdAt: new Date(now - 3 * day),
        updatedAt: new Date(now - 3 * day),
      },
    ];
  }

  // Helper to mask keys safely: mch_live_...xxxx
  maskApiKey(rawKey) {
    if (!rawKey || typeof rawKey !== "string") return null;
    const prefix = "mch_live_";
    const lastFour = rawKey.slice(-4);
    return `${prefix}...${lastFour}`;
  }

  // 1. Platform Statistics
  getPlatformStatistics() {
    let totalVolume = 0;
    let totalTransactions = this.transactions.length;
    const statusBreakdown = {
      SUCCEEDED: 0,
      PENDING: 0,
      PROCESSING: 0,
      FAILED: 0,
      REVERSED: 0,
    };

    const merchantStatsMap = {};
    for (const m of this.merchants) {
      merchantStatsMap[m._id] = {
        merchantId: m._id,
        merchantName: m.name,
        transactionCount: 0,
        successfulAmount: 0,
      };
    }

    for (const tx of this.transactions) {
      if (statusBreakdown[tx.status] !== undefined) {
        statusBreakdown[tx.status]++;
      }
      if (tx.status === PaymentStatus.SUCCEEDED) {
        totalVolume += tx.amount;
      }

      if (tx.merchant && merchantStatsMap[tx.merchant._id]) {
        merchantStatsMap[tx.merchant._id].transactionCount++;
        if (tx.status === PaymentStatus.SUCCEEDED) {
          merchantStatsMap[tx.merchant._id].successfulAmount += tx.amount;
        }
      }
    }

    const activeMerchants = this.merchants.filter((m) => m.status === "ACTIVE").length;
    const inactiveMerchants = this.merchants.filter((m) => m.status === "INACTIVE").length;

    return {
      totalVolume,
      totalTransactions,
      statusBreakdown,
      merchants: {
        total: this.merchants.length,
        active: activeMerchants,
        inactive: inactiveMerchants,
      },
      merchantsBreakdown: Object.values(merchantStatsMap),
    };
  }

  // 2. Merchant Specific Statistics
  getMerchantStatistics(merchantId) {
    const merchant = this.merchants.find((m) => m._id === merchantId);
    if (!merchant) return null;

    let totalVolume = 0;
    let totalTransactions = 0;
    const statusBreakdown = {
      SUCCEEDED: 0,
      PENDING: 0,
      PROCESSING: 0,
      FAILED: 0,
      REVERSED: 0,
    };

    for (const tx of this.transactions) {
      if (tx.merchant && tx.merchant._id === merchantId) {
        totalTransactions++;
        if (statusBreakdown[tx.status] !== undefined) {
          statusBreakdown[tx.status]++;
        }
        if (tx.status === PaymentStatus.SUCCEEDED) {
          totalVolume += tx.amount;
        }
      }
    }

    return {
      merchant: {
        _id: merchant._id,
        name: merchant.name,
        description: merchant.description,
        status: merchant.status,
        apiKeyMasked: this.maskApiKey(merchant.apiKey),
      },
      totalVolume,
      totalTransactions,
      statusBreakdown,
    };
  }

  // 3. Merchants List with statistics attached
  getAllMerchants(filter = {}) {
    let list = this.merchants;
    if (filter.status) {
      list = list.filter((m) => m.status === filter.status.toUpperCase());
    }

    return list.map((m) => {
      const stats = this.getMerchantStatistics(m._id);
      const totalTx = stats ? stats.totalTransactions : 0;
      const successTx = stats ? stats.statusBreakdown.SUCCEEDED : 0;
      const successRate = totalTx > 0 ? ((successTx / totalTx) * 100).toFixed(1) : "0.0";
      const lastTx = this.transactions
        .filter((tx) => tx.merchant && tx.merchant._id === m._id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

      return {
        _id: m._id,
        name: m.name,
        description: m.description,
        status: m.status,
        apiKeyMasked: this.maskApiKey(m.apiKey),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        metrics: {
          totalTransactions: totalTx,
          successfulAmount: stats ? stats.totalVolume : 0,
          successfulTransactions: successTx,
          failedTransactions: stats ? stats.statusBreakdown.FAILED : 0,
          reversedTransactions: stats ? stats.statusBreakdown.REVERSED : 0,
          pendingTransactions: stats ? stats.statusBreakdown.PENDING : 0,
          successRate: `${successRate}%`,
          lastTransactionDate: lastTx ? lastTx.createdAt : null,
        },
      };
    });
  }

  // 4. Get Merchant By ID
  getMerchantById(merchantId) {
    const m = this.merchants.find((m) => m._id === merchantId);
    if (!m) return null;
    return {
      _id: m._id,
      name: m.name,
      description: m.description,
      status: m.status,
      apiKeyMasked: this.maskApiKey(m.apiKey),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  // 5. Create Merchant
  createMerchant({
    name,
    description,
    businessName,
    platformType,
    websiteUrl,
    environment,
    webhookUrl,
    webhookEvents,
    capabilities,
    allowedOrigins,
    ipRestrictions,
  }) {
    const rawApiKey = `mch_live_${crypto.randomBytes(24).toString("hex")}`;
    const newMerchant = {
      _id: `mch_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`,
      name: name.trim(),
      description: description ? description.trim() : "",
      businessName: businessName ? businessName.trim() : `${name.trim()} Technologies`,
      platformType: platformType || "Other",
      websiteUrl: websiteUrl ? websiteUrl.trim() : "",
      environment: environment || "Sandbox",
      webhookUrl: webhookUrl ? webhookUrl.trim() : "",
      webhookEvents: Array.isArray(webhookEvents) ? webhookEvents : ["payment.succeeded", "payment.failed"],
      capabilities: Array.isArray(capabilities) ? capabilities : ["Create Payments", "Check Transaction Status", "View Transaction History"],
      allowedOrigins: allowedOrigins ? allowedOrigins.trim() : "",
      ipRestrictions: ipRestrictions ? ipRestrictions.trim() : "",
      status: "ACTIVE",
      apiKey: rawApiKey,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.merchants.unshift(newMerchant);
    return {
      _id: newMerchant._id,
      name: newMerchant.name,
      description: newMerchant.description,
      businessName: newMerchant.businessName,
      platformType: newMerchant.platformType,
      environment: newMerchant.environment,
      status: newMerchant.status,
      apiKey: rawApiKey, // Provided once upon creation
      createdAt: newMerchant.createdAt,
      updatedAt: newMerchant.updatedAt,
    };
  }

  // 6. Update Merchant Status
  updateMerchantStatus(merchantId, status) {
    const m = this.merchants.find((item) => item._id === merchantId);
    if (!m) return null;
    m.status = status;
    m.updatedAt = new Date();
    return {
      _id: m._id,
      name: m.name,
      description: m.description,
      status: m.status,
      apiKeyMasked: this.maskApiKey(m.apiKey),
      updatedAt: m.updatedAt,
    };
  }

  // 7. Rotate API Key
  rotateMerchantApiKey(merchantId) {
    const m = this.merchants.find((item) => item._id === merchantId);
    if (!m) return null;
    const newRawKey = `mch_live_${crypto.randomBytes(24).toString("hex")}`;
    m.apiKey = newRawKey;
    m.updatedAt = new Date();
    return {
      _id: m._id,
      name: m.name,
      status: m.status,
      apiKey: newRawKey, // Provided once upon rotation
      updatedAt: m.updatedAt,
    };
  }

  // 8. Delete Merchant (Allowed ONLY if merchant has zero transaction history)
  deleteMerchant(merchantId) {
    const index = this.merchants.findIndex((m) => m._id === merchantId);
    if (index === -1) {
      return null;
    }
    const merchant = this.merchants[index];

    // Check transaction count across the ledger/transactions
    const txCount = this.transactions.filter(
      (tx) => tx.merchant && tx.merchant._id === merchantId
    ).length;

    if (txCount > 0) {
      console.log(
        `[AUDIT] Merchant deletion rejected: merchantId=${merchantId}, merchantName=${merchant.name}, transactionCount=${txCount}, reason=Audit policy requires preserving transaction history`
      );
      const error = new Error(
        `Merchant '${merchant.name}' cannot be permanently deleted because it has ${txCount} transaction(s). Payment records must remain auditable; deactivate the platform instead.`
      );
      error.statusCode = 409;
      throw error;
    }

    // Permanently remove merchant with zero transactions
    this.merchants.splice(index, 1);
    console.log(
      `[AUDIT] Merchant permanently deleted: merchantId=${merchantId}, merchantName=${merchant.name}, reason=Zero transaction history`
    );

    return {
      _id: merchant._id,
      name: merchant.name,
      deleted: true,
    };
  }

  // 9. Get Transactions (with filtering, pagination, search)

  getTransactions({ merchantId, status, search, page = 1, limit = 20 } = {}) {
    let list = [...this.transactions];

    if (merchantId) {
      list = list.filter((tx) => tx.merchant && tx.merchant._id === merchantId);
    }
    if (status) {
      list = list.filter((tx) => tx.status === status.toUpperCase());
    }
    if (search) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (tx) =>
          tx._id.toLowerCase().includes(q) ||
          (tx.idempotencyKey && tx.idempotencyKey.toLowerCase().includes(q)) ||
          (tx.merchant && tx.merchant.name.toLowerCase().includes(q))
      );
    }

    // Sort newest first
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const total = list.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const totalPages = Math.ceil(total / limitNum) || 1;
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = list.slice(startIndex, startIndex + limitNum);

    return {
      transactions: paginated,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
    };
  }

  // 9. Simulate Payment from Demo Client
  simulateDemoPayment({ merchantId, amount, description, simulatedOutcome = "SUCCEEDED" }) {
    const merchant = this.merchants.find((m) => m._id === merchantId);
    if (!merchant) {
      throw new Error("Merchant not found");
    }

    if (merchant.status !== "ACTIVE") {
      // Inactive merchant fails
      simulatedOutcome = "FAILED";
    }

    const now = new Date();
    const txId = `tx_${Date.now().toString(36)}`;
    const idempotencyKey = `idem_${merchant.name.toLowerCase()}_${Date.now()}`;

    const stateHistory = [
      { status: PaymentStatus.PENDING, timestamp: now },
      { status: PaymentStatus.PROCESSING, timestamp: new Date(now.getTime() + 100) },
    ];

    let finalStatus = PaymentStatus.SUCCEEDED;
    let failureReason = null;

    if (simulatedOutcome === "FAILED") {
      finalStatus = PaymentStatus.FAILED;
      failureReason = merchant.status !== "ACTIVE" ? "Merchant account is inactive" : "Simulated bank card decline";
      stateHistory.push({ status: PaymentStatus.FAILED, timestamp: new Date(now.getTime() + 200) });
    } else {
      stateHistory.push({ status: PaymentStatus.SUCCEEDED, timestamp: new Date(now.getTime() + 200) });
    }

    const newTx = {
      _id: txId,
      amount: Number(amount) || 250,
      merchant: {
        _id: merchant._id,
        name: merchant.name,
        status: merchant.status,
      },
      fromAccount: { _id: "acc_cust_001", status: "ACTIVE" },
      toAccount: { _id: `acc_mch_${merchant._id.slice(-3)}`, status: merchant.status },
      status: finalStatus,
      idempotencyKey,
      description: description || `Simulated transaction for ${merchant.name}`,
      failureReason,
      stateHistory,
      createdAt: now,
      updatedAt: new Date(now.getTime() + 200),
    };

    this.transactions.unshift(newTx);
    return newTx;
  }

  // 10. Simulate Reversal
  simulateDemoReversal(transactionId) {
    const tx = this.transactions.find((item) => item._id === transactionId);
    if (!tx) {
      throw new Error("Transaction not found");
    }
    if (tx.status !== PaymentStatus.SUCCEEDED) {
      throw new Error(`Only SUCCEEDED transactions can be reversed. Current status: ${tx.status}`);
    }

    const now = new Date();
    tx.status = PaymentStatus.REVERSED;
    tx.reversalReason = "Simulated customer refund requested via platform";
    tx.updatedAt = now;
    tx.stateHistory.push({
      status: PaymentStatus.REVERSED,
      timestamp: now,
    });

    return tx;
  }
}

export const localDemoStore = new LocalDemoStore();
