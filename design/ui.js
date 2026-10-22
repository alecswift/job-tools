// Shared front-end helpers for every job-tools app. Served by each app at /design/ui.js.

// Where each app runs, unless the server says otherwise (GET /api/apps reports LEETCODE_URL and LOG_URL when set).
const DEFAULT_APPS = { leetcode: "http://localhost:8001", log: "http://localhost:8002" };
const APP_NAMES = { leetcode: "LeetCode", log: "Log" };

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// The "LeetCode | Log" links above the header. current is this app's key. Only links: the apps stay separate.
// Drawn straight away with the defaults so the page doesn't jump, then pointed at the server's addresses.
export async function appSwitcher(current) {
  const bar = document.createElement("div");
  bar.className = "apps";
  bar.innerHTML = `<div class="apps-in">${Object.entries(APP_NAMES).map(([key, name]) =>
    `<a data-app="${key}" href="${key === current ? "/" : esc(DEFAULT_APPS[key])}"${key === current ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</div>`;
  document.body.prepend(bar);
  try {
    const res = await fetch("/api/apps");
    if (!res.ok) return;
    for (const [key, url] of Object.entries(await res.json())) {
      const link = bar.querySelector(`a[data-app="${key}"]:not([aria-current])`);
      if (link) link.href = url;
    }
  } catch { /* server down: keep the defaults */ }
}

export function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("show"), 1800); }

// Dev mode: reload when GET /api/dev/version changes. Stops on the first 404, so it does nothing in normal mode.
export async function devReload() {
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
}
