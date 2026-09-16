import mongoose from "mongoose";
import crypto from "node:crypto";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Merchant } from "../models/merchant.model.js";
import { Transaction } from "../models/transaction.model.js";
import { User } from "../models/user.model.js";
import { Account } from "../models/account.model.js";
import { Ledger } from "../models/ledger.model.js";
import {
  PaymentStatus,
  assertValidTransition,
  transitionTransaction,
} from "../services/paymentStateMachine.js";
import { localDemoStore } from "../services/localDemoStore.js";

/**
 * 1. Create a new merchant.
 * Returns the unmasked raw API key ONCE on creation.
 */
export const createMerchant = asyncHandler(async (req, res) => {
  const { name, description } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Merchant name is required");
  }

  if (global.IS_LOCAL_DEMO) {
    const newMerchant = localDemoStore.createMerchant({ name, description, ...req.body });
    return res.status(201).json(
      new ApiResponse(
        201,
        newMerchant,
        "Merchant registered successfully. Save the API key safely; it will not be displayed in full again."
      )
    );
  }

  const existingMerchant = await Merchant.findOne({ name: name.trim() });
  if (existingMerchant) {
    throw new ApiError(409, `Merchant with name '${name.trim()}' already exists`);
  }

  const rawApiKey = Merchant.generateApiKey();

  const merchant = await Merchant.create({
    name: name.trim(),
    description: description ? description.trim() : "",
    apiKey: rawApiKey,
    status: "ACTIVE",
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        _id: merchant._id,
        name: merchant.name,
        description: merchant.description,
        status: merchant.status,
        apiKey: rawApiKey, // Returned once upon creation
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
      },
      "Merchant registered successfully. Save the API key safely; it will not be displayed in full again."
    )
  );
});

/**
 * 2. Get all merchants.
 * Displays only masked API keys (e.g. mch_live_...a82f) for security.
 */
export const getAllMerchants = asyncHandler(async (req, res) => {
  const { status } = req.query;

  if (global.IS_LOCAL_DEMO) {
    const list = localDemoStore.getAllMerchants({ status });
    return res.status(200).json(new ApiResponse(200, list, "Merchants fetched successfully"));
  }

  const filter = {};
  if (status) {
    const uppercaseStatus = status.toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(uppercaseStatus)) {
      throw new ApiError(400, "Status filter must be either ACTIVE or INACTIVE");
    }
    filter.status = uppercaseStatus;
  }

  const merchants = await Merchant.find(filter)
    .select("+apiKey")
    .sort({ createdAt: -1 });

  // Compute metrics for each merchant from MongoDB transactions
  const merchantIds = merchants.map((m) => m._id);
  const statsAgg = await Transaction.aggregate([
    { $match: { merchant: { $in: merchantIds } } },
    {
      $group: {
        _id: { merchant: "$merchant", status: "$status" },
        count: { $sum: 1 },
        totalVolume: {
          $sum: {
            $cond: [{ $eq: ["$status", PaymentStatus.SUCCEEDED] }, "$amount", 0],
          },
        },
      },
    },
  ]);

  const statsMap = {};
  for (const item of statsAgg) {
    const mId = item._id.merchant.toString();
    if (!statsMap[mId]) {
      statsMap[mId] = {
        totalTransactions: 0,
        successfulAmount: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        reversedTransactions: 0,
        pendingTransactions: 0,
      };
    }
    statsMap[mId].totalTransactions += item.count;
    if (item._id.status === PaymentStatus.SUCCEEDED) {
      statsMap[mId].successfulTransactions += item.count;
      statsMap[mId].successfulAmount += item.totalVolume;
    } else if (item._id.status === PaymentStatus.FAILED) {
      statsMap[mId].failedTransactions += item.count;
    } else if (item._id.status === PaymentStatus.REVERSED) {
      statsMap[mId].reversedTransactions += item.count;
    } else if (
      item._id.status === PaymentStatus.PENDING ||
      item._id.status === PaymentStatus.PROCESSING
    ) {
      statsMap[mId].pendingTransactions += item.count;
    }
  }

  const sanitizedMerchants = merchants.map((m) => {
    const s = statsMap[m._id.toString()] || {
      totalTransactions: 0,
      successfulAmount: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      reversedTransactions: 0,
      pendingTransactions: 0,
    };
    const rate =
      s.totalTransactions > 0
        ? ((s.successfulTransactions / s.totalTransactions) * 100).toFixed(1)
        : "0.0";

    return {
      _id: m._id,
      name: m.name,
      description: m.description,
      status: m.status,
      apiKeyMasked: m.getMaskedApiKey(),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      metrics: {
        ...s,
        successRate: `${rate}%`,
      },
    };
  });

  return res.status(200).json(
    new ApiResponse(200, sanitizedMerchants, "Merchants fetched successfully")
  );
});

