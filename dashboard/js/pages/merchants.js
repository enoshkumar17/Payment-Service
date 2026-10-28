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
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants`);
    const json = await res.json();
    state.currentMerchantList = json?.data || [];
    renderMerchantsPage(state.currentMerchantList);
    populateMerchantFilterDropdown();
  } catch (err) {
    console.warn("Failed to load merchants:", err);
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
            <div class="stat-item-val text-success">${metrics.successfulTransactions || 0}</div>
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
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${merchantId}/statistics`);
    const json = await res.json();
    const data = json?.data;
    if (!data) return;

    const m = data.merchant;
    const isAct = m.status === "ACTIVE";
    const titleEl = document.getElementById("merchantDetailModalTitle");
    const contentEl = document.getElementById("merchantDetailModalContent");

    if (titleEl) titleEl.textContent = `${m.name} — Platform Statistics`;
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4 style="font-size: 16px;">${m.name}</h4>
            ${isAct ? '<span class="badge badge-active">ACTIVE</span>' : '<span class="badge badge-inactive">INACTIVE</span>'}
          </div>
          <p style="font-size: 12.5px; color: var(--text-muted);">${m.description || "Integrated client platform"}</p>
        </div>

        <div class="metrics-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 20px;">
          <div class="metric-card">
            <div class="metric-label">Processed Volume</div>
            <div class="metric-value text-primary">${formatCurrency(data.totalSuccessfullyProcessedAmount)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Total Transactions</div>
            <div class="metric-value">${data.totalTransactions}</div>
          </div>
        </div>

        <h5 style="font-size: 13px; font-weight: 700; margin-bottom: 8px;">Status Breakdown</h5>
        <div class="platform-stats-row" style="grid-template-columns: repeat(5, 1fr); margin-bottom: 20px;">
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

        <div class="platform-key-box" style="margin-bottom: 16px;">
          <span>Masked API Key:</span>
          <code>${m.apiKeyMasked || "mch_live_...xxxx"}</code>
        </div>

        <div style="padding-top: 14px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 12.5px;">
          ${
            data.totalTransactions === 0
              ? `<span class="text-muted">Zero transactions recorded &bull; Platform eligible for removal:</span>
                 <button class="btn btn-xs btn-outline-danger" onclick="document.getElementById('merchantDetailModal').classList.remove('open'); window.openDeleteMerchantModal('${m._id}')">
                   Delete Platform
                 </button>`
              : `<span class="text-muted">🔒 Audit Policy Active: ${data.totalTransactions} recorded transaction(s) preserved.</span>
                 <button class="btn btn-xs ${isAct ? "btn-deactivate" : "btn-activate"}" onclick="document.getElementById('merchantDetailModal').classList.remove('open'); window.toggleMerchantStatus('${m._id}', '${isAct ? "INACTIVE" : "ACTIVE"}')">
                   ${isAct ? "Deactivate Platform" : "Activate Platform"}
                 </button>`
          }
        </div>
      `;
    }

    document.getElementById("merchantDetailModal")?.classList.add("open");
  } catch (err) {
    console.error("Failed to view merchant details:", err);
  }
}

/**
 * Open delete dialog (enforcing zero-transaction audit policy)
 */
export async function openDeleteMerchantModal(merchantId) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${merchantId}/statistics`);
    const json = await res.json();
    if (!json.success || !json.data) {
      alert(json.message || "Failed to fetch platform statistics");
      return;
    }

    const data = json.data;
    const m = data.merchant;
    const totalTx = data.totalTransactions || 0;

    if (totalTx === 0) {
      document.getElementById("deleteTargetMerchantName").textContent = m.name;
      document.getElementById("deleteTargetMerchantStatus").innerHTML =
        m.status === "ACTIVE"
          ? '<span class="badge badge-active">ACTIVE</span>'
          : '<span class="badge badge-inactive">INACTIVE</span>';
      document.getElementById("deleteTargetMerchantKey").textContent = m.apiKeyMasked || "mch_live_...xxxx";
      document.getElementById("deleteConfirmMatchTarget").textContent = m.name;

      const confirmInput = document.getElementById("deleteConfirmInput");
      const confirmBtn = document.getElementById("confirmDeleteMerchantBtn");
      if (confirmInput) confirmInput.value = "";
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Permanently Delete Merchant";
      }

      state.pendingDeleteTarget = { id: m._id, name: m.name };
      document.getElementById("deleteMerchantModal")?.classList.add("open");
      setTimeout(() => confirmInput?.focus(), 100);
    } else {
      document.getElementById("blockedTargetMerchantName").textContent = m.name;
      document.getElementById("blockedTargetTxCount").textContent = `${totalTx} transaction(s)`;
      document.getElementById("blockedTargetSuccessTx").textContent = `${data.succeededCount || 0} succeeded`;
      document.getElementById("blockedTargetVolume").textContent = formatCurrency(data.totalSuccessfullyProcessedAmount || 0);
      document.getElementById("blockedTargetStatus").innerHTML =
        m.status === "ACTIVE"
          ? '<span class="badge badge-active">ACTIVE</span>'
          : '<span class="badge badge-inactive">INACTIVE</span>';

      const deactBtn = document.getElementById("blockedDeactivateBtn");
      if (deactBtn) {
        if (m.status === "INACTIVE") {
          deactBtn.textContent = "Platform Already Inactive";
          deactBtn.disabled = true;
        } else {
          deactBtn.textContent = "Deactivate Platform";
          deactBtn.disabled = false;
          deactBtn.onclick = async () => {
            await toggleMerchantStatus(m._id, "INACTIVE");
            document.getElementById("deleteBlockedModal")?.classList.remove("open");
          };
        }
      }

      document.getElementById("deleteBlockedModal")?.classList.add("open");
    }
  } catch (err) {
    console.error("Failed to prepare deletion modal:", err);
  }
}

