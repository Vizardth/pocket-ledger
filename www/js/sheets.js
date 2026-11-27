// Bottom-sheet forms for adding and editing entries and bills.

import { BILL_CATEGORY, CREDIT_CATEGORY, PAYDAY_ROLLOVER_DAY, ACCOUNTS, DEFAULT_ACCOUNT } from "./config.js";
import { categoriesFor, addCategory } from "./categories.js";
import { data, saveData, settings, saveSettings } from "./storage.js";
import { ui } from "./state.js";
import { render } from "./views.js";
import { dueDayIn, balanceAt, accountOf, accountLabel, otherAccount } from "./finance.js";
import {
  escapeHtml as esc, parseAmount, groupDigits, newId, toast, todayISO, thisMonth,
  addMonths, monthLabel, money, pad2,
} from "./utils.js";

// ---------- Generic sheet ----------

export function closeSheet() {
  document.getElementById("sheetRoot").innerHTML = "";
}

/**
 * Show a form in a bottom sheet.
 * onSubmit(formData) returns false to keep the sheet open (e.g. invalid input).
 * onDelete is optional; the Delete button asks for a second tap before running it.
 * Returns the <form> element so callers can add their own listeners.
 */
function openSheet(innerHtml, onSubmit, onDelete = null) {
  const root = document.getElementById("sheetRoot");
  root.innerHTML = `
    <div class="scrim" id="scrim">
      <form class="sheet" id="sheetForm" novalidate>
        ${innerHtml}
        <div class="sheet-actions">
          <div>${onDelete ? `<button type="button" class="btn danger" id="del">Delete</button>` : ""}</div>
          <div class="btns">
            <button type="button" class="btn" id="cancel">Cancel</button>
            <button class="btn primary">Save</button>
          </div>
        </div>
      </form>
    </div>`;

  const form = root.querySelector("#sheetForm");

  root.querySelector("#scrim").addEventListener("click", (e) => {
    if (e.target.id === "scrim") closeSheet();
  });
  root.querySelector("#cancel").addEventListener("click", closeSheet);

  if (onDelete) {
    const deleteButton = root.querySelector("#del");
    deleteButton.addEventListener("click", () => {
      if (!deleteButton.dataset.confirm) {
        deleteButton.dataset.confirm = "1";
        deleteButton.textContent = "Tap again to delete";
        return;
      }
      onDelete();
      closeSheet();
    });
  }

  // Amount fields show thousand separators as you type.
  root.querySelectorAll("[data-money]").forEach((input) =>
    input.addEventListener("input", () => (input.value = groupDigits(parseAmount(input.value)))),
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (onSubmit(new FormData(form)) !== false) closeSheet();
  });

  const autofocus = root.querySelector("[autofocus]");
  if (autofocus) setTimeout(() => autofocus.focus(), 50);

  return form;
}

// A removed category stays selectable on the old entries that use it,
// so saving an old entry never quietly moves it to another category.
const optionsHtml = (list, selected) =>
  (selected && !list.includes(selected) ? [...list, selected] : list)
    .map((item) => `<option ${item === selected ? "selected" : ""}>${esc(item)}</option>`).join("");

/** Wire a two-button segmented control; calls onChange(value) when a side is picked. */
function bindSegment(form, attribute, onChange) {
  form.addEventListener("click", (e) => {
    const button = e.target.closest(`[data-${attribute}]`);
    if (!button) return;
    const value = button.dataset[attribute];
    form.querySelectorAll(`[data-${attribute}]`).forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset[attribute] === value)),
    );
    onChange(value);
  });
}

// ---------- Cash or ATM/digital ----------

/** A Cash | ATM / Digital picker. Wire it with bindSegment(form, "acct", ...). */
function accountPicker(selected, label) {
  return `
    <div class="field">
      <span class="field-label" id="acctLabel">${label}</span>
      <div class="seg" role="group" aria-labelledby="acctLabel">
        ${ACCOUNTS.map((a) =>
          `<button type="button" data-acct="${a.id}" aria-pressed="${a.id === selected}">${a.label}</button>`).join("")}
      </div>
    </div>`;
}

/** The account picked last time on a new entry or payment, so it's preselected next time. */
function preferredAccount() {
  return ACCOUNTS.some((a) => a.id === settings.lastAccount) ? settings.lastAccount : DEFAULT_ACCOUNT;
}

function rememberAccount(id) {
  if (settings.lastAccount === id) return;
  settings.lastAccount = id;
  saveSettings();
}

const accountPrompt = (type) => (type === "income" ? "Received in" : "Paid with");

// ---------- Income / expense entry ----------

