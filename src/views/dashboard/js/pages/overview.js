/**
 * PayPlatform Overview Page Module
 * KPI metric summary cards, active platforms overview, and recent transaction stream.
 */

import { API_BASE_URL, state } from "../config.js";
import { apiFetch } from "../api.js";
import { formatCurrency, formatDate, getStatusBadge, getPlatformIcon } from "../formatters.js";
import { populateMerchantFilterDropdown } from "./transactions.js";

/**
 * Fetch and render all overview summary metrics and data
 */
export async function loadOverviewData() {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/statistics`);
    const json = await res.json();
    const stats = json?.data || {};

    // Update KPI metric cards
    const volEl = document.getElementById("statTotalVolume");
    const grossEl = document.getElementById("statGrossVolume");
    const txEl = document.getElementById("statTotalTransactions");
    const succEl = document.getElementById("statSucceeded");
    const failEl = document.getElementById("statFailed");
    const pendEl = document.getElementById("statPendingProcessing");
    const revEl = document.getElementById("statReversed");

    const formattedVol = formatCurrency(stats.totalSuccessfullyProcessedAmount);
    if (volEl) volEl.textContent = formattedVol;
    if (grossEl) grossEl.textContent = formattedVol;
    if (txEl) txEl.textContent = `${stats.totalTransactions || 0} Tx`;
    if (succEl) succEl.textContent = `${stats.succeededCount || 0} Succeeded`;
    if (failEl) failEl.textContent = stats.failedCount || 0;
    if (pendEl) pendEl.textContent = (stats.pendingCount || 0) + (stats.processingCount || 0);
    if (revEl) revEl.textContent = stats.reversedCount || 0;

    // Load registered client platforms
    const mRes = await apiFetch(`${API_BASE_URL}/api/v1/merchants`);
    const mJson = await mRes.json();
    state.currentMerchantList = mJson?.data || [];
    renderOverviewPlatforms(state.currentMerchantList);
    populateMerchantFilterDropdown();

    // Load recent 5 transactions
    const txRes = await apiFetch(`${API_BASE_URL}/api/v1/transactions?limit=5`);
    const txJson = await txRes.json();
    renderOverviewRecentTransactions(txJson?.data?.transactions || []);
  } catch (err) {
    console.warn("Failed to load overview data:", err);
  }
}

/**
 * Render platform preview tiles on overview
 */
export function renderOverviewPlatforms(merchants) {
  const container = document.getElementById("overviewPlatformsGrid");
  if (!container) return;

  if (!merchants || merchants.length === 0) {
    container.innerHTML = `<div class="loading-state">No client platforms registered yet.</div>`;
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
              <div class="platform-sub-desc">${m.description || "Integrated client platform"}</div>
            </div>
          </div>
          ${statusBadge}
        </div>

        <div class="platform-stats-row">
          <div>
            <div class="stat-item-label">Transactions</div>
            <div class="stat-item-val">${metrics.totalTransactions || 0}</div>
          </div>
          <div>
            <div class="stat-item-label">Processed</div>
            <div class="stat-item-val">${formatCurrency(metrics.successfulAmount || 0)}</div>
          </div>
          <div>
            <div class="stat-item-label">Success Rate</div>
            <div class="stat-item-val text-success">${metrics.successRate || "0%"}</div>
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
        </div>
      </div>
    `;
    })
    .join("");
}

/**
 * Render recent transactions table on overview
 */
export function renderOverviewRecentTransactions(txList) {
  const tbody = document.getElementById("overviewRecentTransactionsTable");
  if (!tbody) return;

  if (!txList || txList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No transactions found</td></tr>`;
    return;
  }

  tbody.innerHTML = txList
    .map((tx, idx) => {
      const platformName = tx.merchant?.name || (tx.merchant ? "Platform" : "Direct / Legacy");
      const fromAcc = tx.fromAccount?._id || tx.fromAccount || "acc_cust_001";
      const toAcc = tx.toAccount?._id || tx.toAccount || "acc_settle";

      return `
      <tr>
        <td style="text-align: center;"><span class="text-muted" style="font-size: 11.5px; font-weight: 600;">${idx + 1}</span></td>
        <td><code title="${tx._id}">${tx._id}</code></td>
        <td><strong>${platformName}</strong></td>
        <td style="text-align: right;"><strong>${formatCurrency(tx.amount)}</strong></td>
        <td><code class="text-muted" title="${fromAcc}">${fromAcc}</code></td>
        <td><code class="text-muted" title="${toAcc}">${toAcc}</code></td>
        <td style="text-align: center;">${getStatusBadge(tx.status)}</td>
        <td><span class="text-muted">${formatDate(tx.createdAt)}</span></td>
      </tr>
    `;
    })
    .join("");
}
