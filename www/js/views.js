// Screens. Each view returns an HTML string for the current month; render() puts it on screen.

import { CLAUDE_MODELS, BACKUP_REMINDER_DAYS } from "./config.js";
import { data, settings, IS_NATIVE } from "./storage.js";
import { ui } from "./state.js";
import {
  summarizeMonth, billsForMonth, paymentFor, savingHints,
  installmentNumber, dueDayIn,
} from "./finance.js";
import {
  money, sum, escapeHtml as esc, addMonths, monthLabel, dayLabel,
  thisMonth, now,
} from "./utils.js";

// ---------- Ledger tab ----------

function ledgerView() {
  const month = ui.month;
  const s = summarizeMonth(month);
  const paidCount = s.billsDue.length - s.unpaidBills.length;

  // Group entries and bill payments by day, newest first.
  const byDay = {};
  for (const t of s.entries) (byDay[t.date] ||= []).push(t);
  for (const p of s.payments) {
    const day = p.paidOn && p.paidOn.startsWith(month) ? p.paidOn : `${month}-01`;
    (byDay[day] ||= []).push({ ...p, isPayment: true });
  }
  const days = Object.keys(byDay).sort().reverse();

  const dayGroups = days.map((day) => {
    const items = byDay[day];
    const net = sum(items, (t) => (t.type === "income" ? t.amount : -t.amount));
    return `
      <div class="dayhead">
        <span>${dayLabel(day)}</span>
        <span class="num">${net >= 0 ? "+" : "−"}${money(Math.abs(net))}</span>
      </div>
      ${items.map(ledgerRow).join("")}`;
  }).join("");

  const billProgress = s.billsDue.length ? `
    <div class="stack-sm" style="gap:6px">
      <div class="billline">
        <span>Bills ${paidCount} of ${s.billsDue.length} paid</span>
        <span class="num">${s.unpaidBills.length ? money(s.unpaidAmount) + " still due" : "All paid"}</span>
      </div>
      <div class="meter"><i style="width:${Math.round((paidCount / s.billsDue.length) * 100)}%"></i></div>
    </div>` : "";

  return `
    <div class="stack-lg">
      <section class="hero">
        <div>
          <div class="label">Left this month</div>
          <div class="left">${s.left < 0 ? "−" : ""}${money(Math.abs(s.left))}</div>
        </div>
        <div class="split">
          <div><span class="label">Income</span><span class="num">${money(s.income)}</span></div>
          <div><span class="label">Spent</span><span class="num">${money(s.spent)}</span></div>
        </div>
        ${billProgress}
      </section>
      <section class="stack-sm">
        <h2>Ledger</h2>
        <div class="panel">
          ${dayGroups || `<div class="empty"><b>Nothing logged for ${monthLabel(month)}</b>Tap + to add your salary, side income or a purchase.</div>`}
        </div>
      </section>
    </div>`;
}

function ledgerRow(item) {
  if (item.isPayment) {
    return `
      <div class="row">
        <div class="main"><div class="t">${esc(item.name)}</div><div class="s">${esc(item.category)} · bill paid</div></div>
        <div class="num">−${money(item.amount)}</div>
      </div>`;
  }
  const isIncome = item.type === "income";
  const title = item.note || item.category;
  const subtitle = item.note ? item.category : isIncome ? "Income" : "Expense";
  return `
    <button class="row" data-edit-tx="${item.id}">
      <div class="main"><div class="t">${esc(title)}</div><div class="s">${esc(subtitle)}</div></div>
      <div class="num ${isIncome ? "amt-in" : ""}">${isIncome ? "+" : "−"}${money(item.amount)}</div>
    </button>`;
}

// ---------- Bills tab ----------

function billsView() {
  const month = ui.month;
  const bills = billsForMonth(month);
  const s = summarizeMonth(month);

  const reminderPrompt = IS_NATIVE && bills.length && !settings.reminders ? `
    <div class="notice notice-row">
      <span>Get a reminder before each bill is due.</span>
      <button class="btn" id="remOn">Turn on</button>
    </div>` : "";

  return `
    <div class="stack">
      <div class="section-head">
        <div>
          <h2>Bills & credits</h2>
          <div class="muted small">${bills.length
            ? `${money(sum(bills, (b) => b.amount))} this month · ${money(s.unpaidAmount)} unpaid`
            : "Recurring payments you tick off each month"}</div>
        </div>
        <button class="btn primary" id="newBill">Add bill</button>
      </div>
      ${reminderPrompt}
      <div class="panel">
        ${bills.map((b) => billRow(b, month)).join("") ||
          `<div class="empty"><b>No bills yet</b>Add rent, electricity, phone, internet or a credit installment. Each month you tick them off here.</div>`}
      </div>
    </div>`;
}