const notePlaceholder = (type) => (type === "income" ? "e.g. Freelance design job" : "e.g. Lunch, Grab to office");

/** The month after the one a "YYYY-MM-DD" date falls in. */
const monthAfter = (date) => addMonths((date || todayISO).slice(0, 7), 1);

/** New income received late in the month counts toward next month by default. */
const defaultsToNextMonth = (date) => Number((date || todayISO).slice(8, 10)) >= PAYDAY_ROLLOVER_DAY;

/** Add a new entry, or edit `entry` when given. */
export function openEntrySheet(entry = null) {
  let type = entry?.type || "expense";
  let account = entry ? accountOf(entry) : preferredAccount();
  const defaultDate = entry?.date || (ui.month === thisMonth ? todayISO : ui.month + "-01");
  let countsNext = entry ? Boolean(entry.budgetMonth) : defaultsToNextMonth(defaultDate);
  let countsNextTouched = Boolean(entry); // don't overwrite a choice already made

  const html = `
    <h2>${entry ? "Edit entry" : "New entry"}</h2>
    <div class="seg" role="group" aria-label="Type">
      <button type="button" data-type="expense" aria-pressed="${type === "expense"}">Expense</button>
      <button type="button" data-type="income" aria-pressed="${type === "income"}">Income</button>
    </div>
    <div class="field">
      <label for="f-amt">Amount (Rp)</label>
      <input id="f-amt" name="amount" class="bigamt" inputmode="numeric" data-money autocomplete="off" value="${groupDigits(entry?.amount)}" autofocus>
    </div>
    ${accountPicker(account, accountPrompt(type))}
    <div class="two">
      <div class="field">
        <div class="label-row">
          <label for="f-cat">Category</label>
          <button type="button" class="linkbtn" id="catNew" aria-expanded="false">+ New</button>
        </div>
        <select id="f-cat" name="category">${optionsHtml(categoriesFor(type), entry?.category)}</select>
      </div>
      <div class="field">
        <label for="f-date">Date</label>
        <input id="f-date" type="date" name="date" value="${defaultDate}">
      </div>
    </div>
    <div class="field cat-add" id="catAdd" hidden>
      <label for="f-newcat">New category</label>
      <div class="inline-add">
        <input id="f-newcat" maxlength="30" autocomplete="off" placeholder="e.g. Pets, Coffee">
        <button type="button" class="btn" id="catSave">Add</button>
      </div>
    </div>
    <div class="field">
      <label for="f-note">Note</label>
      <input id="f-note" name="note" maxlength="80" placeholder="${notePlaceholder(type)}" value="${esc(entry?.note || "")}">
    </div>
    <label class="checkfield" id="nextWrap" ${type === "income" ? "" : "hidden"}>
      <input type="checkbox" id="f-next" ${countsNext ? "checked" : ""}>
      <span>Counts toward <b id="nextLabel">${monthLabel(monthAfter(defaultDate))}</b>'s budget
        <span class="muted small">Use for salary that pays for the month ahead.</span></span>
    </label>`;

  const onSubmit = (form) => {
    const amount = parseAmount(form.get("amount"));
    if (!amount) {
      toast("Enter an amount above zero.");
      return false;
    }
    const date = form.get("date") || todayISO;
    const fields = {
      type,
      amount,
      category: form.get("category"),
      date,
      note: String(form.get("note") || "").trim(),
      account,
    };
    if (!entry) rememberAccount(account);
    if (type === "income" && countsNext) fields.budgetMonth = monthAfter(date);
    if (entry) {
      delete entry.budgetMonth; // re-set below only if still ticked
      Object.assign(entry, fields);
    } else {
      data.tx.push({ id: newId(), ...fields, createdAt: Date.now() });
    }
    saveData();
    toast(entry ? "Entry updated" : "Entry saved");
    render();
  };

  const onDelete = entry
    ? () => {
        data.tx = data.tx.filter((t) => t.id !== entry.id);
        saveData();
        toast("Entry deleted");
        render();
      }
    : null;

  const form = openSheet(html, onSubmit, onDelete);
  const catSelect = form.querySelector("#f-cat");
  const catAdd = form.querySelector("#catAdd");
  const catInput = form.querySelector("#f-newcat");
  const catToggle = form.querySelector("#catNew");

  const showCatAdd = (show) => {
    catAdd.hidden = !show;
    catToggle.setAttribute("aria-expanded", String(show));
    if (show) catInput.focus();
  };
  const saveNewCategory = () => {
    const { error, name } = addCategory(type, catInput.value);
    if (error) {
      toast(error);
      return;
    }
    catSelect.innerHTML = optionsHtml(categoriesFor(type), name);
    catInput.value = "";
    showCatAdd(false);
    toast(`Added "${name}"`);
  };

  catToggle.addEventListener("click", () => showCatAdd(catAdd.hidden));
  form.querySelector("#catSave").addEventListener("click", saveNewCategory);
  catInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // don't submit the entry
      saveNewCategory();
    }
  });

  const nextWrap = form.querySelector("#nextWrap");
  const nextBox = form.querySelector("#f-next");
  const dateInput = form.querySelector("#f-date");
  nextBox.addEventListener("change", () => {
    countsNext = nextBox.checked;
    countsNextTouched = true;
  });
  dateInput.addEventListener("change", () => {
    form.querySelector("#nextLabel").textContent = monthLabel(monthAfter(dateInput.value));
    if (!countsNextTouched) nextBox.checked = countsNext = defaultsToNextMonth(dateInput.value);
  });

  bindSegment(form, "type", (value) => {
    type = value;
    catSelect.innerHTML = optionsHtml(categoriesFor(type));
    form.querySelector("#f-note").placeholder = notePlaceholder(type);
    nextWrap.hidden = type !== "income";
    form.querySelector("#acctLabel").textContent = accountPrompt(type);
    showCatAdd(false);
  });
  bindSegment(form, "acct", (value) => (account = value));
}

