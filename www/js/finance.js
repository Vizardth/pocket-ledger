// Money calculations: monthly totals, bills due, savings hints and exports.
// Pure functions over the saved data; nothing here touches the screen.

import { FLEXIBLE_CATEGORIES, ACCOUNTS, DEFAULT_ACCOUNT } from "./config.js";
import { data } from "./storage.js";
import { money, sum, addMonths, monthsBetween, monthLabel, daysInMonth } from "./utils.js";

// ---------- Bills ----------

/** Bills and credits that apply to a month, sorted by due day. */
export function billsForMonth(month) {
  return data.bills
    .filter((bill) => {
      if (bill.startMonth && month < bill.startMonth) return false;
      // A credit with a set number of installments stops after the last one.
      if (bill.kind === "credit" && bill.installments) {
        return monthsBetween(bill.startMonth, month) < bill.installments;
      }
      return true;
    })
    .sort((a, b) => (a.dueDay || 0) - (b.dueDay || 0));
}

/** The payment record for a bill in a month, if it was marked paid. */
export function paymentFor(billId, month) {
  return data.pays.find((p) => p.billId === billId && p.month === month);
}

/** "3/12" style position of a credit installment in a month. */
export function installmentNumber(bill, month) {
  return monthsBetween(bill.startMonth, month) + 1;
}

/** The bill's due day, clamped to the month's length (a "31st" bill is due on 30 Nov). */
export function dueDayIn(bill, month) {
  return Math.min(bill.dueDay || 1, daysInMonth(month));
}

// ---------- Monthly summary ----------

/** The month an entry counts toward: its budget month if set, otherwise the month of its date. */
export function budgetMonthOf(entry) {
  return entry.budgetMonth || (entry.date || "").slice(0, 7);
}

/** Everything the screens and reports need to know about one month. */
export function summarizeMonth(month) {
  const entries = data.tx.filter((t) => budgetMonthOf(t) === month);
  const incomes = entries.filter((t) => t.type === "income");
  const expenses = entries.filter((t) => t.type === "expense");
  const payments = data.pays.filter((p) => p.month === month);

  const incomeBySource = {};
  for (const t of incomes) incomeBySource[t.category] = (incomeBySource[t.category] || 0) + t.amount;

  const spentByCategory = {};
  const entryCountByCategory = {};
  for (const t of expenses) {
    spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
    entryCountByCategory[t.category] = (entryCountByCategory[t.category] || 0) + 1;
  }
  // Paid bills count as spending in their own category.
  for (const p of payments) spentByCategory[p.category] = (spentByCategory[p.category] || 0) + p.amount;

  const income = sum(incomes, (t) => t.amount);
  const spent = sum(expenses, (t) => t.amount) + sum(payments, (p) => p.amount);
  const billsDue = billsForMonth(month);
  const unpaidBills = billsDue.filter((b) => !paymentFor(b.id, month));

  return {
    entries,
    payments,
    incomeBySource,
    spentByCategory,
    entryCountByCategory,
    income,
    spent,
    left: income - spent,
    billsDue,
    unpaidBills,
    unpaidAmount: sum(unpaidBills, (b) => b.amount),
    creditPayments: sum(billsDue.filter((b) => b.kind === "credit"), (b) => b.amount),
  };
}

// ---------- Accounts (cash vs ATM/digital) ----------

/** "cash" or "digital" for an entry, payment or correction. Older records count as DEFAULT_ACCOUNT. */
export function accountOf(record) {
  return ACCOUNTS.some((a) => a.id === record?.account) ? record.account : DEFAULT_ACCOUNT;
}

/** "Cash" or "ATM / Digital". */
export function accountLabel(id) {
  return (ACCOUNTS.find((a) => a.id === id) || ACCOUNTS.find((a) => a.id === DEFAULT_ACCOUNT)).label;
}

/** The other account, e.g. otherAccount("cash") -> "digital". */
export function otherAccount(id) {
  return ACCOUNTS.find((a) => a.id !== id).id;
}

// ---------- Running balance ----------

/**
 * Money you have, counting every entry, bill payment and balance correction by the day it
 * actually happened. With `upToDate` ("YYYY-MM-DD"), only what happened on or before that day.
 * Unlike the monthly totals, nothing resets: leftover money carries on into the next month.
 *
 * With `account` ("cash" or "digital"), only that account, including transfers in and out.
 * Transfers never change the total. `excludeTransferId` leaves one transfer out (while editing it).
 */
