import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Merchant } from "../models/merchant.model.js";
import { Transaction } from "../models/transaction.model.js";
import { PaymentStatus } from "../services/paymentStateMachine.js";
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

  const sanitizedMerchants = merchants.map((m) => ({
    _id: m._id,
    name: m.name,
    description: m.description,
    status: m.status,
    apiKeyMasked: m.getMaskedApiKey(),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }));

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
 * 8. Simulate demo checkout from a client application (MovieHub, FoodBox, EventBook).
 */
export const simulateDemoCheckout = asyncHandler(async (req, res) => {
  const { merchantId, amount, description, simulatedOutcome } = req.body;
  const tx = localDemoStore.simulateDemoPayment({
    merchantId,
    amount,
    description,
    simulatedOutcome,
  });
  return res.status(201).json(new ApiResponse(201, tx, "Demo transaction simulated successfully"));
});

/**
 * 9. Simulate demo reversal for a transaction.
 */
export const simulateDemoReversal = asyncHandler(async (req, res) => {
  const { transactionId } = req.body;
  const tx = localDemoStore.simulateDemoReversal(transactionId);
  return res.status(200).json(new ApiResponse(200, tx, "Demo reversal simulated successfully"));
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