// ---------- Setting the balance ----------

/**
 * Set cash and ATM/digital to what you really have. Each account that differs gets its own
 * correction, so neither is counted as income or spending. A field left empty is unchanged.
 */
export function openBalanceSheet() {
  const current = Object.fromEntries(ACCOUNTS.map(({ id }) => [id, balanceAt(null, id)]));
  const isFirst = !data.adjust.length;

  const fields = ACCOUNTS.map(({ id, label }) => `
    <div class="field">
      <label for="a-${id}">${label} now (Rp)</label>
      <input id="a-${id}" name="${id}" class="bigamt" inputmode="numeric" data-money autocomplete="off"
        placeholder="${isFirst ? "0" : groupDigits(Math.max(0, current[id])) || "0"}">
      <div class="muted small" id="a-diff-${id}">${isFirst ? "" : `App has ${money(current[id])}. Leave empty to keep.`}</div>
    </div>`).join("");

  const html = `
    <h2>${isFirst ? "Set your starting balance" : "Correct your balance"}</h2>
    <div class="muted small">${isFirst
      ? "Count the cash in your wallet, and add up your bank accounts and e-wallets. From here on the app adds income and subtracts spending from the one you pick."
      : "If your cash or your bank and e-wallets add up to something else than the app shows, enter the real amount."}</div>
    ${fields}
    <div class="field">
      <label for="a-note">Note</label>
      <input id="a-note" name="note" maxlength="80" placeholder="${isFirst ? "Starting balance" : "e.g. Forgot some cash purchases"}">
    </div>`;

  const onSubmit = (form) => {
    const note = String(form.get("note") || "").trim() || (isFirst ? "Starting balance" : "Balance correction");
    let changed = 0;
    for (const { id } of ACCOUNTS) {
      const raw = String(form.get(id) || "").trim();
      if (!raw) continue;
      const difference = parseAmount(raw) - current[id];
      if (!difference) continue;
      data.adjust.push({ id: newId(), date: todayISO, amount: difference, note, account: id });
      changed++;
    }
    if (!changed) {
      toast(isFirst ? "Enter how much you have now." : "Already matches. Nothing to change.");
      return isFirst ? false : undefined;
    }
    saveData();
    toast(isFirst ? "Starting balance set" : "Balance corrected");
    render();
  };

  const form = openSheet(html, onSubmit);
  for (const { id } of ACCOUNTS) {
    const hint = form.querySelector(`#a-diff-${id}`);
    form.querySelector(`#a-${id}`).addEventListener("input", (e) => {
      const change = parseAmount(e.target.value) - current[id];
      if (!e.target.value) hint.textContent = isFirst ? "" : `App has ${money(current[id])}. Leave empty to keep.`;
      else if (!change) hint.textContent = "Matches. No change.";
      else hint.textContent = `Correction of ${change > 0 ? "+" : "−"}${money(Math.abs(change))}. Not counted as income or spending.`;
    });
  }
}

// ---------- Moving money between cash and ATM/digital ----------

