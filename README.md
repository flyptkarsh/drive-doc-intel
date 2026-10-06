# Folio: Document Intelligence for Fund Reporting

> **Option A: Document Intelligence Web App.** You connect Google Drive, pick a folder of
> messy financial documents, and get structured performance data you can browse, filter and question.

**Live demo:** https://drive-doc-intel.onrender.com
**Stack:** Next.js 16 (App Router, TypeScript) · shadcn/ui · SWR · PostgreSQL · Claude API · Google Identity Services · Vitest · Render

---

## Contents

1. [What it does](#what-it-does)
2. [Requirements coverage](#requirements-coverage)
3. [Architecture](#architecture)
4. [Key design decisions](#key-design-decisions)
5. [Data model](#data-model)
6. [Security](#security)
7. [Running it locally](#running-it-locally)
   - [FAQ: running locally](#faq-running-locally)
8. [Deploying to Render](#deploying-to-render)
9. [Testing](#testing)
10. [Limitations and next steps](#limitations-and-next-steps)
11. [Project layout](#project-layout)

---

## What it does

1. **Sign in** with Google One Tap. A "Continue with Google" button is the fallback.
2. **Connect Google Drive** with read-only OAuth, then **pick a folder** in the built-in folder browser.
3. Every PDF, HTML page, `.eml` email, CSV, Google Doc and Google Sheet in that folder (and its subfolders)
   is downloaded and sent to Claude. Claude maps each one onto **a single shared schema**: funds, a return
   for each fund and period, benchmarks, and headline figures such as AUM, NAV and fees.
4. **Browse the results:**
   - **Performance:** a sortable table filtered by fund, period type and date range, plus a
     **monthly grid** with funds as rows and months as columns.
   - **Documents:** full-text search, the status of each file, a detail view with everything extracted,
     the raw JSON, and a "Re-extract" button.
   - **Ask:** plain-English questions such as _"Which fund had the best January return?"_, answered from
     the database. Each answer shows the SQL that was run and links to the source documents.
5. **Automatic sync.** The server re-checks the folder every 60 seconds. New files are processed,
   changed files are re-processed, and deleted files are removed.

## Requirements coverage

| Requirement                                                | How it is met                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connect Google Drive with OAuth                            | Google Identity Services code flow (popup) → the server exchanges the code for a refresh token, which is stored encrypted. Scope: `drive.readonly`.                                                                                                                       |
| Watch a chosen folder                                      | Folder picker (browse or search). The folder is listed recursively, up to 3 levels deep.                                                                                                                                                                                  |
| PDFs, HTML emails, CSVs                                    | PDFs go to Claude as native document blocks, so it sees layout and tables. HTML and `.eml` files are converted to text with table rows kept intact, and PDFs attached to emails are included. CSVs are sent as-is. Google Docs are exported as PDF, Google Sheets as CSV. |
| Use LLMs to extract structured data                        | Claude structured outputs (`output_config.format`) with a Zod schema, so every response is parsed and validated against the schema.                                                                                                                                       |
| Each document looks different, with no per-document parser | There is one schema and one prompt for every document. The prompt covers the variation directly: return grids, trailing versus calendar periods, `(0.8%)` as a negative number, net versus gross, and annualized returns.                                                 |
| Store results in a database                                | PostgreSQL: `documents`, `funds`, `performance`, `metrics`, plus the raw extraction kept as JSONB.                                                                                                                                                                        |
| Browse, search and query everything                        | Filterable tables, Postgres full-text search, and a Claude Q&A agent that can run read-only SQL.                                                                                                                                                                          |
| "Which fund had the best January return?"                  | The Ask agent runs SQL such as `... where extract(month from period_end) = 1 order by return_pct desc`, then explains the answer and cites its sources.                                                                                                                   |
| New files processed automatically                          | A poller inside the server diffs Drive against the database using md5 checksums or modified times. A "Sync now" button and a `POST /api/cron/sync` endpoint for external schedulers are also available.                                                                   |

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Next.js + shadcn UI]
    GIS[Google Identity Services<br/>One Tap + code client]
  end

  subgraph "Next.js server (Render)"
    API[Route handlers /api/*]
    Poller[Poller<br/>instrumentation.ts]
    Sync[Sync engine]
    Prep[Content prep<br/>PDF · HTML · EML · CSV]
    Extract[Extractor<br/>Claude structured output]
    Ask[Ask agent<br/>Claude + tools]
  end

  DB[(PostgreSQL)]
  Drive[(Google Drive API)]
  Claude[(Claude API)]

  GIS -- ID token / auth code --> API
  UI --> API
  Poller --> Sync
  API -- "Sync now" --> Sync
  Sync -- list / download --> Drive
  Sync --> Prep --> Extract --> Claude
  Extract --> DB
  API --> DB
  API --> Ask
  Ask -- run_sql / search_documents --> DB
  Ask --> Claude
```

### What happens to one file

```
Drive folder ──list (recursive)──► diff against `documents` by md5 / modifiedTime
   ├─ new / changed ─► status=pending
   └─ missing ───────► delete (rows cascade)

for each pending file (3 at a time):
   download (export Google Docs → PDF, Sheets → CSV)
   → prepareContent()        PDF as base64 document block (+ text layer kept for search)
                             HTML/EML → text with tables kept as | a | b | rows
   → extractDocument()       Claude + Zod schema + list of fund names already seen
   → one transaction:        replace funds / performance / metrics rows, set status=done
   on failure → status=error with the message (shown in the UI; "Re-extract" retries)
```

## Key design decisions

**Let the model handle layout, and keep the schema strict.**
Writing a parser for each manager's format doesn't scale, and the brief says it shouldn't be needed.
Every document goes through one prompt and one Zod schema
([`src/server/extraction/schema.ts`](src/server/extraction/schema.ts)), and structured outputs guarantee the response matches it.
The schema is designed for querying, not for a generic summary:

- Returns are stored **one row per fund, share class and period**, with a `period_type` enum
  (`month`, `ytd`, `1y`, `3y`, `since_inception`, …) and real `period_start` / `period_end` dates.
  This turns "best January return" into a simple `WHERE` clause.
- Monthly return grids, which are common in factsheets, are **expanded into one row per month**.
- Each return is tagged as net or gross and as annualized or not, so different figures aren't compared as if they were the same.
- Metrics use a normalized snake_case `name` (`aum`, `nav`, `sharpe_ratio`) with a separate `unit`.

**Keep fund names consistent across documents.** Managers name the same fund differently
("Northwind Global Equity" vs. "Northwind Global Equity Fund I USD"). Every extraction request includes the
fund names already in the database, and the prompt tells Claude to reuse an exact name when it is the same
fund. This is lightweight entity resolution that needs no separate matching step.

**Send PDFs as PDFs.** Factsheets carry meaning in their layout (tables, charts with labels,
footnotes). Claude reads PDFs natively, so they are sent as document blocks instead of plain extracted
text. The text layer is still extracted for full-text search. PDFs over 20 MB fall back to text only.

**Answer questions with SQL instead of RAG.** The questions in the brief ("best January return", "filter by
fund") are about numbers and comparisons, which vector search over chunks of text handles poorly. The Ask
agent ([`src/server/ask/agent.ts`](src/server/ask/agent.ts)) gets two tools:

- `run_sql`: read-only SQL over the extracted tables, for anything numeric.
- `search_documents`: Postgres full-text search, for questions about the prose.

The answer shows every query that was run, so the user can check the result.

**Poll Drive instead of using push notifications.** Drive's `changes.watch` webhooks need channel renewal
and a public HTTPS endpoint, and they still need a catch-up job for missed notifications. With a few
hundred files per folder, listing the folder every 60 seconds is one cheap API call per user and is easier
to reason about. The diff uses `md5Checksum`, falling back to `modifiedTime` for Google-native files, so
unchanged files are never sent to Claude again. Sync runs are de-duplicated per user, so the poller and
"Sync now" can't process the same files twice.

**Use Google Identity Services for both sign-in and Drive.** One Tap provides sign-in with a verified ID
token, and the GIS code client requests Drive access in a popup. Using one library means there are no
redirect URIs to manage, and Drive access is only requested once the user decides to connect a folder.

**Avoid an ORM.** The schema is small and stable, so it lives as idempotent SQL in
[`src/server/schema.ts`](src/server/schema.ts) and is applied on first use. Queries use `postgres.js` tagged templates,
which are parameterized.

## Data model

```
users ─┬─ drive_connections   (encrypted refresh token, folder_id, last_synced_at, last_sync_error)
       └─ documents           (drive_file_id, md5, status, document_type, manager, as_of_date,
            │                  summary, extraction JSONB, text_content, search tsvector)
            ├─ funds          (fund_name, share_class, isin, ticker, strategy, asset_class)
            ├─ performance    (fund_name, share_class, period_type, period_label, period_start,
            │                  period_end, return_pct, benchmark_name, benchmark_return_pct,
            │                  is_annualized, net_or_gross, currency)
            └─ metrics        (fund_name, name, value_number | value_text, unit, as_of_date)
```

`documents.search` is a weighted, generated `tsvector` (title and manager weighted highest, then summary,
then full text) with a GIN index. All child rows cascade on delete, so removing a file from Drive cleanly
removes its data.

## Security

- **Sessions:** HS256 JWT in an `httpOnly`, `SameSite=Lax` cookie. Google ID tokens are verified
  server-side against the client ID, and the email must be verified.
- **Drive tokens:** refresh tokens are encrypted at rest with AES-256-GCM. Drive scope is read-only.
- **Allow-list:** `ALLOWED_SIGNINS` limits sign-in to specific emails or `@domains`. This matters because
  each processed document costs Claude credits.
- **SQL written by the model** ([`src/server/ask/sql.ts`](src/server/ask/sql.ts)) has several layers of protection:
  - The query is wrapped so it can only see CTEs named `documents`, `funds`, `performance` and `metrics`,
    each **already filtered to the signed-in user** (`where user_id = $1`).
  - It runs inside a `READ ONLY` transaction with a 5-second `statement_timeout`.
  - Statements that aren't `SELECT`/`WITH` are rejected, as are write and DDL keywords (even inside a
    CTE), `;`, schema-qualified names, `pg_*` functions, and the `users` / `drive_connections` tables.
  - Results are capped at 200 rows.
- **Isolation between users:** every route handler scopes its queries by `user_id` from the session.

## Running it locally

**Requirements:** Node 20.9+ and PostgreSQL 13+.

```bash
git clone https://github.com/flyptkarsh/drive-doc-intel && cd drive-doc-intel
npm install
createdb drive_doc_intel_dev
cp .env.example .env.local    # fill in the values below
npm run dev                   # http://localhost:3000; the schema is created on first request
```

### Google OAuth client

In Google Cloud Console → APIs & Services:

1. Create (or reuse) an OAuth client of type **Web application**.
2. **Authorized JavaScript origins:** `http://localhost:3000` and your deployed URL. No redirect URI is needed
   because the code flow uses the GIS popup (`postmessage`).
3. **Enable the Google Drive API.**
4. **OAuth consent screen → Data access:** add `https://www.googleapis.com/auth/drive.readonly`.
   An _Internal_ (Workspace-only) app needs no verification. For an _External_ app in testing mode, add
   yourself as a test user.

### Environment variables

| Variable                                    | Required | Purpose                                                               |
| ------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                              | ✓        | Postgres connection string                                            |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ✓        | Google OAuth Web client                                               |
| `ANTHROPIC_API_KEY`                         | ✓        | Claude API                                                            |
| `SESSION_SECRET`                            | ✓        | Signs session cookies (`openssl rand -base64 32`)                     |
| `ENCRYPTION_KEY`                            |          | Encrypts stored refresh tokens. Defaults to `SESSION_SECRET`.         |
| `ALLOWED_SIGNINS`                           |          | Comma-separated emails / `@domains` allowed to sign in                |
| `CRON_SECRET`                               |          | Enables `POST /api/cron/sync` with `Authorization: Bearer <secret>`   |
| `SYNC_INTERVAL_SECONDS`                     |          | Poll interval. Default `60`.                                          |
| `CLAUDE_MODEL`                              |          | Default `claude-opus-5-5`                                             |
| `DISABLE_POLLER`                            |          | Set to `1` to turn off background sync (e.g. while developing the UI) |

### FAQ: running locally

<details>
<summary><b>What do I need installed?</b></summary>

Node.js 20.9 or newer (`node -v`) and PostgreSQL 13 or newer. You also need three credentials: a Google
OAuth **Web application** client ID and secret, and an Anthropic API key from
[console.anthropic.com](https://console.anthropic.com).
</details>

<details>
<summary><b>I don't have Postgres. What's the quickest way to get it?</b></summary>

With Homebrew on macOS:

```bash
brew install postgresql@17 && brew services start postgresql@17
createdb drive_doc_intel_dev
# DATABASE_URL=postgres://localhost/drive_doc_intel_dev
```

Or with Docker:

```bash
docker run -d --name folio-pg -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=drive_doc_intel_dev postgres:17
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/drive_doc_intel_dev
```

There is no migration step. The schema is created the first time the app touches the database.
</details>

<details>
<summary><b>What's the minimum <code>.env.local</code>?</b></summary>

```bash
DATABASE_URL=postgres://localhost/drive_doc_intel_dev
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
ANTHROPIC_API_KEY=sk-ant-...
SESSION_SECRET=any-long-random-string   # openssl rand -base64 32
```

Everything else is optional (see the table above). Restart `npm run dev` after editing it.
</details>

<details>
<summary><b>The Google sign-in button or One Tap prompt doesn't appear.</b></summary>

- The exact origin you are browsing from must be listed under the OAuth client's **Authorized JavaScript
  origins**. `http://localhost:3000` and `http://127.0.0.1:3000` are different origins, so add the one you use.
  Changes in Google Cloud can take a few minutes to apply.
- The browser console shows the real reason. Look for `[GSI_LOGGER]` messages such as
  "The given origin is not allowed for the given client ID".
- If you closed the One Tap prompt several times, Google hides it for a while. The "Continue with Google"
  button below the headline always works.
- Some browsers block One Tap when third-party cookies or FedCM are disabled. Again, use the button.

</details>

<details>
<summary><b>Google says "Access blocked" or "This app isn't verified".</b></summary>

The consent screen needs the `drive.readonly` scope added, and:

- **Internal** app (Google Workspace): only accounts in that Workspace can sign in, and no verification
  is needed.
- **External** app in testing mode: add your Google account under **Test users**.

For an unverified External app in testing mode, clicking **Advanced → Continue** is expected.
</details>

<details>
<summary><b>Connecting Drive fails with "Google didn't return a refresh token".</b></summary>

Google only issues a refresh token the first time you consent. Remove the app's access at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions), then click
**Connect Google Drive** again. (Disconnecting inside Folio revokes the grant for you.)
</details>

<details>
<summary><b>The folder picker or sync shows "Google Drive API has not been used in project … or it is disabled".</b></summary>

Enable the **Google Drive API** in the same Google Cloud project as the OAuth client
(APIs & Services → Library → Google Drive API → Enable), wait a minute, then click **Sync now**.
</details>

<details>
<summary><b>My files stay "Queued" and never get processed.</b></summary>

- Check that `DISABLE_POLLER` is not set to `1` in `.env.local`. **Sync now** works either way.
- Watch the terminal running `npm run dev`. Each failure is logged with the file name.
- Make sure the file type is supported: PDF, HTML, `.eml`, CSV, TXT, Google Docs, Google Sheets.
  Other files in the folder are ignored.

</details>

<details>
<summary><b>A document shows "Failed".</b></summary>

Open it on the **Documents** tab to see the error. The usual causes are a missing or invalid
`ANTHROPIC_API_KEY`, a password-protected PDF, or a scanned PDF with no readable content. Click
**Re-extract** to retry after fixing the cause.
</details>

<details>
<summary><b>Can I use a cheaper or faster model while developing?</b></summary>

Yes. Set `CLAUDE_MODEL=claude-sonnet-5-5` in `.env.local`. Extraction and Q&A both use this setting.
</details>

<details>
<summary><b>Port 3000 is already in use.</b></summary>

Run `npm run dev -- -p 3001` and add `http://localhost:3001` to the OAuth client's JavaScript origins.
</details>

<details>
<summary><b>How do I start over with a clean database?</b></summary>

Use **Disconnect Drive** in the account menu, which deletes your documents and extracted data. To wipe
everything:

```bash
dropdb drive_doc_intel_dev && createdb drive_doc_intel_dev
```

</details>

<details>
<summary><b>How do I run the production build locally?</b></summary>

```bash
npm run build && npm start
```

`npm run check` runs lint, typecheck, formatting and tests, the same as CI.
</details>

<details>
<summary><b>How do I run the tests?</b></summary>

```bash
npm test
```

To include the Postgres integration tests, point them at a database they can write to (they create and
clean up their own rows):

```bash
TEST_DATABASE_URL=postgres://localhost/drive_doc_intel_dev npm test
```

</details>

### Try it with the sample documents

[`samples/`](samples) holds three documents that are deliberately different:

| File                                       | Format               | What makes it tricky                                                                                                           |
| ------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `northwind-global-equity-jan-2026.html`    | HTML manager email   | Returns given in a sentence and in a trailing-period table. AUM written as "USD 1.82bn".                                       |
| `harbor-credit-opportunities-monthly.csv`  | CSV export           | A title and metadata rows mixed in with the data. Monthly returns are spread across rows. NAV and fund size sit in the footer. |
| `summit-multi-asset-statement-q4-2025.txt` | Plain-text statement | GBP. Quarterly, YTD and monthly returns in a dotted-leader layout. The benchmark only covers some periods.                     |

Drop these (plus any real factsheet PDFs) into the watched folder, wait for the
"In progress" count to reach zero, and ask _"Which fund had the best January return?"_

## Deploying to Render

[`render.yaml`](render.yaml) defines a Postgres database and a Node web service. Deploy it with
**New → Blueprint**, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY` and
`ALLOWED_SIGNINS`. Add the service URL to the OAuth client's JavaScript origins.

The web service uses the **Starter** plan rather than Free. Free instances sleep when idle, which would
stop the background poller. If you need to run on Free, point an external scheduler at `/api/cron/sync`
to wake the service and trigger a sync.

`/api/health` checks that the database is reachable and is used as Render's health check.

## Testing

```bash
npm test                                   # unit tests (Vitest)
TEST_DATABASE_URL=postgres://localhost/drive_doc_intel_dev npm test   # + Postgres integration tests
npm run check                              # lint, typecheck, formatting and tests: what CI runs
```

**Automated** (`*.test.ts`, run in CI on every push against a Postgres 17 service):

| Area                                                                             | What's covered                                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL guard ([`sql.test.ts`](src/server/ask/sql.test.ts))                          | Allowed queries pass. Writes, DDL, data-modifying CTEs, stacked statements, other tables, schema-qualified names, `pg_*` and settings functions are rejected.                                         |
| Scoped SQL ([`sql.integration.test.ts`](src/server/ask/sql.integration.test.ts)) | Against a real Postgres: a user only sees their own rows, the January question gets the right fund, CTE queries work, the transaction is read-only (`nextval` fails), and full-text search is scoped. |
| Content prep ([`content.test.ts`](src/server/extraction/content.test.ts))        | HTML → text keeps tables as rows and drops scripts and styles. CSV handling, `.eml` parsing, and detecting HTML by file extension.                                                                    |
| Schema ([`schema.test.ts`](src/server/extraction/schema.test.ts))                | The Zod schema converts to a structured-output format and accepts a valid extraction. Date normalization rejects impossible dates.                                                                    |
| Sync ([`sync.test.ts`](src/server/sync.test.ts))                                 | Change detection by md5, falling back to modified time.                                                                                                                                               |
| Security helpers                                                                 | AES-GCM round-trip, a fresh IV each time, tamper and wrong-key detection. The sign-in allow-list matches emails and domains.                                                                          |
| UI logic                                                                         | Return, date and relative-time formatting. The monthly-grid pivot.                                                                                                                                    |

**Checked by hand:**

- The UI in a browser with seeded data at desktop and phone widths: dashboard, filters, sorting, monthly
  grid, document dialog.
- API error responses: 400 for invalid input, 401 when signed out, 404 for unknown documents.
- The production deploy on Render and its health check.
- The extraction request sent to the real Claude API with an invalid key, which returned `401`. This
  confirms the streamed, schema-constrained request is built correctly.

**Not yet automated:** an end-to-end run against the live Claude and Drive APIs. The natural next step is
an **extraction eval**: real factsheets with hand-labeled expected rows, scored on per-field precision and
recall, run whenever the prompt or schema changes.

## Limitations and next steps

- **Extraction quality is measured by eye, not by an eval.** The first thing to add is a labeled eval set
  (see above).
- **Very large documents.** PDFs over 20 MB are sent as their text layer only, and text over about 600k
  characters is truncated, with a note in what Claude sees. Long multi-fund reports could be split by
  page range.
- **Sync scaling.** Per-user polling runs inside the web process. With many users, this should move to a
  background worker with a job queue (for example pg-boss), and to Drive `changes.list` with a stored page
  token instead of re-listing every folder.
- **Fund name matching** relies on the model reusing known names. A fund table with aliases, plus
  ISIN/ticker matching, would make it deterministic.
- **Currency and FX.** Returns are stored with their currency but not converted. Comparisons across
  currencies are left to the user or to the Ask agent's explanation.
- **Ask answers aren't streamed.** A streaming response with live tool-call progress would feel faster.
- **One folder per user.** Multiple folders, or shared team folders, would be a small schema change.

## Project layout

Server-only code lives in `src/server/` and imports `server-only`, so the build fails if a client
component ever pulls it in. `src/lib/` holds code that is safe on both sides. Route handlers stay thin:
they validate input with Zod, call a query or service function, and return JSON. Auth and error handling
live in one wrapper ([`src/server/http.ts`](src/server/http.ts)), which returns safe messages for expected
errors and a generic message for anything unexpected.

```
src/
├─ app/
│  ├─ page.tsx                    Landing page + Google One Tap
│  ├─ dashboard/page.tsx          Authenticated app shell
│  └─ api/                        Thin route handlers (Zod input → server function → JSON)
│     ├─ auth/google, auth/logout
│     ├─ drive/connect            Exchange the GIS auth code (POST) / revoke and delete (DELETE)
│     ├─ drive/folders, drive/folder   Folder picker, choose the folder to watch
│     ├─ sync, cron/sync          Manual / scheduled sync (runs after the response via `after()`)
│     ├─ documents, documents/[id]     List and search, detail, re-extract
│     ├─ performance, ask, status, health
├─ server/                        Server-only
│  ├─ http.ts                     route()/authedRoute() wrappers, HttpError, readJson()
│  ├─ env.ts                      Typed, lazily-validated configuration
│  ├─ db.ts, schema.ts            postgres.js client, idempotent schema
│  ├─ session.ts, crypto.ts       JWT cookie sessions, AES-GCM token encryption
│  ├─ google.ts, drive.ts         OAuth + ID token verification; Drive listing and download
│  ├─ claude.ts                   Anthropic client + refusal fallback config
│  ├─ extraction/                 schema.ts (Zod), content.ts (file → content blocks), extract.ts (Claude)
│  ├─ ask/                        agent.ts (tool loop), sql.ts (SQL guard, scoped runner, search)
│  ├─ queries/                    All SQL for the app: users, connections, documents, performance
│  ├─ sync.ts                     Drive diff + processing queue
│  └─ poller.ts                   Background sync loop (started from instrumentation.ts)
├─ components/
│  ├─ dashboard/                  Shell, header, account menu, stats, connect card, folder picker
│  ├─ performance/                Filters, sortable table, monthly grid
│  ├─ documents/                  Table, detail dialog, status badge
│  ├─ ask/                        Chat view and message rendering
│  ├─ auth/, common/              One Tap button; search input, empty state, skeletons, return cell
│  └─ ui/                         shadcn/ui primitives (generated)
├─ hooks/                         useSyncStatus (SWR polling), useConnectDrive, useDebouncedValue
└─ lib/                           Shared: types, fetcher, formatting, constants, GIS loader
samples/                          Test documents in three different formats
test/                             Vitest support (server-only stub)
.github/workflows/ci.yml          Lint, typecheck, format check, tests (with Postgres), build
render.yaml                       Render Blueprint
```