/**
 * 3. Get single merchant details by ID.
 */
export const getMerchantById = asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  if (global.IS_LOCAL_DEMO) {
    const merchant = localDemoStore.getMerchantById(merchantId);
    if (!merchant) {
      throw new ApiError(404, "Merchant not found");
    }
    return res.status(200).json(new ApiResponse(200, merchant, "Merchant fetched successfully"));
  }

  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new ApiError(400, "Invalid merchantId format");
  }

  const merchant = await Merchant.findById(merchantId).select("+apiKey");

  if (!merchant) {
    throw new ApiError(404, "Merchant not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: merchant._id,
        name: merchant.name,
        description: merchant.description,
        status: merchant.status,
        apiKeyMasked: merchant.getMaskedApiKey(),
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
      },
      "Merchant fetched successfully"
    )
  );
});

/**
 * 4. Update merchant status (ACTIVE / INACTIVE).
 */
export const updateMerchantStatus = asyncHandler(async (req, res) => {
  const { merchantId } = req.params;
  const { status } = req.body;

  if (!status || !["ACTIVE", "INACTIVE"].includes(status.toUpperCase())) {
    throw new ApiError(400, "Valid status ('ACTIVE' or 'INACTIVE') is required");
  }

  if (global.IS_LOCAL_DEMO) {
    const updated = localDemoStore.updateMerchantStatus(merchantId, status.toUpperCase());
    if (!updated) {
      throw new ApiError(404, "Merchant not found");
    }
    return res.status(200).json(
      new ApiResponse(200, updated, `Merchant status updated to ${updated.status}`)
    );
  }

  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new ApiError(400, "Invalid merchantId format");
  }

  const merchant = await Merchant.findById(merchantId).select("+apiKey");
  if (!merchant) {
    throw new ApiError(404, "Merchant not found");
  }

  merchant.status = status.toUpperCase();
  await merchant.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: merchant._id,
        name: merchant.name,
        description: merchant.description,
        status: merchant.status,
        apiKeyMasked: merchant.getMaskedApiKey(),
        updatedAt: merchant.updatedAt,
      },
      `Merchant status updated to ${merchant.status}`
    )
  );
});

/**
 * 5. Rotate/regenerate an API key for a merchant.
 * Returns the new unmasked raw API key ONCE.
 */
export const rotateMerchantApiKey = asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  if (global.IS_LOCAL_DEMO) {
    const rotated = localDemoStore.rotateMerchantApiKey(merchantId);
    if (!rotated) {
      throw new ApiError(404, "Merchant not found");
    }
    return res.status(200).json(
      new ApiResponse(
        200,
        rotated,
        "API key rotated successfully. Store the new API key safely; it will not be displayed in full again."
      )
    );
  }

  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new ApiError(400, "Invalid merchantId format");
  }

  const merchant = await Merchant.findById(merchantId).select("+apiKey");
  if (!merchant) {
    throw new ApiError(404, "Merchant not found");
  }

  const newRawApiKey = Merchant.generateApiKey();
  merchant.apiKey = newRawApiKey;
  await merchant.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: merchant._id,
        name: merchant.name,
        status: merchant.status,
        apiKey: newRawApiKey, // Provided once on rotation
        updatedAt: merchant.updatedAt,
      },
      "API key rotated successfully. Store the new API key safely; it will not be displayed in full again."
    )
  );
});

