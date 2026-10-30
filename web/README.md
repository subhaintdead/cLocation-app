# web viewer

static files, no build step. `watch/index.html` is the page behind `https://<your-host>/watch?code=ABC234`:
live map, status, "show my location", and an "open in app" button on android.

## deploy (github pages)

1. host this folder at the **root** of a domain. the easiest way is a repo named `subhaintdead.github.io`
   (a user site) and copy the contents of `web/` into it, including the hidden `.nojekyll` and `.well-known/`.
   a project site like `subhaintdead.github.io/cLocation-download` will **not** work for app links, because
   android reads `assetlinks.json` from the root of the host only.
2. if you use a different host, change it in three places: `WEB_BASE` in `src/config.ts`,
   `host` in `app.json` -> `android.intentFilters`, and nothing else (the page itself is host independent).

## make links open the app (android app links)

without this, a tapped link still works: it opens the web viewer (which has an "open in app" button).
with it, android opens the app directly and skips the browser when the app is installed.

1. get your app signing fingerprint: `eas credentials` -> android -> keystore -> copy the **SHA-256** value
   (if you ever publish on google play with play app signing, also add the play console one).
2. paste it into `.well-known/assetlinks.json` (replace `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT`).
   more than one fingerprint is allowed, put each in the list.
3. deploy, then check `https://<your-host>/.well-known/assetlinks.json` opens in a browser and shows json.
4. rebuild the app (`eas build`) so the new intent filters are in it, and reinstall.
   android verifies the link when the app is installed. to re-check: `adb shell pm get-app-links com.sealfish.clocation`.

## keep in sync

the status rules (live / lost / stopped / waiting / expired / not found) are written once in `src/status.ts`
and copied into `watch/index.html`. if you change one, change the other.
