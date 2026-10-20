// The Log / Edit and Log retry dialogs.
import { $, esc, HELP_GUIDE, toast } from "./util.js";
import { state, send, preview } from "./store.js";
import { lookupFields } from "./autofill.js";

const dlg = $("#dlg"), form = $("#dlgForm");

function slider(name, label, val, hint) {
  return `<label class="f"><span>${label}</span><div class="slider"><input type="range" name="${name}" min="0" max="10" step="1" value="${val}"><output>${val}</output></div>${hint ? `<span class="hint">${hint}</span>` : ""}</label>`;
}

// Score fields the dialog fixes rather than asks for (a retry's difficulty and attempt number)
let previewBase = {};
let previewSeq = 0;
// Show what the form would score, using the server's formulas. Answers that arrive out of order are dropped.
async function livePreview() {
  const el = $("#prev"); if (!el) return;
  const fields = { ...previewBase };
  for (const k of ["difficulty", "attempts", "help", "confidence", "time"]) if (form.elements[k]) fields[k] = form.elements[k].value;
  const seq = ++previewSeq;
  try {
    const r = await preview(fields);
    if (seq !== previewSeq) return;
    el.innerHTML = `Struggle <b class="mono">${r.struggle}</b> → next retry in <b class="mono">${r.interval}</b> day${r.interval === 1 ? "" : "s"}${r.mastered ? ` · <span style="color:var(--done);font-weight:600">Mastered</span>` : ""}`;
  } catch (err) {
    if (seq === previewSeq) el.textContent = err.message;
  }
}

// Filling in a new problem from its LeetCode link. Null unless the Log dialog is open for a new problem.
// touched: fields the person has set themselves, which a lookup leaves alone.
let autofill = null;
const FILLABLE = ["name", "lc", "difficulty", "pattern"];
function onAutofillInput(t) {
  // A link pasted into the name box belongs in the link box
  if (t.name === "name" && /leetcode\.com\/problems\//i.test(t.value)) {
    form.elements.slug.value = t.value.trim();
    t.value = "";
    return scheduleLookup();
  }
  if (t.name === "slug") return scheduleLookup();
  if (FILLABLE.includes(t.name)) autofill.touched.add(t.name);
}
function scheduleLookup() { clearTimeout(autofill.timer); autofill.timer = setTimeout(runLookup, 300); }
async function runLookup() {
  if (!autofill) return;
  const text = form.elements.slug.value.trim(), note = $("#lookupNote"), seq = ++autofill.seq;
  if (!text) { note.textContent = ""; return; }
  note.textContent = "Looking it up on LeetCode…";
  const patterns = [...form.elements.pattern.options].map(o => o.value).filter(Boolean);
  try {
    const f = await lookupFields(text, patterns);
    if (!autofill || seq !== autofill.seq) return;
    for (const k of FILLABLE) if (!autofill.touched.has(k) && f[k] != null && f[k] !== "") form.elements[k].value = f[k];
    const logged = state().problems.some(p => p.slug === f.slug);
    note.innerHTML = `Filled in from LeetCode: ${f.lc ? `${f.lc}. ` : ""}${esc(f.name)}${f.premium ? " (premium)" : ""}`
      + (logged ? ` · <b>Already in your log.</b> <button type="button" class="btn small" data-retry="${f.slug}">Log a retry instead</button>` : "");
    livePreview();
  } catch (err) {
    if (autofill && seq === autofill.seq) note.textContent = `${err.message} Fill in the rest yourself.`;
  }
}

form.addEventListener("input", e => {
  if (e.target.type === "range") e.target.nextElementSibling.value = e.target.value;
  if (autofill) onAutofillInput(e.target);
  livePreview();
});
form.addEventListener("click", e => { if (e.target.dataset.close != null) dlg.close(); });
// The close event arrives a moment late: if a new dialog was opened meanwhile, its autofill stays
dlg.addEventListener("close", () => { if (dlg.open || !autofill) return; clearTimeout(autofill.timer); autofill = null; });

function show(onSubmit) {
  form.onsubmit = async e => {
    e.preventDefault();
    try { await onSubmit(Object.fromEntries(new FormData(form))); dlg.close(); }
    catch (err) { $("#dlgErr").textContent = err.message; }
  };
  livePreview();
  if (!dlg.open) dlg.showModal();
}

