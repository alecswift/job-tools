// The page's copy of the server state, and every call that changes it.
// Each change returns the whole new state from the server; listeners (the page render) run after it lands.
import { toast } from "./util.js";

let S = null;
const listeners = [];
export const state = () => S;
export function onChange(fn) { listeners.push(fn); }
const notify = () => listeners.forEach(fn => fn());

async function request(method, path, body) {
  const r = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Request failed");
  return j;
}

export async function send(method, path, body) {
  S = await request(method, path, body);
  if (planLatest) S.plan = planLatest;  // a plan save may still be on its way
  notify();
  return S;
}
export const load = () => send("GET", "/api/state");

// What a problem would score, without saving it. Uses the server's formulas, so it matches what gets stored.
export const preview = fields => request("POST", "/api/preview", fields);

// A LeetCode problem's number, title, difficulty and tags, from a link or slug
export const lookup = text => request("GET", "/api/lookup?q=" + encodeURIComponent(text));

// Quiz marks update the page right away and the server copy follows. Saves run one at a time, in order.
let planSaving = Promise.resolve(), planLatest = null;
export function setPlan(quiz) {
  const plan = planLatest = { quiz: [...quiz] };
  S.plan = plan;
  notify();
  // Keep the newest local marks in case another click came in while this save was in flight
  planSaving = planSaving
    .then(() => request("PUT", "/api/plan", plan))
    .then(next => { S = { ...next, plan: planLatest }; })
    .catch(async err => { toast("Couldn't save: " + err.message); planLatest = null; await load().catch(() => {}); });
}