function billRow(bill, month) {
  const paid = paymentFor(bill.id, month);
  const dueDay = dueDayIn(bill, month);
  const monthShort = monthLabel(month, true).split(" ")[0];

  let statusTag = "";
  if (!paid) {
    const isPast = month < thisMonth || (month === thisMonth && dueDay < now.getDate());
    const isSoon = month === thisMonth && dueDay - now.getDate() <= 3;
    if (isPast) statusTag = `<span class="tag late">Overdue</span>`;
    else if (isSoon) statusTag = `<span class="tag due">Due soon</span>`;
  }

  const creditTag = bill.kind === "credit"
    ? `<span class="tag cr">${bill.installments ? `${installmentNumber(bill, month)}/${bill.installments}` : "Credit"}</span>`
    : "";

  return `
    <div class="row ${paid ? "paidrow" : ""}">
      <button class="check ${paid ? "paid" : ""}" data-pay="${bill.id}" aria-pressed="${Boolean(paid)}"
        aria-label="${paid ? "Mark unpaid" : "Mark paid"}: ${esc(bill.name)}">${paid ? "PAID" : "PAY"}</button>
      <button class="main row-link" data-edit-bill="${bill.id}">
        <div class="t">${esc(bill.name)}</div>
        <div class="s">Due ${dueDay} ${monthShort} ${creditTag} ${statusTag}</div>
      </button>
      <div class="num">${money(bill.amount)}</div>
    </div>`;
}

// ---------- Report tab ----------

function reportView() {
  const month = ui.month;
  const previousMonth = addMonths(month, -1);
  const s = summarizeMonth(month);
  const before = summarizeMonth(previousMonth);
  const hints = savingHints(month);

  const categories = Object.entries(s.spentByCategory).sort((a, b) => b[1] - a[1]);
  const largest = categories.length ? categories[0][1] : 1;

  const bars = categories.map(([category, amount]) => {
    const previous = before.spentByCategory[category] || 0;
    const change = amount - previous;
    const delta = previous
      ? `<div class="delta ${change > 0 ? "up" : "down"}">${change > 0 ? "▲" : "▼"} ${money(Math.abs(change))} vs ${monthLabel(previousMonth, true)}</div>`
      : `<div class="delta muted">new this month</div>`;
    return `
      <div class="bar">
        <div class="bar-top"><span>${esc(category)}</span><span class="num">${money(amount)}</span></div>
        <div class="track"><i style="width:${Math.max(2, (amount / largest) * 100)}%"></i></div>
        ${delta}
      </div>`;
  }).join("");

  const incomeRows = Object.entries(s.incomeBySource)
    .map(([source, amount]) => `<span>${esc(source)}</span><span class="num amt-in">+${money(amount)}</span>`)
    .join("") || `<span class="muted">No income logged</span><span></span>`;

  return `
    <div class="stack">
      <h2>${monthLabel(month)} summary</h2>

      <div class="panel cardpad">
        <div class="kv">
          ${incomeRows}
          <span>Spent</span><span class="num">−${money(s.spent)}</span>
          <span class="strong">Left over</span><span class="num strong">${money(s.left)}</span>
          ${s.income ? `<span class="muted">Savings rate</span><span class="num muted">${Math.round((s.left / s.income) * 100)}%</span>` : ""}
        </div>
      </div>

      <div class="panel cardpad">
        <div class="label">Where it went</div>
        ${categories.length ? `<div class="bars">${bars}</div>` : `<div class="muted">No spending logged yet.</div>`}
      </div>

      <div class="panel cardpad">
        <div class="label">What you can reduce</div>
        ${hints.length
          ? `<ul class="hints">${hints.map((h) => `<li class="${h.ok ? "ok" : ""}">${esc(h.text)}</li>`).join("")}</ul>`
          : `<div class="muted">Log a few entries and suggestions appear here.</div>`}
      </div>

      ${analysisPanel(month)}
    </div>`;
}

function analysisPanel(month) {
  const a = ui.analysis;
  const showResult = a.month === month && (a.text || a.isBusy);
  const modelLabel = CLAUDE_MODELS.find((m) => m.id === settings.model)?.label || settings.model;

  const controls = settings.apiKey ? `
    <div class="muted small">Sends this month's report to Claude (${esc(modelLabel)}). Needs internet. Costs a few cents per analysis on your API account.</div>
    <div class="btns">
      <button class="btn primary" id="askAI" ${a.isBusy ? "disabled" : ""}>${a.isBusy ? "Analyzing…" : "Analyze " + monthLabel(month, true)}</button>
      <button class="btn" id="copyRep">Copy report</button>
    </div>` : `
    <div class="muted small">Two ways: copy the report and paste it into a Claude chat, or add your own Claude API key under Export → Claude API to analyze right here.</div>
    <div class="btns">
      <button class="btn primary" id="copyRep">Copy report</button>
      <button class="btn" data-goto="more">Set up API key</button>
    </div>`;

  const result = showResult
    ? `<div class="ai ${a.isError ? "err" : ""}" id="aiOut">${a.isBusy && !a.text ? "Waiting for Claude…" : esc(a.text)}</div>`
    : "";

  return `
    <div class="panel cardpad">
      <div class="label">Analyze with Claude</div>
      ${controls}
      ${result}
    </div>`;
}

