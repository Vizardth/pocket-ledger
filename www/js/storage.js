// Where the app keeps its data.
// In the Android app: Capacitor Preferences (private app storage).
// In a browser (for testing): localStorage.

import { STORAGE_KEYS, DEFAULT_MODEL, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "./config.js";
import { toast } from "./utils.js";

/** True when running inside the installed Android app. */
export const IS_NATIVE = Boolean(window.Cap && window.Cap.Capacitor.isNativePlatform());

/** All money records. Mutated in place, then saved with saveData(). */
export const data = {
  tx: [],    // { id, type: "income"|"expense", amount, category, date, note, createdAt }
  bills: [], // { id, name, amount, dueDay, kind: "bill"|"credit", category, startMonth, installments }
  pays: [],  // { id, billId, month, name, category, kind, amount, paidOn }
  cats: { income: [...INCOME_CATEGORIES], expense: [...EXPENSE_CATEGORIES] }, // your category lists
};

/** User settings. Mutated in place, then saved with saveSettings(). */
export const settings = {
  apiKey: "",
  model: DEFAULT_MODEL,
  workspace: "",
  lastBackup: 0,
  reminders: false,
};

async function read(key) {
  if (IS_NATIVE) {
    const { value } = await window.Cap.Preferences.get({ key });
    return value ? JSON.parse(value) : null;
  }
  const value = localStorage.getItem(key);
  return value ? JSON.parse(value) : null;
}

async function write(key, value) {
  const text = JSON.stringify(value);
  if (IS_NATIVE) await window.Cap.Preferences.set({ key, value: text });
  else localStorage.setItem(key, text);
}

/** Load saved data and settings into the shared objects above. */
export async function loadAll() {
  const savedData = await read(STORAGE_KEYS.data);
  if (savedData) replaceData(savedData);
  const savedSettings = await read(STORAGE_KEYS.settings);
  if (savedSettings) Object.assign(settings, savedSettings);
}

/** Swap in a whole new set of records (used by restore and "delete all"). */
export function replaceData({ tx = [], bills = [], pays = [], cats = null }) {
  data.tx = tx;
  data.bills = bills;
  data.pays = pays;
  // Older saves and backups have no category list, and "delete all" passes none:
  // in both cases keep the current list.
  if (Array.isArray(cats?.income) && Array.isArray(cats?.expense) && cats.income.length && cats.expense.length) {
    data.cats = { income: cats.income.map(String), expense: cats.expense.map(String) };
  }
}

// Other modules can react after each save (e.g. reschedule bill reminders).
const saveListeners = [];
export function onSave(listener) {
  saveListeners.push(listener);
}
function notifySaved() {
  saveListeners.forEach((listener) => listener());
}

// Writes are chained so they always land in order.
let writeQueue = Promise.resolve();

export function saveData() {
  writeQueue = writeQueue
    .then(() => write(STORAGE_KEYS.data, data))
    .catch(() => toast("Couldn't save. Export a backup and free up phone storage."));
  notifySaved();
}

export function saveSettings() {
  write(STORAGE_KEYS.settings, settings).catch(() => {});
  notifySaved();
}
