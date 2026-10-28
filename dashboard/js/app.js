/**
 * PayPlatform Infrastructure Dashboard Application
 * Vanilla ES Module handling SPA routing, data fetching, and demo simulations.
 */

// Backend Base URL
const API_BASE_URL = "https://payment-service-pl7q.onrender.com";

// Global State
let currentMerchantList = [];
let currentTxPage = 1;
const txLimit = 10;
let currentTxFilter = {
  merchantId: "",
  status: "",
  search: "",
};

// Authentication State & Helpers
let currentUser = null;

function showAuthScreen() {
  const authScreen = document.getElementById("authScreen");
  if (authScreen) authScreen.style.display = "flex";
}

function hideAuthScreen() {
  const authScreen = document.getElementById("authScreen");
  if (authScreen) authScreen.style.display = "none";
}

function updateUserUI(user) {
  const userPill = document.getElementById("userPill");
  const logoutBtn = document.getElementById("logoutBtn");
  if (userPill) {
    const displayName = user?.email || user?.name || "Admin";
    userPill.textContent = `${displayName} ▾`;
    userPill.title = `Signed in as ${user?.email || user?.name}`;
  }
  if (logoutBtn) {
    logoutBtn.style.display = "inline-block";
    logoutBtn.onclick = async () => {
      try {
        await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
          method: "POST",
          credentials: "include",
        });
      } catch (err) {}
      window.location.reload();
    };
  }
}

// Server Wake Watcher for Render Free-Tier Cold Starts
let wakeTimeout = null;

function showWakingBanner() {
  const el = document.getElementById("serverWakingBanner");
  if (el) el.style.display = "flex";
  const dot = document.querySelector(".top-status-strip .status-dot");
  const text = document.querySelector(".top-status-strip .status-text");
  if (dot) dot.style.background = "#f59e0b";
  if (text) text.textContent = "Waking Cloud Server...";
}

function hideWakingBanner() {
  if (wakeTimeout) {
    clearTimeout(wakeTimeout);
    wakeTimeout = null;
  }
  const el = document.getElementById("serverWakingBanner");
  if (el) el.style.display = "none";
  const dot = document.querySelector(".top-status-strip .status-dot");
  const text = document.querySelector(".top-status-strip .status-text");
  if (dot) dot.style.background = "";
  if (text) text.textContent = "Production Cloud";
}

function startWakeWatcher() {
  if (!wakeTimeout) {
    wakeTimeout = setTimeout(() => {
      showWakingBanner();
    }, 1500);
  }
}

async function checkAuth() {
  startWakeWatcher();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      credentials: "include",
    });
    hideWakingBanner();
    if (res.ok) {
      const data = await res.json();
      currentUser = data?.data;
      hideAuthScreen();
      updateUserUI(currentUser);
      return true;
    } else {
      showAuthScreen();
      return false;
    }
  } catch (err) {
    hideWakingBanner();
    console.warn("Auth check error or offline mode:", err);
    showAuthScreen();
    return false;
  }
}

// Centralized Authenticated Fetch Wrapper
async function apiFetch(url, options = {}) {
  const defaultHeaders = {
    "Content-Type": "application/json",
  };
  const headers = {
    ...defaultHeaders,
    ...(options.headers || {}),
  };

  // Do not send Content-Type on GET requests without a body
  if (!options.body && (!options.method || options.method === "GET")) {
    delete headers["Content-Type"];
  }

  const mergedOptions = {
    ...options,
    credentials: "include",
    headers,
  };

  startWakeWatcher();
  try {
    const response = await fetch(url, mergedOptions);
    hideWakingBanner();
    if (response.status === 401) {
      showAuthScreen();
    }
    return response;
  } catch (error) {
    hideWakingBanner();
    console.error(`Network error requesting ${url}:`, error);
    throw error;
  }
}

// Formatting Helpers
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN");
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "N/A";
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day} ${month}, ${hours}:${minutes} ${ampm}`;
}

function getStatusBadge(status) {
  const s = (status || "PENDING").toUpperCase();
  let badgeClass = "badge-pending";
  if (s === "SUCCEEDED") badgeClass = "badge-succeeded";
  else if (s === "FAILED") badgeClass = "badge-failed";
  else if (s === "PROCESSING") badgeClass = "badge-processing";
  else if (s === "REVERSED") badgeClass = "badge-reversed";

  return `<span class="badge ${badgeClass}">${s}</span>`;
}

function getPlatformIcon(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("movie")) {
    return `
      <div class="platform-icon platform-icon-moviehub">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
          <line x1="7" y1="2" x2="7" y2="22"></line>
          <line x1="17" y1="2" x2="17" y2="22"></line>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="2" y1="7" x2="7" y2="7"></line>
          <line x1="2" y1="17" x2="7" y2="17"></line>
          <line x1="17" y1="17" x2="22" y2="17"></line>
          <line x1="17" y1="7" x2="22" y2="7"></line>
        </svg>
      </div>`;
  } else if (n.includes("food")) {
    return `
      <div class="platform-icon platform-icon-foodbox">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"></path>
          <path d="M15 2v18"></path>
          <path d="M6 2v6a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V2"></path>
          <path d="M8 10v10"></path>
        </svg>
      </div>`;
  } else if (n.includes("event")) {
    return `
      <div class="platform-icon platform-icon-eventbook">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="16" rx="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>`;
  } else {
    return `
      <div class="platform-icon platform-icon-default">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
          <polyline points="2 17 12 22 22 17"></polyline>
          <polyline points="2 12 12 17 22 12"></polyline>
        </svg>
      </div>`;
  }
}

