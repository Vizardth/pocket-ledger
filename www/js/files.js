// Exports, backup, restore and copy-to-clipboard.
// In the Android app files go through the share sheet (save to Drive, send to Claude, etc.).

import { data, settings, IS_NATIVE, replaceData, saveData, saveSettings } from "./storage.js";
import { ui } from "./state.js";
import { render } from "./views.js";
import { monthReportText, entriesCsv, backupJson, isValidBackup } from "./finance.js";
import { escapeHtml, toast, todayISO } from "./utils.js";

const UTF8_BOM = "﻿"; // helps Excel read Rupiah text and accents correctly

/** Save or share a text file. Resolves true if it was saved/shared, false if the user cancelled. */
async function saveTextFile(filename, text, mimeType) {
  if (IS_NATIVE) {
    const { Filesystem, Share, Directory, Encoding } = window.Cap;
    const file = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    try {
      await Share.share({ title: filename, files: [file.uri], dialogTitle: "Save or send " + filename });
    } catch (error) {
      if (/cancel/i.test(error?.message || "")) return false;
      throw error;
    }
    return true;
  }

  // Browser fallback: trigger a normal download.
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Saved to your Downloads");
  return true;
}

/** Handle the export buttons: "month-csv", "month-md", "all-csv" or "backup". */
export async function exportFile(kind) {
  const month = ui.month;
  try {
    switch (kind) {
      case "month-csv":
        await saveTextFile(`pocket-ledger-${month}.csv`, UTF8_BOM + entriesCsv(month), "text/csv");
        break;
      case "month-md":
        await saveTextFile(`pocket-ledger-report-${month}.md`, monthReportText(month), "text/markdown");
        break;
      case "all-csv":
        await saveTextFile(`pocket-ledger-all-${todayISO}.csv`, UTF8_BOM + entriesCsv(null), "text/csv");
        break;
      case "backup": {
        const saved = await saveTextFile(`pocket-ledger-backup-${todayISO}.json`, backupJson(), "application/json");
        if (saved) {
          settings.lastBackup = Date.now();
          saveSettings();
          render();
        }
        break;
      }
    }
  } catch {
    toast("Couldn't create the file. Try again.");
  }
}

/** Copy this month's report so it can be pasted into a Claude chat. */
export async function copyReport() {
  const text = monthReportText(ui.month);
  try {
    if (IS_NATIVE) await window.Cap.Clipboard.write({ string: text });
    else await navigator.clipboard.writeText(text);
    toast("Report copied. Paste it into Claude.");
  } catch {
    // Fallback: show the text so it can be copied by hand.
    const box = document.getElementById("copyWrap");
    if (box) {
      box.innerHTML = `<textarea class="copybox" readonly>${escapeHtml(text)}</textarea>`;
      box.firstChild.select();
      toast("Long-press the text to copy it");
    } else {
      toast("Couldn't copy. Use Report (.md) instead.");
    }
  }
}

/** Replace all data with the contents of a backup file. */
export function restoreFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!isValidBackup(parsed)) throw new Error("not a backup");
      replaceData(parsed);
      saveData();
      toast(`Restored ${parsed.tx.length} entries and ${parsed.bills.length} bills`);
      ui.tab = "month";
      render();
    } catch {
      toast("That file isn't a Pocket Ledger backup.");
    }
  };
  reader.readAsText(file);
}

/** True if there is anything a restore or wipe would overwrite. */
export function hasData() {
  return Boolean(data.tx.length || data.bills.length);
}
