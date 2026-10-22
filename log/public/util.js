// Small helpers shared by the views and dialogs. The generic ones come from the shared design/ui.js.
export { $, esc, toast } from "/design/ui.js";

// Time is whole minutes everywhere; hours only on screen, without trailing zeros (375 -> "6.25", 420 -> "7")
export const hours = min => String(Math.round(min / 60 * 100) / 100);
export const signed = min => (min > 0 ? "+" : min < 0 ? "−" : "") + hours(Math.abs(min));
// Hours typed in a form, to minutes in 15-minute steps
export const toMinutes = h => Math.round(Number(h) * 4) * 15;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function parseDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
export function isoDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const fmtDate = (iso, opts = { month: "short", day: "numeric" }) => parseDate(iso).toLocaleDateString(undefined, opts);
export const clock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