/** Record a transfer (ATM withdrawal, cash deposit, top-up), or edit `transfer` when given. */
export function openTransferSheet(transfer = null) {
  let from = transfer?.from || "digital"; // most common: taking cash out at an ATM
  const defaultDate = transfer?.date || (ui.month === thisMonth ? todayISO : ui.month + "-01");

  const html = `
    <h2>${transfer ? "Edit transfer" : "Move money"}</h2>
    <div class="seg" role="group" aria-label="Direction">
      ${ACCOUNTS.map((a) => `<button type="button" data-from="${a.id}" aria-pressed="${a.id === from}">
        ${a.label} → ${accountLabel(otherAccount(a.id))}</button>`).join("")}
    </div>
    <div class="field">
      <label for="t-amt">Amount (Rp)</label>
      <input id="t-amt" name="amount" class="bigamt" inputmode="numeric" data-money autocomplete="off" value="${groupDigits(transfer?.amount)}" autofocus>
    </div>
    <div class="two">
      <div class="field">
        <label for="t-date">Date</label>
        <input id="t-date" type="date" name="date" value="${defaultDate}">
      </div>
      <div class="field">
        <label for="t-note">Note</label>
        <input id="t-note" name="note" maxlength="80" placeholder="${noteFor(from)}" value="${esc(transfer?.note || "")}">
      </div>
    </div>
    <div class="muted small" id="t-hint"></div>
    <div class="muted small">A transfer only moves money. It isn't income or spending, and your total stays the same. If the ATM or bank charged a fee, add it as a separate expense.</div>`;

  const onSubmit = (form) => {
    const amount = parseAmount(form.get("amount"));
    if (!amount) {
      toast("Enter an amount above zero.");
      return false;
    }
    const fields = {
      date: form.get("date") || todayISO,
      amount,
      from,
      to: otherAccount(from),
      note: String(form.get("note") || "").trim(),
    };
    if (transfer) Object.assign(transfer, fields);
    else data.transfers.push({ id: newId(), ...fields, createdAt: Date.now() });
    saveData();
    toast(`${transfer ? "Transfer updated" : "Moved"}: ${money(amount)} to ${accountLabel(fields.to)}`);
    render();
  };

  const onDelete = transfer
    ? () => {
        data.transfers = data.transfers.filter((t) => t.id !== transfer.id);
        saveData();
        toast("Transfer deleted");
        render();
      }
    : null;

  const form = openSheet(html, onSubmit, onDelete);
  const hint = form.querySelector("#t-hint");
  const amountInput = form.querySelector("#t-amt");
  const dateInput = form.querySelector("#t-date");

  // Show what the source account has on that day, and warn when the transfer is more than that.
  const updateHint = () => {
    const available = balanceAt(dateInput.value || todayISO, from, transfer?.id);
    const amount = parseAmount(amountInput.value);
    const left = available - amount;
    hint.textContent = amount
      ? `${accountLabel(from)} after this: ${left < 0 ? "−" : ""}${money(Math.abs(left))}${left < 0 ? ". That's more than you have there." : ""}`
      : `${accountLabel(from)} has ${available < 0 ? "−" : ""}${money(Math.abs(available))}.`;
    hint.classList.toggle("warn-text", left < 0);
  };
  amountInput.addEventListener("input", updateHint);
  dateInput.addEventListener("change", updateHint);
  bindSegment(form, "from", (value) => {
    from = value;
    form.querySelector("#t-note").placeholder = noteFor(from);
    updateHint();
  });
  updateHint();
}

function noteFor(from) {
  return from === "digital" ? "e.g. ATM withdrawal" : "e.g. Deposit, e-wallet top-up";
}

// ---------- Paying a bill ----------

