import { makeWindow, monthBeforeReset, okReport, errorReport, unavailableReport, toEpoch, jsonLines } from "../lib/report.js";

const SOURCE = "gh api copilot_internal/user";
const NAMES = {
  premium_interactions: { short: "prem", long: "Premium requests" },
  chat: { short: "chat", long: "Chat" },
  completions: { short: "code", long: "Completions" },
};

function quotaWindow(id, q, resetsAt) {
  if (!q || q.unlimited || !Number.isFinite(q.percent_remaining)) return null;
  const name = NAMES[id] ?? { short: id.replace(/_/g, " "), long: id.replace(/_/g, " ") };
  return makeWindow({
    id,
    ...name,
    percent: 100 - q.percent_remaining,
    resetsAt,
    durationSec: resetsAt == null ? null : monthBeforeReset(resetsAt),
  });
}

export function parse(text, now) {
  const lines = jsonLines(text);
  const body = lines.find((m) => m.quotas || m.plan);
  if (!body) return errorReport(SOURCE, String(lines.find((m) => m.error)?.error ?? "No reply from gh"), now);
  const resetsAt = toEpoch(body.reset);
  const windows = Object.entries(body.quotas ?? {})
    .map(([id, q]) => quotaWindow(id, q, resetsAt))
    .filter(Boolean);
  if (windows.length === 0) return unavailableReport(SOURCE, "No Copilot limits", now);
  return okReport(SOURCE, now, windows, body.plan ?? null);
}

export default {
  id: "copilot",
  name: "Copilot",
  icon: "icons/copilot.svg",
  oneColorGlyph: true,
  helper: "helpers/copilot-usage.sh",
  parse,
};
