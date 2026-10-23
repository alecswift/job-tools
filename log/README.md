# Log

A small web app for logging the hours you spend on each activity (LeetCode, applications, system design…) and comparing them with a weekly plan. It's a web version of the Log tab of `weekly_plan.xlsx`, with a work timer added: 50 minutes of work counts as 1 hour.

## Run it

Needs Ruby 4.0 (see `.ruby-version`) and Bundler.

```
bundle install
bin/server
```

from this folder, then open http://localhost:8002.

While editing the code, run `bin/server --dev` instead. The server restarts itself when any `.rb` file in `lib/` changes, and open pages reload when that, anything in `public/`, or the shared `../design/` changes.

### Or with Docker

```
docker compose up -d --build
```

Same address, http://localhost:8002. The container mounts the whole job-tools repo and runs this folder's code in `--dev` mode, so edits to `lib/`, `public/` or `../design/` take effect on save with no rebuild. Changes to the `Gemfile` or `Dockerfile` need `up --build`. Change `TZ` in `docker-compose.yml` if you move time zones, since it decides what "today" is. It restarts on its own unless you stop it with `docker compose down`.

Everything is saved to `log.sqlite3` in `../log-data/`, a separate private git repo. Set `LOG_DATA_DIR` (in `.env`, say) to keep it somewhere else with Docker, or `LOG_DATA` to the file's full path when running directly. `bundle exec rake export` writes `log.json` next to it: a readable copy of every table, so changes show up as diffs in git.

## Pages

- **Week** (the front page): one row per activity with this week's **Actual** hours (Monday to Sunday), **Planned** hours, the **Diff** (green when over plan, red when under) and **%** of plan, plus a total row and each day's total underneath. Use ← and → to move between weeks. Planned hours can be edited right in the table for this week and later weeks. A change applies from this week on, and past weeks keep the plan they had. The **⋯** menu on each row renames an activity or changes its hint, archives it (its plan becomes 0 from this week; old weeks and entries keep it) or deletes it (only if it has no entries). **+ Add activity** adds one with its weekly hours.
- **Log**: every entry, newest first, with search (over What I did and Notes) and an activity filter. Edit or delete any entry.

**+ Log time** (on every page) records an entry: date, activity, hours in steps of 0.25, what you did, and notes.

**The timer** sits in the header. Pick an activity and press **Start**. After 50 minutes of work it chimes, shows a notification (if you allow them) and counts down a 10-minute break that isn't credited. Then press **Continue** for another 50-minute block, or **Stop**. Pause works any time during a block. Stop opens the Log time dialog filled in, with the credit worked out as worked minutes × 60 ÷ 50, rounded to the nearest 15 minutes (25 minutes → 0.5 h). Add what you did and save; closing the dialog discards the time. The timer is kept by the server, so it survives reloading the page, closing the tab and restarting the server. That includes a stopped timer that hasn't been logged yet: the header then offers **Log it** and **Discard**.

The "LeetCode | Log" bar at the top switches to LeetCode Helper. Set `LEETCODE_URL` and `LOG_URL` if either app runs somewhere other than ports 8001 and 8002.

## Files

| File | What it is |
|---|---|
| `bin/server` | Starts the server: reads the options below (and `--dev`) |
| `config.ru` | The Rack app: the tracker on the SQLite file, wrapped in the web layer |
| **`lib/`** | **The Ruby back end** |
| `lib/time_log.rb` | Loads the rest and picks the data file |
| `lib/time_log/app.rb` | HTTP layer (Sinatra): maps each API route to a tracker call, serves `public/` and `/design/` |
| `lib/time_log/tracker.rb` | Every read and change: the week's numbers, entries, activities, plan versions and the timer |
| `lib/time_log/credit.rb` | The timer's credit rule (50 minutes counts as an hour, in 15-minute steps) |
| `lib/time_log/database.rb` | Opens the SQLite file (or an in-memory one for tests) and runs the migrations |
| `lib/time_log/dev_mode.rb` | `--dev` only: restarts the server when `lib/` changes and tells open pages when to reload |
| `db/migrations/` | The tables, as Sequel migrations |
| **`public/`** | **The front end** |
| `public/index.html`, `style.css` | The page shell and the Log's own styles (shared ones come from `../design/`) |
| `public/main.js` | Picks the page from the URL, handles clicks and form input |
| `public/views.js`, `dialogs.js` | The Week and Log pages, and the Log time and activity dialogs |
| `public/timer.js` | The header timer: display, chime and notifications |
| `public/store.js` | The page's copy of the server state and the calls that change it |
| `public/util.js` | Hours formatting and date helpers |
| **Everything else** | |
| `test/` | Tests for the credit rule, plan versions, week numbers, activities, entries, the timer and the API |
| `Rakefile` | `rake test`, `rake db:migrate`, `rake export` |
| `Dockerfile`, `docker-compose.yml` | Container setup, built from the repo root so it can include `../design/` |

## Tests

```
bundle exec rake test
```

Minitest, with each test on a fresh in-memory SQLite database and a fake clock for the timer.

## API

JSON throughout. Every call that changes something returns the full state for the week being viewed: pass `?week=YYYY-MM-DD` (any day in that week; this week if left out). Times are whole minutes (`credited_min`, `weekly_min`), always in steps of 15.

| Method | Path | Body |
|---|---|---|
| GET | `/api/state?week=` | Returns `today`, `week` (`monday`, `editable`, `rows`, `total`, `daily_min`), `activities` and `timer` (null when none runs) |
| GET | `/api/entries?q=&activity=` | Entries, newest first, filtered by search text and activity id |
| POST | `/api/entries` | `date, activity_id, credited_min, what`; optional `notes`. Timer entries go through `/api/timer/log` |
| PUT | `/api/entries/<id>` | Any of `date, activity_id, credited_min, what, notes`. `worked_min` can't change |
| DELETE | `/api/entries/<id>` | |
| POST | `/api/activities` | `name`; optional `hint`, `weekly_min` |
| PUT | `/api/activities/<id>` | Any of `name, hint`, or `archived: true` |
| DELETE | `/api/activities/<id>` | Refused (400) if it has entries |
| PUT | `/api/plan` | `activity_id, weekly_min`. Applies from this week on |
| POST | `/api/timer/start` | `activity_id` |
| POST | `/api/timer/pause`, `/resume`, `/continue` | Continue starts the next block, during or after the break |
| POST | `/api/timer/stop` | Ends the work. The timer stays, phase `stopped`, with `entry`: `date, activity_id, worked_min, credited_min` for the Log time dialog |
| POST | `/api/timer/log` | `credited_min, what`; optional `notes`, `date`, `activity_id` (default: the timer's). Saves the entry with the timer's `worked_min` and clears the timer |
| POST | `/api/timer/discard` | Clears a stopped timer without saving |
| GET | `/api/apps` | Where each job-tools app runs, for the switcher |
| GET | `/api/dev/version` | `--dev` only (404 otherwise): `version`, which changes when the code does. Open pages poll it to reload |

Errors come back as `{"error": "..."}` with 400 (bad input) or 404 (no such thing).

Options: `PORT=9000 bin/server` changes the port, `HOST` changes the bind address, and `LOG_DATA=/path/log.sqlite3` changes where data is stored. `HOST` defaults to `127.0.0.1`, so the server is only reachable from this machine unless you change it. It also only answers requests addressed to `localhost` or `127.0.0.1`. The Docker image binds to `0.0.0.0` inside the container, but `docker-compose.yml` publishes the port on `127.0.0.1` only.