/**
 * 6. Get platform-wide dashboard statistics using MongoDB aggregation.
 */
export const getPlatformStatistics = asyncHandler(async (req, res) => {
  if (global.IS_LOCAL_DEMO) {
    const stats = localDemoStore.getPlatformStatistics();
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          totalTransactions: stats.totalTransactions,
          totalSuccessfullyProcessedAmount: stats.totalVolume,
          pendingCount: stats.statusBreakdown.PENDING,
          processingCount: stats.statusBreakdown.PROCESSING,
          succeededCount: stats.statusBreakdown.SUCCEEDED,
          failedCount: stats.statusBreakdown.FAILED,
          reversedCount: stats.statusBreakdown.REVERSED,
          totalMerchantCount: stats.merchants.total,
          activeMerchantCount: stats.merchants.active,
          merchantsBreakdown: stats.merchantsBreakdown,
        },
        "Platform dashboard statistics fetched successfully"
      )
    );
  }

  const [statusAggregation, totalMerchants, activeMerchants, merchantsBreakdown] =
    await Promise.all([
      // Transaction counts and volume grouped by status
      Transaction.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
          },
        },
      ]),
      // Merchant counts
      Merchant.countDocuments(),
      Merchant.countDocuments({ status: "ACTIVE" }),
      // Per-merchant volume & transaction breakdown
      Transaction.aggregate([
        {
          $match: { merchant: { $ne: null } },
        },
        {
          $group: {
            _id: "$merchant",
            transactionCount: { $sum: 1 },
            successfulAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", PaymentStatus.SUCCEEDED] }, "$amount", 0],
              },
            },
            successfulCount: {
              $sum: {
                $cond: [{ $eq: ["$status", PaymentStatus.SUCCEEDED] }, 1, 0],
              },
            },
          },
        },
        {
          $lookup: {
            from: "merchants",
            localField: "_id",
            foreignField: "_id",
            as: "merchantInfo",
          },
        },
        {
          $unwind: {
            path: "$merchantInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            merchantId: "$_id",
            name: { $ifNull: ["$merchantInfo.name", "Unknown Merchant"] },
            status: { $ifNull: ["$merchantInfo.status", "UNKNOWN"] },
            transactionCount: 1,
            successfulAmount: 1,
            successfulCount: 1,
          },
        },
        {
          $sort: { successfulAmount: -1 },
        },
      ]),
    ]);

  let totalTransactions = 0;
  let totalSuccessfullyProcessedAmount = 0;
  let pendingCount = 0;
  let processingCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let reversedCount = 0;

  for (const item of statusAggregation) {
    totalTransactions += item.count;
    if (item._id === PaymentStatus.SUCCEEDED) {
      succeededCount = item.count;
      totalSuccessfullyProcessedAmount = item.totalAmount;
    } else if (item._id === PaymentStatus.PENDING) {
      pendingCount = item.count;
    } else if (item._id === PaymentStatus.PROCESSING) {
      processingCount = item.count;
    } else if (item._id === PaymentStatus.FAILED) {
      failedCount = item.count;
    } else if (item._id === PaymentStatus.REVERSED) {
      reversedCount = item.count;
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalTransactions,
        totalSuccessfullyProcessedAmount,
        pendingCount,
        processingCount,
        succeededCount,
        failedCount,
        reversedCount,
        totalMerchantCount: totalMerchants,
        activeMerchantCount: activeMerchants,
        merchantsBreakdown,
      },
      "Platform dashboard statistics fetched successfully"
    )
  );
});

/**
 * 7. Get merchant-specific statistics using MongoDB aggregation.
 */
