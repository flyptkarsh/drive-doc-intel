# Folio — Document Intelligence for fund reporting

Connect Google Drive, point it at a folder of messy financial documents (fund
factsheets, account statements, performance reports, manager emails, CSV
exports), and get one clean, filterable table of performance data you can query
in plain English. New files dropped into the folder are picked up automatically.

**Stack:** Next.js 16 (App Router) · shadcn/ui · Postgres · Claude (`claude-opus-5-5`) ·
Google Identity Services (One Tap sign-in + Drive OAuth) · Render

## How it works

```
Google One Tap ──► /api/auth/google   verify ID token, set session cookie
"Connect Drive" ─► GIS code client ─► /api/drive/connect   exchange code, store encrypted refresh token
Folder picker ───► /api/drive/folder

Poller (every 60s, in-process) ─► list folder (recursive) ─► diff against DB by md5 / modifiedTime
   new or changed file ─► download (Google Docs → PDF, Sheets → CSV)
                       ─► prepare: PDF as a native document block · HTML/EML → text with tables kept
                                   (PDF attachments in .eml files included) · CSV as-is
                       ─► Claude structured output (one schema for every layout)
                       ─► documents / funds / performance / metrics tables
   removed file ─► rows deleted

Ask tab ─► Claude tool loop: run_sql (read-only, user-scoped) + search_documents (Postgres FTS)
```

- **No per-format parsers.** Every document goes through one extraction schema:
  document type, manager, as-of date, funds, a row per fund × period return
  (monthly grids are expanded into one row per month), benchmarks, and headline
  metrics (AUM, NAV, fees, risk stats). Known fund names from earlier documents
  are passed in so the same fund lines up across managers' different spellings.
- **Querying.** The Ask tab gives Claude a `run_sql` tool. Its SQL only sees CTEs
  pre-filtered to the signed-in user, runs in a `READ ONLY` transaction with a
  5s timeout, and is rejected if it references anything outside the four tables.
  Executed queries and source documents are shown with each answer.
- **Sync.** An in-process poller (`src/instrumentation.ts`) checks every connected
  folder every `SYNC_INTERVAL_SECONDS`. "Sync now" triggers it on demand, and
  `POST /api/cron/sync` (Bearer `CRON_SECRET`) lets an external scheduler do it.

## Setup

### 1. Google OAuth client

Use an existing **Web application** OAuth client (e.g. the Lounge Frog Workspace one) or create one in
Google Cloud Console → APIs & Services → Credentials.

1. **Enable the Google Drive API** for that project.
2. **Authorized JavaScript origins:** add `http://localhost:3000` and your Render URL
   (e.g. `https://drive-doc-intel.onrender.com`). No redirect URI is needed: the
   code flow uses the GIS popup (`postmessage`).
3. **OAuth consent screen → Data access:** add the
   `https://www.googleapis.com/auth/drive.readonly` scope. With an **Internal**
   (Workspace-only) consent screen no Google verification is needed; with
   **External** in testing mode, add yourself as a test user.

### 2. Run locally

```bash
cp .env.example .env.local    # fill in the values
createdb drive_doc_intel_dev
npm install
npm run dev
```

The schema is created automatically on first request.

### 3. Deploy to Render

`render.yaml` defines the Postgres database and the web service. Either use
**New → Blueprint** in the Render dashboard, or create the services with the
Render CLI. Then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
`ANTHROPIC_API_KEY` on the web service. Set `ALLOWED_SIGNINS` (e.g.
`@yourdomain.com,someone@gmail.com`) to restrict who can sign in.

## Try it

`samples/` has three deliberately different documents (an HTML manager email,
a CSV of monthly returns, a plain-text quarterly statement). Drop them, plus any
real factsheet PDFs, into the watched Drive folder, then ask
*"Which fund had the best January return?"*

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | Google OAuth Web client |
| `ANTHROPIC_API_KEY` | yes | Claude API |
| `SESSION_SECRET` | yes | Signs session cookies |
| `ENCRYPTION_KEY` | no | Encrypts stored Drive refresh tokens (defaults to `SESSION_SECRET`) |
| `ALLOWED_SIGNINS` | no | Comma-separated emails / `@domains` allowed to sign in |
| `CRON_SECRET` | no | Enables `POST /api/cron/sync` |
| `SYNC_INTERVAL_SECONDS` | no | Poll interval, default 60 |
| `CLAUDE_MODEL` | no | Defaults to `claude-opus-5-5` |
