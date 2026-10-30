# ʻIobot — public school schedule

A red, white, and black calendar for ʻIolani School. It shows large rotation-day labels, official period times, a live countdown, day details, and only three lunch venues: Weinberg Snack Bar, One Team Wagon, and ASC Dining Hall. Everyone sees the same schedule. There are no accounts or personal class profiles.

**Live app:** https://iobot08.web.app — deployed to Firebase Hosting in project `iobot08`.

The source supports A–F rotation labels, numbered E/F schedule variants, holidays, breaks, exams, special schedules, and summer-school labels. Run `node scripts/audit-calendar.cjs` after refreshing data to audit all weekdays. The 2026–27 audit covers 260 weekdays with no unclassified days. Supplementary exam/summer dates come from the official school Year-at-a-Glance linked in the app. Some exam and summer-school days have no published bell times.

**Firebase updates:** See [FIREBASE-DEPLOYMENT.md](FIREBASE-DEPLOYMENT.md). A recurring Firebase refresh/deployment pipeline has not been configured; the live countdown pauses after 30 minutes without a verified source update. The optional GitHub Pages workflow below is manual and does not update Firebase.

## Publish a public site and repository

1. Sign in to a GitHub account you are permitted to use. Create a repository named `iobot` with **Public** visibility and a `main` branch.
2. Upload the contents of this folder, including `.github/workflows/publish.yml`. Upload the source files, not this ZIP as a single file. On a Mac, Command–Shift–Period shows hidden folders in Finder. Never upload `node_modules`, `_site`, `.build`, `.data`, tokens, or environment files.
3. In the repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**.
4. Open **Actions → Refresh school data and publish → Run workflow**. This first run downloads real data; it must succeed before the app has a real schedule. If organizational policy requires approval, a repository administrator must enable the workflow/Pages environment.
5. Open the successful deployment's `page_url`. It will normally have the shape `https://YOUR-USERNAME.github.io/iobot/`, but use the exact URL GitHub reports.
6. Verify that URL in a signed-out/private browser on an iPad. Confirm A/B/etc. day labels and times against the official school calendar, including an assembly, chapel day, holiday, and month boundary. Test offline only after a successful online visit and finished service-worker installation.
7. Submit both the public site URL and `https://github.com/YOUR-USERNAME/iobot`. The app automatically links to the actual repository using the workflow's `GITHUB_REPOSITORY` value.

This workflow has no ChatGPT login dependency and requires no Firebase project or billing account. GitHub account and school policies still apply. The existing private site remains unchanged until you replace its submission link with the public deployment.

## What the app does

- Uses Honolulu dates and times, regardless of device time zone.
- Puts the rotation label, such as **A Day**, directly beneath each weekday/date in the week strip.
- Displays the selected day's official timed events and full source details.
- Counts down to the current event's end or the next event's start when recent source verification is available.
- Pauses live countdowns offline or after 30 minutes without a verified source check. Saved schedules remain readable with a warning.
- Reads dated lunch listings from the official Daily Bulletin. Food appears only when the printed date matches the selected date.
- Supports keyboard navigation, a skip link, responsive layouts, screen-reader status messages, printing, and offline reading.

This version has a day/week interface. It does not include the former framework version's month grid or personal class editor. It is an independent student project, not an official school website.

## Official iCal source and special-day parsing

Approved source:

https://calendar.google.com/calendar/ical/iolani.org_ds7482aj4fh4uortauf8vuquso%40group.calendar.google.com/public/basic.ics

The job downloads this fixed source once per run. It does not accept arbitrary feed URLs or hardcode a year's schedule.

`lib/ical.ts` unfolds wrapped lines, reads event properties and time zones, and expands supported recurrence rules. `lib/schedule.ts` chooses the latest event revisions, removes cancellations, applies moved instances and exclusions, and keeps events intersecting the current school year. The configured year is August 1 through July 31 in Honolulu; update `schoolYear()` if the school's official year boundary differs.

Assembly, chapel, community, alternate, and holiday events retain their official names and timestamps. Explicit labeled bell ranges in descriptions can become timed rows. An alternate-day label alone never causes the app to invent a normal timetable. All-day end dates are exclusive. A holiday does not silently delete other events.

Rotation letters come from explicit all-day titles such as `A Schedule`, `A Day`, or `Day B`. They are not calculated from weekdays. Conflicting or absent letters are disclosed.

