# AGENTS.md

cLocation is an Android-first Expo / React Native app for live location sharing by code, with a static web viewer and a Supabase backend. Prefer small, targeted changes. Read the relevant file before editing it.

## Expo changes often, so do not trust memory

Expo ships breaking changes every SDK release.

1. Read the `expo` major version in `package.json` (currently SDK 57).
2. Fetch the matching docs: `https://docs.expo.dev/versions/v57.0.0/`
3. For anything else, use the index at https://docs.expo.dev/llms.txt and follow its links. Do not answer from memory.

## Architecture

There is **no Expo Router** and no `src/app/`. `App.tsx` switches screens with `useState` (`home` / `share` / `watch`). Do not add `expo-router` unless asked.

| Path | Role |
| --- | --- |
| `index.ts` | Entry point. Imports `./src/task` first so the background task is defined before the app loads, installs a global JS error logger, then registers `App`. |
| `App.tsx` | Screen switcher. Handles deep links (`https://<host>/watch?code=X` and `clocation://watch?code=X`). |
| `src/task.ts` | Background location task, start/stop sharing, 20 s heartbeat, `reconcile()` on launch. |
| `src/api.ts` | `rpc(fn, args)`: the only way the client talks to Supabase (REST `/rpc/<fn>`, 10 s timeout). |
| `src/store.ts` | AsyncStorage helpers, on-device log, offline point queue (`enqueue` / `flush`, max 3000 points). |
| `src/Share.tsx`, `src/Watch.tsx` | The two screens. |
| `src/status.ts` | Single source of truth for watcher statuses (live / lost / stopped / waiting / expired / not_found). |
| `src/realtime.ts`, `snap.ts` | Supabase Realtime broadcast listener and how pushes update the Watch state. |
| `src/arrival.ts`, `notify.ts`, `geo.ts`, `recent.ts`, `links.ts`, `mapHtml.ts`, `ui.tsx`, `config.ts` | Pure helpers, notifications, shared UI, Leaflet map HTML, Supabase and host config. |
| `supabase.sql` | Whole backend. Idempotent, safe to re-run. |
| `web/` | Static web viewer (no build step), deployed separately to the root of a domain. |
| `patches/` | `patch-package` patch for `expo-location`, applied on `npm install`. |

## Commands

```bash
npm ci                      # install exactly from the lockfile; postinstall applies patches
npx expo install <package>  # ALWAYS use this instead of npm add; it picks SDK-compatible versions
npx tsc --noEmit            # typecheck; must pass before finishing any task
npx expo-doctor             # config and dependency check (needs internet)
npx expo export --platform android --output-dir /tmp/out   # quick bundle check
npx expo run:android        # local dev build (Expo Go does NOT work, see below)
npx eas-cli@latest build -p android --profile preview      # cloud APK build
```

There is no lint script and no test runner. Pure modules (`arrival.ts`, `status.ts`, `recent.ts`, `geo.ts`, `snap.ts`) are written to be easy to unit test.

## Rules and gotchas

- **No Expo Go.** The app uses background location, a foreground service, a patched native module and config plugins. Use a dev build or the `preview` APK.
- **Do not edit `ios/` or `android/`.** They are generated (and gitignored). Change native behaviour in `app.json` and config plugins.
- **Do not remove `./src/task` from the top of `index.ts`.** The background task must be defined at module load or Android will start a task nothing handles.
- **Keep `src/status.ts` and `web/watch/index.html` in sync.** The status rules are intentionally duplicated; change both.
- **Host and Supabase config live in several places.** If you change them, update all: `src/config.ts` (`SUPABASE_*`, `WEB_BASE`, `DOWNLOAD_URL`), `web/watch/index.html` (Supabase values, `DOWNLOAD_URL`, `APP_PACKAGE`), `web/index.html`, and the `host` in `app.json` intent filters. Changing the package name also needs `web/.well-known/assetlinks.json`.
- **Database access goes through RPC functions only.** Tables have RLS on and no grants for `anon`. New backend features mean a new `security definer` function in `supabase.sql` plus a `grant execute ... to anon`. Keep the file idempotent (`create or replace`, `if not exists`, `drop ... if exists`).
- **Never expose `secret`.** It is the sender's credential. Watchers only ever use the code.
- **`patches/expo-location+57.0.21.patch` is tied to that exact version.** If `expo-location` is upgraded, re-check the patch or recreate it with `npx patch-package expo-location`. Do not drop it; it prevents a foreground-service crash.
- **`web/` is deployed separately** (a user-site repo at the domain root, because Android app links read `/.well-known/assetlinks.json` from the root). Do not add a build step.
- **Android only for now.** There is no `ios` config in `app.json`. Do not claim iOS support.
- **Prefer Expo modules** over third-party libraries, and check docs before adding a dependency.

## Before saying a task is done

1. `npx tsc --noEmit` passes.
2. If you touched native config, plugins or dependencies, `npx expo export --platform android` still bundles.
3. If you touched `supabase.sql`, it still runs top to bottom on a fresh project and on a re-run.
4. If you touched status rules or config values, the web copy is updated too.
