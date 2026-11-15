# Dhamma School Manager

A free, mobile-first website for Dhamma schools (දහම් පාසල් / அறநெறிப் பாடசாலை), in **Sinhala, Tamil and English**.

- Register a school (username, password, working days, grades, subjects)
- Student register with guardian details, filters, CSV export
- Attendance per grade per working day, monthly reports
- Exams per grade with marks entry, ranks and averages
- Events (debates, talent shows, meditation, prefect programs…) with participant marks / places
- Prefect appointments with periods
- Full student history: grades, attendance, marks, events, prefect periods
- Each school's data lives in **its own spreadsheet** (Google Sheet), downloadable as **Excel (.xlsx)**

## How it works

```
Phone browser ──► GitHub Pages (this website, free)
                     │  fetch (JSON)
                     ▼
              Google Apps Script web app (free)  ──►  Google Drive
                                                       ├─ "Dhamma School Manager - Registry" (schools + logins)
                                                       └─ "<School> - Dhamma School" (one spreadsheet per school)
```

There is no database and no paid server. The spreadsheets act as the database.
Every school spreadsheet has these tabs: `Settings`, `Students`, `GradeHistory`, `Att_<grade>` (one per grade, a column per date with `P`/`A`),
`Exams`, `ExamMarks`, `Events`, `EventMarks`, `Prefects`.

> Please don't add/rename/reorder columns in the spreadsheets by hand — the app rewrites each tab when it saves.
> Typing a correction into a cell is fine.

---

## Setup (about 15 minutes, one time)

You need a Google account (the spreadsheets will be stored in its Drive) and a GitHub account.

### 1. Create the backend (Google Apps Script)

1. Go to <https://script.google.com> → **New project**. Name it `Dhamma School Manager`.
2. Delete everything in `Code.gs`, then paste the whole content of [`backend/Code.js`](backend/Code.js).
3. Click ⚙ **Project Settings** → tick **Show "appsscript.json" manifest file in editor**.
   Open `appsscript.json` and replace it with the content of [`backend/appsscript.json`](backend/appsscript.json). Save.
4. In the editor's function dropdown choose **`setup`** → **Run**. Google asks for permissions — allow them
   (choose your account → *Advanced* → *Go to Dhamma School Manager (unsafe)* → *Allow*; this warning appears for every personal script).
   The log shows the link of the new registry spreadsheet.
5. Click **Deploy → New deployment** → type **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
   
   Click **Deploy** and copy the **Web app URL** (ends with `/exec`).

### 2. Connect the website to the backend

Open [`js/config.js`](js/config.js) and paste the URL:

```js
export const SCRIPT_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
```

### 3. Publish the website on GitHub Pages

1. Create a new repository on GitHub (public, required for free Pages) and upload all files of this folder
   (or `git init`, `git add .`, `git commit`, `git push`).
2. Repository → **Settings → Pages** → *Source*: **Deploy from a branch**, *Branch*: `main` / `(root)` → Save.
3. After a minute the site is at `https://<your-username>.github.io/<repo-name>/`.
4. Open it on a phone, register your school. In Chrome use **⋮ → Add to Home screen** to install it like an app.

### Updating later

- Website changes: commit and push; GitHub Pages updates automatically.
- Backend changes (`backend/Code.js`): paste the new code into Apps Script, then **Deploy → Manage deployments → ✎ Edit →
  Version: New version → Deploy**. The URL stays the same.

---

## Demo mode / trying it locally

If `SCRIPT_URL` is empty (or the URL has `?demo`), the site runs in **demo mode**: the same backend code runs inside the
browser and stores data in `localStorage` only. On the login page, **Open sample school** creates a school with sample
students, attendance, an exam, events and prefects (username `demo`, password `demo1234`).

```bash
npm start
```

Then open <http://localhost:5173>. (Needs Node.js; it just serves the static files.)

## Tests

```bash
npm test
```

- `tools/test-backend.mjs` runs `backend/Code.js` against a mock of Google Sheets and checks registration, login lockout,
  students, attendance, exams, events, prefects, history, promotions, settings, password change and deletion.
- `tools/check-i18n.mjs` checks that English, Sinhala and Tamil have the same keys and placeholders and that every
  backend error code has a translation.

## Project layout

| Path | What |
|---|---|
| `index.html`, `css/app.css` | App shell and mobile-first styles (light + dark mode) |
| `js/app.js`, `js/router.js` | Routes (`#/students`, `#/attendance`, …), tab bar / sidebar |
| `js/api.js`, `js/store.js` | Calls to the Apps Script, session token, cached school data |
| `js/pages/*.js` | One file per area: auth, dashboard, students, attendance, exams, events, prefects, settings |
| `js/i18n/en.js`, `si.js`, `ta.js` | All texts and error messages |
| `backend/Code.js` | Google Apps Script backend (also used by the website for the same validation rules) |
| `js/demo/` | In-browser mock of Google Sheets for demo mode and tests |

## Security notes

- Passwords are stored salted and hashed (SHA-256, 200 rounds) in the registry spreadsheet; 5 wrong logins lock the
  username for 15 minutes.
- Each login gets a random 64-character session token (30 days). Changing the password logs out other devices.
- Each request can only reach the spreadsheet of the school whose token it carries.
- The spreadsheets are private to the Google account that deployed the script. From **Settings → Share the Google Sheet**
  a school can give a Google account view/edit access to its own spreadsheet.

## Limits of the free setup

- Each request takes about 1–3 seconds (Apps Script start-up). Lists are loaded once and filtered on the phone.
- Google quotas for a free account are far above what a few schools need (≈ 20,000 requests/day, 30 at the same time).
- Saves are queued with a lock, so two teachers saving at the same moment do not overwrite each other.

## Translations

Sinhala and Tamil texts were drafted for this project — please have a native speaker read through
`js/i18n/si.js` and `js/i18n/ta.js` and correct any wording. Run `npm test` after editing to make sure no key is missing.
