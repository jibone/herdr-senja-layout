import { makeWindow, monthBeforeReset, okReport, errorReport, unavailableReport, jsonLines } from "../lib/report.js";

const SOURCE = "opencode api usage/limits";
const PLAN = "Go";
const FULL = 100;
const HOUR_S = 3600;
const DAY_S = 24 * HOUR_S;
const METERS = [
  { id: "rolling", short: "5h", long: "5-hour", durationSec: 5 * HOUR_S },
  { id: "weekly", short: "wk", long: "Weekly", durationSec: 7 * DAY_S },
  { id: "monthly", short: "mo", long: "Monthly", durationSec: 30 * DAY_S },
];

const msToEpoch = (ms) => (Number.isFinite(ms) ? Math.floor(ms / 1000) : null);

function meterWindow(m, meter) {
  if (!meter || !Number.isFinite(meter.percent)) return null;
  const resetsAt = msToEpoch(meter.resetsAt);
  const monthly = m.id === "monthly" && resetsAt != null ? monthBeforeReset(resetsAt) : null;
  return makeWindow({
    id: m.id,
    short: m.short,
    long: m.long,
    percent: meter.limited ? Math.max(meter.percent, FULL) : meter.percent,
    resetsAt,
    durationSec: monthly ?? m.durationSec,
  });
}

export function parse(text, now) {
  const lines = jsonLines(text);
  const go = lines.find((m) => m.data?.go)?.data.go;
  if (!go) return errorReport(SOURCE, String(lines.find((m) => m.message)?.message ?? "No reply from OpenCode"), now);
  const windows = METERS.map((m) => meterWindow(m, go[m.id])).filter(Boolean);
  if (windows.length === 0) return unavailableReport(SOURCE, "No OpenCode Go limits", now);
  return okReport(SOURCE, now, windows, PLAN);
}

export default {
  id: "opencode-go",
  name: "OpenCode Go",
  icon: "icons/opencode.svg",
  oneColorGlyph: true,
  helper: "helpers/opencode-go-limits.sh",
  parse,
};
