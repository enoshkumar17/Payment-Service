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
  if (state.isGuestMode) {
    applyDemoTransactions();
    return;
  }

  const { merchantId, status, search } = state.currentTxFilter;
  let url = `${API_BASE_URL}/api/v1/transactions?page=${state.currentTxPage}&limit=${state.txLimit}`;
  if (merchantId) url += `&merchantId=${encodeURIComponent(merchantId)}`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const res = await apiFetch(url);
    const json = await res.json();
    if (!res.ok || !json?.data?.transactions) {
      applyDemoTransactions();
      return;
    }
    const data = json.data;
    const txList = data.transactions || [];
    const total = data.totalCount || 0;
    const totalPages = data.totalPages || 1;

    renderTransactionsTable(txList);
    updatePaginationUI(txList.length, total, totalPages);
    populateMerchantFilterDropdown();
  } catch (err) {
    console.warn("Using demo client transactions fallback:", err);
    applyDemoTransactions();
  }
}

/**
 * Filter, search, and paginate transactions in Demo Client mode
 */
function applyDemoTransactions() {
  const { merchantId, status, search } = state.currentTxFilter;
  let list = [...state.demoTransactions];

  if (merchantId) {
    list = list.filter((t) => t.merchantId === merchantId || t.merchantName === merchantId);
  }
  if (status) {
    list = list.filter((t) => t.status === status);
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter(
      (t) =>
        (t._id && t._id.toLowerCase().includes(s)) ||
        (t.idempotencyKey && t.idempotencyKey.toLowerCase().includes(s)) ||
        (t.merchantName && t.merchantName.toLowerCase().includes(s))
    );
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / state.txLimit));
  const start = (state.currentTxPage - 1) * state.txLimit;
  const paginated = list.slice(start, start + state.txLimit);

  renderTransactionsTable(paginated);
  updatePaginationUI(paginated.length, total, totalPages);
  populateMerchantFilterDropdown();
}

function updatePaginationUI(displayedCount, total, totalPages) {
  const infoEl = document.getElementById("paginationInfo");
  const pageEl = document.getElementById("pageIndicator");
  const prevBtn = document.getElementById("prevPageBtn");
  const nextBtn = document.getElementById("nextPageBtn");

  if (infoEl) infoEl.textContent = `Showing ${displayedCount} of ${total} transactions`;
  if (pageEl) pageEl.textContent = `Page ${state.currentTxPage} of ${totalPages}`;
  if (prevBtn) prevBtn.disabled = state.currentTxPage <= 1;
  if (nextBtn) nextBtn.disabled = state.currentTxPage >= totalPages;
}

/**
 * Render transactions table rows
 */
export function renderTransactionsTable(txList) {
  const tbody = document.getElementById("transactionsFullTable");
  if (!tbody) return;

  if (!txList || txList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No transactions found matching filters</td></tr>`;
    return;
  }

  tbody.innerHTML = txList
    .map((tx) => {
      const platformName = tx.merchantName || tx.merchant?.name || (tx.merchant ? "Platform" : "MovieHub");
      const fromAcc = tx.fromAccount?._id || tx.fromAccount || "acc_cust_001";
      const toAcc = tx.toAccount?._id || tx.toAccount || "acc_settle";

      return `
      <tr>
        <td><code title="${tx._id}">${tx._id}</code></td>
        <td><strong>${platformName}</strong></td>
        <td style="text-align: right;"><strong>${formatCurrency(tx.amount)}</strong></td>
        <td><code title="${fromAcc}">${fromAcc}</code></td>
        <td><code title="${toAcc}">${toAcc}</code></td>
        <td style="text-align: center;">${getStatusBadge(tx.status)}</td>
        <td><span style="color: #4b5563; font-size: 12px;">${formatDate(tx.createdAt)}</span></td>
        <td><code title="${tx.idempotencyKey || "N/A"}">${tx.idempotencyKey || "N/A"}</code></td>
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

  const list = state.currentMerchantList.length > 0 ? state.currentMerchantList : state.demoMerchants;
  let selectionStillExists = false;
  list.forEach((m) => {
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
  const tx = (state.currentTxCache || []).find((t) => t._id === txId) ||
             state.demoTransactions.find((t) => t._id === txId);
  if (!tx) return;

  const platformName = tx.merchantName || tx.merchant?.name || "MovieHub";

  const contentEl = document.getElementById("txDetailContent");
  if (contentEl) {
    contentEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div>
          <div style="font-size: 11px; font-weight: 700; color: #111111; text-transform: uppercase;">TRANSACTION ID</div>
          <code style="font-size: 14px; font-weight: 700; color: #111111;">${tx._id}</code>
        </div>
        <div>${getStatusBadge(tx.status)}</div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <div style="background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #4b5563;">AMOUNT</div>
          <div style="font-size: 18px; font-weight: 800; color: #111111; margin-top: 2px;">${formatCurrency(tx.amount)}</div>
        </div>
        <div style="background: #fafafa; border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px;">
          <div style="font-size: 11px; font-weight: 600; color: #4b5563;">INITIATING PLATFORM</div>
          <div style="font-size: 16px; font-weight: 700; color: #111111; margin-top: 4px;">${platformName}</div>
        </div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 10px; font-size: 13px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px;">
          <span style="color: #4b5563;">Source Account (Debited):</span>
          <code>${tx.fromAccount?._id || tx.fromAccount || "acc_cust_001"}</code>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px;">
          <span style="color: #4b5563;">Destination Account (Credited):</span>
          <code>${tx.toAccount?._id || tx.toAccount || "acc_settle"}</code>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px;">
          <span style="color: #4b5563;">Idempotency Key:</span>
          <code>${tx.idempotencyKey || "N/A"}</code>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #f0f0f0; padding-bottom: 6px;">
          <span style="color: #4b5563;">Created Timestamp:</span>
          <span style="font-weight: 600; color: #111111;">${formatDate(tx.createdAt)}</span>
        </div>
      </div>

      <div style="background-color: #fafafa; border: 1px solid #e5e5e5; padding: 12px; border-radius: 6px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #111111; margin-bottom: 4px;">State Machine Execution</div>
        <div style="font-size: 12.5px; color: #111111;">
          PENDING &rarr; PROCESSING &rarr; <strong>${tx.status}</strong> (Atomic zero-sum double-entry)
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
