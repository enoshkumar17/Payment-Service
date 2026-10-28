/**
 * PayPlatform Dashboard Configuration & Shared State
 */

// Production API Base URL (Render backend service)
export const DEFAULT_API_BASE = "https://payment-service-pl7q.onrender.com";

// Resolve Base URL dynamically: if running on local port 3500 use relative path; else use production Render backend
export const API_BASE_URL =
  typeof window !== "undefined" && window.location.port === "3500"
    ? ""
    : DEFAULT_API_BASE;

// Global Application Reactive State
export const state = {
  currentUser: null,
  isGuestMode: false,
  currentMerchantList: [],
  currentTxPage: 1,
  txLimit: 10,
  currentTxFilter: {
    merchantId: "",
    status: "",
    search: "",
  },
  currentTxCache: [],
  pendingDeleteTarget: null,
};
