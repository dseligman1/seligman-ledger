# The Seligman Ledger

A private, shared family budget and net worth tracker. Static site, hosted on GitHub Pages, data stored **encrypted** in this repo as `data.json`.

## How it works

- The repo (this code) is public, because GitHub Pages on a free account only serves public repos.
- Your actual numbers are never stored in plain text. Before anything is committed, the app encrypts it in your browser (AES-256-GCM) using a key derived from a PIN only you and your wife know. Anyone browsing this repo on GitHub sees only unreadable ciphertext in `data.json`.
- Saving is a git commit. Every edit is versioned — full history, for free.
- Opening the app (or switching back to the tab) pulls the latest version, so you both stay in sync.

## One-time setup (do this once)

### 1. Create a GitHub token
Go to **github.com → Settings → Developer settings → Fine-grained personal access tokens → Generate new token**.
- Resource owner: your account
- Repository access: **Only select repositories** → `seligman-ledger`
- Permissions: **Contents → Read and write** (nothing else needed)
- Expiration: pick something you're comfortable with (you can regenerate later)

Copy the token (starts `github_pat_...`) — you won't see it again.

### 2. Open the app and connect
Go to **https://dseligman1.github.io/seligman-ledger/**, paste the token in, hit Connect.

### 3. Choose a PIN
Pick any PIN/passcode. This is what encrypts your data — **there is no recovery if you forget it**, since not even GitHub has it. Write it down somewhere safe (e.g. your password manager) rather than just memorizing it.

### 4. Import your data
On first run you'll be asked to start empty or import a file. Use the `seed-data.json` file provided separately (not part of this repo) to load your real history and assumptions in one go.

### 5. Share access with your wife
- Give her the **same GitHub token** (via a password manager, not plain text) and the **same PIN**.
- She goes through steps 2–3 above on her own phone/browser with those same two values (she should choose "Start empty" only if going first — otherwise just enter the PIN and it'll pull the data you already imported).

## Notes on the data model

- **Accounts** track a running "balance vs last month" — like your old spreadsheet's snapshot panel, not a full transaction history.
- **History** (used for the Explore chart) is built automatically: every time you save a balance, the app upserts that month's totals. It only has real data from the point you start using the app forward, plus whatever `Savings`/`Current Accounts` history came from your original spreadsheet's genuinely-entered actuals (2023–2026) — the "Other Assets"/"Total Net Worth" actuals in your old sheet turned out to be formulas mirroring the forecast, not independently verified figures, so those weren't carried over as history.
- **House Equity** and **Motorway Shares** start at £0 — your old sheet didn't have a clean standalone "current actual" for either (only forecast projections), so please update these to real figures on first use.
- **Forecast** lines are a simple trailing-6-month trend projection, not a rebuild of your old assumption-driven formulas — deliberately simple and transparent rather than precise.

## Local development

No build step — it's plain HTML/CSS/JS. Open `index.html` via a local server (e.g. `npx serve`) to test changes, or just edit and push; GitHub Pages redeploys automatically.
