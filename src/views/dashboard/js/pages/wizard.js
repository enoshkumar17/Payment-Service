/**
 * PayPlatform Platform Registration Wizard Module
 * 4-step guided modal for registering a new client platform and issuing an API key.
 */

import { API_BASE_URL } from "../config.js";
import { apiFetch } from "../api.js";
import { loadMerchantsData } from "./merchants.js";
import { loadOverviewData } from "./overview.js";

export function initWizard() {
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

    const origins = document.getElementById("wizardAllowedOrigins");
    const ips = document.getElementById("wizardIpRestrictions");
    if (origins) origins.value = "";
    if (ips) ips.value = "";

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

  document.querySelectorAll('.checkbox-card input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      e.target.closest(".checkbox-card")?.classList.toggle("checked", e.target.checked);
    });
  });

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
    wizardData.platformName = document.getElementById("wizardPlatformName")?.value.trim() || "";
    wizardData.orgName = document.getElementById("wizardOrgName")?.value.trim() || "";
    wizardData.platformType = document.getElementById("wizardPlatformType")?.value || "";
    wizardData.description = document.getElementById("wizardDesc")?.value.trim() || "";
    wizardData.websiteUrl = document.getElementById("wizardWebsite")?.value.trim() || "";

    wizardData.webhookUrl = document.getElementById("wizardWebhookUrl")?.value.trim() || "";
    wizardData.webhookEvents = Array.from(document.querySelectorAll('input[name="wizardWebhookEvents"]:checked')).map((cb) => cb.value);
    wizardData.capabilities = Array.from(document.querySelectorAll('input[name="wizardCapabilities"]:checked')).map((cb) => cb.value);

    wizardData.allowedOrigins = document.getElementById("wizardAllowedOrigins")?.value.trim() || "";
    wizardData.ipRestrictions = document.getElementById("wizardIpRestrictions")?.value.trim() || "";
  }

  function populateStep4Review() {
    syncWizardDataFromInputs();

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

    const revOrigins = document.getElementById("revAllowedOrigins");
    const revIps = document.getElementById("revIpRestrictions");

    if (revOrigins) revOrigins.textContent = wizardData.allowedOrigins || "Any (*)";
    if (revIps) revIps.textContent = wizardData.ipRestrictions || "None";
  }

  function updateWizardUI() {
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

  document.getElementById("wizardPrevBtn")?.addEventListener("click", () => {
    if (currentWizardStep === 1) {
      createModal.classList.remove("open");
    } else {
      goToWizardStep(currentWizardStep - 1);
    }
  });

  document.getElementById("wizardNextBtn")?.addEventListener("click", async () => {
    if (currentWizardStep < 4) {
      goToWizardStep(currentWizardStep + 1);
    } else {
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
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.innerHTML = "Create Platform &amp; Generate Key";
      }
      if (prevBtn) prevBtn.disabled = false;
    }
  }

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

  document.getElementById("wizardViewApiBtn")?.addEventListener("click", () => {
    createModal.classList.remove("open");
    window.location.hash = "#api";
  });

  document.getElementById("wizardGoToPlatformBtn")?.addEventListener("click", () => {
    createModal.classList.remove("open");
    window.location.hash = "#merchants";
  });

  const openBtns = [document.getElementById("openCreateMerchantBtn"), document.getElementById("openCreateMerchantBtn2")];
  openBtns.forEach((btn) => {
    btn?.addEventListener("click", () => {
      resetWizard();
      createModal.classList.add("open");
    });
  });

  document.getElementById("closeCreateMerchantBtn")?.addEventListener("click", () => {
    createModal.classList.remove("open");
  });
}
