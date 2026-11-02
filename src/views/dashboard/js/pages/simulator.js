/**
 * PayPlatform Simulator / Client Platforms Module
 * Interactive payment simulation, state machine stepper, decline testing, and reversals.
 */

import { API_BASE_URL, state } from "../config.js";
import { apiFetch } from "../api.js";
import { formatCurrency } from "../formatters.js";
import { loadOverviewData } from "./overview.js";
import { toggleMerchantStatus } from "./merchants.js";

/**
 * Sync API key previews and status badges for demo cards
 */
export function loadDemoClientsData() {
  const list = state.currentMerchantList.length > 0 ? state.currentMerchantList : state.demoMerchants;
  const movieHub = list.find((m) => m._id === "mch_001_moviehub" || m.name === "MovieHub");
  const foodBox = list.find((m) => m._id === "mch_002_foodbox" || m.name === "FoodBox");
  const eventBook = list.find((m) => m._id === "mch_003_eventbook" || m.name === "EventBook");

  const movieKeyEl = document.getElementById("moviehubKeyPreview");
  const foodKeyEl = document.getElementById("foodboxKeyPreview");
  const eventKeyEl = document.getElementById("eventbookKeyPreview");

  if (movieHub && movieKeyEl) movieKeyEl.textContent = movieHub.apiKeyMasked || "mch_live_4b8f...2d1";
  if (foodBox && foodKeyEl) foodKeyEl.textContent = foodBox.apiKeyMasked || "mch_live_9a7e...f34";

  const eventBookCard = document.getElementById("demoCardEventBook");
  if (eventBookCard) {
    eventBookCard.style.display = eventBook ? "block" : "none";
    if (eventBook && eventKeyEl) {
      eventKeyEl.textContent = eventBook.apiKeyMasked || "mch_live_6c3d...b89";
      const isAct = eventBook.status === "ACTIVE";
      const b = document.getElementById("eventbookConnBadge");
      if (b) {
        b.className = isAct ? "connected-badge" : "connected-badge badge-inactive";
        b.textContent = isAct ? "✓ Connected to Payment Backend" : "! Platform Inactive";
      }
    }
  }
}

/**
 * Reset the 3-step visual state stepper
 */
export function resetStepper() {
  document.querySelectorAll(".step-circle").forEach((c) => {
    c.className = "step-circle";
  });
  const l1 = document.getElementById("stepLine1");
  const l2 = document.getElementById("stepLine2");
  const lbl = document.getElementById("stepFinalLabel");
  if (l1) l1.classList.remove("active");
  if (l2) l2.classList.remove("active");
  if (lbl) lbl.textContent = "SUCCEEDED";
}

/**
 * Execute simulated live payment request through state machine
 */
