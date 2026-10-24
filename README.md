# The Seligman Ledger

A private, shared family budget and net worth tracker. Static site, hosted on GitHub Pages, data stored **encrypted** in this repo as `ledger.json`.

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
On first run you'll be asked to start empty or import a file. Use a ledger backup file (Settings → Download backup) if you ever need to restore.

### 5. Share access with your wife
- Give her the **same GitHub token** (via a password manager, not plain text) and the **same PIN**.
- She goes through steps 2–3 above on her own phone/browser with those same two values (she should choose "Start empty" only if going first — otherwise just enter the PIN and it'll pull the data you already imported).

### 6. Turn on phone reminders (optional)
On iPhone, open the app in Safari → Share → **Add to Home Screen**, then open it from the new icon.
Go to **Settings → Phone notifications → Turn on**. You'll get a reminder at 9am on the 1st of each
month, then every day at 9am until that month's check-in is complete. This needs two repo secrets,
`LEDGER_PIN` and `VAPID_PRIVATE_KEY` (see `PROGRESS.md`).

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
