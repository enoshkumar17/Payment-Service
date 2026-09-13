import { Router } from "express";
import { verifySystemUser, verifyUser } from "../middlewares/auth.middleware.js";
import { optionalMerchantAuth } from "../middlewares/merchantAuth.middleware.js";
import {
  createInitialFundTransaction,
  createTransaction,
  reverseTransaction,
  getTransactions,
} from "../controllers/transaction.controller.js";

const router = Router();

// Transaction listing with optional filtering by merchantId, status, and pagination
router.get("/", verifyUser, getTransactions);

// Payment creation (supports optional x-api-key for merchant identification + user authorization)
router.post("/new-transaction", optionalMerchantAuth, verifyUser, createTransaction);
router.post("/:transactionId/reverse", verifyUser, reverseTransaction);
router.post("/system/initial-funds", verifySystemUser, createInitialFundTransaction);

export default router;