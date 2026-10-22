// The page's copy of the server state and the calls that change it. Every change returns the
// state for the week on screen, so the store asks for that week (ui.week) each time.
import { toast } from "/design/ui.js";

let current = null, listeners = [], entriesAsked = 0;
export const ui = { week: null, logFilter: { q: "", activity: "" }, entries: [] };

export const state = () => current;
export const onChange = fn => listeners.push(fn);

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  const out = await res.json().catch(() => null); // errors from outside the app may not be JSON
  if (!res.ok) throw new Error(out?.error || `Something went wrong (${res.status} ${res.statusText}).`);
  return out;
}
const withWeek = path => ui.week ? `${path}${path.includes("?") ? "&" : "?"}week=${ui.week}` : path;

function set(next) {
  current = next;
  ui.week = next.week.monday;
  listeners.forEach(fn => fn(current));
}
// Once the change is saved, a failure refreshing the Log is only reported, so a dialog never offers to save twice
async function change(method, path, body) {
  set(await api(method, withWeek(path), body));
  loadEntries().catch(err => toast(err.message));
}

export const load = async () => set(await api("GET", withWeek("/api/state")));
export const showWeek = monday => { ui.week = monday; return load(); };

// Only the newest search counts: an older, slower answer is dropped
export async function loadEntries() {
  const { q, activity } = ui.logFilter, asked = ++entriesAsked;
  const entries = await api("GET", `/api/entries?q=${encodeURIComponent(q)}&activity=${activity}`);
  if (asked !== entriesAsked) return;
  ui.entries = entries;
  listeners.forEach(fn => fn(current));
}

export const addEntry = body => change("POST", "/api/entries", body);
export const editEntry = (id, body) => change("PUT", `/api/entries/${id}`, body);
export const deleteEntry = id => change("DELETE", `/api/entries/${id}`);
export const addActivity = body => change("POST", "/api/activities", body);
export const editActivity = (id, body) => change("PUT", `/api/activities/${id}`, body);
export const deleteActivity = id => change("DELETE", `/api/activities/${id}`);
export const setPlan = (activity_id, weekly_min) => change("PUT", "/api/plan", { activity_id, weekly_min });

export const timerAction = (action, body) => change("POST", `/api/timer/${action}`, body).catch(err => toast(err.message));
// Stop returns the Log time dialog's fields; the entry is saved from the dialog
export async function stopTimer() { const fields = await api("POST", "/api/timer/stop"); await load(); return fields; }
