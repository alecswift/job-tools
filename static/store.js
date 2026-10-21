// The page's copy of the server state, and every call that changes it.
// Each change returns the whole new state from the server; listeners (the page render) run after it lands.
import { toast } from "./util.js";

let current = null;
const listeners = [];
export const state = () => current;
export function onChange(fn) { listeners.push(fn); }
const notify = () => listeners.forEach(fn => fn());

async function request(method, path, body) {
  const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Request failed");
  return out;
}

// A call that returns the whole new state
async function send(method, path, body) {
  current = await request(method, path, body);
  if (planLatest) current.plan = planLatest;  // a plan save may still be on its way
  notify();
  return current;
}
export const load = () => send("GET", "/api/state");

export const addProblem = fields => send("POST", "/api/problems", fields);
export const editProblem = (slug, fields) => send("PUT", `/api/problems/${slug}`, fields);
export const retryProblem = (slug, fields) => send("POST", `/api/problems/${slug}/retry`, fields);
export const deleteProblem = slug => send("DELETE", `/api/problems/${slug}`);
export const saveSettings = fields => send("PUT", "/api/settings", fields);
export const resetSettings = () => send("POST", "/api/settings/reset");

// What a problem would score, without saving it. Uses the server's formulas, so it matches what gets stored.
export const preview = fields => request("POST", "/api/preview", fields);

// A LeetCode problem's number, title, difficulty and tags, from a link or slug
export const lookup = text => request("GET", "/api/lookup?q=" + encodeURIComponent(text));

// Quiz marks update the page right away and the server copy follows. Saves run one at a time, in order.
let planSaving = Promise.resolve(), planLatest = null;
export function setPlan(quiz) {
  const plan = planLatest = { quiz: [...quiz] };
  current.plan = plan;
  notify();
  // Keep the newest local marks in case another click came in while this save was in flight
  planSaving = planSaving
    .then(() => request("PUT", "/api/plan", plan))
    .then(next => { current = { ...next, plan: planLatest }; })
    .catch(async err => { toast("Couldn't save: " + err.message); planLatest = null; await load().catch(() => {}); });
}
