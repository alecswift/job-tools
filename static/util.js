// Small helpers shared by the views and dialogs.
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Same names as scheduling.py's DIFFICULTIES and statuses. DIFF maps the plan's E/M/H codes.
export const DIFF = { E: "Easy", M: "Medium", H: "Hard" };
export const DIFFICULTIES = Object.values(DIFF);
export const STATUS = { retry: "Retry now", wait: "Not yet", mastered: "Mastered" };  // key = the pill's CSS class
export const HELP_GUIDE = "0 solved solo · 2–3 small hint or peeked at a tag · 5 looked up the approach · 7–8 followed a written solution · 10 copied the answer";

export function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 1800); }
export function fmtDate(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
export function rel(n) { if (n == null) return ""; if (n === 0) return "due today"; if (n < 0) return `${-n} day${n === -1 ? "" : "s"} overdue`; return `in ${n} day${n === 1 ? "" : "s"}`; }
export function pill(status) { const cls = Object.keys(STATUS).find(k => STATUS[k] === status); return status ? `<span class="pill ${cls}">${status}</span>` : ""; }

// Per-browser preferences (like "hide finished groups"). Never the only copy of anything.
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
