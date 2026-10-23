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
| — | `snapshots[].updated` {accountId: date}: when each account was confirmed that month (check-ins over several days) |
| — | `checklist[month]` {balances, change, oneoffs, budget}: manual ticks; balances auto-ticks when all accounts updated |
| — | `budget.lines[].payMonths` [1–12]: lump the monthly-average amount into specific months (bonus, annual bills) |

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
| `sw.js` | Service worker. Only shows push notifications and handles taps; no caching |
| `.github/workflows/reminders.yml` + `.github/reminders/remind.mjs` | Scheduled check-in reminders (see below) |

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
  Skipped Jul 2023 (formula = forecast). **Feb 2026** (cell is `=BD102`, the live panel) and
  **Jul 2026** (`=AU92`, a copy of June) repeat the previous month. Dan asked for no "estimated"
  flags (2026-10-23); any future unlogged month also repeats the month before (`M.timeline`).
- **Rows 82–83 (house equity, MW shares)** → asset `balances` on every snapshot, so Other assets and
  Net worth have full history. They're the sheet's model values, so still badged "est.".
- **Rows 85, 87 and group subtotals (13, 23, 30, 37, 46, 49, 62)** → `planHistory[month]`; the line
  rows under each group (14–22, 24–29, 31–36, 38–45, 47–48, 50–61, 63–66) → `planHistory[month].lines`
  (matched to budget lines by name within the group; sums checked against the group rows, 0 mismatches). Used as the
  plan for **past** months (`M.planMonth`), because budget-line kinds describe today (the flat rent,
  Hillend etc. were active in 2023–24). From the current month on, the plan comes from the Budget tab.
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

## Definitions (one place for each)

- **Months of cover** = (liquid + fund adjustments) ÷ (planning-year fixed + living [+ extras] + cost
  adjustments). The chart over time uses the same denominator for every month; fund adjustments only
  apply to the latest point, so the chart's last point equals the headline.
- **Monthly change** = change in liquid funds. Transfers between own accounts net to zero; "What moved"
  pairs an outflow and inflow within 5% of each other (≥£500) and shows them as a transfer.
- **Plan for a month**: `planHistory` for past months, the budget (with `payMonths`) for now and the future.
- **Projection**: actual for the last 12 or 24 months (solid), then 24 months dashed along (i) the 6-month
  average trend, (ii) the budget month by month, (iii) the budget plus active what-ifs. Coming up items are added to all three.

## UI patterns

- Multi-series charts take `pills` (tick boxes) instead of a legend. Hidden series are per device in
  `UI.off[chartKey]`, and the y-axis rescales to the visible series.
- Navigation: sidebar ≥1100px; hamburger drawer below that; bottom tab bar below 900px. Theme toggle
  in the header (sun/moon) and in the menu (Dark/Light/Auto).
- Where the money goes (Budget): one bucket ticked → bars split by that bucket's lines (top 7 + Other).
  The line on the right axis is the ticked spend as % of that month's total income (a deliberate
  dual axis Dan asked for; outlier months such as Dec 2024/Jan 2025, where the sheet booked the house
  purchase against income, are clipped and labelled). Tapping a bar opens that month's breakdown
  below the chart: bucket % of income, then each line's % of its bucket.
- Calendar reminder: Settings or menu → "Monthly reminder" downloads a repeating `.ics` (9am on the 1st, nudge
  2 days later). The home-screen icon badge shows accounts left to update where supported.

## Push reminders (v2.2)

- **Device side**: Settings → Phone notifications → "Turn on" asks permission, subscribes with the
  VAPID public key in `js/app.js`, and saves the subscription in `state.push.subs` (so it's encrypted
  in `ledger.json` and shared across devices). iPhone needs iOS 16.4+ and the app opened from the
  home-screen icon; Safari tabs can't receive web push.
- **Sender**: `.github/workflows/reminders.yml` runs at 08:00 and 09:00 UTC daily. `remind.mjs` keeps
  only the run that is 9am in London (BST/GMT), decrypts `ledger.json` with the `LEDGER_PIN` secret,
  loads `js/model.js` in a sandbox and calls `M.checkin(s, thisMonth)`. If the check-in isn't complete
  it pushes "New month…" (1st, nothing started) or "Still to do: …" to every saved device. Logs only
  counts, because Actions logs on a public repo are public.
- **Secrets** (repo Settings → Secrets and variables → Actions): `LEDGER_PIN`, `VAPID_PRIVATE_KEY`.
  Lose the private key → generate a new pair, put the public half in `app.js` and `remind.mjs`,
  and turn notifications on again on each device.
- **Manual run**: Actions tab → Check-in reminders → Run workflow → `test` (send a test now) or
  `check` (normal logic now).
- GitHub can delay scheduled runs by some minutes, and pauses schedules in public repos after 60 days
  without commits (each save is a commit, so monthly use keeps it alive).

## Status as of 2026-10-23

v2.1 (same day, Dan's first feedback): tick-box pills on charts, check-in tracking per account with
checklist, bonus months, spend-by-group charts, projection with history, asset history, net worth chart,
transfer netting, side menu, header theme toggle. Tested at 390px and 1280px in headless Chrome,
including a simulated 3 Nov multi-day check-in.

v2.2: spend chart drill-down (tap a bar; one bucket → split by line), % of income line on a right axis,
line-level plan history from the sheet, and push reminders via GitHub Actions.

### Next steps / ideas
- Dan's feedback pass on the preview.
- Wife's device: same token + PIN; first unlock pulls `ledger.json`.
- Possible: per-account history before Aug 2026 could be recovered from old copies of the sheet, if any exist.
- Possible: CSV export of the monthly table.
