// Small helpers for money, dates, text and feedback. No app state lives here.

// ---------- Money ----------

const rupiahFormat = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/** Format a number as Rupiah, e.g. 1500000 -> "Rp 1.500.000". */
export function money(amount) {
  return rupiahFormat.format(Math.round(amount || 0)).replace(/ /g, " ");
}

/** Read digits from user input, e.g. "1.500.000" -> 1500000. */
export function parseAmount(text) {
  return Number(String(text).replace(/[^\d]/g, "")) || 0;
}

/** Show an amount with thousand separators while typing, e.g. 1500000 -> "1.500.000". */
export function groupDigits(amount) {
  return amount ? Number(amount).toLocaleString("id-ID") : "";
}

export function sum(items, pick = (x) => x) {
  return items.reduce((total, item) => total + pick(item), 0);
}

// ---------- Dates (months are "YYYY-MM" strings, days are "YYYY-MM-DD") ----------

export const pad2 = (n) => String(n).padStart(2, "0");

export const now = new Date();
export const todayISO = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
export const thisMonth = todayISO.slice(0, 7);

function splitMonth(month) {
  return month.split("-").map(Number);
}

/** Move a month forward or back, e.g. addMonths("2026-01", -1) -> "2025-12". */
export function addMonths(month, count) {
  let [year, m] = splitMonth(month);
  m += count;
  year += Math.floor((m - 1) / 12);
  m = (((m - 1) % 12) + 12) % 12 + 1;
  return `${year}-${pad2(m)}`;
}

/** Number of months from `from` to `to`, e.g. monthsBetween("2026-01", "2026-03") -> 2. */
export function monthsBetween(from, to) {
  const [y1, m1] = splitMonth(from);
  const [y2, m2] = splitMonth(to);
  return (y2 - y1) * 12 + (m2 - m1);
}

/** "November 2026", or "Nov 2026" when short. */
export function monthLabel(month, short = false) {
  const [year, m] = splitMonth(month);
  return new Date(year, m - 1, 1).toLocaleDateString("en-GB", {
    month: short ? "short" : "long",
    year: "numeric",
  });
}

export function daysInMonth(month) {
  const [year, m] = splitMonth(month);
  return new Date(year, m, 0).getDate();
}

/** "Wed 4 Nov" for a "YYYY-MM-DD" date. */
export function dayLabel(isoDate) {
  return new Date(isoDate + "T00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ---------- Text and ids ----------

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Make user text safe to put inside HTML. */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function newId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** Turn a string into a stable positive integer (used for notification ids). */
export function hashToInt(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return (Math.abs(hash) % 2000000000) + 1;
}

// ---------- Feedback ----------

let toastTimer;

/** Show a short message at the bottom of the screen. */
export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2800);
}
