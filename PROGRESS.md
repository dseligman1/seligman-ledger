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
| — | `budget.lines[].payMonths` {year: [1–12]}: lump the monthly-average amount into specific months, set per year (v2.3; v2.1–2.2 stored one list for all years, which `L.normalise` copies to every year on load) |
| — | `coverage.excludeSlow`: leave the "slower to get out" tag (`coverage.slowTagId`) out of months of cover |

## Architecture

### v2.11 (2026-11-10): Life admin (pensions, bills, subscriptions, insurance)

New sixth page **Life admin** (`js/admin.js`; bottom bar label "Admin"). Data lives in `state.admin`, apart from accounts and snapshots.
- **Pensions** `admin.pensions[] {id, name, provider, owner, kind, note, archived, values:[{id, date, value}]}`. Kinds: workplace, personal/SIPP (pots, summed) and final salary (db), state (expected yearly income, totalled separately, never added to pots). Updated whenever: "Update pension values" round-up (blank = skip, "Same as last time"), or per pension. One value per date (a second replaces it). Due after 92 days without a value.
- **Never** in liquid funds, savings, months of cover, net worth, check-in, transfers, monthly reviews or reminders. Shown alongside: Overview "Pensions" tile (5th stat), Life admin "Net worth + pensions" tile, Accounts note. Chart `pensions` = pots stacked at each month-end, carrying the last value forward; a pot counts from its first value.
- **Bills/subscriptions/insurance** `admin.items[] {id, name, provider, category (utility|subscription|insurance|other), cost, period (monthly|quarterly|annual), endDate, owner, autoRenew, ref, note, archived}`. Monthly and yearly equivalents; renewal status passed / soon (≤30 days) / later. "Coming up" list, category cards, and an Overview card that appears only when something ends within 30 days, has lapsed, or a pension is due.
- **Calendar**: "Add dates to calendar" downloads `ledger-renewals.ics` (each future end date, all-day, alarm 14 days before; plus a quarterly "update pension values" event). Stable UIDs.
- Costs here are a record only; they don't feed the Budget tab (possible later link). Guide gains a 9th step. Demo v2 adds invented pensions and 18 items (`L.DEMO_VERSION = 2`, so saved demos rebuild). `L.normalise` adds an empty `admin` to older files; real `ledger.json` gains it on its next ordinary save.
- Model: `M.pensions / pensionTotals / pensionSeries / pensionValues / itemMonthly / itemAnnual / renewal / adminSummary` in `model.js`.
- Verified: 35 Node tests (7 new in `tests/life-admin.test.cjs`, incl. pensions leave liquid/net worth/check-in unchanged); `tests/admin-browser.cjs` (demo only, 390/1280px: overview tile + card, quarterly update, add pension + value, add subscription → Coming up, .ics, reload, no horizontal scroll, no errors or external requests); onboarding and report browser tests pass. Screenshots in private `../outputs/life-admin/`. Not yet on a real iPhone.

### Sandbox (2026-11-10): bank transactions vs the budget, before touching the app