/**
 * Initialize event listeners for merchant modals
 */
export function initMerchantsModals() {
  const deleteModal = document.getElementById("deleteMerchantModal");
  const blockedModal = document.getElementById("deleteBlockedModal");

  const closeDelete = () => {
    deleteModal?.classList.remove("open");
    state.pendingDeleteTarget = null;
    const confirmInput = document.getElementById("deleteConfirmInput");
    if (confirmInput) confirmInput.value = "";
  };
  const closeBlocked = () => {
    blockedModal?.classList.remove("open");
  };

  document.getElementById("closeDeleteMerchantBtn")?.addEventListener("click", closeDelete);
  document.getElementById("cancelDeleteMerchantBtn")?.addEventListener("click", closeDelete);
  document.getElementById("closeDeleteBlockedBtn")?.addEventListener("click", closeBlocked);
  document.getElementById("cancelDeleteBlockedBtn")?.addEventListener("click", closeBlocked);

  document.getElementById("deleteConfirmInput")?.addEventListener("input", (e) => {
    const inputVal = e.target.value.trim();
    const targetName = state.pendingDeleteTarget?.name;
    const confirmBtn = document.getElementById("confirmDeleteMerchantBtn");
    if (confirmBtn) {
      confirmBtn.disabled = !targetName || inputVal !== targetName;
    }
  });

  document.getElementById("confirmDeleteMerchantBtn")?.addEventListener("click", async () => {
    if (!state.pendingDeleteTarget) return;
    const { id, name } = state.pendingDeleteTarget;
    const confirmInput = document.getElementById("deleteConfirmInput");
    if (confirmInput?.value.trim() !== name) return;

    const confirmBtn = document.getElementById("confirmDeleteMerchantBtn");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Deleting...";
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (res.ok && json.success) {
        closeDelete();
        alert(`Platform "${name}" was permanently deleted.`);
        loadMerchantsData();
        loadOverviewData();
        loadDemoClientsData();
      } else {
        alert(json?.message || "Failed to delete merchant");
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Permanently Delete Merchant";
        }
      }
    } catch (err) {
      console.error("Delete merchant error:", err);
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Permanently Delete Merchant";
      }
    }
  });

  document.getElementById("closeMerchantDetailBtn")?.addEventListener("click", () => {
    document.getElementById("merchantDetailModal")?.classList.remove("open");
  });
  document.getElementById("closeMerchantDetailFooterBtn")?.addEventListener("click", () => {
    document.getElementById("merchantDetailModal")?.classList.remove("open");
  });
}
