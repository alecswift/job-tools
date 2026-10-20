# LeetCode Helper

A small web app with two parts: the Scattered Plan (212 problems to work through in order) and a web version of `LeetCode_Retry_Tracker.xlsx`. The tracker uses the same scoring formulas as the sheet: Time Score, Struggle, Interval, Due Date, Retry Priority and Status.

## Run it

Needs Python 3.8+ and nothing else.

```
python3 -m backend
```

from this folder, then open http://localhost:8001.

While editing the code, run `python3 -m backend --dev` instead. The server restarts itself when anything in `backend/` changes, and open pages reload when anything in `backend/` or `static/` changes.

### Or with Docker

```
docker compose up -d --build
```

Same address, http://localhost:8001. The container reads and writes the same `data.json` in this folder, so you can switch between the two ways freely (just don't run both at once). It restarts on its own unless you stop it with `docker compose down`. It runs the code straight from this folder in `--dev` mode, so edits to `backend/` or `static/` take effect on save with no rebuild. Only changes to the `Dockerfile` need `up --build`. Change `TZ` in `docker-compose.yml` if you move time zones, since it decides what "today" is.

Everything is saved to `data.json` in this folder. Back up or copy that one file to move your data.

## Pages

- **Plan** (the front page): the Scattered Plan, the NeetCode 150 plus 62 extra LeetCode problems in groups of 3. A tick means the problem is logged in the retry tracker: ticking it opens the Log dialog with its details filled in, and the tick appears once you save (closing the dialog leaves it unticked). To untick a logged problem, delete it from the Log. The **Quiz** button marks a problem done through the NeetCode quiz without logging it; its box shows a dot and it counts toward progress. Quiz marks are saved in `data.json`. Problems that are in the tracker show when they're next due, and logged problems outside the plan are counted as "off-plan".
- **Retry queue**: problems due for a retry, sorted by priority, plus what's coming up and what you've mastered. The note at the top suggests how to pace today's session.
- **Log**: every problem in one table, with sortable columns, search, and pattern and status filters. Green column headers are calculated.
- **How it works**: the formulas, filled in with your current settings, and the settings form. Edit the weights, spacing, mastery threshold, target times and pattern list, then save.

Problems are identified by their LeetCode slug (`two-sum`), the same key the plan uses, so a problem can only be logged once. Use **+ Log problem** for a new problem: paste its LeetCode link and the number, name, difficulty and a guessed pattern fill themselves in (anything you've already typed is left alone) and **Log retry** when you redo one. A retry sets the date, adds 1 to Attempts and re-scores the problem, the same as the sheet's instructions. Each attempt's scores are also kept in a `history` list in `data.json`.

## Files

| File | What it is |
|---|---|
| **`backend/`** | **The Python back end, run with `python3 -m backend`** |
| `backend/__main__.py` | Starts the server: reads the options below and picks the data file |
| `backend/web.py` | HTTP layer: maps each API route to a tracker call, serves `static/`, dev-mode reloading |
| `backend/tracker.py` | Every change to problems, plan marks and settings: add, edit, retry, delete, plan, settings. Also upgrades old `data.json` files |
| `backend/scheduling.py` | The formulas (Time Score, Struggle, Interval, Due Date, Priority, Status) and settings validation. The only copy of them: the dialogs' preview asks the server |
| `backend/storage.py` | Saving: the JSON file, plus an in-memory version for tests |
| `backend/leetcode.py` | Looks up a problem's number, title, difficulty and tags on LeetCode (public, no sign-in), for the Log dialog |
| `backend/import_xlsx.py` | Re-import from the spreadsheet (`pip install openpyxl`, then `python3 -m backend.import_xlsx LeetCode_Retry_Tracker.xlsx`). Matches problems by slug, so you can run it again safely. |
| **`static/`** | **The front end** |
| `static/index.html`, `style.css` | The page shell and styles |
| `static/main.js` | Picks the page from the URL, handles clicks and form input |
| `static/views.js`, `dialogs.js` | The four pages, and the Log / Edit / Retry dialogs |
| `static/autofill.js` | Turns a LeetCode lookup into Log dialog fields, picking the Pattern from the plan or LeetCode's tags |
| `static/store.js` | The page's copy of the server state and the calls that change it |
| `static/plan.js` | The plan's problem list, in plan order, and each topic's tracker pattern |
| **Everything else** | |
| `tests/` | Tests for the formulas, the tracker, the LeetCode lookup and the HTTP layer |
| `data.json` | Your data |
| `Dockerfile`, `docker-compose.yml` | Container setup (data stays in this folder through a mount) |

## Tests

```
python3 -m unittest discover -s tests -t .
```

Standard library only, like the app.

## API

Every call returns the full state (same as `GET /api/state`) except `/api/preview` and `/api/lookup`. Problems are addressed by slug.

| Method | Path | Body |
|---|---|---|
| GET | `/api/state` | Returns settings, problems with calculated fields, the interval table, plan marks and today's date |
| GET | `/api/lookup?q=<link or slug>` | Returns `slug, lc, name, difficulty, premium, tags` from LeetCode. 404 if there's no such problem, 502 if LeetCode can't be reached |
| POST | `/api/preview` | `difficulty, attempts, help, confidence, time`. Returns what that would score (`struggle, interval, timeScore, mastered`) without saving |
| POST | `/api/problems` | `name, difficulty, help, confidence`; optional `slug` (a slug or a LeetCode link; built from the name if left out), `lc, pattern, lastAttempted, attempts, time, notes` |
| PUT | `/api/problems/<slug>` | Any of the fields above. Corrects the latest history entry too |
| POST | `/api/problems/<slug>/retry` | `help, confidence`; optional `time, date, notes` |
| DELETE | `/api/problems/<slug>` | |
| PUT | `/api/settings` | Any setting, or `patterns` as a list |
| POST | `/api/settings/reset` | Restores the default numbers and keeps your patterns |
| PUT | `/api/plan` | `quiz`: list of problem slugs done by Quiz. Replaces the saved list. Solved plan problems are the logged ones, so aren't sent |

Options: `PORT=9000 python3 -m backend` changes the port, `HOST` changes the bind address (default `127.0.0.1`), and `TRACKER_DATA=/path/file.json` changes where data is stored. The server listens on localhost only.

## Credits

The plan's 150 roadmap problems and their topics come from the [NeetCode 150](https://neetcode.io/practice) by NeetCode. The 62 extras, the plan order and the retry tracker are this project's own. Problems link to [LeetCode](https://leetcode.com) and, for premium ones, to NeetCode's free versions.

This project is not affiliated with or endorsed by NeetCode or LeetCode.