`sandbox.html` (not linked from the app; open `/seligman-ledger/sandbox.html`). Read-only: never calls `store.queue/flush`.
- Sources: invented **Sample Barclays feed** (`js/sandbox-feed.js`: current account + Barclaycard, last 3 months + this month to date), **Upload a bank CSV** (parsed in memory, never saved; Barclays `Number,Date,Account,Amount,Subcategory,Memo`, Paid in/Paid out, card exports with a flip-sign tick), **Live Barclays feed** (placeholder until the nightly feed exists).
- Budgets: demo household, `?preview` budget, or **Our real budget** read-only via `store.unlock(pin)` (needs this device's token).
- `js/sandbox-model.js` (pure): feed format `ledger-feed/1` {accounts[], transactions[{id, accountId, date, amount (− = out), description, pending}]}; CSV parsing with stable ids and dedupe; sorting order = your pick → your rule (longest keyword wins) → paired move (equal/opposite between feed accounts within 4 days) → move wording → built-in guesses (only to lines that exist; exact name preferred) → not sorted. Refunds reduce their spending line. Plan per line = `planMonthLines` (sheet history for past months) else `lineInMonth`.
- Rules and picks: localStorage `ledger_sandbox_v1_<demo|preview|dan|sal>`, this browser only.
- Next: nightly Action pulls Barclays via Lunch Flow → `ledger-feed/1` → encrypted `feed-barclays.json`; plan in `../docs/2026-11-10-barclays-feed-setup.md`.
- Verified: 5 Node tests in `tests/sandbox.test.cjs` (28 total pass); headless Chrome at 390/1280px: no errors, no external requests, no horizontal scroll; sort + make rule, CSV upload, real-budget and live placeholders; preview budget loads.

### v2.10 (2026-11-08): household entry, guided setup and annual amounts

- Household chooser: **Dan & Micks** keeps `ledger.json`, `data.json` fallback and existing device preferences. **Sal & Phil** uses only `ledger-sal-phil.json`, with no legacy fallback. Both use the existing one-time GitHub token connection; subsequent visits need their household PIN. No credentials are included in source or documentation.
- **Try the demo** opens immediately, without a username, PIN or token. Existing local-only demo storage, reset and exit remain. Demo UI preferences are isolated from the real households.
- Eight-step first-run guide adapted from Family Finances Tracker: real-page navigation/highlighting, back/next/skip, keyboard focus containment, replay from Settings. Completion is local to the household/demo on that device. Guide lives in `js/onboarding.js`; no financial-state writes for tour completion.
- Sal & Phil's encrypted starter is copied from the Family Finances Tracker's flattened test dataset (same account names and amounts). No Dan & Micks data was copied. Starter notice remains until explicitly dismissed. Check-in confirmations, reports and push subscriptions are reset. Calendar reminders are available; the existing phone-push Action remains Dan & Micks only.
- `budget.lines[].amountPeriod[year]` is `monthly` or `annual`. `M.inputAmount` reads the entered value; `M.amt` always returns the monthly equivalent, keeping charts, cover, reports and forecasts consistent. Budget rows show `/mo` or `/year`; line details let each year choose independently. Switching units converts the value, preserving totals. New-year copies include the unit and payment months.
- `L.normalise` converts existing entries with exactly one pay month to annual (value ×12). Multi-month and every-month entries keep their values and monthly units. Explicit units prevent double migration; normalization happens on load/import/restore and persists with the next ordinary save. Original encrypted Dan & Micks file was not edited by this release.
- Settings → Change PIN re-encrypts only the selected household after current-PIN confirmation and a SHA check. Failed/concurrent changes keep the current key. Saves verify the remote envelope before writing, preventing an old-PIN session from replacing a newer one. Older Versions still require their original PIN. Dan's reminder `LEDGER_PIN` secret must be updated separately after a PIN change.
- Monthly backup release now explicitly includes the parents' encrypted file, alongside the full-history bundle.
- Verification: 23 Node tests; onboarding browser test (390/1280px, invented data and mocked GitHub) for demo/tour/annual edits/household/PIN rotation; existing report browser regression. Screenshots inspected in private `../outputs/onboarding/`. All 60 private-preview months and yearly totals match v2.9; accounts, snapshots, plan history and original `ledger.json` unchanged. No live writes during browser QA. Real iPhone checks remain outstanding.

### v2.9 (2026-11-07): moves between accounts, full + controllable tables

Why: v2.8 only netted 1-to-1 transfers within 5%, so money moved out of a market-linked account (whose balance also moved with prices) into a cash ISA read as a market loss.
- `M.detectTransfers(s, a, b)`: 1→1, 1→2-3 and 2-3→1 matches within 5%; market-linked accounts get extra slack of 3% of their balance, but only for moves ≥ max(£2k, 2× slack) so a normal month of saving during a dip isn't mistaken for a move. Market-side amounts take the exact non-market figure.
- `M.transfers`: `snapshots[].transfers` [{from, to, amount}] recorded at check-in wins; else spotted; v2.8 `invested` still honoured as a group-level move. `M.moves` (What moved) uses the same transfers.
- `M.drivers` now returns `groups` (Market-linked / Other savings / Current accounts and cards: change = moved + real), per-account rows, transfers, `intoMarket` and `check` (market and other money went opposite ways by ≥ max(£2k, 2% of market) with no recorded move → "Check this" prompt). Market = market group real change; ours = total − market.
- Check-in: "Money moved between our accounts" list, pre-filled with spotted moves that refresh as balances are typed; editing/removing/adding switches to a recorded list saved on the snapshot ("Use spotted moves instead" reverts). Replaces the v2.8 single box.
- Overview card: "Everything" table + "Just what we control" table + moves list + Every account. Review image panel is the same table (H 2205); extra bullet for moves into/out of investments.
- Verified: 15 node tests (shuffle with price noise, 1→2 split, saving-during-dip guard, recorded moves, flag, legacy figure); report-browser test passes; Playwright demo at 390/1280px incl. editing moves at check-in.

### v2.8 (2026-11-06): ± button, 6-digit PIN boxes, what drove the change

- **± button** (`.sign-btn`, `data-sign`) next to check-in balances, "Paid into investments" and scenario/one-off amounts, because the iPhone decimal keypad has no minus key. One delegated handler in `app.js` flips the sign, fires `input` (and `change` for `data-edit` fields), and stops the tap stealing focus so the keyboard stays open.
- **PIN**: six boxes over one transparent real input (keeps keyboards and password managers working). Digits only, max 6, Unlock disabled until 6, the sixth digit submits; a wrong PIN clears the boxes. Same on the demo login (auto-submits only once a name is entered). **Assumes the PIN is exactly 6 digits.**
- **What drove the change**: `M.marketTag` (Settings → Market-linked accounts; automatic = tag named market/invest…), `M.drivers(s, a, b)` splits the liquid change into *ours* (everything not market-linked: cash, current, cards) and *market* (market-linked change less money paid in). Money paid in comes from the optional check-in field `snapshots[].invested` (+ in, − out); if blank, a transfer between the two sides within 5% is netted automatically. Overview has a "What drove the change" card and "market" badges in What moved. Monthly review: `drivers`, `oursGap` and `trend[].ours`; driver bullet, plan comparison excludes markets, market-led months get a market headline; the image gains a panel (H 1740 → 2080) and the plan chart bars use change excl. markets.
- Verified: `node --test tests/monthly-report.test.cjs` (11, incl. 3 new driver tests); `tests/report-browser.cjs` passes; Playwright demo screenshots at 390px (PIN filter/auto-submit, ± keeps focus, drivers card). Not yet tried on a real iPhone.

### Monthly reviews (v2.7, 2026-10-30)

- Complete every non-asset account confirmation plus the change, one-offs and budget checklist activities: the previous month's review is created automatically and opens after the last activity. A manual balance tick cannot bypass unconfirmed accounts. November check-in → October review, using October → November balance snapshots and October's plan. Dates and the approximation are explicit on the export.
- Overview → View & share review, or menu → Monthly reviews, reopens saved reviews; a month selector accesses older ones. Existing completed check-ins are picked up on unlock. Reopening a check-in withdraws its report until complete again; completed reports refresh when relevant figures change.
- `js/report-model.js` computes the dataset: three deterministic bullets, liquid funds/change/cover/net worth, six check-in balances, six prior-month changes versus their plans, and the next month's planned change/upcoming item. No invented spending causes or AI service calls. Missing snapshots create gaps, not zero changes. Historical calculations exclude later balances/assets; stored historical account IDs prevent new accounts reopening past reviews.
- `js/reports.js` draws a 2160×3480 PNG and a matching single-page image-based PDF on device. Native share, PNG clipboard copy and image/PDF downloads use already prepared files (preserving tap activation). Unsupported/failed sharing offers downloads; cancelling sharing is quiet. Native WhatsApp delivery still needs an iPhone test.
- Small `monthlyReports[checkMonth]` datasets save inside the existing encrypted ledger; rendered files stay in browser memory until the user saves/shares. No plaintext images, PDF files or financial data are published to the public repo. At most two rendered reports are cached in memory. Existing backups, Versions and sync continue to work.
- App hooks: commit, unlock, remote sync, import and version restore. Assets bumped together to `?v=2.7.0`.
- Verification: `node --test tests/monthly-report.test.cjs` (8 calculation/lifecycle tests). `node tests/report-browser.cjs` (requires Playwright, Chrome, local server at :8767; optional `LEDGER_PLAYWRIGHT_PATH`) uses only demo data and mocks sharing/clipboard. Covers both completion orders, PNG/PDF downloads, 390px/1280px layout, reload/history, reopen/recomplete and failures; no external requests. PNG and PDF rendered and visually checked; PDF confirmed one page with Poppler. Demo outputs are in the private sibling `outputs/monthly-review/`.
- API references: [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share), [clipboard image writing](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write). No runtime library added.

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
| `js/admin.js` | Life admin page (pensions, bills, subscriptions, insurance), its popups, calendar export, and the small Overview/Accounts pieces |
| `sw.js` | Service worker. Only shows push notifications and handles taps; no caching |
| `.github/workflows/reminders.yml` + `.github/reminders/remind.mjs` | Scheduled check-in reminders (see below) |

- **Data files**: `ledger.json` for Dan & Micks and `ledger-sal-phil.json` for Sal & Phil (encrypted v2). The v1 file `data.json` is **left untouched** as a backup;
  if `ledger.json` is ever missing, unlock migrates `data.json` automatically.
- **Sync**: last-write-wins; re-reads the `sha` before each PUT, retries once on conflict; pulls on
  focus/visibility if not mid-edit.
- **Rendering**: each page is a pure function of state. Edits commit on `change` (blur) and the page
  redraws straight away, putting focus (and the cursor) back on the field you're in, matched by its
  data-* attributes. Only a text box with unsaved typing delays the redraw. (Before v2.3 any focused
  input, including a just-clicked tick box or dropdown, delayed it, so Planner edits looked like they did nothing.)
- **Generic editing**: `data-edit="field" data-coll="<path>" data-id data-f [data-type=num]` edits any list item;
  `data-act="add|del"` with `data-coll` adds or removes. Paths support `#id` segments, e.g. `scenarios.#s12.items`.

## Preview mode (for trying changes without touching real data)

From the project folder (not `code/`) run `python3 -m http.server 8765`, then open
http://localhost:8765/code/index.html?preview. It loads `../data/ledger-preview.js` (the
unencrypted seed in the private `data/` folder, never committed). Edits stay in that browser's
localStorage; Settings → Reset preview restores the seed.