// -----------------------------------------------------------------------------
// 1. Navigation & Routing
// -----------------------------------------------------------------------------
function initRouter() {
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

    // Update active nav items
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-page") === pageId);
    });

    // Update active section
    document.querySelectorAll(".page-section").forEach((sec) => {
      sec.classList.toggle("active", sec.id === `page-${pageId}`);
    });

    // Update top title
    document.getElementById("topPageTitle").textContent = pageTitles[pageId].title;
    document.getElementById("topPageSubtitle").textContent = pageTitles[pageId].sub;

    // Load data for specific page
    if (pageId === "overview") loadOverviewData();
    else if (pageId === "transactions") loadTransactionsData();
    else if (pageId === "merchants") loadMerchantsData();
    else if (pageId === "demo-clients") loadDemoClientsData();
  }

  // Handle hash changes
  window.addEventListener("hashchange", () => {
    const pageId = window.location.hash.replace("#", "") || "overview";
    navigateTo(pageId);
  });

  // Handle sidebar nav clicks
  document.querySelectorAll("[data-page]").forEach((el) => {
    el.addEventListener("click", (e) => {
      const targetPage = el.getAttribute("data-page");
      window.location.hash = `#${targetPage}`;
    });
  });

  // Initial route
  const initialPage = window.location.hash.replace("#", "") || "overview";
  navigateTo(initialPage);
}

// -----------------------------------------------------------------------------
// 2. Data Loading: Overview Page
// -----------------------------------------------------------------------------
async function loadOverviewData() {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/statistics`);
    const json = await res.json();
    const stats = json?.data || {};

    // Update metric cards
    document.getElementById("statTotalVolume").textContent = formatCurrency(stats.totalSuccessfullyProcessedAmount);
    document.getElementById("statTotalTransactions").textContent = stats.totalTransactions || 0;
    document.getElementById("statSucceeded").textContent = stats.succeededCount || 0;
    document.getElementById("statFailed").textContent = stats.failedCount || 0;
    document.getElementById("statPendingProcessing").textContent = (stats.pendingCount || 0) + (stats.processingCount || 0);
    document.getElementById("statReversed").textContent = stats.reversedCount || 0;

    // Load and render platforms summary
    const mRes = await apiFetch(`${API_BASE_URL}/api/v1/merchants`);
    const mJson = await mRes.json();
    currentMerchantList = mJson?.data || [];
    renderOverviewPlatforms(currentMerchantList);
    populateMerchantFilterDropdown();

    // Load recent 5 transactions
    const txRes = await apiFetch(`${API_BASE_URL}/api/v1/transactions?limit=5`);
    const txJson = await txRes.json();
    renderOverviewRecentTransactions(txJson?.data?.transactions || []);
  } catch (err) {
    console.error("Failed to load overview data:", err);
  }
}

function renderOverviewPlatforms(merchants) {
  const container = document.getElementById("overviewPlatformsGrid");
  if (!container) return;

  if (merchants.length === 0) {
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

function renderOverviewRecentTransactions(txList) {
  const tbody = document.getElementById("overviewRecentTransactionsTable");
  if (!tbody) return;

  if (txList.length === 0) {
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

// -----------------------------------------------------------------------------
// 3. Data Loading: Transactions Page
// -----------------------------------------------------------------------------
async function loadTransactionsData() {
  const { merchantId, status, search } = currentTxFilter;
  let url = `${API_BASE_URL}/api/v1/transactions?page=${currentTxPage}&limit=${txLimit}`;
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

    // Update pagination
    document.getElementById("paginationInfo").textContent = `Showing ${txList.length} of ${total} transactions`;
    document.getElementById("pageIndicator").textContent = `Page ${currentTxPage} of ${totalPages}`;
    document.getElementById("prevPageBtn").disabled = currentTxPage <= 1;
    document.getElementById("nextPageBtn").disabled = currentTxPage >= totalPages;

    // Populate merchant dropdown if needed
    populateMerchantFilterDropdown();
  } catch (err) {
    console.error("Failed to load transactions:", err);
  }
}

function renderTransactionsTable(txList) {
  const tbody = document.getElementById("transactionsFullTable");
  if (!tbody) return;

  if (txList.length === 0) {
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

  // Store txList globally for quick detail lookup
  window._currentTxCache = txList;
}

function populateMerchantFilterDropdown() {
  const select = document.getElementById("txMerchantFilter");
  if (!select) return;

  const currentVal = select.value || currentTxFilter.merchantId || "";

  // Reset to default first option: "All Platforms"
  select.innerHTML = '<option value="">All Platforms</option>';

  let selectionStillExists = false;
  currentMerchantList.forEach((m) => {
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
    currentTxFilter.merchantId = "";
  }
}

// -----------------------------------------------------------------------------
// 4. Data Loading: Merchants / Platforms Page
// -----------------------------------------------------------------------------
async function loadMerchantsData() {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants`);
    const json = await res.json();
    currentMerchantList = json?.data || [];
    renderMerchantsPage(currentMerchantList);
    populateMerchantFilterDropdown();
  } catch (err) {
    console.error("Failed to load merchants:", err);
  }
}

