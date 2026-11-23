// Your own income and expense categories, saved with your data (so backups include them).

import { BILL_CATEGORY, CREDIT_CATEGORY } from "./config.js";
import { data, saveData } from "./storage.js";

// Bill and credit payments are always filed under these two, so they can't be removed.
export const LOCKED_CATEGORIES = [BILL_CATEGORY, CREDIT_CATEGORY];

/** The current list for "income" or "expense". */
export const categoriesFor = (type) => data.cats[type === "income" ? "income" : "expense"];

/** Add a category. Returns { name } on success or { error } with a message to show. */
export function addCategory(type, rawName) {
  const name = String(rawName || "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "Type a name first." };
  if (name.length > 30) return { error: "Keep it under 30 characters." };

  const list = categoriesFor(type);
  if (list.some((c) => c.toLowerCase() === name.toLowerCase())) {
    return { error: `"${name}" is already in the list.` };
  }
  list.push(name);
  saveData();
  return { name };
}

/**
 * Remove a category from the list. Old entries keep their category name, so past
 * reports don't change. Returns { kept } (how many old entries still use it) or { error }.
 */
export function removeCategory(type, name) {
  const key = type === "income" ? "income" : "expense";
  if (LOCKED_CATEGORIES.includes(name)) return { error: `"${name}" is used by bills and can't be removed.` };
  if (!data.cats[key].includes(name)) return { error: "That category is already gone." };
  if (data.cats[key].length <= 1) return { error: "Keep at least one category." };

  data.cats[key] = data.cats[key].filter((c) => c !== name);
  saveData();
  return { kept: data.tx.filter((t) => t.type === key && t.category === name).length };
}