// ---------- Export / settings tab ----------

function moreView() {
  const hasData = data.tx.length || data.bills.length;
  const daysSinceBackup = settings.lastBackup ? Math.floor((Date.now() - settings.lastBackup) / 864e5) : null;
  const maskedKey = settings.apiKey ? settings.apiKey.slice(0, 10) + "…" + settings.apiKey.slice(-4) : "";

  let backupStatus = "";
  if (hasData && (daysSinceBackup === null || daysSinceBackup >= BACKUP_REMINDER_DAYS)) {
    backupStatus = `<div class="notice">${daysSinceBackup === null
      ? "You haven't made a backup yet."
      : `Last backup was ${daysSinceBackup} days ago.`}</div>`;
  } else if (daysSinceBackup !== null) {
    backupStatus = `<div class="muted small">Last backup: ${daysSinceBackup === 0 ? "today" : daysSinceBackup + " days ago"}.</div>`;
  }

  const remindersPanel = IS_NATIVE ? `
    <div class="panel cardpad">
      <div class="label">Bill reminders</div>
      <div class="muted small">A notification at 9:00 the day before each unpaid bill or installment is due, and again on the day. Paid bills are skipped.</div>
      <div class="btns">${settings.reminders
        ? `<button class="btn" id="remOff">Turn off reminders</button>`
        : `<button class="btn primary" id="remOn">Turn on reminders</button>`}</div>
    </div>` : "";

  return `
    <div class="stack">
      <h2>Export, backup & settings</h2>

      <div class="panel cardpad">
        <div class="label">${monthLabel(ui.month)} report</div>
        <div class="muted small">Copy or download, then paste or upload it in your Claude chat to talk it through.</div>
        <div class="btns">
          <button class="btn primary" id="copyRep">Copy report</button>
          <button class="btn" data-export="month-md">Report (.md)</button>
          <button class="btn" data-export="month-csv">Spreadsheet (.csv)</button>
        </div>
        <div id="copyWrap"></div>
      </div>

      <div class="panel cardpad">
        <div class="label">Backup</div>
        <div class="muted small">Your entries live only on this phone. Save a backup file now and then, and keep it somewhere safe like Google Drive.</div>
        ${backupStatus}
        <div class="btns">
          <button class="btn primary" data-export="backup">Save backup</button>
          <button class="btn" id="restore">Restore from backup</button>
          <button class="btn" data-export="all-csv">All entries (.csv)</button>
        </div>
      </div>

      ${remindersPanel}

      <div class="panel cardpad">
        <div class="label">Claude API (optional)</div>
        <div class="muted small">Lets the Report tab's "Analyze" button work. Create a key at platform.claude.com → API keys. API use is billed separately from a Claude subscription. The key is stored only on this phone; anyone using this phone could use it.</div>
        <div class="field">
          <label for="k">API key</label>
          <input id="k" type="password" autocomplete="off" placeholder="${settings.apiKey ? esc(maskedKey) : "sk-ant-…"}">
        </div>
        <div class="field">
          <label for="ws">Workspace ID (only if your key isn't tied to a workspace)</label>
          <input id="ws" autocomplete="off" placeholder="wrkspc_…" value="${esc(settings.workspace || "")}">
        </div>
        <div class="field">
          <label for="mdl">Model</label>
          <select id="mdl">${CLAUDE_MODELS.map((m) =>
            `<option value="${m.id}" ${m.id === settings.model ? "selected" : ""}>${m.label}</option>`).join("")}</select>
        </div>
        <div class="btns">
          <button class="btn primary" id="saveKey">Save</button>
          ${settings.apiKey ? `<button class="btn danger" id="clearKey">Remove key</button>` : ""}
        </div>
      </div>

      <div class="panel cardpad">
        <div class="label">Danger zone</div>
        <div class="btns"><button class="btn danger" id="wipe">Delete all entries</button></div>
      </div>
    </div>`;
}

// ---------- Render ----------

const VIEWS = { month: ledgerView, bills: billsView, report: reportView, more: moreView };

/** Redraw the header and the current tab. */
export function render() {
  document.getElementById("mlabel").textContent = monthLabel(ui.month);
  document.querySelectorAll(".tab").forEach((tab) => {
    if (tab.dataset.tab === ui.tab) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });

  const view = document.getElementById("view");
  if (!ui.loaded) {
    view.innerHTML = `<div class="panel empty"><b>Opening your ledger…</b></div>`;
    return;
  }
  view.innerHTML = VIEWS[ui.tab]();
}
