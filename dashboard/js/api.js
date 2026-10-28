/**
 * PayPlatform Network & Authentication Service
 * Handles authenticated API calls, cold-start waking detection, and session state.
 */

import { API_BASE_URL, state } from "./config.js";

let wakeTimeout = null;

export function showWakingBanner() {
  const el = document.getElementById("serverWakingBanner");
  if (el) el.style.display = "flex";
  const dot = document.querySelector(".top-status-strip .status-dot");
  const text = document.querySelector(".top-status-strip .status-text");
  if (dot) dot.style.background = "#f59e0b";
  if (text) text.textContent = "Waking Cloud Server...";
}

export function hideWakingBanner() {
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

export function startWakeWatcher() {
  if (!wakeTimeout) {
    wakeTimeout = setTimeout(() => {
      showWakingBanner();
    }, 1500);
  }
}

export function showAuthScreen() {
  if (state.isGuestMode) return; // Do not show if guest preview is enabled
  const authScreen = document.getElementById("authScreen");
  if (authScreen) authScreen.style.display = "flex";
}

export function hideAuthScreen() {
  const authScreen = document.getElementById("authScreen");
  if (authScreen) authScreen.style.display = "none";
}

export function updateUserUI(user) {
  const userPill = document.getElementById("userPill");
  const logoutBtn = document.getElementById("logoutBtn");
  if (userPill) {
    if (state.isGuestMode) {
      userPill.textContent = "Recruiter Preview ▾";
      userPill.title = "Viewing in Guest / Recruiter Mode";
    } else {
      const displayName = user?.email || user?.name || "Admin";
      userPill.textContent = `${displayName} ▾`;
      userPill.title = `Signed in as ${user?.email || user?.name}`;
    }
  }
  if (logoutBtn) {
    logoutBtn.style.display = "inline-block";
    logoutBtn.onclick = async () => {
      if (state.isGuestMode) {
        state.isGuestMode = false;
        showAuthScreen();
        return;
      }
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

/**
 * Robust fetch wrapper handling credentials, content-types, and waking watcher
 */
export async function apiFetch(url, options = {}) {
  const defaultHeaders = {
    "Content-Type": "application/json",
  };
  const headers = {
    ...defaultHeaders,
    ...(options.headers || {}),
  };

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
    if (response.status === 401 && !state.isGuestMode) {
      showAuthScreen();
    }
    return response;
  } catch (error) {
    hideWakingBanner();
    console.warn(`Network error requesting ${url}:`, error);
    throw error;
  }
}

/**
 * Verify authentication or check session
 */
export async function checkAuth() {
  if (state.isGuestMode) {
    hideAuthScreen();
    updateUserUI(null);
    return true;
  }

  startWakeWatcher();
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      credentials: "include",
    });
    hideWakingBanner();
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data?.data;
      hideAuthScreen();
      updateUserUI(state.currentUser);
      return true;
    } else {
      showAuthScreen();
      return false;
    }
  } catch (err) {
    hideWakingBanner();
    console.warn("Auth check error, presenting auth overlay:", err);
    showAuthScreen();
    return false;
  }
}

/**
 * Enable Recruiter / Demo Preview Mode
 */
export function enableGuestMode() {
  state.isGuestMode = true;
  hideAuthScreen();
  updateUserUI(null);
}
