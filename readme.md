# cLocation

a Seva First Innovation Challenge 2026 entry

submitted by: Subhadip Majumdar&#32;


## what is it?

this is a simple location sharing app prototype that allows an user to share their real-time location by sharing a code.



## use case

the app can be used in different cases, and it can beat existing options in a few of them.&#32;

key possible use cases include:

- school van/bus tracking: this app can be used to share location of school van/bus. parents do not know if the bus has left, is late, or has already passed. this usually results in wasted time, both for parents/students and drivers who receive multiple calls to share their location

* sharing live location for meeting friends: share your location with multiple friends at once
* parcel delivery live tracking: if adopted, this can be used to see precise parcel location

and more.

## existing options

existing options mostly are weak. commercial GPS trackers need hardware, SIM cards and a monthly fee. whatsapp live location needs the driver to set it up for each chat, runs for limited durations, and shows the person nothing about who watched.

## how to use

the app has two modes: **Share** and **Watch**.

- The sender clicks share once. the phone sends its location, even with the screen off, until they click stop.
- The app gives that user a short code. anyone with the code can open a live map and see "last active X min ago".
- no accounts and no phone numbers are collected.(for privacy, however this can be implemented later)
- the sender can see who watched in the last 48 hours. location history and the viewer log are deleted automatically after 48 hours.
- if the signal drops, the phone stores points and sends them when signal returns.
- the code can be shared as a link (`.../watch?code=ABC234`). tapping it opens the app if it is installed, otherwise a web page with the same live map, so watchers do not need the app.
- the sender can make the code expire after 24 h / 48 h / 7 days / 14 days. it is off by default.
- watchers can see themselves on the map, and get a notification when the vehicle comes within 100 / 200 / 500 m of them. it is off by default.
- updates are pushed instantly (supabase realtime) instead of waiting for the next refresh.

safety rules: only the driver can share, only people with the code can view, the code can be changed at any time, and history expires. The same app works for any vehicle or person: ambulance, farm-produce van, village bus, a family member walking home.

## statuses

what a watcher sees, exactly (defined once in `src/status.ts`):

| status | when | shown as |
| --- | --- | --- |
| live | sender is sharing and the last update is 2 minutes old or less | Live |
| signal lost | sender is sharing but nothing arrived for more than 2 minutes (phone offline, battery dead, tunnel). the last place stays on the map | Signal lost, last seen X ago |
| stopped | sender pressed Stop. the last place stays on the map | Stopped sharing, last seen X ago |
| waiting | the code is valid but there is no location from the last 48 hours | Waiting for sender |
| expired | the code's expiry time has passed | Code expired |
| not found | no such code (typo, or the sender changed it) | Code not found |

live turns into signal lost on its own as time passes, no refresh needed. the sender sees their own status too: not sharing, sharing up to date, or sharing with points saved for later (no signal).

## codes, links and expiry

- **random code**: 6 characters, made when the sender first starts. "new code" replaces it and cuts off everyone who had the old one.
- **custom code** (optional): a vanity code like `SCHOOLVAN1` that you set by hand in the database (`vehicles.custom_code`, uppercase, 3 to 16 characters). it shows the same location as the random code, and the app shares it instead of the random one. "new code" does not change it.
- **link**: tapping the code in the share screen shares `https://<host>/watch?code=<code>`. see `web/README.md` for hosting it and for making android open the app directly.
- **expiry**: the sender turns on "code expires" and picks 24 h, 48 h, 7 days or 14 days. after that, both the random and the custom code show "Code expired" and reveal nothing. "new code" restarts the timer. you can also set or clear `vehicles.expires_at` by hand.

## arrival alerts

both sides can set a distance: off / 100 m / 200 m / 500 m. off by default.

- the **sender** sets the default for their watchers (stored on the vehicle).
- each **watcher** can override it for themselves, or turn it off. their choice is saved on their phone only.
- the alert fires once when the vehicle comes from outside that distance to inside it. it will not fire just because the app was opened while the vehicle was already close, and it needs the vehicle to be live.
- the distance is worked out on the watcher's phone. the watcher's location is never sent to the server or the sender.
- it works while the watch screen is open (the screen is kept on while an alert is armed). android stops apps in the background, so this is not a background alert. that would need push notifications, which is a bigger setup.

## realtime

the database pushes each new location to watchers over a supabase realtime broadcast channel, so the map moves within a second or two. the app still polls as a safety net (every 5 s when realtime is not connected, every 30 s when it is), so a dropped connection never leaves a stale map.

- the channel name is a random id that changes with "new code", so an old code cannot keep listening.
- the database only sends while someone is actually watching, which keeps the message count low on the free tier.
- check once: supabase dashboard -> realtime -> settings -> "allow public access" should be on (it is by default).
- viewers on a public channel can in theory send fake updates to other viewers of the same vehicle, because public channels cannot check who is who without accounts. the 30 second poll overwrites anything fake with the real data.

## cost

| Item | Pilot cost |
| --- | --- |
| app development | Rs 0 (i built) |
| backend, build service, maps | Rs 0 (scalable database) |
| needed hardware | Rs 0 (existing android phones) |
| mobile data | as per the users' plans |

## tech used

for database, i used supabase free tier(scalable)\
for android app i used expo+typescript

for maps i used openstreetmaps(can change to google maps api later)


## setup after pulling these changes

1. supabase sql editor: run the whole `supabase.sql` again (safe to re-run, adds the new columns and functions).
2. `npm install`, then rebuild the app with `eas build` (new native modules: notifications, keep-awake, deep links).
3. deploy `web/` (see `web/README.md`).

## upgrades that can be done

for maps, this project can be updated to use google maps instead of openstreetmaps.

for database, a paid tier can be used.

the ui/ux can be polished further.

alerts that work with the phone locked need real push notifications (a server step that sends them when the vehicle gets close).

## source code and downloadable app

the project and its details can be found here:&#32;

&#32;<https://subhaintdead.github.io/cLocation-download>
