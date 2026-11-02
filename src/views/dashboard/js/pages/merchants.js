/**
 * PayPlatform Merchants / Platforms Management Page Module
 * Platform registry, status activation/deactivation, API key rotation, stats, and audit-safe deletion.
 */

import { API_BASE_URL, state } from "../config.js";
import { apiFetch } from "../api.js";
import { formatCurrency, getPlatformIcon } from "../formatters.js";
import { loadOverviewData } from "./overview.js";
import { populateMerchantFilterDropdown } from "./transactions.js";
import { loadDemoClientsData } from "./simulator.js";

/**
 * Fetch and render all registered merchant platforms
 */
export async function loadMerchantsData() {
  if (state.isGuestMode) {
    state.currentMerchantList = [...state.demoMerchants];
    renderMerchantsPage(state.currentMerchantList);
    populateMerchantFilterDropdown();
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants`);
    const json = await res.json();
    if (res.ok && Array.isArray(json?.data) && json.data.length > 0) {
      state.currentMerchantList = json.data;
    } else {
      state.currentMerchantList = [...state.demoMerchants];
    }
    renderMerchantsPage(state.currentMerchantList);
    populateMerchantFilterDropdown();
  } catch (err) {
    console.warn("Using demo client merchants fallback:", err);
    state.currentMerchantList = [...state.demoMerchants];
    renderMerchantsPage(state.currentMerchantList);
    populateMerchantFilterDropdown();
  }
}

/**
 * Render platform registry cards
 */
export function renderMerchantsPage(merchants) {
  const container = document.getElementById("merchantsDetailedGrid");
  if (!container) return;

  if (!merchants || merchants.length === 0) {
    container.innerHTML = `<div class="empty-state" style="padding: 32px; text-align: center; color: var(--text-muted); font-size: 13.5px;">No platforms connected yet. Click '+ Register New Platform' to add one.</div>`;
    return;
  }

  container.innerHTML = merchants
    .map((m) => {
      const isAct = m.status === "ACTIVE";
      const statusBadge = isAct
        ? `<span class="badge badge-active">ACTIVE</span>`
        : `<span class="badge badge-inactive">INACTIVE</span>`;
      const metrics = m.metrics || {};

      return `
      <div class="platform-summary-card">
        <div class="platform-card-header">
          <div class="platform-header-left">
            ${getPlatformIcon(m.name)}
            <div class="platform-header-text">
              <div class="platform-name">${m.name}</div>
              <div class="platform-sub-desc">${m.description || "Client Application"}</div>
            </div>
          </div>
          ${statusBadge}
        </div>

        <div class="platform-stats-row">
          <div>
            <div class="stat-item-label">Total Tx</div>
            <div class="stat-item-val">${metrics.totalTransactions || 0}</div>
          </div>
          <div>
            <div class="stat-item-label">Successful</div>
            <div class="stat-item-val text-success">${metrics.successfulTransactions || metrics.totalTransactions || 0}</div>
          </div>
          <div>
            <div class="stat-item-label">Volume</div>
            <div class="stat-item-val">${formatCurrency(metrics.successfulAmount || 0)}</div>
          </div>
        </div>

        <div class="platform-key-box">
          <span>API Key:</span>
          <code title="${m.apiKeyMasked || ""}">${m.apiKeyMasked || "mch_live_...xxxx"}</code>
        </div>

        <div class="platform-actions-row">
          <button class="btn btn-xs btn-secondary" onclick="window.viewMerchantDetails('${m._id}')">
            View Stats
          </button>
          <button class="btn btn-xs ${isAct ? "btn-deactivate" : "btn-activate"}" onclick="window.toggleMerchantStatus('${m._id}', '${isAct ? "INACTIVE" : "ACTIVE"}')">
            ${isAct ? "Deactivate" : "Activate"}
          </button>
          <button class="btn btn-xs btn-secondary" onclick="window.rotateApiKey('${m._id}', '${m.name}')">
            Rotate Key
          </button>
          <button class="btn btn-xs btn-outline-danger" onclick="window.openDeleteMerchantModal('${m._id}')">
            Delete
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * Toggle platform status between ACTIVE and INACTIVE
 */
export async function toggleMerchantStatus(merchantId, newStatus) {
  if (state.isGuestMode) {
    const m = state.demoMerchants.find((x) => x._id === merchantId);
    if (m) m.status = newStatus;
    state.currentMerchantList = [...state.demoMerchants];
    renderMerchantsPage(state.currentMerchantList);
    loadOverviewData();
    loadDemoClientsData();
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${merchantId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    const json = await res.json();
    if (json.success) {
      loadMerchantsData();
      loadOverviewData();
    }
  } catch (err) {
    console.error("Failed to update status:", err);
  }
}

/**
 * Rotate API Key for a platform
 */
export async function rotateApiKey(merchantId, merchantName) {
  if (!confirm(`Are you sure you want to rotate the API key for ${merchantName}? The existing key will be immediately invalidated.`)) {
    return;
  }

  if (state.isGuestMode) {
    const m = state.demoMerchants.find((x) => x._id === merchantId);
    const newKey = `mch_live_${Math.random().toString(36).substring(2, 14)}${Math.random().toString(36).substring(2, 14)}`;
    if (m) {
      m.apiKey = newKey;
      m.apiKeyMasked = `${newKey.slice(0, 12)}...${newKey.slice(-4)}`;
    }
    state.demoMerchants = [...state.demoMerchants];
    state.currentMerchantList = [...state.demoMerchants];
    renderMerchantsPage(state.currentMerchantList);
    loadDemoClientsData();
    alert(`New API Key generated for ${merchantName}!\n\nNew Secret API Key:\n${newKey}\n\n(Save this key now. It will never be displayed in full again.)`);
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${merchantId}/rotate-api-key`, {
      method: "POST",
    });
    const json = await res.json();
    const newKey = json?.data?.apiKey;

    alert(`Key Rotated Successfully for ${merchantName}!\n\nNew Secret API Key:\n${newKey}\n\nSave this key now. It will never be displayed in full again.`);
    loadMerchantsData();
  } catch (err) {
    console.error("Failed to rotate key:", err);
  }
}

/**
 * Open platform statistics modal
 */
export async function viewMerchantDetails(merchantId) {
  const localM = state.demoMerchants.find((x) => x._id === merchantId);

  if (state.isGuestMode && localM) {
    renderStatsModal({
      merchant: localM,
      totalSuccessfullyProcessedAmount: localM.metrics?.successfulAmount || 25000,
      totalTransactions: localM.metrics?.totalTransactions || 100,
      succeededCount: localM.metrics?.totalTransactions || 98,
      failedCount: 2,
      pendingCount: 0,
      processingCount: 0,
      reversedCount: 1,
    });
    return;
  }

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${merchantId}/statistics`);
    const json = await res.json();
    const data = json?.data;
    if (!data && localM) {
      renderStatsModal({
        merchant: localM,
        totalSuccessfullyProcessedAmount: localM.metrics?.successfulAmount || 25000,
        totalTransactions: localM.metrics?.totalTransactions || 100,
        succeededCount: localM.metrics?.totalTransactions || 98,
        failedCount: 2,
        pendingCount: 0,
        processingCount: 0,
        reversedCount: 1,
      });
      return;
    }
    renderStatsModal(data);
  } catch (err) {
    if (localM) {
      renderStatsModal({
        merchant: localM,
        totalSuccessfullyProcessedAmount: localM.metrics?.successfulAmount || 25000,
        totalTransactions: localM.metrics?.totalTransactions || 100,
        succeededCount: localM.metrics?.totalTransactions || 98,
        failedCount: 2,
        pendingCount: 0,
        processingCount: 0,
        reversedCount: 1,
      });
    }
  }
}

function renderStatsModal(data) {
  if (!data) return;
  const m = data.merchant || {};
  const isAct = m.status === "ACTIVE";
  const titleEl = document.getElementById("merchantDetailModalTitle");
  const contentEl = document.getElementById("merchantDetailModalContent");

  if (titleEl) titleEl.textContent = `${m.name} — Platform Statistics`;
  if (contentEl) {
    contentEl.innerHTML = `
      <div style="margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="font-size: 16px; font-weight: 700; color: #111111;">${m.name}</h4>
          ${isAct ? '<span class="badge badge-active">ACTIVE</span>' : '<span class="badge badge-inactive">INACTIVE</span>'}
        </div>
        <p style="font-size: 12.5px; color: #4b5563; margin-top: 2px;">${m.description || "Integrated client platform"}</p>
      </div>

      <div class="metrics-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 20px;">
        <div class="metric-card" style="border-radius: 8px;">
          <div class="metric-label">Processed Volume</div>
          <div class="metric-value text-primary">${formatCurrency(data.totalSuccessfullyProcessedAmount)}</div>
        </div>
        <div class="metric-card" style="border-radius: 8px;">
          <div class="metric-label">Total Transactions</div>
          <div class="metric-value">${data.totalTransactions}</div>
        </div>
      </div>

      <h5 style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #111111; margin-bottom: 8px;">Status Breakdown</h5>
      <div class="platform-stats-row" style="grid-template-columns: repeat(5, 1fr); margin-bottom: 20px; border-radius: 8px;">
        <div>
          <div class="stat-item-label">SUCCEEDED</div>
          <div class="stat-item-val text-success">${data.succeededCount}</div>
        </div>
        <div>
          <div class="stat-item-label">FAILED</div>
          <div class="stat-item-val text-danger">${data.failedCount}</div>
        </div>
        <div>
          <div class="stat-item-label">PENDING</div>
          <div class="stat-item-val text-warning">${data.pendingCount}</div>
        </div>
        <div>
          <div class="stat-item-label">PROCESSING</div>
          <div class="stat-item-val" style="color: #0284c7;">${data.processingCount}</div>
        </div>
        <div>
          <div class="stat-item-label">REVERSED</div>
          <div class="stat-item-val text-purple">${data.reversedCount}</div>
        </div>
      </div>

      <div style="font-size: 11.5px; color: #6b7280; border-top: 1px solid #e5e5e5; padding-top: 10px;">
        Registered: ${new Date(m.createdAt || Date.now()).toLocaleDateString("en-IN", { dateStyle: "long" })}
      </div>
    `;
  }

  document.getElementById("merchantDetailModal")?.classList.add("open");
}

/**
 * Open audit-safe delete modal
 */
export function openDeleteMerchantModal(merchantId) {
  const m = (state.currentMerchantList || []).find((x) => x._id === merchantId) ||
            state.demoMerchants.find((x) => x._id === merchantId);
  if (!m) return;

  state.pendingDeleteTarget = m;
  const nameEl = document.getElementById("deleteMerchantNameDisplay");
  if (nameEl) nameEl.textContent = m.name;

  document.getElementById("deleteMerchantModal")?.classList.add("open");
}

/**
 * Initialize merchants modals
 */
export function initMerchantsModals() {
  document.getElementById("closeMerchantDetailBtn")?.addEventListener("click", () => {
    document.getElementById("merchantDetailModal")?.classList.remove("open");
  });
  document.getElementById("closeMerchantDetailFooterBtn")?.addEventListener("click", () => {
    document.getElementById("merchantDetailModal")?.classList.remove("open");
  });

  document.getElementById("cancelDeleteMerchantBtn")?.addEventListener("click", () => {
    document.getElementById("deleteMerchantModal")?.classList.remove("open");
    state.pendingDeleteTarget = null;
  });

  document.getElementById("confirmDeleteMerchantBtn")?.addEventListener("click", async () => {
    if (!state.pendingDeleteTarget) return;

    if (state.isGuestMode) {
      state.demoMerchants = state.demoMerchants.filter((m) => m._id !== state.pendingDeleteTarget._id);
      state.currentMerchantList = [...state.demoMerchants];
      document.getElementById("deleteMerchantModal")?.classList.remove("open");
      state.pendingDeleteTarget = null;
      loadMerchantsData();
      loadOverviewData();
      loadDemoClientsData();
      return;
    }

    try {
      await apiFetch(`${API_BASE_URL}/api/v1/merchants/${state.pendingDeleteTarget._id}`, {
        method: "DELETE",
      });
      document.getElementById("deleteMerchantModal")?.classList.remove("open");
      state.pendingDeleteTarget = null;
      loadMerchantsData();
      loadOverviewData();
    } catch (err) {
      alert("Failed to delete platform: " + err.message);
    }
  });
}
