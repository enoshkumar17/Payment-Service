/**
 * PayPlatform Formatting & Display Helpers
 * Minimal FinTech aesthetic matching Credor Bank reference: Pure white background, vibrant brand badges.
 */

/**
 * Format number into Indian Rupee currency string
 * @param {number|string} amount
 * @returns {string} e.g. "₹1,250.00"
 */
export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Format ISO date string into readable short format
 * @param {string} dateStr
 * @returns {string} e.g. "28 Oct, 12:45 pm"
 */
export function formatDate(dateStr) {
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

/**
 * Render standard state badge HTML
 * @param {string} status
 * @returns {string} HTML span
 */
export function getStatusBadge(status) {
  const s = (status || "PENDING").toUpperCase();
  let badgeClass = "badge-pending";
  if (s === "SUCCEEDED") badgeClass = "badge-succeeded";
  else if (s === "FAILED") badgeClass = "badge-failed";
  else if (s === "PROCESSING") badgeClass = "badge-processing";
  else if (s === "REVERSED") badgeClass = "badge-reversed";

  return `<span class="badge ${badgeClass}">${s}</span>`;
}

/**
 * Render merchant platform lively icon box
 * @param {string} name
 * @returns {string} HTML div
 */
export function getPlatformIcon(name) {
  const n = (name || "").toLowerCase();
  let emoji = "⚡";
  if (n.includes("movie")) emoji = "🎬";
  else if (n.includes("food")) emoji = "🍔";
  else if (n.includes("event")) emoji = "🎟️";

  return `<div class="platform-icon">${emoji}</div>`;
}

/**
 * Basic HTML escaping helper for safe text interpolation
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
