# End-to-end test

`app.e2e.mjs` drives the real app in a browser (Chromium through Playwright), the way people use it. It runs 48 steps across these sessions:

| Session | What it covers |
|---|---|
| **New mother** | Wrong password, sign-up (including its error messages), edit profile, change password, text size, log out and back in |
| **Mother** | Home checklist, child profile, growth history, development, recipes, meal plan, a guided measurement, logging a meal, NutriScan (foods on hand → best dish → cooking steps → logged meal, including the instant-noodle tip), three symptom checks (a tapped danger sign, a typed danger sign, a negated sentence that must stay calm), Tanya Nuri, packages, privacy switches, health guide, adding a child |
| **Kader** | Area counts, filters and paging, search, cases, sharing a note with the family, logistics, locker pickup, measuring a child, Settings opened directly |
| **Officer and doctor** | Dashboard, reviews, readable package options, approving a package, drone fleet, case review |
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