function renderMerchantsPage(merchants) {
  const container = document.getElementById("merchantsDetailedGrid");
  if (!container) return;

  if (merchants.length === 0) {
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

// -----------------------------------------------------------------------------
// 5. Demo Client Playground Data Loading
// -----------------------------------------------------------------------------
function loadDemoClientsData() {
  // Sync API key previews from loaded merchant list
  const movieHub = currentMerchantList.find((m) => m._id === "mch_001_moviehub" || m.name === "MovieHub");
  const foodBox = currentMerchantList.find((m) => m._id === "mch_002_foodbox" || m.name === "FoodBox");
  const eventBook = currentMerchantList.find((m) => m._id === "mch_003_eventbook" || m.name === "EventBook");

  if (movieHub && document.getElementById("moviehubKeyPreview")) {
    document.getElementById("moviehubKeyPreview").textContent = movieHub.apiKeyMasked || "mch_live_...xxxx";
  }
  if (foodBox && document.getElementById("foodboxKeyPreview")) {
    document.getElementById("foodboxKeyPreview").textContent = foodBox.apiKeyMasked || "mch_live_...xxxx";
  }

  const eventBookCard = document.getElementById("demoCardEventBook");
  if (eventBookCard) {
    eventBookCard.style.display = eventBook ? "block" : "none";
    if (eventBook && document.getElementById("eventbookKeyPreview")) {
      document.getElementById("eventbookKeyPreview").textContent = eventBook.apiKeyMasked || "mch_live_...xxxx";
      const isAct = eventBook.status === "ACTIVE";
      const b = document.getElementById("eventbookConnBadge");
      if (b) {
        b.className = isAct ? "connected-badge" : "connected-badge badge-inactive";
        b.textContent = isAct ? "✓ Connected to Payment Backend" : "! Platform Inactive";
      }
    }
  }
}

// -----------------------------------------------------------------------------
// 6. Global Window Handlers for Demo Actions & Modals
// -----------------------------------------------------------------------------
window.runDemoPayment = async function (merchantIdOrName, amount, description, simulatedOutcome = "SUCCEEDED", platformName = "Platform") {
  // Resolve merchant platform
  let resolvedId = merchantIdOrName;
  let resolvedName = platformName;
  const match = currentMerchantList.find(
    (m) => m._id === merchantIdOrName || m.name === merchantIdOrName || m.name === platformName
  );
  if (match) {
    resolvedId = match._id;
    resolvedName = match.name;
  }

  const feedbackBox = document.getElementById("simulationFeedbackBox");
  feedbackBox.style.display = "block";

  // Step 1: PENDING
  resetStepper();
  document.getElementById("stepNodePending").querySelector(".step-circle").classList.add("active");
  document.getElementById("simulationFeedbackDetails").innerHTML = `
    <strong>[Step 1: PENDING]</strong> Payment request received from <strong>${resolvedName}</strong> for ${formatCurrency(amount)}.<br>
    Verifying <code>x-api-key</code> and acquiring write lock on source account...
  `;

  // Step 2: PROCESSING (after 400ms)
  await new Promise((r) => setTimeout(r, 400));
  document.getElementById("stepLine1").classList.add("active");
  document.getElementById("stepNodeProcessing").querySelector(".step-circle").classList.add("active");
  document.getElementById("simulationFeedbackDetails").innerHTML = `
    <strong>[Step 2: PROCESSING]</strong> Lock acquired. Verifying ledger balance within transaction session.<br>
    Writing double-entry ledger debit & credit entries...
  `;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/demo-checkout`, {
      method: "POST",
      body: JSON.stringify({
        merchantId: resolvedId,
        amount,
        description,
        simulatedOutcome,
      }),
    });

    const json = await res.json();
    const tx = json?.data;

    // Step 3: SUCCEEDED or FAILED (after 450ms)
    await new Promise((r) => setTimeout(r, 450));
    document.getElementById("stepLine2").classList.add("active");

    const finalCircle = document.getElementById("stepNodeFinal").querySelector(".step-circle");
    const finalLabel = document.getElementById("stepFinalLabel");

    if (tx && tx.status === "SUCCEEDED") {
      finalCircle.classList.add("success");
      finalLabel.textContent = "SUCCEEDED";
      document.getElementById("simulationFeedbackDetails").innerHTML = `
        <div style="color: var(--success); font-weight: 700; margin-bottom: 4px;">✓ Payment Succeeded & Committed</div>
        <div>Transaction ID: <code>${tx._id}</code> | Amount: <strong>${formatCurrency(tx.amount)}</strong></div>
        <div>Platform: <strong>${resolvedName}</strong> | Idempotency: <code>${tx.idempotencyKey}</code></div>
        <div style="margin-top: 4px; font-size: 11.5px; color: var(--text-muted);">State Machine: PENDING &rarr; PROCESSING &rarr; SUCCEEDED (Double-entry balance updated).</div>
      `;
    } else {
      finalCircle.classList.add("failed");
      finalLabel.textContent = "FAILED";
      document.getElementById("simulationFeedbackDetails").innerHTML = `
        <div style="color: var(--danger); font-weight: 700; margin-bottom: 4px;">✕ Payment Failed</div>
        <div>Transaction ID: <code>${tx?._id || "N/A"}</code> | Reason: ${tx?.failureReason || json?.message || "Declined"}</div>
        <div style="margin-top: 4px; font-size: 11.5px; color: var(--text-muted);">State Machine: PENDING &rarr; PROCESSING &rarr; FAILED (Zero balance deduction).</div>
      `;
    }

    // Refresh background data
    loadOverviewData();
  } catch (err) {
    console.error("Payment test error:", err);
  }
};

window.runDemoReversal = async function (platformName) {
  // Find latest succeeded transaction for this platform
  const txRes = await apiFetch(`${API_BASE_URL}/api/v1/transactions?limit=20`);
  const txJson = await txRes.json();
  const txList = txJson?.data?.transactions || [];
  const targetTx = txList.find(
    (tx) => (tx.merchant?.name === platformName || tx.merchant?._id === platformName) && tx.status === "SUCCEEDED"
  );

  if (!targetTx) {
    alert(`No SUCCEEDED transaction found for ${platformName} to reverse. Please test a payment first.`);
    return;
  }

  const feedbackBox = document.getElementById("simulationFeedbackBox");
  feedbackBox.style.display = "block";
  resetStepper();

  document.getElementById("simulationFeedbackDetails").innerHTML = `
    <strong>[Reversal Initiated]</strong> Reversing transaction <code>${targetTx._id}</code> for ${formatCurrency(targetTx.amount)}...<br>
    Verifying recipient account has sufficient balance for compensating debit...
  `;

  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/demo-reverse`, {
      method: "POST",
      body: JSON.stringify({ transactionId: targetTx._id }),
    });

    const json = await res.json();
    const reversed = json?.data;

    await new Promise((r) => setTimeout(r, 400));
    const finalCircle = document.getElementById("stepNodeFinal").querySelector(".step-circle");
    finalCircle.classList.add("reversed");
    document.getElementById("stepFinalLabel").textContent = "REVERSED";

    document.getElementById("simulationFeedbackDetails").innerHTML = `
      <div style="color: var(--purple); font-weight: 700; margin-bottom: 4px;">✓ Transaction Reversed Successfully</div>
      <div>Transaction ID: <code>${reversed._id}</code> | Amount: <strong>${formatCurrency(reversed.amount)}</strong></div>
      <div style="margin-top: 4px; font-size: 11.5px; color: var(--text-muted);">Compensating double-entry ledger entries created: Customer (+${reversed.amount}), Merchant (-${reversed.amount}).</div>
    `;

    loadOverviewData();
  } catch (err) {
    console.error("Reversal error:", err);
  }
};

