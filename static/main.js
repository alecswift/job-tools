// Page entry: picks the view from the URL hash, wires up clicks and form input, loads the state.
import { PLAN, TOPIC_PATTERN } from "./plan.js";
import { $, local, toast, fmtDate } from "./util.js";
import { state, onChange, load, send, setPlan } from "./store.js";
import { ui, DIFF, TEXT_COLS, planSets, viewPlan, viewQueue, viewLog, logRows, viewHow, weightWarning } from "./views.js";
import { openProblem, openRetry } from "./dialogs.js";

const VIEWS = { plan: viewPlan, retryqueue: viewQueue, log: viewLog, how: viewHow };

function render() {
  const S = state(), v = location.hash.slice(1);
  const view = v in VIEWS ? v : "plan";
  document.querySelectorAll("nav a").forEach(a => { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#today").textContent = fmtDate(S.today);
  $("#view").innerHTML = VIEWS[view](S);
  // A quiz-only plan problem shows a dot, which can only be set from script
  document.querySelectorAll(".chk[data-partial]").forEach(c => { c.indeterminate = true; });
}
onChange(render);

const findProblem = slug => state().problems.find(p => p.slug === slug);

// A plan tick means the problem is logged, so ticking opens the Log dialog and the tick comes from the saved log.
// The box goes back to how it was until then: closing the dialog without saving changes nothing.
function tickPlan(box) {
  const slug = box.dataset.s, logged = !!findProblem(slug);
  box.checked = logged;
  box.indeterminate = !logged && state().plan.quiz.includes(slug);
  if (logged) return toast("Delete it from the Log to untick it");
  const p = PLAN.problems.find(x => x.slug === slug);
  openProblem(null, {
    prefill: { name: p.name, slug, difficulty: DIFF[p.diff], pattern: TOPIC_PATTERN[p.topic] },
    title: `Log “${p.name}”`,
    intro: "Say how it went to tick it off and schedule its retries. Closing without saving leaves it unticked.",
  });
}

$("#addBtn").onclick = () => openProblem(null);
document.addEventListener("click", e => {
  const qb = e.target.closest(".qbtn");
  if (qb) {
    const slug = qb.dataset.q, { quiz } = planSets(state());
    if (quiz.has(slug)) quiz.delete(slug); else quiz.add(slug);
    setPlan(quiz);
    const el = document.querySelector(`.qbtn[data-q="${slug}"]`); if (el) el.focus();
  }
  const r = e.target.closest("[data-retry]"), ed = e.target.closest("[data-edit]"), th = e.target.closest("th[data-sort]");
  if (r) openRetry(findProblem(r.dataset.retry));
  if (ed) openProblem(findProblem(ed.dataset.edit));
  if (th) {
    const k = th.dataset.sort;
    ui.logSort = { key: k, dir: ui.logSort.key === k ? -ui.logSort.dir : (TEXT_COLS.includes(k) ? 1 : -1) };
    render();
  }
  if (e.target.id === "resetBtn") {
    $("#resetZone").innerHTML = `<span class="confirm">Reset weights, spacing and targets? <button type="button" class="btn small danger" id="resetYes">Reset</button><button type="button" class="btn small" id="resetNo">Cancel</button></span>`;
  }
  if (e.target.id === "resetNo") render();
  if (e.target.id === "resetYes") send("POST", "/api/settings/reset").then(() => toast("Settings reset"), err => toast(err.message));
});
document.addEventListener("input", e => {
  if (e.target.id === "q") { ui.logFilter.q = e.target.value; $("#logBody").innerHTML = logRows(state()); }
  if (e.target.closest("#settingsForm") && e.target.name?.startsWith("weight")) {
    const f = e.target.form, sum = +(["weightHelp", "weightConfidence", "weightTime"].reduce((a, k) => a + (+f.elements[k].value || 0), 0)).toFixed(2);
    const w = $("#wsum"); w.hidden = sum === 1; w.textContent = weightWarning(sum);
  }
});
document.addEventListener("change", e => {
  if (e.target.matches(".chk")) tickPlan(e.target);
  if (e.target.id === "planHide") { ui.planHide = e.target.checked; local.set("ncplan.hide", ui.planHide); render(); }
  if (e.target.id === "fp") { ui.logFilter.pattern = e.target.value; $("#logBody").innerHTML = logRows(state()); }
  if (e.target.id === "fs") { ui.logFilter.status = e.target.value; $("#logBody").innerHTML = logRows(state()); }
});
document.addEventListener("submit", async e => {
  if (e.target.id !== "settingsForm") return;
  e.preventDefault();
  const body = {};
  for (const [k, v] of new FormData(e.target)) body[k] = k === "patterns" ? v.split("\n") : v;
  try { await send("PUT", "/api/settings", body); toast("Settings saved"); }
  catch (err) { $("#setErr").textContent = err.message; }
});
window.addEventListener("hashchange", render);

load().catch(() => {
  $("#view").innerHTML = `<div class="empty">Can't reach the server. Start it with <span class="mono">python3 -m backend</span> and reload.</div>`;
});

// Dev mode (python3 -m backend --dev): reload when the code changes.
// Stops on the first 404, so it does nothing in normal mode.
(async function devReload() {
  let ver = null;
  while (true) {
    try {
      const r = await fetch("/api/dev/version");
      if (r.status === 404) return;
      const v = (await r.json()).version;
      if (ver !== null && v !== ver) return location.reload();
      ver = v;
    } catch { /* server restarting */ }
    await new Promise(res => setTimeout(res, 1000));
  }
})();
