# cLocation

a Seva First Innovation Challenge 2026 entry

submitted by: Subhadip Majumdar


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
- the code can be shared as a link (`.../watch?code=XYZ123`). tapping it opens the app if it is installed, otherwise a web page with the same live map, so watchers do not need the app.
- the sender can make the code expire after 24 h / 48 h / 7 days / 14 days. it is off by default.
- watchers can see themselves on the map, and get a notification when the vehicle comes within 100 / 200 / 500 m of them. it is off by default.
- updates are pushed instantly (supabase realtime) instead of waiting for the next refresh.

safety rules: only the driver can share, only people with the code can view, the code can be changed at any time, and history expires. The same app works for any vehicle or person: ambulance, farm-produce van, village bus, a family member walking home.

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


## upgrades that can be done

for maps, this project can be updated to use google maps instead of openstreetmaps.

for database, a paid tier can be used.

the ui/ux can be polished further.

alerts that work with the phone locked need real push notifications (a server step that sends them when the vehicle gets close).

## source code and downloadable app

the project and its details can be found here:

<https://subhaintdead.github.io/cLocation-download>