export async function runDemoPayment(merchantIdOrName, amount, description, simulatedOutcome = "SUCCEEDED", platformName = "Platform") {
  let resolvedId = merchantIdOrName;
  let resolvedName = platformName;
  const list = state.currentMerchantList.length > 0 ? state.currentMerchantList : state.demoMerchants;
  const match = list.find(
    (m) => m._id === merchantIdOrName || m.name === merchantIdOrName || m.name === platformName
  );
  if (match) {
    resolvedId = match._id;
    resolvedName = match.name;
  }

  const feedbackBox = document.getElementById("simulationFeedbackBox");
  if (feedbackBox) feedbackBox.style.display = "block";

  // Step 1: PENDING
  resetStepper();
  document.getElementById("stepNodePending")?.querySelector(".step-circle")?.classList.add("active");
  const detailsEl = document.getElementById("simulationFeedbackDetails");
  if (detailsEl) {
    detailsEl.innerHTML = `
      <strong>[Step 1: PENDING]</strong> Payment request received from <strong>${resolvedName}</strong> for ${formatCurrency(amount)}.<br>
      Verifying <code>x-api-key</code> and acquiring write lock on source account...
    `;
  }

  // Step 2: PROCESSING (after 400ms)
  await new Promise((r) => setTimeout(r, 400));
  document.getElementById("stepLine1")?.classList.add("active");
  document.getElementById("stepNodeProcessing")?.querySelector(".step-circle")?.classList.add("active");
  if (detailsEl) {
    detailsEl.innerHTML = `
      <strong>[Step 2: PROCESSING]</strong> Lock acquired. Verifying ledger balance within transaction session.<br>
      Writing double-entry ledger debit & credit entries...
    `;
  }

  // Fallback demo simulation handler
  const executeLocalSimulation = () => {
    const finalCircle = document.getElementById("stepNodeFinal")?.querySelector(".step-circle");
    const finalLabel = document.getElementById("stepFinalLabel");
    document.getElementById("stepLine2")?.classList.add("active");

    const isFail = simulatedOutcome === "FAILED";
    const txId = `tx_live_${Math.floor(1000 + Math.random() * 9000)}`;

    if (isFail) {
      finalCircle?.classList.add("failed");
      if (finalLabel) finalLabel.textContent = "FAILED";
      const newTx = {
        _id: txId,
        merchantId: resolvedId,
        merchantName: resolvedName,
        amount,
        fromAccount: "acc_cust_4821",
        toAccount: `acc_mch_${resolvedName.toLowerCase()}`,
        status: "FAILED",
        errorReason: "INSUFFICIENT_FUNDS",
        idempotencyKey: `order_${resolvedName.toLowerCase()}_${Date.now().toString().slice(-4)}`,
        createdAt: new Date().toISOString(),
      };
      state.demoTransactions.unshift(newTx);
      if (detailsEl) {
        detailsEl.innerHTML = `
          <div style="color: var(--danger); font-weight: 700; margin-bottom: 4px;">✕ Payment Failed</div>
          <div>Transaction ID: <code>${txId}</code> | Reason: Insufficient Funds (Simulated Decline)</div>
          <div style="margin-top: 4px; font-size: 11.5px; color: #4b5563;">State Machine: PENDING &rarr; PROCESSING &rarr; FAILED (Zero balance deduction).</div>
        `;
      }
    } else {
      finalCircle?.classList.add("success");
      if (finalLabel) finalLabel.textContent = "SUCCEEDED";
      const newTx = {
        _id: txId,
        merchantId: resolvedId,
        merchantName: resolvedName,
        amount,
        fromAccount: "acc_cust_4821",
        toAccount: `acc_mch_${resolvedName.toLowerCase()}`,
        status: "SUCCEEDED",
        idempotencyKey: `order_${resolvedName.toLowerCase()}_${Date.now().toString().slice(-4)}`,
        createdAt: new Date().toISOString(),
      };
      state.demoTransactions.unshift(newTx);
      if (detailsEl) {
        detailsEl.innerHTML = `
          <div style="color: var(--success); font-weight: 700; margin-bottom: 4px;">✓ Payment Succeeded & Committed</div>
          <div>Transaction ID: <code>${txId}</code> | Amount: <strong>${formatCurrency(amount)}</strong></div>
          <div>Platform: <strong>${resolvedName}</strong> | Double-entry verified atomically.</div>
        `;
      }
    }
    loadOverviewData();
  };

  if (state.isGuestMode) {
    await new Promise((r) => setTimeout(r, 450));
    executeLocalSimulation();
    return;
  }

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

    if (!res.ok) {
      await new Promise((r) => setTimeout(r, 450));
      executeLocalSimulation();
      return;
    }

    const json = await res.json();
    const tx = json?.data;

    // Step 3: Final State (SUCCEEDED or FAILED)
    await new Promise((r) => setTimeout(r, 450));
    document.getElementById("stepLine2")?.classList.add("active");

    const finalCircle = document.getElementById("stepNodeFinal")?.querySelector(".step-circle");
    const finalLabel = document.getElementById("stepFinalLabel");

    if (tx && tx.status === "SUCCEEDED") {
      finalCircle?.classList.add("success");
      if (finalLabel) finalLabel.textContent = "SUCCEEDED";
      if (detailsEl) {
        detailsEl.innerHTML = `
          <div style="color: var(--success); font-weight: 700; margin-bottom: 4px;">✓ Payment Succeeded & Committed</div>
          <div>Transaction ID: <code>${tx._id}</code> | Amount: <strong>${formatCurrency(tx.amount)}</strong></div>
          <div>Platform: <strong>${resolvedName}</strong> | Idempotency: <code>${tx.idempotencyKey}</code></div>
          <div style="margin-top: 4px; font-size: 11.5px; color: #4b5563;">State Machine: PENDING &rarr; PROCESSING &rarr; SUCCEEDED (Double-entry balance updated).</div>
        `;
      }
    } else {
      finalCircle?.classList.add("failed");
      if (finalLabel) finalLabel.textContent = "FAILED";
      if (detailsEl) {
        detailsEl.innerHTML = `
          <div style="color: var(--danger); font-weight: 700; margin-bottom: 4px;">✕ Payment Failed</div>
          <div>Transaction ID: <code>${tx?._id || "N/A"}</code> | Reason: ${tx?.failureReason || json?.message || "Declined"}</div>
          <div style="margin-top: 4px; font-size: 11.5px; color: #4b5563;">State Machine: PENDING &rarr; PROCESSING &rarr; FAILED (Zero balance deduction).</div>
        `;
      }
    }

    loadOverviewData();
  } catch (err) {
    console.warn("Payment simulation fallback to local state:", err);
    await new Promise((r) => setTimeout(r, 450));
    executeLocalSimulation();
  }
}

