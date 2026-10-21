// The four pages. Each takes the server state and returns HTML; main.js puts it on the page.
import { PLAN, NC_FREE, DEPTH_NAMES } from "./plan.js";
import { esc, fmtDate, rel, pill, local, DIFF, STATUS, HELP_GUIDE } from "./util.js";

// What the person has chosen on the page: not saved to the server
export const ui = {
  planHide: local.get("ncplan.hide", false),
  logSort: { key: "priority", dir: -1 },
  logFilter: { q: "", pattern: "", status: "" },
};

export const TOPICS = Object.fromEntries(PLAN.topics.map(t => [t.key, t]));
const PACE = 3;
const depthCol = d => `var(--d${d})`;

// ---------- plan ----------
// done: plan problems that are logged in the retry tracker (a tick means logged). quiz: marked done via the NeetCode quiz.
export function planSets(state) {
  const logged = new Set(state.problems.map(p => p.slug));
  return { done: new Set(PLAN.problems.map(p => p.slug).filter(s => logged.has(s))), quiz: new Set(state.plan.quiz) };
}
const PLAN_SLUGS = new Set(PLAN.problems.map(p => p.slug));

// A plan problem's place in the retry tracker, if it's logged there
function trackNote(tracked) {
  if (!tracked) return "";
  if (tracked.status === STATUS.retry) return `<button type="button" class="pill retry" data-retry="${tracked.slug}" title="Log a retry">${STATUS.retry}</button>`;
  if (tracked.status === STATUS.mastered) return pill(STATUS.mastered);
  return `<span class="track" title="Next retry ${fmtDate(tracked.dueDate)}">retry ${rel(tracked.daysUntilDue)}</span>`;
}

