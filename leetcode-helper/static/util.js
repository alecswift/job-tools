// Small helpers shared by the views and dialogs. The generic ones come from the shared design/ui.js.
export { $, esc, toast } from "/design/ui.js";
// Same names as scheduling.py's DIFFICULTIES and statuses. DIFF maps the plan's E/M/H codes.
export const DIFF = { E: "Easy", M: "Medium", H: "Hard" };
export const DIFFICULTIES = Object.values(DIFF);
export const STATUS = { retry: "Retry now", wait: "Not yet", mastered: "Mastered" };  // key = the pill's CSS class
export const HELP_GUIDE = "0 solved solo · 2–3 small hint or peeked at a tag · 5 looked up the approach · 7–8 followed a written solution · 10 copied the answer";

export function fmtDate(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
export function rel(n) { if (n == null) return ""; if (n === 0) return "due today"; if (n < 0) return `${-n} day${n === -1 ? "" : "s"} overdue`; return `in ${n} day${n === 1 ? "" : "s"}`; }
export function pill(status) { const cls = Object.keys(STATUS).find(k => STATUS[k] === status); return status ? `<span class="pill ${cls}">${status}</span>` : ""; }

// Per-browser preferences (like "hide finished groups"). Never the only copy of anything.
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