window.toggleEventBookStatus = async function () {
  const eventBook = currentMerchantList.find((m) => m._id === "mch_003_eventbook" || m.name === "EventBook");
  if (!eventBook) return;

  const nextStatus = eventBook.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await window.toggleMerchantStatus(eventBook._id, nextStatus);
  loadDemoClientsData();
};

function resetStepper() {
  document.querySelectorAll(".step-circle").forEach((c) => {
    c.className = "step-circle";
  });
  document.getElementById("stepLine1").classList.remove("active");
  document.getElementById("stepLine2").classList.remove("active");
  document.getElementById("stepFinalLabel").textContent = "SUCCEEDED";
}

// -----------------------------------------------------------------------------
// 7. Merchant Management: Create, Toggle, Rotate
// -----------------------------------------------------------------------------
window.toggleMerchantStatus = async function (merchantId, newStatus) {
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
};

window.rotateApiKey = async function (merchantId, merchantName) {
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
};

window.viewMerchantDetails = async function (merchantId) {
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${merchantId}/statistics`);
    const json = await res.json();
    const data = json?.data;
    if (!data) return;

    const m = data.merchant;
    const isAct = m.status === "ACTIVE";
    document.getElementById("merchantDetailModalTitle").textContent = `${m.name} — Platform Statistics`;

    document.getElementById("merchantDetailModalContent").innerHTML = `
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

    document.getElementById("merchantDetailModal").classList.add("open");
  } catch (err) {
    console.error("Failed to view merchant details:", err);
  }
};

window.openDeleteMerchantModal = async function (merchantId) {
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
      // CASE A: 0 Transactions -> Allow deletion with exact name confirmation
      document.getElementById("deleteTargetMerchantName").textContent = m.name;
      document.getElementById("deleteTargetMerchantStatus").innerHTML =
        m.status === "ACTIVE"
          ? '<span class="badge badge-active">ACTIVE</span>'
          : '<span class="badge badge-inactive">INACTIVE</span>';
      document.getElementById("deleteTargetMerchantKey").textContent = m.apiKeyMasked || "mch_live_...xxxx";
      document.getElementById("deleteConfirmMatchTarget").textContent = m.name;

      const confirmInput = document.getElementById("deleteConfirmInput");
      const confirmBtn = document.getElementById("confirmDeleteMerchantBtn");
      confirmInput.value = "";
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Permanently Delete Merchant";

      window._pendingDeleteTarget = {
        id: m._id,
        name: m.name,
      };

      document.getElementById("deleteMerchantModal").classList.add("open");
      setTimeout(() => confirmInput.focus(), 100);
    } else {
      // CASE B: > 0 Transactions -> Audit policy blocks deletion
      document.getElementById("blockedTargetMerchantName").textContent = m.name;
      document.getElementById("blockedTargetTxCount").textContent = `${totalTx} transaction(s)`;
      document.getElementById("blockedTargetSuccessTx").textContent = `${data.succeededCount || 0} succeeded`;
      document.getElementById("blockedTargetVolume").textContent = formatCurrency(data.totalSuccessfullyProcessedAmount || 0);
      document.getElementById("blockedTargetStatus").innerHTML =
        m.status === "ACTIVE"
          ? '<span class="badge badge-active">ACTIVE</span>'
          : '<span class="badge badge-inactive">INACTIVE</span>';

      const deactBtn = document.getElementById("blockedDeactivateBtn");
      if (m.status === "INACTIVE") {
        deactBtn.textContent = "Platform Already Inactive";
        deactBtn.disabled = true;
      } else {
        deactBtn.textContent = "Deactivate Platform";
        deactBtn.disabled = false;
        deactBtn.onclick = async () => {
          await window.toggleMerchantStatus(m._id, "INACTIVE");
          document.getElementById("deleteBlockedModal").classList.remove("open");
        };
      }

      document.getElementById("deleteBlockedModal").classList.add("open");
    }
  } catch (err) {
    console.error("Failed to prepare deletion modal:", err);
    alert("Could not load platform details. Please try again.");
  }
};

