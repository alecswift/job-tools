# job-tools spec

Two small local web apps for a job search, kept in one repo:

- **leetcode-helper**: the Scattered Plan and the LeetCode retry tracker (Python).
- **log**: a time log measured against a weekly hours plan, a web version of `weekly_plan.xlsx` (Ruby).

## 1. The repo

```
job-tools/
├── SPEC.md            this file
├── design/            shared styles and UI helpers (the only shared code)
├── leetcode-helper/   Python app, port 8001
├── log/               Ruby app, port 8002
├── leetcode-data/     private data repo (gitignored)
└── log-data/          private data repo (gitignored)
```

Rules:

- **The two apps are fully separate.** Each has its own server, its own port and its own data. They have no shared backend, no combined pages and no app prefixes in their routes. Neither app reads the other's data.
- **They share only `design/`.** Each server serves it at `/design/` from `../design`, so the two apps can't drift apart visually.
- **Both run locally only.** They bind to `127.0.0.1` and run directly or in Docker, with no login. Hosting is out of scope for now.
- **Data stays out of this repo.** Each app's data lives in its own private repo next to it (`leetcode-data/`, `log-data/`), which is gitignored here.

### Build order

1. Create `design/` and move leetcode-helper onto it, with no visual change. Add the app switcher.
2. Build `log/`.

## 2. design/

| File | What it is |
|---|---|
| `tokens.css` | CSS custom properties: colours (light and dark), type scale, spacing, radii |
| `components.css` | Shared components built on the tokens: header, nav, buttons, tables, dialogs, form fields, red/green value colours |
| `ui.js` | Shared front-end helpers, including the app switcher |

**Token refactor of leetcode-helper.** Move leetcode-helper's hard-coded values in `static/style.css` into `tokens.css`, and move its generic components into `components.css`. Anything that belongs only to leetcode-helper stays in its own `style.css`. Success test: the pages look the same before and after.

**App switcher.** A thin "LeetCode | Log" bar above each app's header, rendered by `appSwitcher()` in `ui.js`. It's only links. Each server reports the addresses from its environment at `GET /api/apps`:

| Variable | Default |
|---|---|
| `LEETCODE_URL` | `http://localhost:8001` |
| `LOG_URL` | `http://localhost:8002` |

## 3. leetcode-helper/

Already built. Its [README](leetcode-helper/README.md) is the spec. The only planned changes are the token refactor and the app switcher above.

## 4. log/

A web version of the **Log** tab of `weekly_plan.xlsx`: you log the hours you spend on each activity, and each week you compare them against a weekly plan. Unlike the sheet, the plan is **weekly totals only**: no per-day plan and no schedule notes.

### Terms

- **Activity**: a kind of work you plan hours for, such as LeetCode or Applications / outreach. (The sheet calls it "Category".)
- **Entry**: one logged piece of time on an activity, on a date.
- **Plan**: the weekly hours for each activity. It changes over time as a series of versions.
- **Credit**: the hours an entry counts toward the plan.

Use these words everywhere: code, API, UI and README.

### Data model

SQLite through the Sequel gem, with migrations. The file is `log-data/log.sqlite3`, and `LOG_DATA` overrides the path.

```
activities   id · name · hint? · archived_at? · created_at
entries      id · date · activity_id · credited_min · worked_min? · what · notes? · created_at · updated_at
plans        id · effective_from
plan_hours   plan_id · activity_id · minutes
timer        activity_id · started_at · block_started_at · banked_sec · paused_at? · paused_sec · stopped_at?   (at most one row)
```