## Demo mode (v2.4, for showing the app to others)

- **Open**: household chooser, connection or PIN screen → **Try the demo**. One tap; no credentials (since v2.10). Real households still need the device connection token and their own PIN.
- **Mode**: login sets `sessionStorage.ledger_demo = 1` and reloads. `L.DEMO` (core.js) is read once at
  load; `L.LOCAL = PREVIEW || DEMO` switches off every GitHub read/write, focus pulls and push
  notifications. Closing the tab ends the demo; Exit demo / Lock clear the flag.
- **Data**: `js/demo.js` → `L.demoState()` builds an invented household for today's date: 10 accounts
  + 2 estimated assets, 36 months of per-account history, this month's check-in 4/10 done, budget
  2 years back to 1 year ahead with pay months, one-offs, upcoming costs, three what-ifs and a loft
  project. Fixed random seed, so every reset gives the same household. Run it through `M` in Node to
  sanity-check numbers (liquid ~£53k → ~£80k, ~15 months of cover).
- **Storage**: edits save to `localStorage.ledger_demo_state_v1`. Reset demo data (demo bar or Settings)
  deletes it. A demo nobody has edited is rebuilt each month so history always runs to today; bump
  `L.DEMO_VERSION` after changing `demo.js` so saved demos are rebuilt.
