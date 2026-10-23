# The Seligman Ledger — Project Context

Read this first if you're picking up work on this project in a new session.

## What this is

A private family budget and net-worth tracker that replaces the "Seligman Family budget"
Google Sheet. Dan and his wife both view and edit it from their phones, and it stays in sync.

- **Live app**: https://dseligman1.github.io/seligman-ledger/
- **Repo**: https://github.com/dseligman1/seligman-ledger (public, so all data is encrypted)
- **Working copy**: `Documents/Claude/Projects/seligman-ledger/code` (the only checkout)
- **Source sheet**: Google Sheet "Seligman Family budget - v2" (id `1WyL71-Jk9eXNdTFDdsLGEU-dCadKl6pvQjRXDunvM8Q`)

## v2 (2026-10-23): what changed and why

The v1 app stored only "balance vs last month" per account, so you couldn't see an account's
progress over time, and the Explore view said "no prior months". v2 rebuilds the data model
around **monthly snapshots**:

| v1 | v2 |
|---|---|
| `accounts[].balance / prevBalance` | `snapshots[]` = one per month: `{month, date, balances:{accountId: £}}` |
| `history[]` bucket totals | Old months kept as `snapshots[].totals {savings, current}` (no per-account split) |
| Hard-coded `GROWTH_ACCOUNT_NAMES` | `tags[]` + `accounts[].tags` (many-to-many, user-editable) |
| One amount per budget category | `budget.lines[].amounts[year]`, matching the sheet's 2023–2027 columns, plus a `kind` |
| House project as loose numbers | `house.summary / building / furnishings`, from "general costs in and out" |
| — | `coverage` (months-of-cover adjustments), `scenarios` (what-ifs), `events` (one-offs), `upcoming`, `notes` |

## Architecture

Plain HTML/CSS/JS with no build step. Classic `<script>` tags (not modules), so the preview
also works from `file://`.

| File | Role |
|---|---|
| `index.html` | Shell: gates (token, PIN), header/nav, modal, toast |
| `style.css` | Tokens for dark (default) and light themes; mobile-first, 12-col grid at ≥900px, bottom nav below 900px |
| `js/core.js` | Encryption (AES-256-GCM, PBKDF2 210k; same envelope as v1), GitHub Contents API, save queue, focus-pull, v1→v2 migration, preview mode |
| `js/model.js` | All derived numbers: timeline (with gap interpolation), change, rolling averages, plan totals, coverage, ladder, tags, year summaries, projection |
| `js/charts.js` | Dependency-free SVG charts: line/stacked area, signed bars + overlay, waterfall, sparkline, html bars. Tooltips, resize-aware |
| `js/app.js` | Formatting, UI prefs, render loop, chart registry, modal, delegated events, settings, boot |
| `js/views.js` | The five pages (Overview, Accounts, Budget, Trends, Planner), chart specs and popups |

- **Data file**: `ledger.json` (encrypted v2). The v1 file `data.json` is **left untouched** as a backup;
  if `ledger.json` is ever missing, unlock migrates `data.json` automatically.
- **Sync**: last-write-wins; re-reads the `sha` before each PUT, retries once on conflict; pulls on
  focus/visibility if not mid-edit.
- **Rendering**: each page is a pure function of state. Edits commit on `change` (blur), and re-render
  waits until focus leaves the field so tapping between inputs isn't interrupted.
- **Generic editing**: `data-edit="field" data-coll="<path>" data-id data-f [data-type=num]` edits any list item;
  `data-act="add|del"` with `data-coll` adds or removes. Paths support `#id` segments, e.g. `scenarios.#s12.items`.

## Preview mode (for trying changes without touching real data)

From the project folder (not `code/`) run `python3 -m http.server 8765`, then open
http://localhost:8765/code/index.html?preview. It loads `../data/ledger-preview.js` (the
unencrypted seed in the private `data/` folder, never committed). Edits stay in that browser's
localStorage; Settings → Reset preview restores the seed.

## How the sheet maps in (importer: see `data/` notes)

- **Rows 92–93 (Savings / Current actuals)** → `snapshots[].totals`, Aug 2023 → Jul 2026.
  Skipped: Jul 2023 (formula = forecast), **Feb 2026** (cell is `=BD102`, i.e. the live panel, so the
  real figure was never kept), **Jul 2026** (`=AU92`, a copy of June). These are listed in `gaps[]`
  and are interpolated + flagged as estimated in charts.
- **Panel AX102:BE118** → accounts (savings/current split taken from the `BD102`/`BD103` formulas)
  and per-account snapshots: Sep 2026 = "Last Month" column, Oct 2026 = "Current Month" column.
  **Aug 2026** per-account balances came from the v1 app's stored balances.
- **Assumptions B3:H57** → `budget.lines` (kind from column A: A=income, B=bonus, X=fixed,
  C=living, D=extra, Z/N=off). Rows 3–4 (gross wages) → `budget.salaries` (reference only).
  Group assignment follows the Cash Flow tab's sections.
- **general costs in and out** → `coverage` adjustments (D10 coming in, D52 still owed, D55
  nursery correction) and `house.*`. Months of cover reproduces the sheet's D57 (16.6).
- **House equity / Motorway shares**: only the sheet's *model* values exist (rows 82/83), so they're
  `bucket:'asset'`, `estimate:true`, excluded from liquid, and shown with "est." badges.

## Data caveats (don't "fix" these without knowing why)

- Oct 2026 snapshot date is 15 Oct, inferred from the sheet's last edit; the sheet's "Date Updated"
  cell (BE109) still said 6 Sep, which is used for September.
- Monzo and Barclays Saver are classified per the sheet's formulas (Monzo = savings, Barclays
  Saver = current), which differs from v1. Aug 2026 bucket split therefore matches the sheet exactly.
- "Implied spend" = budgeted income − actual change in liquid funds. It includes investment
  growth, so it's a rough guide (labelled Inferred in the app).

## Design system

Dark by default (Dan's preference for personal tools): off-black `--bg:#0E0F0B`, yellow accent
`--accent:#E8B83A`, Georgia/Iowan for titles. Light theme keeps the v1 "ledger" palette. Chart
colours are the dataviz skill's validated 8-slot order (`--s1..--s8`): savings = slot 1 (blue),
current = slot 2 (orange), up/down change = blue/red (diverging). Tags default to slots 3+ so they
never clash with savings/current. No horizontal scrolling at any width; wide tables hide
secondary columns below 560px (`.hide-sm`).

## Status as of 2026-10-23

v2 built, tested (headless Chrome at 390px and 1280px: no overflow, no JS errors; workflows
checked numerically), deployed with the sheet data encrypted into `ledger.json`.

### Next steps / ideas
- Dan's feedback pass on the preview.
- Wife's device: same token + PIN; first unlock pulls `ledger.json`.
- Possible: per-account history before Aug 2026 could be recovered from old copies of the sheet, if any exist.
- Possible: CSV export of the monthly table; reminders on check-in day (would need a push service).