export const getMerchantStatistics = asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  if (global.IS_LOCAL_DEMO) {
    const stats = localDemoStore.getMerchantStatistics(merchantId);
    if (!stats) {
      throw new ApiError(404, "Merchant not found");
    }
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          merchant: stats.merchant,
          totalTransactions: stats.totalTransactions,
          totalSuccessfullyProcessedAmount: stats.totalVolume,
          pendingCount: stats.statusBreakdown.PENDING,
          processingCount: stats.statusBreakdown.PROCESSING,
          succeededCount: stats.statusBreakdown.SUCCEEDED,
          failedCount: stats.statusBreakdown.FAILED,
          reversedCount: stats.statusBreakdown.REVERSED,
        },
        `Statistics for merchant '${stats.merchant.name}' fetched successfully`
      )
    );
  }

  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new ApiError(400, "Invalid merchantId format");
  }

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    throw new ApiError(404, "Merchant not found");
  }

  const statusAggregation = await Transaction.aggregate([
    {
      $match: { merchant: new mongoose.Types.ObjectId(merchantId) },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]);

  let totalTransactions = 0;
  let totalSuccessfullyProcessedAmount = 0;
  let pendingCount = 0;
  let processingCount = 0;
  let succeededCount = 0;
  let failedCount = 0;
  let reversedCount = 0;

  for (const item of statusAggregation) {
    totalTransactions += item.count;
    if (item._id === PaymentStatus.SUCCEEDED) {
      succeededCount = item.count;
      totalSuccessfullyProcessedAmount = item.totalAmount;
    } else if (item._id === PaymentStatus.PENDING) {
      pendingCount = item.count;
    } else if (item._id === PaymentStatus.PROCESSING) {
      processingCount = item.count;
    } else if (item._id === PaymentStatus.FAILED) {
      failedCount = item.count;
    } else if (item._id === PaymentStatus.REVERSED) {
      reversedCount = item.count;
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        merchant: {
          _id: merchant._id,
          name: merchant.name,
          description: merchant.description,
          status: merchant.status,
        },
        totalTransactions,
        totalSuccessfullyProcessedAmount,
        pendingCount,
        processingCount,
        succeededCount,
        failedCount,
        reversedCount,
      },
      `Statistics for merchant '${merchant.name}' fetched successfully`
    )
  );
});

/**
 * Helper to ensure test accounts exist for payment testing in MongoDB.
 */
async function getOrCreateTestAccounts(merchant) {
  let systemUser = await User.findOne({ email: "system.test@payplatform.internal" });
  if (!systemUser) {
    systemUser = await User.create({
      name: "PayPlatform System",
      email: "system.test@payplatform.internal",
      authProvider: "Local",
      systemUser: true,
      verifiedUser: true,
    });
  }

  let customerAccount = await Account.findOne({ username: "Demo Customer", user: systemUser._id });
  if (!customerAccount) {
    customerAccount = await Account.create({
      user: systemUser._id,
      username: "Demo Customer",
      currency: "INR",
      status: "ACTIVE",
    });
  }

  const merchantAccountName = `${merchant.name} Settlement`;
  let merchantAccount = await Account.findOne({ username: merchantAccountName, user: systemUser._id });
  if (!merchantAccount) {
    merchantAccount = await Account.create({
      user: systemUser._id,
      username: merchantAccountName,
      currency: "INR",
      status: merchant.status === "ACTIVE" ? "ACTIVE" : "FROZEN",
    });
  } else if (merchantAccount.status !== (merchant.status === "ACTIVE" ? "ACTIVE" : "FROZEN")) {
    merchantAccount.status = merchant.status === "ACTIVE" ? "ACTIVE" : "FROZEN";
    await merchantAccount.save();
  }

  return { customerAccount, merchantAccount };
}

/**
 * 8. Simulate demo checkout from a client application (MovieHub, FoodBox, EventBook).
 * Reuses the canonical payment state machine (PENDING -> PROCESSING -> SUCCEEDED / FAILED)
 * and double-entry ledger flow.
 */