window.viewTxDetails = function (txId) {
  const tx = (window._currentTxCache || []).find((t) => t._id === txId);
  if (!tx) return;

  const platformName = tx.merchant?.name || (tx.merchant ? "Platform" : "Direct / Legacy");
  const isSucceeded = tx.status === "SUCCEEDED";

  document.getElementById("txDetailContent").innerHTML = `
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

  document.getElementById("txDetailModal").classList.add("open");
};

// -----------------------------------------------------------------------------
// 8. Event Listeners & Modals Binding
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  await checkAuth();
  initRouter();

  // Refresh Button
  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    loadOverviewData();
    loadTransactionsData();
    loadMerchantsData();
  });

  // ---------------------------------------------------------------------------
  // Register Platform 4-Step Wizard Controller
  // ---------------------------------------------------------------------------
  const createModal = document.getElementById("createMerchantModal");
  let currentWizardStep = 1;
  let wizardData = {
    platformName: "",
    orgName: "",
    platformType: "",
    description: "",
    websiteUrl: "",
    environment: "Sandbox",
    webhookUrl: "",
    webhookEvents: ["payment.succeeded", "payment.failed"],
    capabilities: ["Create Payments", "Check Transaction Status", "View Transaction History"],
    allowedOrigins: "",
    ipRestrictions: "",
  };

  function resetWizard() {
    currentWizardStep = 1;
    wizardData = {
      platformName: "",
      orgName: "",
      platformType: "",
      description: "",
      websiteUrl: "",
      environment: "Sandbox",
      webhookUrl: "",
      webhookEvents: ["payment.succeeded", "payment.failed"],
      capabilities: ["Create Payments", "Check Transaction Status", "View Transaction History"],
      allowedOrigins: "",
      ipRestrictions: "",
    };

    // Reset Step 1 inputs
    const pName = document.getElementById("wizardPlatformName");
    const orgName = document.getElementById("wizardOrgName");
    const pType = document.getElementById("wizardPlatformType");
    const pDesc = document.getElementById("wizardDesc");
    const pWeb = document.getElementById("wizardWebsite");
    if (pName) pName.value = "";
    if (orgName) orgName.value = "";
    if (pType) pType.value = "";
    if (pDesc) pDesc.value = "";
    if (pWeb) pWeb.value = "";

    // Reset Step 2 inputs
    setWizardEnvironment("Sandbox");
    const whUrl = document.getElementById("wizardWebhookUrl");
    if (whUrl) whUrl.value = "";
    document.querySelectorAll('input[name="wizardWebhookEvents"]').forEach((cb) => {
      cb.checked = cb.value === "payment.succeeded" || cb.value === "payment.failed";
      cb.closest(".checkbox-card")?.classList.toggle("checked", cb.checked);
    });
    document.querySelectorAll('input[name="wizardCapabilities"]').forEach((cb) => {
      cb.checked = true;
      cb.closest(".checkbox-card")?.classList.toggle("checked", cb.checked);
    });

    // Reset Step 3 inputs
    const origins = document.getElementById("wizardAllowedOrigins");
    const ips = document.getElementById("wizardIpRestrictions");
    if (origins) origins.value = "";
    if (ips) ips.value = "";

    // Show panels
    document.getElementById("wizardSuccessPanel")?.classList.remove("active");
    const stepper = document.getElementById("wizardStepper");
    const footer = document.getElementById("wizardModalFooter");
    if (stepper) stepper.style.display = "flex";
    if (footer) footer.style.display = "flex";

    const nextBtn = document.getElementById("wizardNextBtn");
    const prevBtn = document.getElementById("wizardPrevBtn");
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.innerHTML = "Next: Integration &rarr;";
    }
    if (prevBtn) {
      prevBtn.disabled = false;
      prevBtn.textContent = "Cancel";
    }

    updateWizardUI();
  }

  function setWizardEnvironment(env) {
    wizardData.environment = env;
    const sBoxBtn = document.getElementById("envBtnSandbox");
    const liveBtn = document.getElementById("envBtnLive");
    if (env === "Sandbox") {
      sBoxBtn?.classList.add("active");
      liveBtn?.classList.remove("active");
    } else {
      sBoxBtn?.classList.remove("active");
      liveBtn?.classList.add("active");
    }
  }

  document.getElementById("envBtnSandbox")?.addEventListener("click", () => setWizardEnvironment("Sandbox"));
  document.getElementById("envBtnLive")?.addEventListener("click", () => setWizardEnvironment("Live"));

  // Checkbox cards styling reactivity
  document.querySelectorAll('.checkbox-card input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      e.target.closest(".checkbox-card")?.classList.toggle("checked", e.target.checked);
    });
  });

  // Step 1 input validation check
  function isStep1Valid() {
    const pName = document.getElementById("wizardPlatformName")?.value.trim() || "";
    const orgName = document.getElementById("wizardOrgName")?.value.trim() || "";
    const pType = document.getElementById("wizardPlatformType")?.value.trim() || "";
    const pDesc = document.getElementById("wizardDesc")?.value.trim() || "";
    return pName.length > 0 && orgName.length > 0 && pType.length > 0 && pDesc.length > 0;
  }

  function checkStep1Validation() {
    if (currentWizardStep === 1) {
      const nextBtn = document.getElementById("wizardNextBtn");
      if (nextBtn) {
        nextBtn.disabled = !isStep1Valid();
      }
    }
  }

  ["wizardPlatformName", "wizardOrgName", "wizardPlatformType", "wizardDesc"].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener("input", checkStep1Validation);
    el?.addEventListener("change", checkStep1Validation);
  });

  function syncWizardDataFromInputs() {
    // Step 1
    wizardData.platformName = document.getElementById("wizardPlatformName")?.value.trim() || "";
    wizardData.orgName = document.getElementById("wizardOrgName")?.value.trim() || "";
    wizardData.platformType = document.getElementById("wizardPlatformType")?.value || "";
    wizardData.description = document.getElementById("wizardDesc")?.value.trim() || "";
    wizardData.websiteUrl = document.getElementById("wizardWebsite")?.value.trim() || "";

    // Step 2
    wizardData.webhookUrl = document.getElementById("wizardWebhookUrl")?.value.trim() || "";
    wizardData.webhookEvents = Array.from(document.querySelectorAll('input[name="wizardWebhookEvents"]:checked')).map((cb) => cb.value);
    wizardData.capabilities = Array.from(document.querySelectorAll('input[name="wizardCapabilities"]:checked')).map((cb) => cb.value);

    // Step 3
    wizardData.allowedOrigins = document.getElementById("wizardAllowedOrigins")?.value.trim() || "";
    wizardData.ipRestrictions = document.getElementById("wizardIpRestrictions")?.value.trim() || "";
  }

  function populateStep4Review() {
    syncWizardDataFromInputs();

    // Section 1: Platform & Organization
    const revName = document.getElementById("revPlatformName");
    const revOrg = document.getElementById("revOrgName");
    const revType = document.getElementById("revPlatformType");
    const revDesc = document.getElementById("revDesc");
    const revWeb = document.getElementById("revWebsite");

    if (revName) revName.textContent = wizardData.platformName || "—";
    if (revOrg) revOrg.textContent = wizardData.orgName || "—";
    if (revType) revType.textContent = wizardData.platformType || "—";
    if (revDesc) revDesc.textContent = wizardData.description || "—";
    if (revWeb) revWeb.textContent = wizardData.websiteUrl || "None specified";

    // Section 2: Integration Configuration
    const revEnv = document.getElementById("revEnvironment");
    const revWh = document.getElementById("revWebhookUrl");
    const revEvents = document.getElementById("revWebhookEvents");
    const revCaps = document.getElementById("revCapabilities");

    if (revEnv) revEnv.textContent = wizardData.environment;
    if (revWh) revWh.textContent = wizardData.webhookUrl || "Not configured";

    if (revEvents) {
      if (wizardData.webhookEvents.length === 0) {
        revEvents.innerHTML = '<span class="review-tag text-muted">None selected</span>';
      } else {
        revEvents.innerHTML = wizardData.webhookEvents.map((ev) => `<span class="review-tag">${ev}</span>`).join("");
      }
    }

    if (revCaps) {
      if (wizardData.capabilities.length === 0) {
        revCaps.innerHTML = '<span class="review-tag text-muted">None selected</span>';
      } else {
        revCaps.innerHTML = wizardData.capabilities.map((cap) => `<span class="review-tag">${cap}</span>`).join("");
      }
    }

    // Section 3: Security & Access
    const revOrigins = document.getElementById("revAllowedOrigins");
    const revIps = document.getElementById("revIpRestrictions");

    if (revOrigins) revOrigins.textContent = wizardData.allowedOrigins || "Any (*)";
    if (revIps) revIps.textContent = wizardData.ipRestrictions || "None";
  }

  function updateWizardUI() {
    // 1. Update stepper indicators and panels
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`stepIndicator${i}`);
      const panelEl = document.getElementById(`wizardPanel${i}`);
      if (stepEl) {
        stepEl.classList.toggle("active", i === currentWizardStep);
        stepEl.classList.toggle("completed", i < currentWizardStep);
      }
      if (panelEl) {
        panelEl.classList.toggle("active", i === currentWizardStep);
      }
    }

    // 2. Update footer buttons
    const prevBtn = document.getElementById("wizardPrevBtn");
    const nextBtn = document.getElementById("wizardNextBtn");

    if (currentWizardStep === 1) {
      if (prevBtn) prevBtn.textContent = "Cancel";
      if (nextBtn) {
        nextBtn.innerHTML = "Next: Integration &rarr;";
        nextBtn.disabled = !isStep1Valid();
      }
    } else if (currentWizardStep === 2) {
      if (prevBtn) prevBtn.textContent = "← Back";
      if (nextBtn) {
        nextBtn.innerHTML = "Next: Security &rarr;";
        nextBtn.disabled = false;
      }
    } else if (currentWizardStep === 3) {
      if (prevBtn) prevBtn.textContent = "← Back";
      if (nextBtn) {
        nextBtn.innerHTML = "Next: Review &rarr;";
        nextBtn.disabled = false;
      }
    } else if (currentWizardStep === 4) {
      populateStep4Review();
      if (prevBtn) prevBtn.textContent = "← Back";
      if (nextBtn) {
        nextBtn.innerHTML = "Create Platform &amp; Generate Key";
        nextBtn.disabled = false;
      }
    }
  }

  function goToWizardStep(step) {
    if (step >= 1 && step <= 4) {
      syncWizardDataFromInputs();
      currentWizardStep = step;
      updateWizardUI();
    }
  }

  // Click on stepper or edit button
  document.querySelectorAll(".wizard-step").forEach((stepEl) => {
    stepEl.addEventListener("click", () => {
      const targetStep = parseInt(stepEl.getAttribute("data-step"), 10);
      if (targetStep < currentWizardStep || isStep1Valid()) {
        goToWizardStep(targetStep);
      }
    });
  });

  document.querySelectorAll(".review-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetStep = parseInt(btn.getAttribute("data-goto"), 10);
      if (targetStep) goToWizardStep(targetStep);
    });
  });

  // Prev / Cancel button
  document.getElementById("wizardPrevBtn")?.addEventListener("click", () => {
    if (currentWizardStep === 1) {
      createModal.classList.remove("open");
    } else {
      goToWizardStep(currentWizardStep - 1);
    }
  });

  // Next / Submit button
  document.getElementById("wizardNextBtn")?.addEventListener("click", async () => {
    if (currentWizardStep < 4) {
      goToWizardStep(currentWizardStep + 1);
    } else {
      // Final Submit on Step 4
      await submitPlatformRegistration();
    }
  });

  async function submitPlatformRegistration() {
    syncWizardDataFromInputs();
    const nextBtn = document.getElementById("wizardNextBtn");
    const prevBtn = document.getElementById("wizardPrevBtn");

    if (!wizardData.platformName) {
      goToWizardStep(1);
      return;
    }

    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.innerHTML = "Registering...";
    }
    if (prevBtn) prevBtn.disabled = true;

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants`, {
        method: "POST",
        body: JSON.stringify({
          name: wizardData.platformName,
          description: wizardData.description,
          businessName: wizardData.orgName,
          platformType: wizardData.platformType,
          websiteUrl: wizardData.websiteUrl,
          environment: wizardData.environment,
          webhookUrl: wizardData.webhookUrl,
          webhookEvents: wizardData.webhookEvents,
          capabilities: wizardData.capabilities,
          allowedOrigins: wizardData.allowedOrigins,
          ipRestrictions: wizardData.ipRestrictions,
        }),
      });

      const json = await res.json();
      const rawKey = json?.data?.apiKey;

      if (rawKey) {
        // Show Success Panel
        const stepper = document.getElementById("wizardStepper");
        const footer = document.getElementById("wizardModalFooter");
        if (stepper) stepper.style.display = "none";
        if (footer) footer.style.display = "none";
        for (let i = 1; i <= 4; i++) {
          document.getElementById(`wizardPanel${i}`)?.classList.remove("active");
        }

        const successPanel = document.getElementById("wizardSuccessPanel");
        const keyDisplay = document.getElementById("wizardSuccessKey");
        if (keyDisplay) keyDisplay.textContent = rawKey;
        if (successPanel) successPanel.classList.add("active");

        // Refresh background data
        loadMerchantsData();
        loadOverviewData();
      } else {
        alert(json?.message || "Failed to create platform. Please check your inputs.");
        if (nextBtn) {
          nextBtn.disabled = false;
          nextBtn.innerHTML = "Create Platform &amp; Generate Key";
        }
        if (prevBtn) prevBtn.disabled = false;
      }
    } catch (err) {
      console.error("Create merchant failed:", err);
      alert("Error creating platform. Please try again.");
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.innerHTML = "Create Platform &amp; Generate Key";
      }
      if (prevBtn) prevBtn.disabled = false;
    }
  }

  // Copy Key Button in Success Panel
  document.getElementById("wizardCopyKeyBtn")?.addEventListener("click", () => {
    const key = document.getElementById("wizardSuccessKey")?.textContent;
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
      const btn = document.getElementById("wizardCopyKeyBtn");
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = orig;
        }, 2000);
      }
    });
  });

  // Success Screen Action Buttons:
  // "View Integration Guide"
  document.getElementById("wizardViewApiBtn")?.addEventListener("click", () => {
    createModal.classList.remove("open");
    // Switch to API / Integration tab
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
    const apiNavItem = document.querySelector('[data-page="api"]');
    const apiSection = document.getElementById("page-api");
    if (apiNavItem) apiNavItem.classList.add("active");
    if (apiSection) apiSection.classList.add("active");
    const pageTitle = document.getElementById("pageTitle");
    const pageSubtitle = document.getElementById("pageSubtitle");
    if (pageTitle) pageTitle.textContent = "API & Integration Guide";
    if (pageSubtitle) pageSubtitle.textContent = "How client platforms authenticate and communicate with this backend";
  });

  // "Go to Platform"
  document.getElementById("wizardGoToPlatformBtn")?.addEventListener("click", () => {
    createModal.classList.remove("open");
    // Switch to Merchants / Platforms tab
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
    const merchantsNavItem = document.querySelector('[data-page="merchants"]');
    const merchantsSection = document.getElementById("page-merchants");
    if (merchantsNavItem) merchantsNavItem.classList.add("active");
    if (merchantsSection) merchantsSection.classList.add("active");
    const pageTitle = document.getElementById("pageTitle");
    const pageSubtitle = document.getElementById("pageSubtitle");
    if (pageTitle) pageTitle.textContent = "Platforms Using Your Backend";
    if (pageSubtitle) pageSubtitle.textContent = "Registered client applications authorized with API keys";
    loadMerchantsData();
  });

  // Open Modal Buttons
  const openBtns = [document.getElementById("openCreateMerchantBtn"), document.getElementById("openCreateMerchantBtn2")];
  openBtns.forEach((btn) => {
    btn?.addEventListener("click", () => {
      resetWizard();
      createModal.classList.add("open");
    });
  });

  // Close Modal Button
  document.getElementById("closeCreateMerchantBtn")?.addEventListener("click", () => createModal.classList.remove("open"));

  // Close Detail Modals
  document.getElementById("closeTxDetailBtn")?.addEventListener("click", () => document.getElementById("txDetailModal").classList.remove("open"));
  document.getElementById("closeTxDetailFooterBtn")?.addEventListener("click", () => document.getElementById("txDetailModal").classList.remove("open"));
  document.getElementById("closeMerchantDetailBtn")?.addEventListener("click", () => document.getElementById("merchantDetailModal").classList.remove("open"));
  document.getElementById("closeMerchantDetailFooterBtn")?.addEventListener("click", () => document.getElementById("merchantDetailModal").classList.remove("open"));

  // Transactions Filter Bindings
  document.getElementById("txSearchInput")?.addEventListener("input", (e) => {
    currentTxFilter.search = e.target.value.trim();
    currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("txMerchantFilter")?.addEventListener("change", (e) => {
    currentTxFilter.merchantId = e.target.value;
    currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("txStatusFilter")?.addEventListener("change", (e) => {
    currentTxFilter.status = e.target.value;
    currentTxPage = 1;
    loadTransactionsData();
  });

  document.getElementById("txClearFiltersBtn")?.addEventListener("click", () => {
    document.getElementById("txSearchInput").value = "";
    document.getElementById("txMerchantFilter").value = "";
    document.getElementById("txStatusFilter").value = "";
    currentTxFilter = { merchantId: "", status: "", search: "" };
    currentTxPage = 1;
    loadTransactionsData();
  });

  // Delete Merchant Modals Event Listeners
  const deleteModal = document.getElementById("deleteMerchantModal");
  const blockedModal = document.getElementById("deleteBlockedModal");

  const closeDeleteModal = () => {
    deleteModal?.classList.remove("open");
    window._pendingDeleteTarget = null;
    const confirmInput = document.getElementById("deleteConfirmInput");
    if (confirmInput) confirmInput.value = "";
  };
  const closeBlockedModal = () => {
    blockedModal?.classList.remove("open");
  };

  document.getElementById("closeDeleteMerchantBtn")?.addEventListener("click", closeDeleteModal);
  document.getElementById("cancelDeleteMerchantBtn")?.addEventListener("click", closeDeleteModal);
  document.getElementById("closeDeleteBlockedBtn")?.addEventListener("click", closeBlockedModal);
  document.getElementById("cancelDeleteBlockedBtn")?.addEventListener("click", closeBlockedModal);

  // Exact name input check to enable delete button
  document.getElementById("deleteConfirmInput")?.addEventListener("input", (e) => {
    const inputVal = e.target.value.trim();
    const targetName = window._pendingDeleteTarget?.name;
    const confirmBtn = document.getElementById("confirmDeleteMerchantBtn");
    if (confirmBtn) {
      confirmBtn.disabled = !targetName || inputVal !== targetName;
    }
  });

  // Confirm delete button action
  document.getElementById("confirmDeleteMerchantBtn")?.addEventListener("click", async () => {
    if (!window._pendingDeleteTarget) return;
    const { id, name } = window._pendingDeleteTarget;
    const confirmInput = document.getElementById("deleteConfirmInput");
    if (confirmInput?.value.trim() !== name) return;

    const confirmBtn = document.getElementById("confirmDeleteMerchantBtn");
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Deleting...";

    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/merchants/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (res.ok && json.success) {
        closeDeleteModal();
        alert(`Platform "${name}" was permanently deleted.`);
        loadMerchantsData();
        loadOverviewData();
        loadDemoClientsData();
      } else if (res.status === 409) {
        closeDeleteModal();
        alert(json.message || "Deletion conflict: This merchant has transactions and cannot be deleted.");
        loadMerchantsData();
        loadOverviewData();
      } else {
        alert(json.message || "Failed to delete merchant");
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Permanently Delete Merchant";
      }
    } catch (err) {
      console.error("Delete merchant error:", err);
      alert("An error occurred while deleting the merchant.");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Permanently Delete Merchant";
    }
  });

  // Pagination Controls
  document.getElementById("prevPageBtn")?.addEventListener("click", () => {
    if (currentTxPage > 1) {
      currentTxPage--;
      loadTransactionsData();
    }
  });

  document.getElementById("nextPageBtn")?.addEventListener("click", () => {
    currentTxPage++;
    loadTransactionsData();
  });
});
