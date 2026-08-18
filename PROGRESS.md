# The Seligman Ledger — Project Context

Read this first if you're picking up work on this project in a new session.

## What this is

A private family budget & net worth tracker, replacing a years-old Excel/Google
Sheet. Built for Dan and his wife to jointly view and edit from their phones,
always in sync. Originally scoped from a real spreadsheet ("Seligman Cash Flow"
tab + "Assumptions" tab + legacy house-move project tabs).

- **Live app**: https://dseligman1.github.io/seligman-ledger/
- **Repo**: https://github.com/dseligman1/seligman-ledger (public — see "Why public" below)
- **Working copy for edits**: `C:\Users\DanSeligman\my-webapp` (has its own git
  remote to the same repo). This clone in the Claude Personal Folder is a second
  checkout — pick one to work from per session and `git pull` the other after,
  don't diverge them.

## Architecture — and why

Plain HTML/CSS/JS, **no build step** (this machine has no Node/npm installed,
which is part of why — but it's also just not needed at this size).

- **Hosting**: GitHub Pages, free tier. Free tier only serves *public* repos —
  there is no way around this without a paid plan.
- **The privacy problem this creates**: a public repo means anyone can read
  `data.json` directly, bypassing the app entirely. Solved by **encrypting the
  data client-side before it's ever committed** — AES-256-GCM, key derived via
  PBKDF2 (210k iterations) from a PIN only Dan and his wife know. The repo is
  public; the committed bytes are not readable without the PIN. See
  `encryptData`/`decryptData`/`deriveKey` in `app.js`.
- **"Backend" is GitHub itself**: saves are commits via the Contents API. A
  fine-grained PAT (scoped to just this repo, Contents: Read & write) is
  entered once per device and stored in that browser's `localStorage`. This
  gives free multi-device sync *and* full edit history for free. See
  `ghGetFile`/`ghPutFile` in `app.js`.
- **Sync model**: last-write-wins. On save, the app re-fetches the current
  `sha` before PUTting (minimizes but doesn't eliminate races — fine for a
  household of 2). On tab focus/visibilitychange, the app re-fetches and
  re-renders if the remote `sha` has changed, so switching back to the app
  after your wife edits it pulls her changes automatically.
- **Claude Artifact platform was considered and rejected** for the shared-state
  piece — checked via the `artifact-capabilities` skill: this account only has
  `downloads` and `mcp` capabilities, no persistent/shared-state capability, so
  Artifacts can't do real cross-device sync here. That's why it's a real
  GitHub-Pages deploy rather than staying an Artifact.

## Data model (see `defaultEmptyState()` in `app.js`)

- `accounts[]` — liquid accounts (savings + current groups), each tracks
  `balance` + `prevBalance` (like the old spreadsheet's snapshot panel — NOT
  full historical per-account data, just current vs last).
- `illiquidAssets[]` — House Equity and Motorway Shares, tracked separately
  because they're not liquid (excluded from the runway/liquidity check) and
  need to be excludable from net-worth views.
- `history[]` — `{month, savings, current, mwShares, houseEquity}`, one entry
  per calendar month, **upserted automatically** every time a balance is
  edited (`upsertCurrentMonthHistory()`). This is what powers the Explore
  chart. Real history back to 2023-07 was seeded from the spreadsheet's
  genuinely hand-entered actuals for Savings/Current — see "Data caveats"
  below for what wasn't carried over and why.
- `groups[]` / `categories[]` — the Assumptions tab's editable brackets
  (Income, Housing, Transport, Kids, Bills, Food, Lifestyle) and their monthly
  £ amounts + free-text notes.
- `keyDates[]`, `futureItems[]`, `oneOffEvents[]` — payday/bill dates, known
  upcoming costs/income (feeds the runway chart), and already-happened one-off
  spends/windfalls (feeds the dashboard commentary so a one-off doesn't read
  as "normal" spending).
- `houseCats[]`, `furnishings[]`, `houseFundsTotal` — the legacy house-move
  project tabs, carried forward as an editable archive/module.

Net worth "Explore" chart series are all *derived* from `history` at render
time (`totalAt`, `exMWAt`, `exHouseAt`, `exBothAt` in `app.js`) — nulls
propagate through cleanly when a component isn't tracked yet for a given
month, so old months (pre-app) show Savings/Current only, no crash.

Forecast lines are a simple trailing-6-month trend projection
(`projectForward()`), not a rebuild of the spreadsheet's old assumption-driven
formula cascade. Deliberate simplification — transparent over precise.

## Data caveats (don't "fix" these without knowing why)

- **House Equity and Motorway Shares start at £0.** The old spreadsheet only
  had *forecast* projections for these, no independently-verified current
  actual — seeding a guessed number felt worse than an honest zero. Dan needs
  to enter real figures.
- **"Other Assets" / "Total Net Worth" history was NOT imported**, even though
  the old sheet had rows that looked like actuals for them. On inspection
  those rows were formulas mirroring the forecast model (identical values to
  the forecast columns), not independently entered — only `Savings` and
  `Current Accounts` had genuinely hand-entered actuals (38 real monthly
  points, Jul 2023–Aug 2026). Re-verify with the original file if this ever
  needs revisiting; don't assume more history exists than what's in seed data.
- **First session after import shows £0 account deltas.** `ensureMonthRolled()`
  rolls `prevBalance = balance` once whenever the tracked month doesn't match
  the real calendar month — which is unavoidably true on first load after a
  fresh import. Cosmetic only, self-corrects on the next edit.
- **"Controllable movement" excludes HL, Morgan Stanley, and Nutmeg by name**
  (`GROWTH_ACCOUNT_NAMES` in `app.js`) — hardcoded, not a schema flag. If
  accounts get renamed or new market-linked accounts are added, update that
  array, or consider promoting it to a per-account `kind` field if this comes
  up again.

## Design system (don't change without reason — see `artifact-design` skill)

"Ledger" concept — warm sage-grey paper + brass accent, evoking a financial
ledger/passbook rather than generic fintech blue. Deliberately avoided the
"AI-cliché" palette (warm cream + terracotta, near-black + neon pop).

- Light: `--bg:#F1F1E6 --surface:#FCFCF7 --ink:#171A10 --accent:#8A6420`
- Dark: `--bg:#0F120B --surface:#171B10 --ink:#EDEFE3 --accent:#D9A94D`
- Categorical chart colors follow the `dataviz` skill's validated default
  8-hue order (`--cat-1` through `--cat-6` defined, first 6 slots used)
- Fonts: system serif stack (`Iowan Old Style`/`Georgia`) for display/headings,
  system sans for body, `ui-monospace` for all money figures (tabular-nums)
- Icon: brass serif "S" monogram on ink background (`icon-*.png`,
  `apple-touch-icon.png` — generated via a PowerShell/System.Drawing script
  since no Node/image tooling was available; script not kept, easy to redo if
  the icon ever needs changing)

## Status as of 2026-08-18

Built, deployed, real data imported by Dan, PWA-installable (manifest + iOS
meta tags added). Known-working: unlock flow, GitHub Contents API read/write
(mechanics verified directly against the live repo during build), reconnect
flow after a bad token. Not yet exercised: a real concurrent-edit scenario
between two devices, wife's device onboarding.

### Not yet built / possible next steps
- No in-app way to change the stored PAT except triggering an auth error
  first ("Reconnect" link only appears after a failed call) — could add a
  visible Settings affordance.
- No explicit "lock" button — PIN is memory-only and clears on reload, which
  is the de facto lock, but nothing prompts for it (e.g. on a shared device).
- Key dates don't yet drive anything beyond a countdown display — the
  original ask ("view on MTD spend vs average/MoM/YoY based on where we
  should be for that month") is only partially delivered via the simple
  day-of-month pace caption on the Net Spend tile.
- `general costs in and out.csv` / `Itemised Costs.csv` extracts still sit in
  `C:\Users\DanSeligman\.claude\jobs\2ca184ca\tmp\budget_export\` if deeper
  house-project data is ever wanted (only the clear "Y"-flagged categories and
  room furnishing totals were transcribed into the seed data — the messier
  funds/moving-cost rows with ambiguous signs were left out).