Supported recurrence features include daily/weekly/monthly/yearly frequencies, intervals, counts, UNTIL, BYDAY, BYMONTH, BYMONTHDAY, BYSETPOS, WKST, EXDATE, RDATE, and recurrence-instance overrides. Unsupported rules/time zones fail the refresh instead of producing guessed times. Custom VTIMEZONE definitions and RANGE=THISANDFUTURE are not evaluated. See the parser tests before claiming full RFC 5545 support.

## Refreshing and caching: fetch once, serve small

The data job is `.github/workflows/publish.yml`:

1. GitHub Actions runs at UTC minutes 7, 22, 37, and 52, and on main-branch pushes or manual runs.
2. One job downloads the full iCal feed, parses it on the runner, and projects the current school year.
3. It writes `.data/schedule.json` plus an identical hash-named file, such as `schedule.abc123….json`.
4. A tiny `status.json` contains the last successful source-check time and the schedule's content hash. Its timestamp is separate from the event data, so an unchanged schedule retains the same hash and URL.
5. The job builds and deploys `_site` to GitHub Pages. The raw feed and parser are never sent to students' browsers.
6. Browsers check the small status file on visits, focus, and about every five minutes. Repeat polling includes jitter to reduce synchronized requests. The full school-year JSON is requested only when its hash changes or the device has no saved copy.
7. The service worker caches hashed assets and schedule generations. Status and lunch are network-first, falling back to a labeled saved response when offline. Cached JSON is validated before it replaces a useful copy. A new app version preserves cached school data when replacing its old shell cache.

On refresh failure, the job preserves the last successful data and its original timestamp. It records the failed attempt without falsely marking old data fresh. If no valid current-year data exists, the first deployment fails instead of publishing a fabricated schedule. GitHub cache restoration is best effort; if the cache has been evicted and the feed is unavailable, the previous live deployment remains in place.

**A 15-minute cron is a target, not a guarantee.** GitHub can delay/drop scheduled runs; public-repository schedules can be disabled after 60 days without activity. Monitor Actions and re-enable disabled schedules. Large source changes can take longer than 15 minutes to reach a device. The app's age warning helps reveal those delays.

## Planning for 1,500 iPads

Using the supplied estimate of a 5.9 MB feed, 1,500 independent downloads would transfer about **8.85 GB** in one opening wave. This architecture moves that download to one scheduled job, at most 96 planned source fetches per day.

Browser cost is one small status request per check and a cached schedule generation. As a planning example, a 100 KB compressed schedule would require about 150 MB across 1,500 first-time devices per new generation. That is an assumption, not a measured size or a load-test result. Every successful job reports actual raw, JSON, and gzip byte counts in its log and `status.json`.

GitHub Pages currently documents a 100 GB/month soft bandwidth limit. Its 10-builds/hour soft limit does not apply to custom Actions publishing workflows; this workflow plans four updates/hour. Public Actions usage is subject to GitHub's policies and limits. Monitor actual usage and rate limiting; do not promise unlimited free capacity.

Keeping the schedule URL unchanged when event data is unchanged avoids distributing a whole year's JSON every 15 minutes just to update a freshness timestamp. Only four recent generations are retained. Assets have content-hashed names; status files remain small. No per-student server, database, authentication, or expensive PDF processing runs during passing periods.

## Daily Bulletin lunch

Source: https://www.iolani.org/uploaded/PDF/DAILY_BULLETIN.pdf

The scheduled job downloads the PDF and uses vendored PDF.js to extract first-page text. `lib/lunch.ts` reads the printed publication date and at most one header listing for each of the three named locations. Announcements, dinner entries, and general food references are not treated as menu items. PDF scripts are not executed.

The former hosting environment received HTTP 403 from this source. **Moving the job to GitHub does not prove the school will accept its requests.** An unavailable/unreadable bulletin does not block bell-schedule publication. The job retains any previously verified, dated menu and records a lunch error; an older date is never presented as the selected date's food. If GitHub's job is also blocked, obtain a school-approved machine-readable source or ask the school to allow the job's access. This package does not bypass login or anti-bot controls and has no automated browser workaround.

## Run locally

Install Node.js 22.13 or later. From this folder:

```sh
npm ci
npm test
npm run refresh
npm run build
npm run serve
```

Open `http://localhost:8000/`. `serve` uses Python 3's simple HTTP server; it serves the built files and never parses the school feed for visitors. The refresh command needs permitted network access to the official sources. Do not use `file://` to test service workers.

`npm run build` produces the static files. It does not download school data by itself. If `npm run refresh` has never succeeded, live schedule requests will show an unavailable message. Test fixtures are synthetic and are never deployed as real school events.

