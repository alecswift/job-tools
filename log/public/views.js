// The two pages. Each takes the server state and returns HTML; main.js puts it on the page.
import { esc, hours, signed, fmtDate, addDays, DAYS } from "./util.js";
import { ui } from "./store.js";

// ---------- week ----------
const diffClass = min => min > 0 ? "pos" : min < 0 ? "neg" : "";

function activityRow(row, editable, deletable) {
  const planned = editable && !row.archived
    ? `<input class="plan" type="number" min="0" step="0.25" value="${hours(row.planned_min)}" data-plan="${row.id}" aria-label="Planned hours for ${esc(row.name)}">`
    : hours(row.planned_min);
  return `<tr>
    <td class="act"><b>${esc(row.name)}</b>${row.archived ? `<span class="arch">archived</span>` : ""}${row.hint ? `<small>${esc(row.hint)}</small>` : ""}</td>
    <td class="num">${hours(row.actual_min)}</td>
    <td class="num">${planned}</td>
    <td class="num ${diffClass(row.diff_min)}">${signed(row.diff_min)}</td>
    <td class="num">${row.pct == null ? "" : row.pct + "%"}</td>
    <td>${row.archived ? "" : `<details class="menu"><summary aria-label="More for ${esc(row.name)}">⋯</summary><div>
      <button type="button" data-edit-activity="${row.id}">Rename / edit hint</button>
      <button type="button" data-archive="${row.id}">Archive</button>
      ${deletable ? `<button type="button" class="danger" data-delete-activity="${row.id}">Delete</button>` : ""}
    </div></details>`}</td>
  </tr>`;
}

export function viewWeek(state) {
  const { week, today } = state, deletable = new Set(state.activities.filter(a => a.deletable).map(a => a.id));
  const thisWeek = week.monday <= today && today <= addDays(week.monday, 6);
  const rows = week.rows.map(r => activityRow(r, week.editable, deletable.has(r.id))).join("");
  const t = week.total;
  return `
  <div class="weeknav">
    <h1>Week of ${fmtDate(week.monday, { day: "numeric", month: "short", year: "numeric" })}</h1>
    <button class="btn" data-week="${addDays(week.monday, -7)}" aria-label="Previous week">←</button>
    ${thisWeek ? "" : `<button class="btn" data-week="${today}">This week</button>`}
    <button class="btn" data-week="${addDays(week.monday, 7)}" aria-label="Next week">→</button>
    <button class="btn" id="addActivityBtn">+ Add activity</button>
  </div>
  ${week.rows.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Activity</th><th class="num">Actual</th><th class="num">Planned</th><th class="num">Diff</th><th class="num">%</th><th></th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td>Total</td><td class="num">${hours(t.actual_min)}</td><td class="num">${hours(t.planned_min)}</td>
        <td class="num ${diffClass(t.diff_min)}">${signed(t.diff_min)}</td><td class="num">${t.pct == null ? "" : t.pct + "%"}</td><td></td></tr>
    </tbody></table></div>`
    : `<div class="empty">No activities yet. Use <b>+ Add activity</b> to plan your week.</div>`}
  <div class="days">${week.daily_min.map((m, i) =>
    `<span class="${addDays(week.monday, i) === today ? "today" : ""}">${DAYS[i]} <b>${hours(m)}</b></span>`).join("")}</div>
  <p class="rule">${week.editable ? "Planned hours apply from this week on. " : "Past weeks keep the plan they had. "}Timer: 50 minutes of work counts as 1 hour.</p>`;
}

// ---------- log ----------
export function logRows() {
  if (!ui.entries.length) return `<tr><td colspan="8" class="muted">No entries${ui.logFilter.q || ui.logFilter.activity ? " match" : " yet"}.</td></tr>`;
  return ui.entries.map(e => `<tr>
    <td>${fmtDate(e.date)}</td><td>${e.day}</td><td>${esc(e.activity)}</td>
    <td class="num">${hours(e.credited_min)}</td>
    <td class="wrap">${esc(e.what)}</td><td class="wrap muted">${esc(e.notes)}</td>
    <td class="num muted">${e.worked_min == null ? "" : e.worked_min + " min"}</td>
    <td class="acts"><button class="btn small" data-edit-entry="${e.id}">Edit</button><button class="btn small danger" data-delete-entry="${e.id}">Delete</button></td>
  </tr>`).join("");
}

export function viewLog(state) {
  const options = state.activities.map(a => `<option value="${a.id}"${String(a.id) === ui.logFilter.activity ? " selected" : ""}>${esc(a.name)}${a.archived ? " (archived)" : ""}</option>`).join("");
  return `
  <h1>Log</h1>
  <div class="toolbar">
    <input id="q" type="search" placeholder="Search what you did and notes" value="${esc(ui.logFilter.q)}" aria-label="Search">
    <select id="fa" aria-label="Activity"><option value="">All activities</option>${options}</select>
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Date</th><th>Day</th><th>Activity</th><th class="num">Hours</th><th>What I did</th><th>Notes</th><th class="num">Worked</th><th></th></tr></thead>
    <tbody id="logBody">${logRows()}</tbody>
  </table></div>`;
}
