// App-wide constants: categories, Claude models and storage keys.

export const INCOME_CATEGORIES = ["Salary", "Side income", "Other income"];

export const EXPENSE_CATEGORIES = [
  "Food & drinks",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills & utilities",
  "Credit & installments",
  "Entertainment",
  "Health",
  "Family & giving",
  "Education",
  "Other",
];

// Categories that are usually easiest to cut back on. Used by the "what you can reduce" hints.
export const FLEXIBLE_CATEGORIES = ["Food & drinks", "Shopping", "Entertainment", "Other", "Transport"];

// Income received on or after this day defaults to counting toward next month's budget
// (salary on the 25th pays for the month ahead). You can untick it on any entry.
export const PAYDAY_ROLLOVER_DAY = 25;

export const BILL_CATEGORY = "Bills & utilities";
export const CREDIT_CATEGORY = "Credit & installments";

export const CLAUDE_MODELS = [
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (balanced)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest)" },
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (most thorough)" },
];

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export const STORAGE_KEYS = {
  data: "pocketLedger.v1",
  settings: "pocketLedger.settings",
};

// Remind the user to back up when the last backup is older than this.
export const BACKUP_REMINDER_DAYS = 30;