export function balanceAt(upToDate = null, account = null, excludeTransferId = null) {
  const counts = (date) => !upToDate || (date || "") <= upToDate;
  const mine = (record) => !account || accountOf(record) === account;
  let total = 0;
  for (const t of data.tx) if (counts(t.date) && mine(t)) total += t.type === "income" ? t.amount : -t.amount;
  for (const p of data.pays) if (counts(p.paidOn || p.month + "-01") && mine(p)) total -= p.amount;
  for (const a of data.adjust) if (counts(a.date) && mine(a)) total += a.amount;
  if (account) {
    for (const t of data.transfers) {
      if (t.id === excludeTransferId || !counts(t.date)) continue;
      if (t.from === account) total -= t.amount;
      if (t.to === account) total += t.amount;
    }
  }
  return total;
}

/** Total plus each account's balance: { total, cash, digital }. */
export function balancesAt(upToDate = null) {
  const result = { total: balanceAt(upToDate) };
  for (const { id } of ACCOUNTS) result[id] = balanceAt(upToDate, id);
  return result;
}

/** Balance corrections dated in a month. */
export function adjustmentsIn(month) {
  return data.adjust.filter((a) => (a.date || "").startsWith(month));
}

/** Transfers between accounts dated in a month. */
export function transfersIn(month) {
  return data.transfers.filter((t) => (t.date || "").startsWith(month));
}

// ---------- "What you can reduce" hints ----------

/** Plain-language suggestions for a month. `ok: true` marks good news. */
export function savingHints(month) {
  const current = summarizeMonth(month);
  const previous = summarizeMonth(addMonths(month, -1));
  const previousLabel = monthLabel(addMonths(month, -1), true);
  const hints = [];

  if (!current.income && !current.spent) return hints;

  const categories = Object.entries(current.spentByCategory).sort((a, b) => b[1] - a[1]);

  // Categories that grew a lot since last month.
  for (const [category, amount] of categories) {
    const before = previous.spentByCategory[category] || 0;
    if (before > 0 && amount > before * 1.25 && amount - before >= 100000) {
      const percent = Math.round((amount / before - 1) * 100);
      hints.push({
        text: `${category} rose ${money(amount - before)} (+${percent}%) from ${previousLabel}. Bringing it back to last month's level frees that amount.`,
      });
    }
  }

  // The biggest flexible category, if it's a large share of spending.
  const biggestFlexible = categories.find(([category]) => FLEXIBLE_CATEGORIES.includes(category));
  if (biggestFlexible && current.spent) {
    const [category, amount] = biggestFlexible;
    const share = amount / current.spent;
    if (share >= 0.2) {
      hints.push({
        text: `${category} is ${Math.round(share * 100)}% of your spending (${money(amount)}). Trimming it by 20% would save about ${money(amount * 0.2)} a month.`,
      });
    }
  }

  // Many small purchases in a flexible category.
  for (const [category, count] of Object.entries(current.entryCountByCategory)) {
    if (FLEXIBLE_CATEGORIES.includes(category) && count >= 12) {
      const average = current.spentByCategory[category] / count;
      hints.push({
        text: `${count} separate ${category.toLowerCase()} entries this month, averaging ${money(average)}. Small frequent buys add up; a weekly cap is easier to keep than a monthly one.`,
      });
    }
  }

  // Credit payments taking too much of income.
  if (current.income && current.creditPayments / current.income > 0.3) {
    const percent = Math.round((current.creditPayments / current.income) * 100);
    hints.push({
      text: `Credit and installment payments take ${percent}% of income. Above about 30% leaves little room; avoid new installments until one finishes.`,
    });
  }

  // Savings rate.
  if (current.income) {
    const rate = current.left / current.income;
    if (rate < 0) {
      hints.push({ text: `You spent ${money(-current.left)} more than you earned this month.` });
    } else if (rate < 0.1) {
      hints.push({
        text: `You kept ${Math.round(rate * 100)}% of income. Aim for at least 10% by moving that amount to savings on payday.`,
      });
    } else {
      hints.push({ text: `You kept ${Math.round(rate * 100)}% of income (${money(current.left)}).`, ok: true });
    }
  }

  if (current.unpaidBills.length) {
    const count = current.unpaidBills.length;
    hints.push({
      text: `${count} bill${count > 1 ? "s" : ""} still unpaid this month, totalling ${money(current.unpaidAmount)}.`,
    });
  }

  return hints;
}

// ---------- Exports ----------

