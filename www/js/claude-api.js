// "Analyze with Claude": sends the month's report to the Claude API using the user's own key.

import { settings } from "./storage.js";
import { ui } from "./state.js";
import { render } from "./views.js";
import { monthReportText } from "./finance.js";
import { toast } from "./utils.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const MAX_TOKENS = 4000; // room for Claude's thinking plus a ~220-word answer

function buildPrompt(month) {
  return `You are reviewing one month of a person's personal finances in Indonesia (amounts in IDR, Rupiah). Using only the report below, write a practical review in plain English:
1. A one-line verdict on the month.
2. The 3 most realistic places to cut spending, each with a rough Rupiah amount per month.
3. Any risk from bills, credits or installments (unpaid, overdue, or too large a share of income).
4. One concrete action for next month.
Keep it under 220 words. Use short numbered points, no tables, no markdown headings.

${monthReportText(month)}`;
}

/** Turn an API error response into a message the user can act on. */
function explainError(status, message) {
  if (status === 401) return "The API key was rejected. Check it under Export → Claude API.";
  if (status === 429) return "Rate limit reached. Wait a minute and try again.";
  if (status === 400 && /workspace/i.test(message)) {
    return "This key isn't tied to a workspace. Add your Workspace ID under Export → Claude API, or create a new key and pick a workspace for it.";
  }
  if (status === 400 && /credit/i.test(message)) return "Your API account has no credit. Add credit at platform.claude.com.";
  return `Claude returned an error (${status}): ${message}`;
}

async function requestAnalysis(month) {
  const headers = {
    "content-type": "application/json",
    "x-api-key": settings.apiKey,
    "anthropic-version": API_VERSION,
    // Required for calls made directly from an app or browser rather than a server.
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (settings.workspace) headers["anthropic-workspace-id"] = settings.workspace;

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: settings.model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: buildPrompt(month) }],
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(explainError(response.status, body?.error?.message || response.statusText));
  }

  // The reply can contain thinking blocks; only the text blocks are the answer.
  const text = (body.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || "Claude returned no text. Try again.";
}

/** Run the analysis for the month on screen and show the result on the Report tab. */
export async function analyzeMonth() {
  if (!navigator.onLine) {
    toast("You're offline. Connect to the internet to analyze.");
    return;
  }

  const analysis = ui.analysis;
  Object.assign(analysis, { month: ui.month, text: "", isError: false, isBusy: true });
  render();

  try {
    analysis.text = await requestAnalysis(analysis.month);
  } catch (error) {
    const isNetworkError = /Failed to fetch|NetworkError|Load failed/i.test(error.message || "");
    analysis.isError = true;
    analysis.text = isNetworkError || !error.message
      ? "Couldn't reach Claude. Check your internet connection."
      : error.message;
  }

  analysis.isBusy = false;
  render();
}
