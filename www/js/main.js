// App start-up and button handling.

import { data, settings, loadAll, saveData, saveSettings, replaceData, onSave } from "./storage.js";
import { ui } from "./state.js";
import { render } from "./views.js";
import { paymentFor, dueDayIn } from "./finance.js";
import { openEntrySheet, openBillSheet, closeSheet } from "./sheets.js";
import { addCategory, removeCategory } from "./categories.js";
import { exportFile, copyReport, restoreFromFile, hasData } from "./files.js";
import { analyzeMonth } from "./claude-api.js";
import { scheduleReminders, setRemindersEnabled, initReminders } from "./reminders.js";
import { addMonths, newId, pad2, toast, todayISO, thisMonth } from "./utils.js";

// ---------- Actions ----------

/** Tick a bill as paid for the month on screen, or untick it. */
function toggleBillPaid(billId) {
  const bill = data.bills.find((b) => b.id === billId);
  if (!bill) return;
  const month = ui.month;
  const existing = paymentFor(billId, month);

  if (existing) {
    data.pays = data.pays.filter((p) => p !== existing);
    toast(`${bill.name} marked unpaid`);
  } else {
    data.pays.push({
      id: newId(),
      billId,
      month,
      name: bill.name,
      category: bill.category,
      kind: bill.kind,
      amount: bill.amount,
      paidOn: month === thisMonth ? todayISO : `${month}-${pad2(dueDayIn(bill, month))}`,
    });
    toast(`${bill.name} paid`);
  }
  saveData();
  render();
}

function addCategoryFromSettings(type) {
  const input = document.getElementById("newcat-" + type);
  const { error, name } = addCategory(type, input.value);
  if (error) {
    toast(error);
    input.focus();
    return;
  }
  toast(`Added "${name}"`);
  render();
}

function removeCategoryFromSettings(button, type, index) {
  const name = data.cats[type]?.[index];
  if (name === undefined || !confirmTap(button, "Tap again")) return;
  const { error, kept } = removeCategory(type, name);
  if (error) toast(error);
  else toast(kept ? `Removed. ${kept} old ${kept === 1 ? "entry keeps" : "entries keep"} "${name}".` : `Removed "${name}"`);
  render();
}

function saveApiSettings() {
  const key = document.getElementById("k").value.trim();
  settings.model = document.getElementById("mdl").value;
  settings.workspace = document.getElementById("ws").value.trim();
  if (key) {
    if (!key.startsWith("sk-ant-")) {
      toast("That doesn't look like a Claude API key (it starts with sk-ant-).");
      return;
    }
    settings.apiKey = key;
  }
  saveSettings();
  toast("Settings saved");
  render();
}

/** Destructive buttons need a second tap. Returns true on the confirming tap. */
function confirmTap(button, question) {
  if (button.dataset.confirm) return true;
  button.dataset.confirm = "1";
  button.textContent = question;
  return false;
}

// ---------- Click handling ----------

const BUTTON_ACTIONS = {
  prev: () => { ui.month = addMonths(ui.month, -1); render(); },
  next: () => { ui.month = addMonths(ui.month, 1); render(); },
  add: () => openEntrySheet(),
  newBill: () => openBillSheet(),
  copyRep: () => copyReport(),
  askAI: () => analyzeMonth(),
  saveKey: saveApiSettings,
  clearKey: () => { settings.apiKey = ""; saveSettings(); toast("API key removed"); render(); },
  remOn: () => setRemindersEnabled(true),
  remOff: () => setRemindersEnabled(false),
  restore: (button) => {
    if (hasData() && !confirmTap(button, "Replaces current data. Tap again")) return;
    document.getElementById("restoreFile").click();
  },
  wipe: (button) => {
    if (!confirmTap(button, "This erases everything. Tap again")) return;
    replaceData({});
    saveData();
    toast("All entries deleted");
    render();
  },
};

document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.closest("#sheetRoot")) return; // sheets handle their own buttons

  const { tab, goto, editTx, editBill, pay, addCat, removeCat, catType } = button.dataset;
  const exportKind = button.dataset.export;

  if (tab || goto) {
    ui.tab = tab || goto;
    render();
    window.scrollTo(0, 0);
  } else if (editTx) {
    openEntrySheet(data.tx.find((t) => t.id === editTx));
  } else if (editBill) {
    openBillSheet(data.bills.find((b) => b.id === editBill));
  } else if (pay) {
    toggleBillPaid(pay);
  } else if (addCat) {
    addCategoryFromSettings(addCat);
  } else if (removeCat) {
    removeCategoryFromSettings(button, catType, Number(removeCat));
  } else if (exportKind) {
    exportFile(exportKind);
  } else if (BUTTON_ACTIONS[button.id]) {
    BUTTON_ACTIONS[button.id](button);
  }
});

document.getElementById("restoreFile").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) restoreFromFile(file);
  event.target.value = "";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSheet();
});

// ---------- Start ----------

async function start() {
  render(); // shows "Opening your ledger…"
  try {
    await loadAll();
  } catch {
    toast("Couldn't read saved data.");
  }
  ui.loaded = true;
  onSave(scheduleReminders);
  render();
  initReminders();
}

start();
