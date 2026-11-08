# The Seligman Ledger

A private, shared family budget and net worth tracker. Static site, hosted on GitHub Pages, data stored **encrypted** in this repo as `ledger.json`.

## Getting started

Open **https://dseligman1.github.io/seligman-ledger/** and choose your household: **Dan & Micks** or **Sal & Phil**.

- **Try the demo** opens a made-up household immediately. No username, PIN or token; demo edits stay in your browser.
- On a new device, connect once using the GitHub token supplied by Dan, then enter your household's six-digit PIN. Keep credentials in your password manager. The token needs Contents read/write permission for this repository only.
- The first-run guide explains the five pages and monthly check-in. Replay it from **Settings → Show me the guide**.
- Sal & Phil start with example figures from the Family Finances Tracker. Replace account names, balances, budget amounts and Planner figures with your own. Dismiss the example-data banner when ready.
- **Budget → tap a line name**: choose Monthly average or Annual total for each year, then select when it is paid. Annual totals are divided between the selected payment months. Summaries always show monthly averages.
- **Settings → Change PIN** changes your household PIN for both people. Keep the new PIN safe: it cannot be recovered. Older saved versions still need their previous PIN. Dan & Micks' phone-reminder secret must be updated after changing that household's PIN.
- **Settings → Calendar reminder** adds a monthly nudge. Existing phone notifications remain available for Dan & Micks.

## How it works

The code is public, but household data is encrypted in the browser with AES-256-GCM and a PIN-derived key before it is saved. Dan & Micks use `ledger.json`; Sal & Phil use `ledger-sal-phil.json`. The original `data.json` is Dan & Micks' v1 backup. Each household has independent encrypted data and a separate PIN.

Saving creates a GitHub commit, keeping prior versions. Wait for **Synced** before closing the app. A second connected device using the same household PIN sees the shared figures. Plaintext backups downloaded from Settings should be kept private.

## Notes on the data model

- Data lives in `ledger.json`, encrypted. The older `data.json` (v1) is kept untouched as a backup.
- Every monthly check-in saves a snapshot of every account, so account and tag charts build up over time.
- History before Aug 2026 is the savings/current totals from the old spreadsheet (Aug 2023 onwards).
- House equity and Motorway shares are estimates until real values are entered.

## Demo (for showing the app to others)

On the token or PIN screen tap **Log in to the demo**, then use name `test demo` and PIN `123456`.
It opens the full app with a made-up household (`js/demo.js`). Nothing is read from or written to
GitHub; demo edits stay in that browser until **Reset demo data** (demo bar or Settings). **Exit demo**
returns to the normal login. The demo login is a convenience, not security: the real data still
needs the GitHub token and the real PIN.

## Local preview

Run `python3 -m http.server 8765` from the folder *above* this repo, then open
`http://localhost:8765/code/index.html?preview`. Preview data is read from a private file outside
the repo, and edits stay in the browser.
