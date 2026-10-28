/**
 * PayPlatform Application Orchestrator
 * Main entry point integrating modular domain controllers and client-side SPA routing.
 */

import { checkAuth, enableGuestMode } from "./api.js";
import { loadOverviewData } from "./pages/overview.js";
import { loadTransactionsData, viewTxDetails, initTransactionsPage } from "./pages/transactions.js";
import {
  loadMerchantsData,
  toggleMerchantStatus,
  rotateApiKey,
  viewMerchantDetails,
  openDeleteMerchantModal,
  initMerchantsModals,
} from "./pages/merchants.js";
import { loadDemoClientsData, runDemoPayment, runDemoReversal, toggleEventBookStatus } from "./pages/simulator.js";
import { initWizard } from "./pages/wizard.js";

// Expose handlers globally for template event bindings
window.runDemoPayment = runDemoPayment;
window.runDemoReversal = runDemoReversal;
window.toggleEventBookStatus = toggleEventBookStatus;
window.viewMerchantDetails = viewMerchantDetails;
window.toggleMerchantStatus = toggleMerchantStatus;
window.rotateApiKey = rotateApiKey;
window.openDeleteMerchantModal = openDeleteMerchantModal;
window.viewTxDetails = viewTxDetails;

// SPA Router Definition
const pageTitles = {
  overview: { title: "Platform Overview", sub: "Monitor your payment infrastructure, merchants and transactions" },
  transactions: { title: "Transaction History", sub: "Global ledger & payment state transition audit" },
  merchants: { title: "Platforms / Merchants", sub: "Client applications authorized to use your backend" },
  "demo-clients": { title: "Client Platforms", sub: "Test payment transactions against registered client platforms" },
  api: { title: "API & Integration Guide", sub: "Integration workflow for external client frontends" },
  settings: { title: "Environment Settings", sub: "System information & double-entry integrity" },
};

function navigateTo(pageId) {
  if (!pageTitles[pageId]) pageId = "overview";

  // Update active sidebar nav items
  document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("data-page") === pageId);
  });

  // Update active page sections
  document.querySelectorAll(".page-section").forEach((sec) => {
    sec.classList.toggle("active", sec.id === `page-${pageId}`);
  });

  // Update page header
  const titleEl = document.getElementById("topPageTitle");
  const subEl = document.getElementById("topPageSubtitle");
  if (titleEl) titleEl.textContent = pageTitles[pageId].title;
  if (subEl) subEl.textContent = pageTitles[pageId].sub;

  // Load section-specific data
  if (pageId === "overview") loadOverviewData();
  else if (pageId === "transactions") loadTransactionsData();
  else if (pageId === "merchants") loadMerchantsData();
  else if (pageId === "demo-clients") loadDemoClientsData();
}

function initRouter() {
  window.addEventListener("hashchange", () => {
    const pageId = window.location.hash.replace("#", "") || "overview";
    navigateTo(pageId);
  });

  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", () => {
      const targetPage = el.getAttribute("data-page");
      window.location.hash = `#${targetPage}`;
    });
  });

  const initialPage = window.location.hash.replace("#", "") || "overview";
  navigateTo(initialPage);
}

// Application Startup
document.addEventListener("DOMContentLoaded", async () => {
  // Bind Guest / Recruiter Preview Button on Auth Modal
  document.getElementById("guestPreviewBtn")?.addEventListener("click", () => {
    enableGuestMode();
    loadOverviewData();
  });

  // Check auth session
  await checkAuth();

  // Initialize router and modules
  initRouter();
  initTransactionsPage();
  initMerchantsModals();
  initWizard();

  // Top navigation refresh button
  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    loadOverviewData();
    loadTransactionsData();
    loadMerchantsData();
  });
});