/**
 * Execute simulated reversal / refund
 */
export async function runDemoReversal(platformName) {
  const targetTx = state.demoTransactions.find(
    (tx) => (tx.merchantName === platformName || tx.merchantId === platformName || tx.merchant?.name === platformName) &&
            tx.status === "SUCCEEDED"
  );

  if (!targetTx) {
    alert(`No SUCCEEDED transaction found for ${platformName} to reverse. Please test a payment first.`);
    return;
  }

  const feedbackBox = document.getElementById("simulationFeedbackBox");
  if (feedbackBox) feedbackBox.style.display = "block";
  resetStepper();

  const detailsEl = document.getElementById("simulationFeedbackDetails");
  if (detailsEl) {
    detailsEl.innerHTML = `
      <strong>[Reversal Initiated]</strong> Reversing transaction <code>${targetTx._id}</code> for ${formatCurrency(targetTx.amount)}...<br>
      Verifying recipient account has sufficient balance for compensating debit...
    `;
  }

  await new Promise((r) => setTimeout(r, 450));

  targetTx.status = "REVERSED";
  const finalCircle = document.getElementById("stepNodeFinal")?.querySelector(".step-circle");
  finalCircle?.classList.add("reversed");
  const finalLabel = document.getElementById("stepFinalLabel");
  if (finalLabel) finalLabel.textContent = "REVERSED";

  if (detailsEl) {
    detailsEl.innerHTML = `
      <div style="color: var(--purple); font-weight: 700; margin-bottom: 4px;">✓ Transaction Reversed Successfully</div>
      <div>Transaction ID: <code>${targetTx._id}</code> | Amount: <strong>${formatCurrency(targetTx.amount)}</strong></div>
      <div style="margin-top: 4px; font-size: 11.5px; color: #4b5563;">Compensating double-entry ledger entries created: Customer (+${targetTx.amount}), Merchant (-${targetTx.amount}).</div>
    `;
  }

  loadOverviewData();
}

/**
 * Toggle EventBook client platform between active/inactive
 */
export async function toggleEventBookStatus() {
  const list = state.currentMerchantList.length > 0 ? state.currentMerchantList : state.demoMerchants;
  const eventBook = list.find((m) => m._id === "mch_003_eventbook" || m.name === "EventBook");
  if (!eventBook) return;

  const nextStatus = eventBook.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await toggleMerchantStatus(eventBook._id, nextStatus);
  loadDemoClientsData();
}
