import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { Merchant } from "../models/merchant.model.js";
import { localDemoStore } from "../services/localDemoStore.js";

/**
 * Strict middleware for merchant-authenticated routes.
 * Enforces presence of a valid, active x-api-key.
 */
export const verifyMerchantApiKey = asyncHandler(async (req, res, next) => {
  const apiKey = req.header("x-api-key");

  if (!apiKey) {
    throw new ApiError(401, "Merchant API key is required in 'x-api-key' header");
  }

  let merchant;
  if (global.IS_LOCAL_DEMO) {
    const found = localDemoStore.merchants.find((m) => m.apiKey === apiKey);
    merchant = found ? { ...found } : null;
  } else {
    merchant = await Merchant.findOne({ apiKey }).select("+apiKey");
  }

  if (!merchant) {
    throw new ApiError(401, "Invalid Merchant API key");
  }

  if (merchant.status !== "ACTIVE") {
    throw new ApiError(403, "Merchant account is INACTIVE. Please contact platform support.");
  }

  // Attach safe merchant record (without apiKey exposed on req.merchant)
  delete merchant.apiKey;
  req.merchant = merchant;
  next();
});

/**
 * Optional merchant identification middleware.
 * If x-api-key is present, validates it and attaches req.merchant.
 * If x-api-key is absent, leaves req.merchant as null and allows the request to continue.
 */
export const optionalMerchantAuth = asyncHandler(async (req, res, next) => {
  const apiKey = req.header("x-api-key");

  if (!apiKey) {
    req.merchant = null;
    return next();
  }

  let merchant;
  if (global.IS_LOCAL_DEMO) {
    const found = localDemoStore.merchants.find((m) => m.apiKey === apiKey);
    merchant = found ? { ...found } : null;
  } else {
    merchant = await Merchant.findOne({ apiKey }).select("+apiKey");
  }

  if (!merchant) {
    throw new ApiError(401, "Invalid Merchant API key");
  }

  if (merchant.status !== "ACTIVE") {
    throw new ApiError(403, "Merchant account is INACTIVE. Please contact platform support.");
  }

  delete merchant.apiKey;
  req.merchant = merchant;
  next();
});