/** Mark `bill` paid for `month`, with the amount actually paid and any discount or voucher. */
export function openPaySheet(bill, month) {
  // Paying this month or ahead of time: today. Catching up on a past month: its due date.
  const defaultPaidOn = month >= thisMonth ? todayISO : `${month}-${pad2(dueDayIn(bill, month))}`;
  let account = preferredAccount();

  const html = `
    <h2>Pay ${esc(bill.name)}</h2>
    <div class="muted small">${monthLabel(month)} · due ${dueDayIn(bill, month)}</div>
    <div class="field">
      <label for="p-amt">Bill amount (Rp)</label>
      <input id="p-amt" name="amount" class="bigamt" inputmode="numeric" data-money autocomplete="off" value="${groupDigits(bill.amount)}">
    </div>
    <div class="two">
      <div class="field">
        <label for="p-disc">Discount / voucher (Rp)</label>
        <input id="p-disc" name="discount" inputmode="numeric" data-money class="num" autocomplete="off" placeholder="0">
      </div>
      <div class="field">
        <label for="p-date">Paid on</label>
        <input id="p-date" type="date" name="paidOn" value="${defaultPaidOn}">
      </div>
    </div>
    ${accountPicker(account, "Paid with")}
    <div class="muted small" id="p-total">You pay ${money(bill.amount)}</div>`;

  const onSubmit = (form) => {
    const billed = parseAmount(form.get("amount"));
    const discount = parseAmount(form.get("discount"));
    if (!billed) {
      toast("Enter the bill amount.");
      return false;
    }
    if (discount >= billed) {
      toast("The discount must be less than the bill.");
      return false;
    }
    const payment = {
      id: newId(),
      billId: bill.id,
      month,
      name: bill.name,
      category: bill.category,
      kind: bill.kind,
      amount: billed - discount,
      paidOn: form.get("paidOn") || defaultPaidOn,
      account,
    };
    rememberAccount(account);
    if (discount) Object.assign(payment, { billed, discount });
    data.pays.push(payment);
    saveData();
    toast(discount ? `${bill.name} paid, saved ${money(discount)}` : `${bill.name} paid`);
    render();
  };

  const form = openSheet(html, onSubmit);
  bindSegment(form, "acct", (value) => (account = value));
  const total = form.querySelector("#p-total");
  form.addEventListener("input", () => {
    const paid = parseAmount(form.querySelector("#p-amt").value) - parseAmount(form.querySelector("#p-disc").value);
    total.textContent = paid > 0 ? `You pay ${money(paid)}` : "The discount must be less than the bill.";
  });
}

// ---------- Bill / credit ----------

/** Add a new bill, or edit `bill` when given. */
export function openBillSheet(bill = null) {
  let kind = bill?.kind || "bill";
  const creditOnly = (k) => (k === "credit" ? "" : "hidden");

  const html = `
    <h2>${bill ? "Edit" : "New"} bill or credit</h2>
    <div class="seg" role="group" aria-label="Kind">
      <button type="button" data-kind="bill" aria-pressed="${kind === "bill"}">Monthly bill</button>
      <button type="button" data-kind="credit" aria-pressed="${kind === "credit"}">Credit / installment</button>
    </div>
    <div class="field">
      <label for="b-name">Name</label>
      <input id="b-name" name="name" maxlength="50" placeholder="e.g. PLN electricity, Kos rent, Motor credit" value="${esc(bill?.name || "")}" autofocus>
    </div>
    <div class="two">
      <div class="field">
        <label for="b-amt">Amount per month (Rp)</label>
        <input id="b-amt" name="amount" inputmode="numeric" data-money class="num" value="${groupDigits(bill?.amount)}">
      </div>
      <div class="field">
        <label for="b-day">Due day of month</label>
        <input id="b-day" name="dueDay" type="number" inputmode="numeric" min="1" max="31" value="${bill?.dueDay || ""}" placeholder="1–31">
      </div>
    </div>
    <div class="two">
      <div class="field">
        <label for="b-start">Starts</label>
        <input id="b-start" name="startMonth" type="month" value="${bill?.startMonth || ui.month}">
      </div>
      <div class="field" id="instWrap" ${creditOnly(kind)}>
        <label for="b-inst">Total installments</label>
        <input id="b-inst" name="installments" type="number" inputmode="numeric" min="1" max="360" value="${bill?.installments || ""}" placeholder="e.g. 12">
      </div>
    </div>
    <div class="muted small" id="instHint" ${creditOnly(kind)}>Set "Starts" to the month of installment 1, so the app knows which one you're on.</div>`;

  const onSubmit = (form) => {
    const name = String(form.get("name") || "").trim();
    const amount = parseAmount(form.get("amount"));
    if (!name || !amount) {
      toast("Add a name and an amount.");
      return false;
    }
    const fields = {
      name,
      amount,
      dueDay: Math.min(31, Math.max(1, Number(form.get("dueDay")) || 1)),
      kind,
      category: kind === "credit" ? CREDIT_CATEGORY : BILL_CATEGORY,
      startMonth: form.get("startMonth") || ui.month,
      installments: kind === "credit" ? Number(form.get("installments")) || 0 : 0,
    };
    if (bill) Object.assign(bill, fields);
    else data.bills.push({ id: newId(), ...fields });
    saveData();
    toast(bill ? "Bill updated" : "Bill added");
    render();
  };

  const onDelete = bill
    ? () => {
        data.bills = data.bills.filter((b) => b.id !== bill.id);
        saveData();
        toast("Bill removed. Past payments stay in your reports.");
        render();
      }
    : null;

  const form = openSheet(html, onSubmit, onDelete);
  bindSegment(form, "kind", (value) => {
    kind = value;
    form.querySelector("#instWrap").hidden = kind !== "credit";
    form.querySelector("#instHint").hidden = kind !== "credit";
  });
}
