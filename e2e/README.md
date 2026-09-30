# End-to-end test

`app.e2e.mjs` drives the real app in a browser (Chromium through Playwright), the way people use it. It runs 48 steps across these sessions:

| Session | What it covers |
|---|---|
| **New mother** | Wrong password, sign-up (including its error messages), edit profile, change password, text size, log out and back in |
| **Mother** | Home checklist, child profile, growth history, development, recipes, meal plan, a guided measurement, logging a meal, NutriScan (foods on hand → best dish → recipe with shopping list → logged meal, including the instant-noodle tip), three symptom checks (a tapped danger sign, a typed danger sign, a negated sentence that must stay calm), Tanya Nuri, packages, privacy switches, health guide, adding a child |
| **Kader** | Area counts, filters and paging, search, cases, sharing a note with the family, logistics, locker pickup, measuring a child, Settings opened directly |
| **Officer and doctor** | Dashboard, reviews, readable package options, approving a package, logistics (requests and lockers, no drones), case review |
| **Mother again** | Sees the Kader's note as a recommendation and gets a notification in her language |
| **Logged out** | Inner screens send you to login |

A step fails on any JavaScript error, console error, unexpected API error (status 400 or higher), or failed check. A screenshot of every step is saved in `screenshots/`. The script exits with code 1 if any step fails.

## Run it

1. **Start the backend on a fresh demo database.** The test changes data, e.g. it approves a package.
   ```bash
   cd backend
   rm -f nutrisense.db          # start from fresh demo data
   uvicorn app.main:app --port 8000
   ```
2. **Serve the web app on port 8081.**
   ```bash
   cd mobile
   npx expo start --web         # or: npx expo export -p web, then serve dist/ with a single-page-app fallback
   ```
3. **Run the test.**
   ```bash
   cd e2e
   npm install
   npx playwright install chromium   # first time only
   npm test
   ```

Settings:
- `APP_URL` (default `http://localhost:8081`) and `API_URL` (default `http://localhost:8000`) point the test elsewhere.
- For a deployment where one server serves both the app and the API, set both to the same address.
- `CHROMIUM_PATH` uses an already-installed Chromium instead of Playwright's download.


# Quality-assurance pass

`qa.e2e.mjs` is a second, broader check (36 cases) for release: `npm run qa`. Like the end-to-end test it needs the backend on a **fresh** demo database and the web app on port 8081, and it changes data.

| Area | What it checks |
|---|---|
| Auth | Phone login in three formats, wrong password message, phone-only sign-up, sign-up with neither phone nor email refused, duplicate phone refused, staying logged in after reload |
| Mother | Risk level and "Hubungi bidan", Catat ibu flags (normal, KEK + anaemia, severe anaemia), ANC mark and undo, TTD tick, danger-sign order (Puskesmas, 119, Kader), birth plan, "Belum dicek", Tambah kehamilan (a future HPHT is refused), Catat kelahiran with Prematur and BBLR |
| Child | ASI tracker, Jadwal KIA mark and undo, next posyandu, 2T badge, oedema question and urgent referral, symptom emergency card, meal log, NutriScan and Tanya Nuri open cleanly |
| Kader | Ibu hamil card and list filters, Tambah ibu hamil (consent required, villages limited to her area, temporary password, the mother logs in by phone) |
| Officer and doctor | "Data demo" on the model, a source line on every figure, maternal numbers match the API, no drones in logistics, flagged rows open the right record, a doctor opens a case |
| Offline | Five entries saved with no signal, still logged in after a reload, everything sent once back online, no duplicates |
| Language | English screens show no untranslated text or raw keys |
| Security | No access to another family's records, a Kader cannot register outside her area, bad input returns 4xx not 500, pickup codes hidden from staff |

It prints PASS or FAIL per case, writes `qa-results.json`, saves screenshots to `qa-screenshots/`, and exits with code 1 if any case fails. `ONLY=F1,G1 npm run qa` runs selected cases.
