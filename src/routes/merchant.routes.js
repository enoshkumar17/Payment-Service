import { Router } from "express";
import { verifySystemUser, verifyUser } from "../middlewares/auth.middleware.js";
import {
  createMerchant,
  getAllMerchants,
  getMerchantById,
  updateMerchantStatus,
  rotateMerchantApiKey,
  getPlatformStatistics,
  getMerchantStatistics,
  simulateDemoCheckout,
  simulateDemoReversal,
  deleteMerchant,
} from "../controllers/merchant.controller.js";

const router = Router();

// Demo Client Simulation Endpoints (for college dashboard playground)
router.post("/demo-checkout", verifyUser, simulateDemoCheckout);
router.post("/demo-reverse", verifyUser, simulateDemoReversal);

// Dashboard Statistics (Mounted before :merchantId to avoid route collision)
router.get("/statistics", verifyUser, getPlatformStatistics);
router.get("/:merchantId/statistics", verifyUser, getMerchantStatistics);

// Merchant Management Endpoints
router.post("/", verifySystemUser, createMerchant);
router.get("/", verifyUser, getAllMerchants);
router.get("/:merchantId", verifyUser, getMerchantById);
router.patch("/:merchantId/status", verifySystemUser, updateMerchantStatus);
router.post("/:merchantId/rotate-api-key", verifySystemUser, rotateMerchantApiKey);
router.delete("/:merchantId", verifySystemUser, deleteMerchant);

export default router;