- **The timer row** stores times, never a running count: `started_at` (the entry's date), when the current work block began, the work banked from finished blocks, pauses in the current block, and when Stop was pressed.
- **IDs** are auto-increment integers.
- **Time is stored as whole minutes.** `credited_min` is always a multiple of 15. Hours with decimals appear only on screen.
- `worked_min` is the actual clock time. It's set only on entries made by the timer (the API takes it from the timer, never from the request), and it never changes after that.
- **Day and Week Of are calculated, never stored.**
- **Weeks run Monday to Sunday.** "Today" is the date in the server's `TZ`.
- **Deletes are permanent.** There's no trash and no undo.
- `rake export` writes a readable JSON copy of every table next to the database, so `log-data/` has a diffable file in git.

### Rules

**Plan versions**
- `effective_from` is always a Monday.
- Changing a plan (editing an activity's weekly hours, or adding or archiving an activity) saves a version that starts on the current week's Monday. If a version already starts that Monday, update it instead of adding another.
- A week uses the newest version whose `effective_from` is on or before that week's Monday.
- Only the current week and later weeks can be edited. Past weeks are read-only.

**Activities**
- Activities are listed in creation order. There's no reordering.
- A new activity counts as 0 planned minutes in older versions.
- Archiving an activity sets its planned minutes to 0 from the current week on and removes it from the activity pickers. Old weeks and entries still show it.
- An activity can be deleted only if it has no entries.

**Credit**
- Manual entries: you type hours in steps of 0.25. They're stored as minutes, more than 0 and up to 24 h.
- Timer entries: credit is `worked_min × 60 ÷ 50`, rounded to the nearest 15 minutes. So 50 worked → 60 credited, 25 → 30, 37 → 45, and 5 → 0.
- You can change the credit before saving or later. `worked_min` stays as recorded and is shown for reference.

**Week numbers** (for each activity, for one week)
- **Actual** = the sum of `credited_min` for entries dated in that week, Monday to Sunday.
- **Planned** = the minutes from that week's plan version.
- **Diff** = Actual − Planned. Red when below 0, green when above 0.
- **%** = Actual ÷ Planned. Blank when Planned is 0.
- **Total row** = the sums across all activities.
- **Daily totals** = the sum of credit for each day of the week, Mon to Sun. These are plain numbers with no plan to compare against.

### Timer

- Pick an activity and press **Start**.
- After 50 minutes of work, it plays a chime and shows a browser notification, then counts down a 10-minute **break**. The break isn't credited.
- After the break, choose **Continue** (another 50-minute block) or **Stop**.
- **Pause** and **Resume** are available at any time. Paused time isn't credited.
- **Stop** opens the Log time dialog already filled in: today's date (the date the timer started), the activity, the credit and the worked minutes. You add "What I did" and save. Closing the dialog without saving discards the time.
- A stopped timer stays on the server until it's logged or discarded, so the time survives a reload while the dialog is open. The header then shows **Log it** (reopens the dialog) and **Discard**. A new timer can't start until then.
- Only one timer exists at a time. It's stored in the `timer` table, so it survives page reloads, closed tabs and server restarts. Elapsed time is always calculated from `started_at` and the pauses, never by counting in the browser.
- The timer lives in the header of every page. While it runs, the browser tab title shows the countdown.

### Pages

**Header (every page):** app switcher · **Week** · **Log** · timer · **+ Log time**

**Week** (the front page). Answers "am I on plan this week?"

```
  ← Week of 19 Oct 2026 →                             [+ Add activity]

  Activity              Actual   Planned   Diff    %
  LeetCode               7.0     [6.25]   +0.75  112%   ⋯
  Applications           2.5     [5.0 ]   −2.5    50%   ⋯
  …
  Total                 13.0      25.0   −12.0    52%

  Mon 3 · Tue 4 · Wed 4 · Thu 2 · Fri 0 · Sat 0 · Sun 0

  Timer: 50 minutes of work counts as 1 hour.
```

- Use ← and → to move between weeks. The current week is the default.
- **Planned** cells can be edited inline for the current week and later weeks, and save when you leave the cell. In past weeks they're plain text.
- The **⋯** menu on each row has: Rename / edit hint, Archive, and Delete (only shown when the activity has no entries).
- Archived activities appear only in weeks where they have entries or planned hours.
- **+ Add activity** opens the Add activity dialog.

**Log**. Answers "what did I do?"

- Every entry, newest first.
- Columns: Date, Day, Activity, Hours, What I did, Notes, Worked (timer entries only).
- A search box (over What I did and Notes) and an activity filter.
- Edit and Delete buttons on each row.

**Dialogs**

- **Log time** (opened by + Log time, by Edit on a Log row, and when the timer stops): Date (defaults to today), Activity, Hours (steps of 0.25), What I did, Notes. Timer entries also show Worked, read-only.
- **Add activity**: Name, Hint (optional), Weekly hours.

### API

JSON throughout. Like leetcode-helper, every call that changes data returns the full state for the week being viewed.

| Method | Path | Body / query |
|---|---|---|
| GET | `/api/state?week=YYYY-MM-DD` | The week's Monday (defaults to the current week). Returns activities, the week's numbers, daily totals, today, and the timer |
| GET | `/api/entries?q=&activity=` | Entries, newest first, filtered |
| POST | `/api/entries` | `date, activity_id, credited_min, what`; optional `notes` |
| PUT | `/api/entries/:id` | Any of the fields above |
| DELETE | `/api/entries/:id` | |
| POST | `/api/activities` | `name, weekly_min`; optional `hint` |
| PUT | `/api/activities/:id` | `name`, `hint`, or `archived: true` |
| DELETE | `/api/activities/:id` | Refused if it has entries |
| PUT | `/api/plan` | `activity_id, weekly_min`. Applies from the current week |
| POST | `/api/timer/start` | `activity_id` |
| POST | `/api/timer/pause`, `/resume`, `/continue` | |
| POST | `/api/timer/stop` | Ends the work. The timer stays, phase `stopped`, with `entry`: the filled-in fields |
| POST | `/api/timer/log` | `credited_min, what`; optional `notes`, `date`, `activity_id` (default: the timer's). Saves the entry with the timer's `worked_min` and clears the timer |
| POST | `/api/timer/discard` | Clears a stopped timer without saving |
| GET | `/api/apps` | Where each app runs, for the switcher (leetcode-helper has the same route) |
| GET | `/api/dev/version` | `--dev` only, like leetcode-helper |

### Ruby setup

- **Ruby 4.0.7**, installed with Homebrew and pinned in `.ruby-version`.
- **Gems** (Bundler): `sinatra`, `puma`, `rackup`, `sequel`, `sqlite3`. For tests: `minitest`, `rack-test`.
- **Layout**, following Ruby conventions:

| Path | What it is |
|---|---|
| `Gemfile`, `.ruby-version` | Ruby and gem versions |
| `bin/server` | Starts the server (`--dev` for dev mode) |
| `config.ru` | The Rack app |
| `Rakefile` | `test`, `db:migrate`, `export` |
| `lib/` | The app: routes, the plan/credit/timer rules, the database layer |
| `db/migrations/` | Sequel migrations |
| `public/` | Plain-JS front end that uses `/design/` |
| `test/` | Minitest tests |
| `Dockerfile`, `docker-compose.yml` | Container on `ruby:4.0.7` (the full image: Puma compiles a native extension), built from the repo root, published on `127.0.0.1:8002`, data mounted from `LOG_DATA_DIR` |

- **Dev mode:** `--dev` restarts the server when `lib/` changes and reloads open pages when the server or `public/` changes, the same way as leetcode-helper.
- **Options:** `PORT` (default 8002), `HOST` (default `127.0.0.1`), `LOG_DATA`, `TZ`, `LEETCODE_URL`, `LOG_URL`.
- **README** with the same sections as leetcode-helper's: Run it, Pages, Files, Tests, API.
- Python is acceptable in the backend only if something truly needs it.

### Tests

Minitest, with each test on a fresh in-memory SQLite database:

- the credit formula (including the rounding cases above)
- choosing a week's plan version, and updating an existing version in the same week
- archiving and deleting activities
- the week numbers and daily totals
- the timer (pause, break, continue, stop) against a fake clock
- the API through `Rack::Test`

### Starting data

Once, during setup, the 18 entries in the sheet's Log tab (12–22 Oct 2026) and its current weekly totals are copied into the database. This is a one-off step done by hand: there's no import code in the app.

The first plan version starts **Mon 12 Oct 2026**, and the sheet's category names are split into a name and a hint:

| Activity | Hint | Weekly hours |
|---|---|---|
| LeetCode | new first, retries last 20 min | 6.25 |
| Applications / outreach | | 5 |
| System design | reading / mock | 5 |
| Personal projects | vibe coding | 4.5 |
| Open source | | 2.75 |
| AI reading | practice | 1.5 |

### Out of scope for now

- Job-application tracking (companies, stages) — maybe a separate app later
- Hosting and login
- A pace marker on the Week page
- Reordering activities
- Importing spreadsheets from inside the app