export function viewPlan(state) {
  const { done, quiz } = planSets(state), planProblems = PLAN.problems;
  const logged = new Map(state.problems.map(p => [p.slug, p]));
  const isDone = s => done.has(s) || quiz.has(s);
  const quizOnly = [...quiz].filter(s => !done.has(s)).length, both = quiz.size - quizOnly, doneCount = done.size + quizOnly;
  const offPlan = state.problems.filter(p => !PLAN_SLUGS.has(p.slug)).length;
  const groups = [];
  for (let i = 0, group = 1; i < planProblems.length; i += PACE, group++) {
    const items = planProblems.slice(i, i + PACE), nDone = items.filter(p => isDone(p.slug)).length, complete = nDone === items.length;
    if (ui.planHide && complete) continue;
    groups.push(`<section class="day${complete ? " complete" : ""}"><div class="day-head"><h2>Group ${group}<small>#${items[0].n}–${items[items.length - 1].n}</small></h2><span class="count">${nDone}/${items.length}</span></div>`
      + items.map(p => {
        const topic = TOPICS[p.topic];
        return `<div class="prob${done.has(p.slug) ? " is-done" : ""}${quiz.has(p.slug) && !done.has(p.slug) ? " is-quiz" : ""}">
          ${done.has(p.slug)
            ? `<input type="checkbox" class="chk" id="c-${p.slug}" data-s="${p.slug}" aria-label="${esc(p.name)}: logged" aria-disabled="true" title="Logged. Delete it from the Log to untick it." checked>`
            : `<input type="checkbox" class="chk" id="c-${p.slug}" data-s="${p.slug}" aria-label="Log ${esc(p.name)}" title="Log it to tick it off"${quiz.has(p.slug) ? " data-partial" : ""}>`}
          <span class="pnum">${p.n}</span>
          <div class="pmain"><a class="lc" href="https://leetcode.com/problems/${p.slug}/" target="_blank" rel="noopener">${esc(p.name)}</a>
            <div class="meta"><span class="topic" style="--c:${depthCol(topic.depth)}">${esc(topic.name)}</span>${p.src === "lc" ? `<span class="extra">Extra</span><span>${esc(p.note)}</span>` : ""}${p.premium ? `<span class="prem">premium</span>${NC_FREE[p.slug] ? `<a class="nc-link" href="https://neetcode.io/problems/${NC_FREE[p.slug]}" target="_blank" rel="noopener">free on NeetCode</a>` : ""}` : ""}${trackNote(logged.get(p.slug))}</div></div>
          <div class="pright"><button type="button" class="qbtn" data-q="${p.slug}" aria-pressed="${quiz.has(p.slug)}" title="Done via NeetCode quiz">Quiz</button><span class="diff ${DIFF[p.diff]}">${DIFF[p.diff]}</span></div></div>`;
      }).join("") + `</section>`);
  }
  return `<div class="plan">
    <header>
      <div class="label">NeetCode 150 + 62 extras</div>
      <h1>Scattered Plan</h1>
      <p class="lede">All <b>150 roadmap problems</b> plus <b>62 high-frequency LeetCode problems</b>, shuffled so no topic runs back-to-back. Topics only unlock once their parents on the roadmap are about half done, and the top of the tree is weighted heavier, so the first third of the plan is mostly arrays, pointers, stacks and searches, with their harder tails resurfacing later as review.</p>
    </header>
    <label class="toggle"><input type="checkbox" id="planHide" ${ui.planHide ? "checked" : ""}> Hide finished groups</label>
    <div class="progress">
      <div class="prow"><span><b>${doneCount}</b> / ${planProblems.length} done · ${done.size} logged, ${quizOnly} quiz only${both ? `, ${both} logged after quiz` : ""}${offPlan ? ` · +${offPlan} off-plan logged` : ""}</span><span>${Math.ceil(planProblems.length / PACE)} groups of ${PACE} · ${Math.ceil((planProblems.length - doneCount) / PACE)} left</span></div>
      <div class="bar"><i style="width:${done.size / planProblems.length * 100}%"></i><i class="q" style="width:${quizOnly / planProblems.length * 100}%"></i></div>
    </div>
    <div class="strip-box">
      <div class="label">Plan shape · each tick is one problem, colored by roadmap depth</div>
      <div class="strip">${planProblems.map(p => `<span class="${done.has(p.slug) ? "done" : quiz.has(p.slug) ? "quiz" : ""}" title="#${p.n} ${esc(p.name)}" style="--c:${depthCol(TOPICS[p.topic].depth)}"></span>`).join("")}</div>
      <div class="legend">${DEPTH_NAMES.map((name, d) => `<span style="--c:${depthCol(d)}">${name}</span>`).join("")}</div>
    </div>
    <div class="days">${groups.join("") || `<div class="empty">Every group is finished.</div>`}</div>
    <p class="foot">A tick means the problem is logged in the retry tracker. Ticking the box opens the Log dialog, and the tick appears once you save; closing the dialog leaves it unticked. To untick a logged problem, delete it from the Log. The <b>Quiz</b> button marks a problem done through the NeetCode quiz without logging it: its box shows a dot, it counts toward progress, and ticking the box later logs it properly. Logged problems show when they're next due. Problem names open on LeetCode. Problems marked <i>premium</i> are locked there, so they also link to the free version on NeetCode. Your marks are saved to the server, in <span class="mono">data.json</span>.</p>
    <p class="foot">The 150 roadmap problems and their topics are the <a href="https://neetcode.io/practice" target="_blank" rel="noopener">NeetCode 150</a>, by NeetCode. This project is not affiliated with or endorsed by NeetCode or LeetCode.</p>
  </div>`;
}

