// The Log time dialog (new entry, edit, or after the timer stops) and the activity dialog (add, rename).
import { $, esc, toast, hours, toMinutes } from "./util.js";
import { state, addEntry, editEntry, addActivity, editActivity, logTimer, timerAction } from "./store.js";

const dlg = () => $("#dlg"), form = () => $("#dlgForm");

// onDismiss: called when the dialog closes without saving (Cancel or Escape)
function open(html, onSubmit, onDismiss) {
  let saved = false;
  form().innerHTML = html;
  form().onsubmit = async e => {
    if (e.submitter?.value === "cancel") return;
    e.preventDefault();
    try { await onSubmit(new FormData(form())); saved = true; dlg().close(); }
    catch (err) { $("#dlgErr").textContent = err.message; }
  };
  dlg().onclose = () => { if (!saved) onDismiss?.(); };
  dlg().showModal();
  form().querySelector("[autofocus]")?.focus();
}

const buttons = label => `<div class="err" id="dlgErr"></div>
  <div class="row spread"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary">${label}</button></div>`;

// entry: an entry from the Log to edit, or null for a new one
export function openEntry(entry) {
  if (entry) entryDialog(entry, "Edit entry", "Save", async body => { await editEntry(entry.id, body); toast("Entry saved"); });
  else entryDialog({ date: state().today }, "Log time", "Log it", async body => { await addEntry(body); toast("Logged"); });
}

// fields: the stopped timer's entry. Closing without saving discards the time.
export function openTimerEntry(fields) {
  entryDialog(fields, "Log time", "Log it", async body => { await logTimer(body); toast("Logged"); }, () => timerAction("discard"));
}

function entryDialog(e, title, label, save, onDismiss) {
  const active = state().activities.filter(a => !a.archived || a.id === e.activity_id);
  const worked = e.worked_min == null ? "" : `<p class="hint">Worked ${e.worked_min} min on the timer (50 minutes counts as an hour).</p>`;
  open(`
    <h2>${title}</h2>
    <div class="grid2">
      <label class="f"><span>Date</span><input name="date" type="date" required value="${e.date}"></label>
      <label class="f"><span>Hours</span><input name="hours" type="number" min="0.25" max="24" step="0.25" required value="${e.credited_min == null ? "" : hours(e.credited_min)}"></label>
    </div>
    ${worked}
    <label class="f"><span>Activity</span><select name="activity_id" required>${active.map(a =>
      `<option value="${a.id}"${a.id === e.activity_id ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label>
    <label class="f"><span>What I did</span><input name="what" required value="${esc(e.what)}" autofocus></label>
    <label class="f"><span>Notes</span><textarea name="notes" rows="2">${esc(e.notes)}</textarea></label>
    ${buttons(label)}`,
    data => save({ date: data.get("date"), activity_id: Number(data.get("activity_id")), credited_min: toMinutes(data.get("hours")),
                   what: data.get("what"), notes: data.get("notes") }),
    onDismiss);
}

// activity: one to rename, or null to add one (with its weekly hours)
export function openActivity(activity) {
  const a = activity || {};
  open(`
    <h2>${activity ? "Edit activity" : "Add activity"}</h2>
    <label class="f"><span>Name</span><input name="name" required value="${esc(a.name)}" autofocus></label>
    <label class="f"><span>Hint</span><input name="hint" value="${esc(a.hint)}" placeholder="optional, e.g. reading / mock"></label>
    ${activity ? "" : `<label class="f"><span>Weekly hours</span><input name="hours" type="number" min="0" step="0.25" value="0"></label>
      <p class="hint">Counts from this week on.</p>`}
    ${buttons(activity ? "Save" : "Add")}`,
    async data => {
      if (activity) { await editActivity(activity.id, { name: data.get("name"), hint: data.get("hint") }); toast("Activity saved"); }
      else { await addActivity({ name: data.get("name"), hint: data.get("hint"), weekly_min: toMinutes(data.get("hours")) }); toast("Activity added"); }
    });
}
