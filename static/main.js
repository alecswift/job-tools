// Page entry: picks the view from the URL hash, wires up clicks and form input, loads the state.
import { PLAN, TOPIC_PATTERN } from "./plan.js";
import { $, DIFF, local, toast, fmtDate } from "./util.js";
import { state, onChange, load, setPlan, saveSettings, resetSettings } from "./store.js";
import { ui, TEXT_COLS, planSets, viewPlan, viewQueue, viewLog, logRows, viewHow, weightSum, weightWarning } from "./views.js";
import { openProblem, openRetry } from "./dialogs.js";

const VIEWS = { plan: viewPlan, retryqueue: viewQueue, log: viewLog, how: viewHow };

function render() {
  const current = state(), hash = location.hash.slice(1);
  const view = hash in VIEWS ? hash : "plan";
  document.querySelectorAll("nav a").forEach(a => { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#today").textContent = fmtDate(current.today);
  $("#view").innerHTML = VIEWS[view](current);
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
  const retryBtn = e.target.closest("[data-retry]"), editBtn = e.target.closest("[data-edit]"), th = e.target.closest("th[data-sort]");
  if (retryBtn) openRetry(findProblem(retryBtn.dataset.retry));
  if (editBtn) openProblem(findProblem(editBtn.dataset.edit));
  if (th) {
    const key = th.dataset.sort;
    ui.logSort = { key, dir: ui.logSort.key === key ? -ui.logSort.dir : (TEXT_COLS.includes(key) ? 1 : -1) };
    render();
  }
  if (e.target.id === "resetBtn") {
    $("#resetZone").innerHTML = `<span class="confirm">Reset weights, spacing and targets? <button type="button" class="btn small danger" id="resetYes">Reset</button><button type="button" class="btn small" id="resetNo">Cancel</button></span>`;
  }
  if (e.target.id === "resetNo") render();
  if (e.target.id === "resetYes") resetSettings().then(() => toast("Settings reset"), err => toast(err.message));
});
document.addEventListener("input", e => {
  if (e.target.id === "q") { ui.logFilter.q = e.target.value; $("#logBody").innerHTML = logRows(state()); }
  if (e.target.closest("#settingsForm") && e.target.name?.startsWith("weight")) {
    const fields = e.target.form.elements, sum = weightSum(k => fields[k].value);
    const warn = $("#wsum"); warn.hidden = sum === 1; warn.textContent = weightWarning(sum);
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
  for (const [key, value] of new FormData(e.target)) body[key] = key === "patterns" ? value.split("\n") : value;
  try { await saveSettings(body); toast("Settings saved"); }
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
      const res = await fetch("/api/dev/version");
      if (res.status === 404) return;
      const latest = (await res.json()).version;
      if (ver !== null && latest !== ver) return location.reload();
      ver = latest;
    } catch { /* server restarting */ }
    await new Promise(res => setTimeout(res, 1000));
  }
})();
