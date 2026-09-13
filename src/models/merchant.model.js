import mongoose from "mongoose";
import crypto from "node:crypto";

const merchantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Merchant name is required"],
      unique: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    apiKey: {
      type: String,
      required: [true, "API key is required"],
      unique: true,
      index: true,
      select: false, // Omit apiKey by default from queries
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "INACTIVE"],
        message: "Status must be either ACTIVE or INACTIVE",
      },
      default: "ACTIVE",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Generates a standard secure API key using Node.js crypto.
 * Format: mch_live_<48_hex_chars>
 */
merchantSchema.statics.generateApiKey = function () {
  const randomHex = crypto.randomBytes(24).toString("hex");
  return `mch_live_${randomHex}`;
};

/**
 * Returns a masked representation of the API key for safe UI display (e.g. mch_live_...a82f).
 * Never exposes the full secret key in normal responses.
 */
merchantSchema.methods.getMaskedApiKey = function (rawKey) {
  const keyToMask = rawKey || this.apiKey;
  if (!keyToMask || typeof keyToMask !== "string") {
    return null;
  }
  const prefix = "mch_live_";
  const lastFour = keyToMask.slice(-4);
  return `${prefix}...${lastFour}`;
};

export const Merchant = mongoose.model("Merchant", merchantSchema);