- **Text**: sheet-specific notes (Trends "About this data", net worth subtitle, spend-chart notes) have
  a demo or no-planHistory version, so the demo never mentions the real sheet or accounts.

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

- **Months of cover** = (liquid [− slower money] + fund adjustments) ÷ (planning-year fixed + living [+ extras] + cost
  adjustments). The chart over time uses the same denominator for every month; fund adjustments only
  apply to the latest point, so the chart's last point equals the headline. "Slower money" = accounts
  with the tag picked in Planner (default Market-linked); left out only when ticked, and in the chart only
  from Aug 2026 (earlier months have no per-account split).
- **Monthly change** = change in liquid funds. Transfers between own accounts net to zero; "What moved"
  pairs an outflow and inflow within 5% of each other (≥£500) and shows them as a transfer.
- **Plan for a month**: `planHistory` for past months, the budget (with `payMonths`) for now and the future.
  The sheet spread every line evenly, so past months also take the pay months set for that year: each such
  line's monthly average moves into its pay months (`timingShift` in model.js); totals per year don't change.
- **Projection**: actual for the last 12 or 24 months (solid), then 24 months dashed along (i) the 6-month
  average trend, (ii) the budget month by month, (iii) the budget plus active what-ifs. Coming up items are added to all three.

## UI patterns