## Firebase Hosting alternative and cache headers

The ready-to-run scheduled workflow targets GitHub Pages. Firebase can serve the same `_site` folder, but **a one-time Firebase upload will not receive later GitHub Pages updates**. Automatic Firebase updates require replacing the workflow's deployment step with an authorized Firebase deployment. No Firebase credentials or deployment integration are included.

For a manual Firebase test using an account permitted to access Firebase, create a Spark-plan project, then run:

```sh
npm install -g firebase-tools
firebase login
firebase init hosting
# Public directory: _site. Do not overwrite the existing index.html.
# Keep the supplied firebase.json after initialization.
npm run refresh
npm run build
firebase deploy --only hosting
```

The supplied `firebase.json` sets all ordinary files, including `index.html`, `sw.js`, and status/lunch JSON, to `Cache-Control: no-cache`. Hashed `/assets/**` and `/data/schedule.*.json` receive `public, max-age=31536000, immutable`. `no-cache` allows storage but requires revalidation; it does not mean `no-store`. Always change asset filenames when their contents change; the build script handles this automatically.

GitHub Pages does not read `firebase.json`; its HTTP cache policy is controlled by GitHub. The service worker and hash-named files provide the app's caching strategy there. Firebase Spark has lower transfer allowances than this school's possible traffic; check current quotas before choosing it for 1,500 devices.

Check a Firebase deployment's headers with:

```sh
curl -I https://YOUR-PROJECT.web.app/index.html
curl -I https://YOUR-PROJECT.web.app/assets/ACTUAL-HASHED-FILENAME.js
```

## File tour and code defense

| File | Purpose |
| --- | --- |
| `web/index.html` | Accessible page structure and navigation |
| `web/app.css` | Red/white/black responsive layout |
| `web/app.js` | Status checks, hash-aware schedule loading, calendar rendering, countdowns, lunch, and offline labels |
| `web/sw.js` | App-shell/data caching and offline fallback |
| `web/manifest.webmanifest` | Standalone app metadata for supported browsers |
| `scripts/update-data.cjs` | Fixed-source fetches, school-year projection, hashes, failure preservation, and PDF extraction |
| `scripts/build.cjs` | Hashed browser assets and static `_site` output |
| `lib/ical.ts`, `lib/schedule.ts` | iCal parsing and special-day projection |
| `lib/lunch.ts` | Strict venue/date extraction from bulletin text |
| `tests/` | Parser, year-boundary, stale-data preservation, PDF, and service-worker regression tests |
| `.github/workflows/publish.yml` | Scheduled refresh and public Pages deployment |
| `firebase.json` | Optional Firebase Hosting cache rules |
| `vendor/pdfjs/` | PDF.js and its Apache-2.0 license |

Be ready to explain why a stale timestamp must not be changed after a failed download, why a moved recurrence removes its original occurrence, how a hash avoids repeated downloads, and how offline data differs from a verified live countdown. Read and understand every submitted line, including vendor/framework dependencies you rely on, according to the competition's code-defense expectations.

## Validation and remaining checks

Local automated tests cover calendar edge cases, canonical lunch venues, malformed data, school-year boundaries, stable hashes, preservation after failed refreshes, PDF extraction, and service-worker offline fallback. JavaScript syntax and a static build are checked locally. The test fixtures are not evidence of real-school accuracy.

Not yet verified: a successful GitHub publication, fresh retrieval of the real feed from GitHub, live bulletin access from GitHub, real generated JSON size, 1,500-device load, iPad Safari installation/offline behavior, or unauthenticated access to the final URL. Browser QA was unavailable in the preparation environment. Complete those checks before contest submission.

## Privacy and AI-use disclosure

The app collects no student emails, passwords, personal classes, or private calendars. It caches public school events and dated menu listings on the device. GitHub and Firebase may keep their own hosting logs. No analytics are added by the app.

**AI disclosure:** OpenAI ChatGPT/Codex assisted with interface code, iCalendar parsing, scheduled refresh architecture, offline caching, tests, and documentation. Student team members must review, understand, adapt, verify, and defend the submitted code. Follow the school's approved AI-tool and AI Lab rules. This disclosure does not claim that any particular use has school approval.

## Primary documentation

- GitHub Pages setup: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Scheduled workflow limits: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- Firebase cache configuration: https://firebase.google.com/docs/hosting/full-config
- Firebase quotas: https://firebase.google.com/docs/hosting/usage-quotas-pricing
- Service workers: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
