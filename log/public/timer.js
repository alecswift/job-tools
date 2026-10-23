// The timer in the header. The server keeps the timer and works out the time; this only counts down
// between fetches for display, and asks the server again whenever a block or break should have ended.
import { $, esc, clock } from "./util.js";
import { state, load, timerAction } from "./store.js";
import { openTimerEntry } from "./dialogs.js";

let snap = null, fetchedAt = 0, picked = "", shown = null;

export function renderTimer(current) {
  // Only a new state from the server restarts the countdown; redraws of the same state keep counting
  if (current !== shown) { shown = current; snap = current.timer; fetchedAt = performance.now(); }
  const el = $("#timer");
  if (!snap) {
    const active = current.activities.filter(a => !a.archived);
    if (!active.some(a => String(a.id) === picked)) picked = active[0] ? String(active[0].id) : "";
    el.className = "timer";
    el.innerHTML = active.length ? `<select id="timerActivity" aria-label="Activity to time">${active.map(a =>
      `<option value="${a.id}"${String(a.id) === picked ? " selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
      <button class="btn" data-timer="start">▶ Start</button>` : "";
    document.title = "Log";
    return;
  }
  const stop = `<button class="btn small" data-timer="stop">Stop</button>`;
  const controls = {
    work: `<button class="btn small" data-timer="pause">Pause</button>${stop}`,
    paused: `<button class="btn small" data-timer="resume">Resume</button>${stop}`,
    break: `<button class="btn small" data-timer="continue">Continue</button>${stop}`,
    ready: `<button class="btn small" data-timer="continue">Continue</button>${stop}`,
    // Stopped but not yet logged, say after a reload with the Log time dialog open
    stopped: `<button class="btn small" data-timer="log">Log it</button><button class="btn small" data-timer="discard">Discard</button>`,
  }[snap.phase];
  el.className = `timer on${snap.phase === "work" || snap.phase === "paused" ? "" : " rest"}`;
  el.innerHTML = `<span class="what">${esc(snap.activity)} · block ${snap.block}</span><span class="clock" id="timerClock"></span>
    ${controls}`;
  tick();
}

function tick() {
  if (!snap) return;
  const gone = (performance.now() - fetchedAt) / 1000;
  let text;
  if (snap.phase === "work") {
    const left = snap.block_left_sec - gone;
    if (left <= 0) return ring("Block done: take a 10-minute break.");
    text = `${clock(left)} left`;
  } else if (snap.phase === "break") {
    const left = snap.break_left_sec - gone;
    if (left <= 0) return ring("Break over: Continue when you're ready.");
    text = `break ${clock(left)}`;
  } else if (snap.phase === "stopped") {
    text = `stopped, ${snap.entry.worked_min} min worked`;
  } else {
    text = snap.phase === "paused" ? `paused, ${clock(snap.block_left_sec)} left` : "break over";
  }
  $("#timerClock").textContent = text;
  document.title = `${text} · ${snap.activity}`;
}
setInterval(tick, 1000);
// Stay in step with the server (another tab may have paused or stopped the timer)
setInterval(() => { if (snap) load(); }, 30000);

function ring(message) {
  snap = null;
  chime();
  try { if (Notification.permission === "granted") new Notification("Log timer", { body: message }); } catch { /* no notifications here */ }
  load();
}

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.25].forEach(at => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.4);
    });
  } catch { /* no audio */ }
}

export async function onTimerClick(action) {
  if (action === "start") {
    try { if (Notification.permission === "default") Notification.requestPermission(); } catch { /* no notifications */ }
    return timerAction("start", { activity_id: Number(picked) });
  }
  if (action === "stop") await timerAction("stop");
  if (action === "stop" || action === "log") return logStopped();
  if (action === "discard" && !confirm(`Discard ${snap.entry.worked_min} minutes on ${snap.activity}?`)) return;
  return timerAction(action);
}
const logStopped = () => { const t = state().timer; if (t?.phase === "stopped") openTimerEntry(t.entry); };
export const pickTimerActivity = id => { picked = id; };
