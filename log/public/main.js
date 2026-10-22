// Page entry: picks the view from the URL hash, wires up clicks and form input, loads the state.
import { $, toast, toMinutes, fmtDate } from "./util.js";
import { ui, state, onChange, load, loadEntries, showWeek, setPlan, deleteEntry, editActivity, deleteActivity } from "./store.js";
import { viewWeek, viewLog, logRows } from "./views.js";
import { openEntry, openActivity } from "./dialogs.js";
import { renderTimer, onTimerClick, pickTimerActivity } from "./timer.js";
import { appSwitcher, devReload } from "/design/ui.js";

const VIEWS = { week: viewWeek, log: viewLog };

function render() {
  const current = state(), hash = location.hash.slice(1);
  if (!current) return; // the entries can arrive before the state
  const view = hash in VIEWS ? hash : "week";
  document.querySelectorAll("nav a").forEach(a => { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#today").textContent = fmtDate(current.today, { weekday: "short", month: "short", day: "numeric" });
  // Don't redraw the page under someone typing in it (the timer refreshes the state every 30 seconds)
  const typing = document.activeElement?.matches("#view input, #view select");
  if (!typing) $("#view").innerHTML = VIEWS[view](current);
  else if (view === "log") $("#logBody").innerHTML = logRows();
  renderTimer(current);
}
onChange(render);

const activity = id => state().activities.find(a => a.id === Number(id));
const fail = err => toast(err.message);

$("#addBtn").onclick = () => openEntry(null);
document.addEventListener("click", e => {
  const t = e.target.closest("button, [data-week]");
  if (!t) return;
  const d = t.dataset;
  if (d.week) showWeek(d.week).catch(fail);
  if (t.id === "addActivityBtn") openActivity(null);
  if (d.timer) onTimerClick(d.timer).catch(fail);
  if (d.editActivity) openActivity(activity(d.editActivity));
  if (d.archive && confirm(`Archive ${activity(d.archive).name}? Its plan becomes 0 from this week; past weeks and entries keep it.`)) editActivity(Number(d.archive), { archived: true }).catch(fail);
  if (d.deleteActivity && confirm(`Delete ${activity(d.deleteActivity).name}?`)) deleteActivity(Number(d.deleteActivity)).catch(fail);
  if (d.editEntry) openEntry(ui.entries.find(x => x.id === Number(d.editEntry)));
  if (d.deleteEntry && confirm("Delete this entry? This can't be undone.")) deleteEntry(Number(d.deleteEntry)).then(() => toast("Entry deleted"), fail);
});
document.addEventListener("input", e => {
  if (e.target.id === "q") { ui.logFilter.q = e.target.value; loadEntries().catch(fail); }
});
document.addEventListener("change", e => {
  if (e.target.id === "fa") { ui.logFilter.activity = e.target.value; loadEntries().catch(fail); }
  if (e.target.id === "timerActivity") pickTimerActivity(e.target.value);
  // Planned cells save when you leave them. An emptied or unreadable cell goes back to the saved number.
  if (e.target.dataset.plan) {
    e.target.blur();
    const hours = e.target.value.trim();
    if (hours === "" || !Number.isFinite(Number(hours))) return load();
    setPlan(Number(e.target.dataset.plan), toMinutes(hours)).then(() => toast("Plan saved"), err => { toast(err.message); load(); });
  }
});
window.addEventListener("hashchange", render);

appSwitcher("log");
Promise.all([load(), loadEntries()]).catch(() => {
  $("#view").innerHTML = `<div class="empty">Can't reach the server. Start it with <span class="mono">bin/server</span> and reload.</div>`;
});
// Dev mode (bin/server --dev): reload when the code changes.
devReload();