// ---------- queue ----------
export function viewQueue(state) {
  const problems = state.problems;
  const due = problems.filter(p => p.status === STATUS.retry).sort((a, b) => b.priority - a.priority);
  const soon = problems.filter(p => p.status === STATUS.wait).sort((a, b) => a.daysUntilDue - b.daysUntilDue || b.struggle - a.struggle);
  const mastered = problems.filter(p => p.status === STATUS.mastered);
  const logged = problems.length;
  const mix = logged < 50 ? ["~75% new / 25% retry", "e.g. 3 new + 1 retry per session"] : logged < 150 ? ["~60% new / 40% retry", "retries start piling up as spacing kicks in"] : ["shift toward retries", "in the last 4–6 weeks before interviews, aim for ~30/70"];
  const advice = due.length >= 5
    ? `<b>${due.length} problems are due: make today a retry-only day.</b> Work down the list from the top.`
    : due.length
      ? `<b>Start with “${esc(due[0].name)}”</b> while you're fresh, then do new problems. With ${logged} logged, pace at ${mix[0]} (${mix[1]}).`
      : `<b>Nothing is due.</b> Do new problems today. With ${logged} logged, pace at ${mix[0]} (${mix[1]}).`;
  const { maxPriority } = state;
  return `
    <h1>Retry queue</h1>
    <div class="stats">
      <div class="stat due"><b>${due.length}</b><span>due now</span></div>
      <div class="stat"><b>${soon.length}</b><span>waiting</span></div>
      <div class="stat mastered"><b>${mastered.length}</b><span>mastered</span></div>
      <div class="stat"><b>${logged}</b><span>logged</span></div>
    </div>
    <div class="advice">${advice}</div>
    <section class="list"><div class="row spread"><h2>Retry now</h2><span class="label">sorted by priority</span></div>
      ${due.length ? due.map((p, i) => item(p, i + 1, true, maxPriority)).join("") : `<div class="empty">Nothing due. Problems show up here on their due date.</div>`}
    </section>
    <section class="list"><div class="row spread"><h2>Coming up</h2><span class="label">sorted by due date</span></div>
      ${soon.length ? soon.map(p => item(p, null, false, maxPriority)).join("") : `<div class="empty">No problems waiting.</div>`}
    </section>
    ${mastered.length ? `<details class="list"><summary><h2 style="display:inline">Mastered (${mastered.length})</h2></summary><div class="list" style="margin-top:8px">${mastered.map(p => item(p, null, false, maxPriority)).join("")}</div></details>` : ""}`;
}
function item(p, rank, isDue, maxPriority) {
  const barWidth = Math.min(100, p.priority / maxPriority * 100);
  return `<div class="item${isDue ? " due" : ""}${rank ? "" : " norank"}">
    ${rank ? `<span class="rank">${rank}</span>` : ""}
    <div style="min-width:0">
      <a class="name" href="${esc(p.link)}" target="_blank" rel="noopener">${p.lc ? `<span class="mono muted">${p.lc}.</span> ` : ""}${esc(p.name)}</a>
      <div class="meta"><span class="diff ${p.difficulty}">${p.difficulty}</span>${p.pattern ? `<span>${esc(p.pattern)}</span>` : ""}
        <span>Struggle <b class="mono">${p.struggle}</b></span><span>Attempt ${p.attempts}</span>
        ${p.status === STATUS.mastered ? "" : `<span>${rel(p.daysUntilDue)}</span>`}
        ${isDue ? `<span class="pbar" title="Retry priority">Priority <i style="--w:${barWidth}%"></i><b class="mono">${p.priority}</b></span>` : ""}</div>
    </div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn small${isDue ? " primary" : ""}" data-retry="${p.slug}">Log retry</button><button class="btn small" data-edit="${p.slug}" aria-label="Edit ${esc(p.name)}">Edit</button></div>
  </div>`;
}

// ---------- log ----------
const COLS = [
  ["lc", "LC #", "num"], ["name", "Problem"], ["difficulty", "Diff"], ["pattern", "Pattern"], ["lastAttempted", "Last"],
  ["attempts", "Att.", "num"], ["help", "Help", "num"], ["confidence", "Conf.", "num"], ["time", "Min", "num"],
  ["timeScore", "Time sc.", "num calc"], ["struggle", "Struggle", "num calc"], ["interval", "Interval", "num calc"],
  ["dueDate", "Due", "calc"], ["priority", "Priority", "num calc"], ["status", "Status", "calc"],
];
export const TEXT_COLS = ["name", "pattern", "difficulty", "status"];  // sort A→Z first; the rest high→low