// Add a problem (p = null) or edit one. For a new problem, opts can prefill fields and change the wording,
// which is how ticking a plan problem logs it.
export function openProblem(p, opts = {}) {
  const S = state(), isNew = !p;
  p = p || { difficulty: "Medium", attempts: 1, help: 0, confidence: 10, lastAttempted: S.today, pattern: "", ...opts.prefill };
  const pats = [...new Set([...S.settings.patterns, p.pattern].filter(Boolean))];
  previewBase = {};
  autofill = isNew ? { touched: new Set(Object.keys(opts.prefill || {})), seq: 0, timer: null } : null;
  form.innerHTML = `
    <h2>${esc(opts.title || (isNew ? "Log a problem" : "Edit problem"))}</h2>
    ${opts.intro ? `<p class="muted intro">${esc(opts.intro)}</p>` : ""}
    <div class="grid2">
      <label class="f" style="grid-column:1/-1"><span>LeetCode link</span><input name="slug" value="${esc(p.slug)}" placeholder="${isNew ? "Paste a link to fill in the rest" : ""}"></label>
      <div class="hint" id="lookupNote" role="status" style="grid-column:1/-1"></div>
      <label class="f" style="grid-column:1/-1"><span>Problem</span><input name="name" required value="${esc(p.name)}" placeholder="e.g. Two Sum"></label>
      <label class="f"><span>LC #</span><input name="lc" type="number" min="1" value="${p.lc ?? ""}"></label>
      <label class="f"><span>Difficulty</span><select name="difficulty">${["Easy", "Medium", "Hard"].map(d => `<option ${d === p.difficulty ? "selected" : ""}>${d}</option>`).join("")}</select></label>
      <label class="f"><span>Pattern</span><select name="pattern"><option value="">—</option>${pats.map(x => `<option ${x === p.pattern ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="f"><span>Last attempted</span><input name="lastAttempted" type="date" value="${p.lastAttempted}"></label>
      <label class="f"><span>Attempts</span><input name="attempts" type="number" min="1" value="${p.attempts}"></label>
      <label class="f"><span>Time (min)</span><input name="time" type="number" min="0" value="${p.time ?? ""}" placeholder="optional"></label>
    </div>
    ${slider("help", "Help needed", p.help, HELP_GUIDE)}
    ${slider("confidence", "Confidence", p.confidence)}
    <label class="f"><span>Notes</span><textarea name="notes" rows="2">${esc(p.notes)}</textarea></label>
    <div class="preview" id="prev"></div>
    <div class="err" id="dlgErr"></div>
    <div class="row spread">
      <span id="delZone">${isNew ? "" : `<button type="button" class="btn danger" id="delBtn">Delete</button>`}</span>
      <div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${isNew ? "Add problem" : "Save"}</button></div>
    </div>`;
  const del = $("#delBtn");
  if (del) del.onclick = () => {
    $("#delZone").innerHTML = `<span class="confirm">Delete for good? <button type="button" class="btn small danger" id="delYes">Delete</button><button type="button" class="btn small" id="delNo">Keep</button></span>`;
    $("#delNo").onclick = () => openProblem(p);
    $("#delYes").onclick = async () => {
      try { await send("DELETE", `/api/problems/${p.slug}`); dlg.close(); toast("Deleted"); }
      catch (err) { $("#dlgErr").textContent = err.message; }
    };
  };
  show(async body => {
    if (isNew) await send("POST", "/api/problems", body);
    else await send("PUT", `/api/problems/${p.slug}`, body);
    toast(isNew ? "Problem logged" : "Saved");
  });
  if (isNew && p.slug) runLookup();  // opened from the plan: fetch the LC number
}

export function openRetry(p) {
  const S = state();
  previewBase = { difficulty: p.difficulty, attempts: p.attempts + 1 };
  autofill = null;
  form.innerHTML = `
    <h2>Log retry</h2>
    <p class="muted" style="margin:0"><b style="color:var(--fg)">${esc(p.name)}</b> · attempt ${p.attempts + 1} · last struggle ${p.struggle}</p>
    <div class="grid2">
      <label class="f"><span>Date</span><input name="date" type="date" value="${S.today}"></label>
      <label class="f"><span>Time (min)</span><input name="time" type="number" min="0" placeholder="optional"></label>
    </div>
    ${slider("help", "Help needed this time", 0, HELP_GUIDE)}
    ${slider("confidence", "Confidence this time", 10)}
    <label class="f"><span>Notes</span><textarea name="notes" rows="2" placeholder="Leave blank to keep the current notes">${esc(p.notes)}</textarea></label>
    <div class="preview" id="prev"></div>
    <div class="err" id="dlgErr"></div>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save retry</button></div>`;
  show(async body => {
    await send("POST", `/api/problems/${p.slug}/retry`, body);
    toast("Retry logged");
  });
}
