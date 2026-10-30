# IoBot08 Firebase deployment

Target account: ailab08@iolani.org. Project display name: IoBot08. Project ID: `iobot08`.

The app serves a shared public Iolani school calendar without student accounts. It parses the official public iCal feed into school-year JSON, extracts dated lunch menus from the Daily Bulletin, and serves static files with offline caching. All dates use Pacific/Honolulu.

## Verified locally on October 29, 2026

- All 36 automated tests passed.
- Real official feed refresh succeeded: 1,650 school-year events.
- October 29 lunch entries were retrieved for all three venues.
- Static output generated in `_site` using the supplied Firebase cache rules.

## Deployment

Firebase CLI is a local development dependency. Install with `npm ci`.
Authenticate with `npx firebase login` using the target school account.
Use `npx firebase projects:list --account ailab08@iolani.org` to find an existing IoBot08 project. If none exists, create one with display name IoBot08 and an available lowercase project ID using `npx firebase projects:create PROJECT_ID --display-name IoBot08 --account ailab08@iolani.org`.
Associate the verified project ID with `npx firebase use PROJECT_ID` and run `npm run deploy`.
The deploy script refreshes the official data and builds before uploading Hosting files.

## Refresh requirement

The bundled GitHub workflow currently publishes to GitHub Pages. It does not update Firebase. Firebase needs an authenticated scheduled refresh/build/deploy pipeline before this can serve as a continuously updated school calendar. A single deployment becomes stale after 30 minutes and the app intentionally pauses live countdowns. No recurring infrastructure or credentials have been created yet.

## Current status

Deployed and verified October 30, 2026 using ailab08@iolani.org. Public URL: https://iobot08.web.app . Console: https://console.firebase.google.com/project/iobot08/overview . Browser verification showed C Day, official periods with a live countdown, and October 30 lunch menus. HTTP 200 and no-cache HTML headers verified. Automated recurring Firebase refresh remains unconfigured.

## Calendar coverage audit

Run `node scripts/audit-calendar.cjs` after generating school data. The audit writes `calendar-audit.json` and fails for unlabeled weekdays, conflicting day labels, or rotation days without times. All 260 weekdays from August 1, 2026 through July 31, 2027 have a label. Holidays, breaks, exams, special schedules and summer school are explicit. Supplementary summer and December exam dates use the official 2026–27 Year-at-a-Glance PDF linked in the app; they are bounded to that year and must be reviewed when the school publishes changes. Summer school and some exam days have no timed entries in the regular bell feed; the app discloses this.