export function viewLog(state) {
  const { logSort, logFilter } = ui;
  const pats = [...new Set([...state.settings.patterns, ...state.problems.map(p => p.pattern).filter(Boolean)])];
  return `
    <div class="row spread"><h1>Log</h1><span class="muted">${state.problems.length} problems · <span style="color:var(--accent)">green headers</span> are calculated</span></div>
    <div class="toolbar">
      <input id="q" type="search" placeholder="Search problems or notes" value="${esc(logFilter.q)}" aria-label="Search">
      <select id="fp" aria-label="Pattern"><option value="">All patterns</option>${pats.map(p => `<option ${p === logFilter.pattern ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
      <select id="fs" aria-label="Status"><option value="">Any status</option>${Object.values(STATUS).map(s => `<option ${s === logFilter.status ? "selected" : ""}>${s}</option>`).join("")}</select>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${COLS.map(([key, label, cls]) => `<th class="${cls || ""}" data-sort="${key}" ${logSort.key === key ? `data-dir="${logSort.dir > 0 ? "▲" : "▼"}"` : ""}>${label}</th>`).join("")}<th></th></tr></thead>
      <tbody id="logBody">${logRows(state)}</tbody>
    </table></div>`;
}
export function logRows(state) {
  const { logSort: { key, dir }, logFilter } = ui;
  const q = logFilter.q.toLowerCase();
  const rows = state.problems.filter(p =>
    (!q || (p.name + " " + (p.notes || "") + " " + (p.lc ?? "")).toLowerCase().includes(q)) &&
    (!logFilter.pattern || p.pattern === logFilter.pattern) &&
    (!logFilter.status || p.status === logFilter.status));
  rows.sort((a, b) => { const va = a[key], vb = b[key]; if (va == null) return 1; if (vb == null) return -1; return (va > vb ? 1 : va < vb ? -1 : 0) * dir; });
  if (!rows.length) return `<tr><td colspan="${COLS.length + 1}" class="muted" style="text-align:center;padding:24px">${state.problems.length ? "No problems match." : "No problems yet. Use “Log problem” to add your first one."}</td></tr>`;
  return rows.map(p => `<tr>
    <td class="num">${p.lc ?? ""}</td>
    <td><a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.name)}</a>${p.notes ? ` <span class="muted" title="${esc(p.notes)}">✎</span>` : ""}</td>
    <td><span class="diff ${p.difficulty}">${p.difficulty[0]}</span></td><td>${esc(p.pattern)}</td><td>${fmtDate(p.lastAttempted)}</td>
    <td class="num">${p.attempts}</td><td class="num">${p.help}</td><td class="num">${p.confidence}</td><td class="num">${p.time ?? "—"}</td>
    <td class="num">${p.timeScore ?? "—"}</td><td class="num">${p.struggle}</td><td class="num">${p.interval}d</td>
    <td>${fmtDate(p.dueDate)}</td><td class="num">${p.priority}</td><td>${pill(p.status)}</td>
    <td><button class="btn small" data-retry="${p.slug}">Retry</button> <button class="btn small" data-edit="${p.slug}">Edit</button></td></tr>`).join("");
}

// ---------- how it works ----------
const SETTING_FIELDS = [
  ["Struggle weights", [
    ["weightHelp", "Help Needed", "Share of Struggle from how much help you needed", 0.05],
    ["weightConfidence", "Low confidence", "Share from (10 − Confidence)", 0.05],
    ["weightTime", "Time score", "Share from your time vs. the target", 0.05]]],
  ["Spacing", [
    ["spacingFactor", "Spacing factor", "Days added to the first interval per point of mastery. Higher = longer gaps", 0.1],
    ["overdueCap", "Overdue cap", "Max multiplier for how overdue a problem is", 0.1]]],
  ["Mastery", [
    ["masteredBelow", "Mastered below Struggle", "A problem is Mastered when Struggle drops under this…", 0.1],
    ["masteredMinAttempts", "…after at least this many attempts", "Mastered problems get priority 0", 1]]],
  ["Target time (minutes)", [
    ["targetEasy", "Easy", "Hitting the target = Time score 5; double the target = 10", 1],
    ["targetMedium", "Medium", "", 1], ["targetHard", "Hard", "", 1]]],
];
const round2 = n => +(+n).toFixed(2);
const WEIGHTS = ["weightHelp", "weightConfidence", "weightTime"];
// value(key): one weight's value, from the saved settings or the form being edited
export const weightSum = value => round2(WEIGHTS.reduce((sum, k) => sum + (+value(k) || 0), 0));
export const weightWarning = sum => `Weights add up to ${sum}. They should sum to 1 so Struggle stays on a 0–10 scale.`;

export function viewHow(state) {
  const { settings } = state;
  const wsum = weightSum(k => settings[k]);
  return `
    <h1>How it works</h1>
    <div class="cols">
      <div class="prose">
        <section><h2>Using it</h2><ol>
          <li><b>Log each problem</b> the first time you attempt it, with how much help you needed, your confidence, and your time if you tracked it. Ticking a plan problem opens the Log dialog with its details filled in.</li>
          <li><b>Leave time blank</b> if you didn't track it. Struggle then uses only Help and Confidence.</li>
          <li><b>When you retry a problem,</b> press <i>Log retry</i>. It sets the date to today, adds an attempt, and re-scores the problem. Don't add a new entry.</li>
          <li><b>Check the Retry queue</b> each session. It's always sorted by priority.</li></ol></section>
        <section><h2>The scoring</h2>
          <p><b>Time score</b> (0–10): how your time compares to the target for that difficulty, capped at 10.</p>
          <div class="formula">5 × minutes ÷ target  <span class="muted">(Easy <var>${round2(settings.targetEasy)}</var> · Medium <var>${round2(settings.targetMedium)}</var> · Hard <var>${round2(settings.targetHard)}</var> min)</span></div>
          <p><b>Struggle</b> (0–10): a weighted mix of the three scores.</p>
          <div class="formula"><var>${round2(settings.weightHelp)}</var> × Help + <var>${round2(settings.weightConfidence)}</var> × (10 − Confidence) + <var>${round2(settings.weightTime)}</var> × Time score</div>
          <p><b>Interval</b>: days until the next retry. Low struggle means a longer gap, and each extra attempt doubles it.</p>
          <div class="formula">(1 + (10 − Struggle) × <var>${round2(settings.spacingFactor)}</var>) × 2<sup>attempts − 1</sup></div>
          <p><b>Retry priority</b>: high struggle plus overdue floats to the top.</p>
          <div class="formula">Struggle × min(<var>${round2(settings.overdueCap)}</var>, days since attempt ÷ interval)</div>
          <p><b>Status</b>: <i>Retry now</i> once the due date arrives. <i>Mastered</i> when Struggle is under <var class="mono">${round2(settings.masteredBelow)}</var> after ${round2(settings.masteredMinAttempts)}+ attempts, which drops priority to 0.</p></section>
        <section><h2>Days until the next retry</h2><p class="muted">With your current settings.</p>
          <div class="table-wrap" style="margin-top:8px"><table class="itable"><thead><tr><th>Struggle</th><th>1st attempt</th><th>2nd</th><th>3rd</th><th>4th</th></tr></thead>
          <tbody>${state.intervalTable.filter(r => r.struggle % 2 === 0 || r.struggle === 5).map(r => `<tr><td class="mono">${r.struggle}</td>${r.intervals.map(d => `<td class="mono">${d}d</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>
        <section><h2>Help Needed guide</h2><p>${HELP_GUIDE}</p></section>
        <section><h2>New vs. retry pacing</h2><ul>
          <li><b>Problems 1–50:</b> ~75% new / 25% retry, e.g. 3 new + 1 retry per session. Only retry what's marked <i>Retry now</i>.</li>
          <li><b>Problems 50–150:</b> ~60/40. Retries start piling up as spacing kicks in.</li>
          <li><b>Last 4–6 weeks before interviews:</b> flip to ~30/70. Retries become the main work.</li>
          <li>Start each session with the top <i>Retry now</i> item while you're fresh. If 5+ are due, do a retry-only day.</li>
          <li>Learn by pattern: do 3–5 new problems in one pattern before moving on.</li></ul></section>
      </div>
      <form class="panel" id="settingsForm" novalidate>
        <div class="row spread"><h2>Settings</h2><span class="label">saved to the server</span></div>
        ${SETTING_FIELDS.map(([title, fields]) => `<div class="fieldset"><h3>${title}</h3>${fields.map(([key, label, hint, step]) =>
          `<div class="field"><label for="s-${key}">${label}</label><input id="s-${key}" name="${key}" type="number" step="${step}" min="0" value="${round2(settings[key])}">${hint ? `<small>${hint}</small>` : ""}</div>`).join("")}</div>`).join("")}
        <div class="warn" id="wsum" ${wsum === 1 ? "hidden" : ""}>${weightWarning(wsum)}</div>
        <div class="fieldset"><h3>Patterns</h3><label class="hint" for="s-patterns">One per line. These fill the Pattern dropdown.</label>
          <textarea id="s-patterns" name="patterns" rows="8">${esc(settings.patterns.join("\n"))}</textarea></div>
        <div class="err" id="setErr"></div>
        <div class="row spread">
          <button type="submit" class="btn primary">Save settings</button>
          <span id="resetZone"><button type="button" class="btn" id="resetBtn">Reset to defaults</button></span>
        </div>
      </form>
    </div>`;
}
