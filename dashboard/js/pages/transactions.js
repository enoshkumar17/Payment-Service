/**
 * PayPlatform Transactions Page Module
 * Ledger table, filtering, pagination, and transaction inspection drawer.
 */

import { API_BASE_URL, state } from "../config.js";
import { apiFetch } from "../api.js";
import { formatCurrency, formatDate, getStatusBadge } from "../formatters.js";

/**
 * Fetch and render paginated/filtered transactions
 */
export async function loadTransactionsData() {
  const { merchantId, status, search } = state.currentTxFilter;
  let url = `${API_BASE_URL}/api/v1/transactions?page=${state.currentTxPage}&limit=${state.txLimit}`;
  if (merchantId) url += `&merchantId=${encodeURIComponent(merchantId)}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await apiFetch(url);
    const json = await res.json();
    const data = json?.data || {};
    const txList = data.transactions || [];
    const total = data.totalCount || 0;
    const totalPages = data.totalPages || 1;

    renderTransactionsTable(txList);

    const infoEl = document.getElementById("paginationInfo");
    const pageEl = document.getElementById("pageIndicator");
    const prevBtn = document.getElementById("prevPageBtn");
    const nextBtn = document.getElementById("nextPageBtn");

    if (infoEl) infoEl.textContent = `Showing ${txList.length} of ${total} transactions`;
    if (pageEl) pageEl.textContent = `Page ${state.currentTxPage} of ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.currentTxPage <= 1;
    if (nextBtn) nextBtn.disabled = state.currentTxPage >= totalPages;

    populateMerchantFilterDropdown();
  } catch (err) {
    console.warn("Failed to load transactions:", err);
  }
}

/**
 * Render transactions table rows
 */
export function renderTransactionsTable(txList) {
  const tbody = document.getElementById("transactionsFullTable");
  if (!tbody) return;

  if (!txList || txList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No transactions yet</td></tr>`;
    return;
  }

  tbody.innerHTML = txList
    .map((tx) => {
      const platformName = tx.merchant?.name || (tx.merchant ? "Platform" : "Direct / Legacy");
      const fromAcc = tx.fromAccount?._id || tx.fromAccount || "acc_cust_001";
      const toAcc = tx.toAccount?._id || tx.toAccount || "acc_settle";

      return `
      <tr>
        <td><code title="${tx._id}">${tx._id}</code></td>
        <td><strong>${platformName}</strong></td>
        <td style="text-align: right;"><strong>${formatCurrency(tx.amount)}</strong></td>
        <td><code class="text-muted" title="${fromAcc}">${fromAcc}</code></td>
        <td><code class="text-muted" title="${toAcc}">${toAcc}</code></td>
        <td style="text-align: center;">${getStatusBadge(tx.status)}</td>
        <td><span class="text-muted">${formatDate(tx.createdAt)}</span></td>
        <td><code class="text-muted" title="${tx.idempotencyKey || "N/A"}">${tx.idempotencyKey || "N/A"}</code></td>
        <td style="text-align: center;">
          <button class="btn btn-xs btn-secondary" onclick="window.viewTxDetails('${tx._id}')">
            Inspect
          </button>
        </td>
      </tr>
    `;
    })
    .join("");

  state.currentTxCache = txList;
}

/**
 * Populate platform selector in filter bar
 */
export function populateMerchantFilterDropdown() {
  const select = document.getElementById("txMerchantFilter");
  if (!select) return;

  const currentVal = select.value || state.currentTxFilter.merchantId || "";
  select.innerHTML = '<option value="">All Platforms</option>';

  let selectionStillExists = false;
  state.currentMerchantList.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m._id;
    opt.textContent = m.name;
    if (m._id === currentVal) {
      opt.selected = true;
      selectionStillExists = true;
    }
    select.appendChild(opt);
  });

  if (selectionStillExists) {
    select.value = currentVal;
  } else {
    select.value = "";
    state.currentTxFilter.merchantId = "";
  }
}

/**
 * Open transaction inspect drawer modal
 */
export function viewTxDetails(txId) {
  const tx = (state.currentTxCache || []).find((t) => t._id === txId);
  if (!tx) return;

  const platformName = tx.merchant?.name || (tx.merchant ? "Platform" : "Direct / Legacy");

  const contentEl = document.getElementById("txDetailContent");
  if (contentEl) {
    contentEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <div style="font-size: 11px; color: var(--text-muted);">TRANSACTION ID</div>
          <code style="font-size: 14px; font-weight: 700;">${tx._id}</code>
        </div>
        <div>${getStatusBadge(tx.status)}</div>
      </div>

      <div class="metrics-grid" style="grid-template-columns: 1fr 1fr; margin-bottom: 16px;">
        <div class="metric-card">
          <div class="metric-label">Amount</div>
          <div class="metric-value text-primary">${formatCurrency(tx.amount)}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Initiating Platform</div>
          <div class="metric-value" style="font-size: 16px; margin-top: 10px;">${platformName}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px; font-size: 13px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <span class="text-muted">Source Account (Debited):</span>
          <code>${tx.fromAccount?._id || "acc_cust_001"}</code>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <span class="text-muted">Destination Account (Credited):</span>
          <code>${tx.toAccount?._id || "acc_mch_001"}</code>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <span class="text-muted">Idempotency Key:</span>
          <code>${tx.idempotencyKey || "N/A"}</code>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
          <span class="text-muted">Created Timestamp:</span>
          <span>${formatDate(tx.createdAt)}</span>
        </div>
      </div>

      <div style="background-color: var(--bg-surface-subtle); padding: 12px; border-radius: 6px;">
        <div style="font-size: 11.5px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">State Machine Lifecycle</div>
        <div style="font-size: 12px; color: var(--text-muted);">
          PENDING &rarr; PROCESSING &rarr; <strong>${tx.status}</strong>
        </div>
      </div>
    `;
  }

  document.getElementById("txDetailModal")?.classList.add("open");
}

/**
 * Initialize event bindings for transactions page
 */
export function initTransactionsPage() {
  document.getElementById("txSearchInput")?.addEventListener("input", (e) => {
    state.currentTxFilter.search = e.target.value.trim();
    state.currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("txMerchantFilter")?.addEventListener("change", (e) => {
    state.currentTxFilter.merchantId = e.target.value;
    state.currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("txStatusFilter")?.addEventListener("change", (e) => {
    state.currentTxFilter.status = e.target.value;
    state.currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("txClearFiltersBtn")?.addEventListener("click", () => {
    const sInput = document.getElementById("txSearchInput");
    const mSelect = document.getElementById("txMerchantFilter");
    const stSelect = document.getElementById("txStatusFilter");
    if (sInput) sInput.value = "";
    if (mSelect) mSelect.value = "";
    if (stSelect) stSelect.value = "";
    state.currentTxFilter = { merchantId: "", status: "", search: "" };
    state.currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("prevPageBtn")?.addEventListener("click", () => {
    if (state.currentTxPage > 1) {
      state.currentTxPage--;
      loadTransactionsData();
    }
  });

  document.getElementById("nextPageBtn")?.addEventListener("click", () => {
    state.currentTxPage++;
    loadTransactionsData();
  });

  document.getElementById("closeTxDetailBtn")?.addEventListener("click", () => {
    document.getElementById("txDetailModal")?.classList.remove("open");
  });
  document.getElementById("closeTxDetailFooterBtn")?.addEventListener("click", () => {
    document.getElementById("txDetailModal")?.classList.remove("open");
  });
}