export const simulateDemoCheckout = asyncHandler(async (req, res) => {
  const { merchantId, amount, description, simulatedOutcome } = req.body;

  if (global.IS_LOCAL_DEMO) {
    const tx = localDemoStore.simulateDemoPayment({
      merchantId,
      amount,
      description,
      simulatedOutcome,
    });
    return res.status(201).json(new ApiResponse(201, tx, "Demo transaction simulated successfully"));
  }

  // Find merchant platform
  let merchant;
  if (merchantId && mongoose.Types.ObjectId.isValid(merchantId)) {
    merchant = await Merchant.findById(merchantId);
  }
  if (!merchant && merchantId) {
    const cleanedName = merchantId.replace(/^mch_\d+_/, "");
    merchant = await Merchant.findOne({
      $or: [
        { name: merchantId },
        { name: new RegExp(`^${cleanedName}$`, "i") },
      ],
    });
  }
  if (!merchant) {
    merchant = await Merchant.findOne({ status: "ACTIVE" });
  }
  if (!merchant) {
    throw new ApiError(404, "Merchant platform not found");
  }

  const { customerAccount, merchantAccount } = await getOrCreateTestAccounts(merchant);

  const idempotencyKey = `idem_${merchant.name.toLowerCase()}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const numAmount = Number(amount) || 250;

  // Step 1: Create transaction in PENDING
  let tx = await Transaction.create({
    merchant: merchant._id,
    fromAccount: customerAccount._id,
    toAccount: merchantAccount._id,
    amount: numAmount,
    status: PaymentStatus.PENDING,
    idempotencyKey,
  });

  // Step 2: Transition PENDING -> PROCESSING
  tx = await transitionTransaction(tx._id, PaymentStatus.PENDING, PaymentStatus.PROCESSING);

  // Step 3: Check outcome or merchant status
  if (simulatedOutcome === "FAILED" || merchant.status !== "ACTIVE") {
    const failureReason =
      merchant.status !== "ACTIVE"
        ? "Merchant platform is inactive"
        : "Simulated bank card decline";

    tx = await transitionTransaction(
      tx._id,
      PaymentStatus.PROCESSING,
      PaymentStatus.FAILED
    );

    const populatedTx = await Transaction.findById(tx._id)
      .populate("merchant", "name status")
      .populate("fromAccount", "username currency")
      .populate("toAccount", "username currency");

    const responseData = populatedTx.toObject();
    responseData.failureReason = failureReason;

    return res.status(201).json(
      new ApiResponse(201, responseData, "Payment simulation failed as requested")
    );
  }

  // SUCCEEDED outcome: Write double-entry ledger entries
  await Ledger.create([
    {
      account: customerAccount._id,
      amount: numAmount,
      transaction: tx._id,
      type: "Debit",
    },
    {
      account: merchantAccount._id,
      amount: numAmount,
      transaction: tx._id,
      type: "Credit",
    },
  ]);

  tx = await transitionTransaction(
    tx._id,
    PaymentStatus.PROCESSING,
    PaymentStatus.SUCCEEDED
  );

  const populatedTx = await Transaction.findById(tx._id)
    .populate("merchant", "name status")
    .populate("fromAccount", "username currency")
    .populate("toAccount", "username currency");

  return res.status(201).json(
    new ApiResponse(201, populatedTx, "Demo transaction simulated successfully")
  );
});

/**
 * 9. Simulate demo reversal for a transaction.
 * Reuses the canonical payment state machine (SUCCEEDED -> REVERSED) and compensating ledger entries.
 */
export const simulateDemoReversal = asyncHandler(async (req, res) => {
  const { transactionId } = req.body;

  if (global.IS_LOCAL_DEMO) {
    const tx = localDemoStore.simulateDemoReversal(transactionId);
    return res.status(200).json(new ApiResponse(200, tx, "Demo reversal simulated successfully"));
  }

  let targetTx;
  if (transactionId && mongoose.Types.ObjectId.isValid(transactionId)) {
    targetTx = await Transaction.findById(transactionId);
  } else {
    // If not a valid ObjectId, find most recent SUCCEEDED transaction
    targetTx = await Transaction.findOne({ status: PaymentStatus.SUCCEEDED }).sort({ createdAt: -1 });
  }

  if (!targetTx) {
    throw new ApiError(404, "Transaction not found for reversal");
  }

  assertValidTransition(targetTx.status, PaymentStatus.REVERSED);

  const reversedTx = await transitionTransaction(
    targetTx._id,
    PaymentStatus.SUCCEEDED,
    PaymentStatus.REVERSED
  );

  // Compensating double-entry ledger entries
  await Ledger.create([
    {
      account: targetTx.fromAccount,
      amount: targetTx.amount,
      transaction: targetTx._id,
      type: "Credit",
    },
    {
      account: targetTx.toAccount,
      amount: targetTx.amount,
      transaction: targetTx._id,
      type: "Debit",
    },
  ]);

  const populated = await Transaction.findById(reversedTx._id)
    .populate("merchant", "name status")
    .populate("fromAccount", "username currency")
    .populate("toAccount", "username currency");

  return res.status(200).json(
    new ApiResponse(200, populated, "Transaction reversed successfully")
  );
});

/**
 * 10. Delete a merchant platform.
 * Policy:
 * - ZERO transactions: permanent deletion allowed.
 * - >= 1 transactions: permanent deletion FORBIDDEN (409 Conflict). Audit records must be preserved.
 */
export const deleteMerchant = asyncHandler(async (req, res) => {
  const { merchantId } = req.params;

  if (global.IS_LOCAL_DEMO) {
    try {
      const result = localDemoStore.deleteMerchant(merchantId);
      if (!result) {
        throw new ApiError(404, "Merchant not found");
      }
      return res.status(200).json(
        new ApiResponse(200, result, "Merchant permanently deleted successfully")
      );
    } catch (err) {
      if (err.statusCode === 409) {
        throw new ApiError(409, err.message);
      }
      throw err;
    }
  }

  if (!mongoose.Types.ObjectId.isValid(merchantId)) {
    throw new ApiError(400, "Invalid merchantId format");
  }

  const merchant = await Merchant.findById(merchantId);
  if (!merchant) {
    throw new ApiError(404, "Merchant not found");
  }

  // 1. Initial transaction count check
  const transactionCount = await Transaction.countDocuments({
    merchant: new mongoose.Types.ObjectId(merchantId),
  });

  if (transactionCount > 0) {
    console.log(
      `[AUDIT] Merchant deletion rejected: merchantId=${merchantId}, merchantName=${merchant.name}, transactionCount=${transactionCount}, reason=Audit policy requires preserving transaction history`
    );
    throw new ApiError(
      409,
      `Merchant '${merchant.name}' cannot be permanently deleted because it has ${transactionCount} transaction(s). In accordance with financial audit safety rules, platforms with transaction history must be deactivated/retired instead.`
    );
  }

  // 2. Write-Barrier: Atomically transition merchant from ACTIVE to INACTIVE before final deletion.
  // Inactive merchants are immediately rejected by verifyMerchantApiKey (403 Forbidden),
  // preventing new merchant-authenticated payments from starting during deletion evaluation.
  if (merchant.status !== "INACTIVE") {
    merchant.status = "INACTIVE";
    await merchant.save();
  }

  // 3. Re-check transaction count after the merchant is INACTIVE.
  const confirmedCount = await Transaction.countDocuments({
    merchant: new mongoose.Types.ObjectId(merchantId),
  });

  if (confirmedCount > 0) {
    console.log(
      `[AUDIT] Merchant deletion rejected after deactivation: merchantId=${merchantId}, merchantName=${merchant.name}, transactionCount=${confirmedCount}, reason=Transactions recorded prior to deactivation write barrier`
    );
    // Keep the merchant INACTIVE to preserve audit trail; do NOT delete
    throw new ApiError(
      409,
      `Merchant '${merchant.name}' cannot be permanently deleted because it has ${confirmedCount} transaction(s). The platform has been deactivated/retired to preserve financial audit history.`
    );
  }

  // 4. Guaranteed zero transactions: permanently delete only that merchant record.
  await Merchant.findByIdAndDelete(merchantId);
  console.log(
    `[AUDIT] Merchant permanently deleted: merchantId=${merchantId}, merchantName=${merchant.name}, reason=Zero transaction history`
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      { _id: merchant._id, name: merchant.name, deleted: true },
      "Merchant permanently deleted successfully"
    )
  );
});
