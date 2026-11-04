// Bill reminders (Android app only): a notification at 9:00 the day before
// each unpaid bill is due, and again on the day. Rebuilt after every save.

import { settings, saveSettings, IS_NATIVE } from "./storage.js";
import { ui } from "./state.js";
import { render } from "./views.js";
import { billsForMonth, paymentFor, installmentNumber, dueDayIn } from "./finance.js";
import { money, toast, thisMonth, addMonths, hashToInt } from "./utils.js";

const CHANNEL_ID = "bills";
const REMINDER_HOUR = 9;
const MAX_SCHEDULED = 60; // stay well under Android's alarm limits
const SCHEDULE_DELAY_MS = 800; // wait for a burst of edits to finish

let pendingTimer;

/** Queue a rebuild of all reminders (cheap to call often). */
export function scheduleReminders() {
  if (!IS_NATIVE || !ui.loaded) return;
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(rebuildReminders, SCHEDULE_DELAY_MS);
}

function remindersToSchedule() {
  const notifications = [];
  const earliest = Date.now() + 60_000;

  for (const month of [thisMonth, addMonths(thisMonth, 1)]) {
    const [year, monthNumber] = month.split("-").map(Number);

    for (const bill of billsForMonth(month)) {
      if (paymentFor(bill.id, month)) continue;

      const dueDay = dueDayIn(bill, month);
      const installment = bill.kind === "credit" && bill.installments
        ? ` · installment ${installmentNumber(bill, month)} of ${bill.installments}`
        : "";

      for (const [daysBefore, label] of [[1, "due tomorrow"], [0, "due today"]]) {
        const at = new Date(year, monthNumber - 1, dueDay - daysBefore, REMINDER_HOUR, 0, 0);
        if (at.getTime() < earliest) continue;

        notifications.push({
          id: hashToInt(bill.id + month + daysBefore),
          title: `${bill.name} ${label}`,
          body: `${money(bill.amount)}${installment}. Open Pocket Ledger to mark it paid.`,
          schedule: { at, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          // Inexact timing (a few minutes late at most) avoids asking for the "Alarms & reminders" permission.
          isExactNotification: false,
        });
      }
    }
  }
  return notifications.slice(0, MAX_SCHEDULED);
}

async function rebuildReminders() {
  const notifications = window.Cap.LocalNotifications;
  try {
    const pending = await notifications.getPending();
    if (pending.notifications.length) {
      await notifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    if (!settings.reminders) return;
    if ((await notifications.checkPermissions()).display !== "granted") return;

    const list = remindersToSchedule();
    if (list.length) await notifications.schedule({ notifications: list });
  } catch {
    // Reminders are a convenience; never block the app if scheduling fails.
  }
}

/** Turn reminders on (asks for notification permission) or off. */
export async function setRemindersEnabled(enabled) {
  if (enabled) {
    const permission = await window.Cap.LocalNotifications.requestPermissions().catch(() => ({ display: "denied" }));
    if (permission.display !== "granted") {
      toast("Notifications are blocked. Allow them in Android Settings → Apps → Pocket Ledger → Notifications.");
      return;
    }
  }
  settings.reminders = enabled;
  saveSettings();
  toast(enabled ? "You'll get a reminder the day before each bill is due, and on the day." : "Bill reminders off");
  render();
}

/** One-time setup when the app starts. */
export async function initReminders() {
  if (!IS_NATIVE) return;
  try {
    await window.Cap.LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: "Bill reminders",
      description: "Reminders before bills and installments are due",
      importance: 4,
    });
  } catch {
    // Channel may already exist.
  }
  scheduleReminders();
}