- Multi-series charts take `pills` (tick boxes) instead of a legend. Hidden series are per device in
  `UI.off[chartKey]`, and the y-axis rescales to the visible series.
- Navigation: sidebar ≥1100px; hamburger drawer below that; bottom tab bar below 900px. Theme toggle
  in the header (sun/moon) and in the menu (Dark/Light/Auto).
- Where the money goes (Budget): one bucket ticked → bars split by that bucket's lines (top 7 + Other).
  A thick red line shows total income in £ on the same axis as the bars (v2.5, 2026-10-30; replaced the
  v2.2 right-hand % axis, which made 100% look like ~£5k at a glance). Months with zero or negative
  income, such as Dec 2024/Jan 2025 where the sheet booked the house purchase against income, are left
  as gaps; one-off spikes are clipped and labelled. The line is hidden when one bucket is split by line,
  since full income would flatten a single bucket's bars. Tapping a bar opens that month's breakdown
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

## Versions (v2.6, in-app restore)

Settings → Your data → **Versions…** lists every save of `ledger.json` (GitHub commits on that path,
30 a page, "Show older" for more), grouped by day. Tap one to decrypt it with the current PIN and
compare net worth, latest check-in, accounts and budget lines against now. **Restore this version**
re-saves it as a new commit ("Restore ledger to version from …"), so restores are themselves undoable;
`meta.restoredFrom` records the source. `push.subs` is kept from the current state (device sign-ups,
not data). A version saved under an older PIN shows "saved with a different PIN". Hidden in preview/demo.
Code: `L.versions` in `js/core.js`, `openVersions` and `ver*` actions in `js/app.js`, `.ver-*` in `style.css`.
Tested with stubbed history in headless Chrome (list, paging, PIN error, compare, restore); not yet on a phone.

## Backups (automatic)

Every save is already a commit, so `git log ledger.json` holds every version (and Settings → Versions…
restores any of them). On top of that, two copies guard against deleted files, a rewritten history or a lost repo:

1. **GitHub, monthly** (`.github/workflows/backup.yml`, 06:00 UTC on the 7th): a Release `backup-YYYY-MM-DD`
   with `seligman-ledger-<date>.bundle` (the whole repo, every commit), `ledger-<date>.json` and
   `data-v1-<date>.json` (both encrypted). See github.com/dseligman1/seligman-ledger/releases.
2. **Dan's Mac, daily since 2026-10-30** (launchd `~/Library/LaunchAgents/com.seligman.ledger-backup.plist` →
   `~/Library/Scripts/seligman-ledger-backup.sh`): runs at 10am and at login. Checks GitHub's latest
   commit (`git ls-remote`) and makes a copy only if it's new since the last one (`.last-sha`), into
   `~/Backups/seligman-ledger/<date>/`: a bundle cloned fresh from GitHub plus `ledger.json`.
   Keeps every copy from the last 30 days, then the newest copy of each month; copies holding a
   project-folder zip are never pruned. Silent on success; notifies only if GitHub hasn't been reached
   for 7 days (`.last-check`). Kept outside ~/Documents because macOS blocks scheduled jobs there; run
   `zsh ~/Library/Scripts/seligman-ledger-backup.sh --now` by hand to force a copy that also zips the
   project folder (which includes the unencrypted preview seed). Log: `backup.log`. The old monthly
   script is kept beside it as `seligman-ledger-backup.sh.monthly-2026-10-30`.

**Restore**
- Any earlier save, from the app: Settings → Versions… (see above). Needs the repo and the PIN.
- Whole repo: `git clone seligman-ledger-<date>.bundle seligman-ledger` gives a full working copy
  with history; push it to a new or emptied GitHub repo.
- Just the data: copy `ledger-<date>.json` over `ledger.json` in the repo and commit + push. The
  app picks it up on the next unlock. Same PIN as when it was saved.

## Status as of 2026-10-23

v2.1 (same day, Dan's first feedback): tick-box pills on charts, check-in tracking per account with
checklist, bonus months, spend-by-group charts, projection with history, asset history, net worth chart,
transfer netting, side menu, header theme toggle. Tested at 390px and 1280px in headless Chrome,
including a simulated 3 Nov multi-day check-in.

v2.2: spend chart drill-down (tap a bar; one bucket → split by line), % of income line on a right axis,
line-level plan history from the sheet, and push reminders via GitHub Actions.

v2.3 (Dan's feedback): (i) bonus/income/cost pay months set per year (Budget → tap a line → When is it
paid?), and applied to past months too; (ii) Planner edits redraw at once (the stale-redraw bug above);
(iii) "Count as slower money" renamed "Money that's slower to get out", explained, and given a "Leave out
of months of cover" tick box. File versions bumped to `?v=2.3.0` so phones fetch the new code.

v2.4 (2026-10-24): demo mode for showing the app to others (see "Demo mode" above). Tested in headless
Chrome at 390px and 1280px: login (wrong and right PIN), all five pages, check-in edit kept after
reload, reset, exit; no GitHub requests and no JS errors in demo mode. File versions bumped to `?v=2.4.0`.

v2.5 (2026-10-30): "Where the money goes" shows income as a thick red £ line on the bar axis (replaces the
right-hand % axis); 8th series colour changed red → slate blue so Savings contributions doesn't clash.
Files bumped to `?v=2.5.0` (`0b4dd4e`): the first push forgot the bump and the PIN unlock stopped working
until it was added. **Always bump `?v=` in index.html when any js/css file changes.**

### Next steps / ideas
- Check on the iPhone that moving between boxes keeps the keyboard up after the redraw (desktop tested only).
- Dan's feedback pass on the preview.
- Wife's device: same token + PIN; first unlock pulls `ledger.json`.
- Possible: per-account history before Aug 2026 could be recovered from old copies of the sheet, if any exist.
- Possible: CSV export of the monthly table.