/** Plain-text (Markdown) report used for Copy, the .md export and the Claude analysis. */
export function monthReportText(month) {
  const current = summarizeMonth(month);
  const previous = summarizeMonth(addMonths(month, -1));
  const lines = [`# Pocket Ledger report — ${monthLabel(month)}`, "", "Currency: IDR", "", `Income: ${money(current.income)}`];

  for (const [source, amount] of Object.entries(current.incomeBySource)) {
    lines.push(`  - ${source}: ${money(amount)}`);
  }
  lines.push(`Spent (incl. paid bills): ${money(current.spent)}`, `Left over: ${money(current.left)}`);
  if (current.income) lines.push(`Savings rate: ${Math.round((current.left / current.income) * 100)}%`);
  lines.push(`Previous month: income ${money(previous.income)}, spent ${money(previous.spent)}`);
  const endBalances = balancesAt(`${month}-${daysInMonth(month)}`);
  lines.push(`Running balance at end of month: ${money(endBalances.total)}`);
  for (const { id, label } of ACCOUNTS) lines.push(`  - ${label}: ${money(endBalances[id])}`);

  lines.push("", "## Spending by category (this month vs previous)");
  Object.entries(current.spentByCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, amount]) => {
      const before = previous.spentByCategory[category] || 0;
      const count = current.entryCountByCategory[category] || 0;
      lines.push(`  - ${category}: ${money(amount)} (prev ${money(before)}, ${count} entries)`);
    });

  lines.push("", "## Bills & credits");
  if (!current.billsDue.length) lines.push("  (none)");
  for (const bill of current.billsDue) {
    const paid = paymentFor(bill.id, month);
    const kind =
      bill.kind === "credit"
        ? "credit" + (bill.installments ? `, installment ${installmentNumber(bill, month)} of ${bill.installments}` : "")
        : "bill";
    const discount = paid?.discount ? `, paid ${money(paid.amount)} after ${money(paid.discount)} discount` : "";
    const status = paid ? `PAID ${paid.paidOn || ""} from ${accountLabel(accountOf(paid))}${discount}` : "UNPAID";
    lines.push(`  - ${bill.name} (${kind}), due day ${bill.dueDay}: ${money(bill.amount)} — ${status}`);
  }

  lines.push("", "## Transactions");
  if (!current.entries.length) lines.push("  (none)");
  current.entries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => {
      const sign = t.type === "income" ? "+" : "-";
      const counted = t.budgetMonth ? ` (counts toward ${monthLabel(month)})` : "";
      lines.push(`  - ${t.date} ${sign}${money(t.amount)} ${t.category} [${accountLabel(accountOf(t))}]${t.note ? " — " + t.note : ""}${counted}`);
    });

  const transfers = transfersIn(month).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (transfers.length) {
    lines.push("", "## Transfers between cash and ATM/digital (not income or spending)");
    for (const t of transfers) {
      lines.push(`  - ${t.date} ${money(t.amount)} ${accountLabel(t.from)} → ${accountLabel(t.to)}${t.note ? " — " + t.note : ""}`);
    }
  }

  return lines.join("\n");
}

function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

/** Spreadsheet of entries and bill payments, for one month or (with null) everything. */
export function entriesCsv(month = null) {
  const rows = [];

  for (const t of data.tx.filter((t) => !month || budgetMonthOf(t) === month)) {
    rows.push([t.date, budgetMonthOf(t), t.type, t.category, t.amount, t.note || "", "entry", accountOf(t)]);
  }
  for (const p of data.pays.filter((p) => !month || p.month === month)) {
    const source = p.kind === "credit" ? "credit payment" : "bill payment";
    const note = p.discount ? `${p.name} (discount ${p.discount})` : p.name;
    rows.push([p.paidOn || p.month + "-01", p.month, "expense", p.category, p.amount, note, source, accountOf(p)]);
  }

  for (const a of data.adjust.filter((a) => !month || (a.date || "").startsWith(month))) {
    rows.push([a.date, a.date.slice(0, 7), "adjustment", "", a.amount, a.note || "", "balance correction", accountOf(a)]);
  }

  // A transfer's account column reads "digital>cash" (from > to).
  for (const t of data.transfers.filter((t) => !month || (t.date || "").startsWith(month))) {
    rows.push([t.date, t.date.slice(0, 7), "transfer", "", t.amount, t.note || "", "transfer", `${t.from}>${t.to}`]);
  }

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return toCsv([["date", "budget_month", "type", "category", "amount_idr", "note", "source", "account"], ...rows]);
}

/** Full backup file contents. */
export function backupJson() {
  return JSON.stringify(
    { app: "pocket-ledger", version: 1, exportedAt: new Date().toISOString(), ...data },
    null,
    1,
  );
}

/** Check that a parsed file is a Pocket Ledger backup. */
export function isValidBackup(parsed) {
  return (
    parsed?.app === "pocket-ledger" &&
    Array.isArray(parsed.tx) &&
    Array.isArray(parsed.bills) &&
    Array.isArray(parsed.pays)
  );
}
