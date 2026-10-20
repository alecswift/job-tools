// Small helpers shared by the views and dialogs.
export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const HELP_GUIDE = "0 solved solo · 2–3 small hint or peeked at a tag · 5 looked up the approach · 7–8 followed a written solution · 10 copied the answer";

export function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800); }
export function fmtDate(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
export function rel(n) { if (n == null) return ""; if (n === 0) return "due today"; if (n < 0) return `${-n} day${n === -1 ? "" : "s"} overdue`; return `in ${n} day${n === 1 ? "" : "s"}`; }
export function pill(status) { const c = { "Retry now": "retry", "Not yet": "wait", "Mastered": "mastered" }[status]; return status ? `<span class="pill ${c}">${status}</span>` : ""; }

// Per-browser preferences (like "hide finished groups"). Never the only copy of anything.
export const local = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
