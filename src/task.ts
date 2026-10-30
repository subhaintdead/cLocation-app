import { AppState } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueue, flush, K, log, Pt } from './store';

export const TASK = 'clocation-share';

const HB_MS = 20000;     // heartbeat period
const STALE_MS = 30000;  // no fix for this long -> force one

const OPTS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 5000,
  distanceInterval: 0, // was 10: Android then only reports after moving 10 m, so a stationary phone went silent
  foregroundService: {
    notificationTitle: 'cLocation',
    notificationBody: 'Sharing location',
    notificationColor: '#2563eb',
  },
};

let lastFix = 0;
let hb: ReturnType<typeof setInterval> | null = null;
let beating = false;

TaskManager.defineTask(TASK, async ({ data, error }: any) => {
  if (error) { await log(`task error: ${error.message ?? error}`); return; }
  if (!data?.locations) return;
  const pts: Pt[] = (data.locations as Location.LocationObject[]).map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    t: l.timestamp,
    spd: l.coords.speed ?? undefined,
    hdg: l.coords.heading ?? undefined,
  }));
  lastFix = Date.now();
  await log(`got ${pts.length} fix`);
  await enqueue(pts);
  await flush();
});

// Android refuses to start a foreground service while the app is in the background
// (the background-permission screen leaves the app there for a moment).
const waitActive = () =>
  AppState.currentState === 'active'
    ? Promise.resolve()
    : new Promise<void>((res) => {
        const sub = AppState.addEventListener('change', (st) => {
          if (st === 'active') { sub.remove(); setTimeout(res, 600); }
        });
      });

const toPt = (l: Location.LocationObject): Pt => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  t: l.timestamp,
  spd: l.coords.speed ?? undefined,
  hdg: l.coords.heading ?? undefined,
});

/** Runs every HB_MS while sharing: reports health, restarts a dead service, forces a fix if updates went quiet, retries the queue. */
async function beat() {
  if (beating) return;
  beating = true;
  try {
    if ((await AsyncStorage.getItem(K.sharing)) !== '1') { stopHeartbeat(); return; }
    const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    const quiet = Date.now() - lastFix;
    let note = `hb svc=${running ? 'on' : 'OFF'} quiet=${Math.round(quiet / 1000)}s`;

    if (!running) {
      if (AppState.currentState === 'active') {
        await Location.startLocationUpdatesAsync(TASK, OPTS)
          .then(() => { note += ' restarted'; })
          .catch((e: any) => { note += ` restart-failed:${String(e?.message ?? e).slice(0, 60)}`; });
      } else {
        note += ' (background, cannot restart)';
      }
    }

    if (quiet > STALE_MS) {
      const p = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((res) => setTimeout(() => res(null), 15000)),
      ]).catch(() => null);
      if (p) { lastFix = Date.now(); await enqueue([toPt(p)]); note += ' forced-fix'; }
      else note += ' no-gps';
    }

    const left = await flush();
    await log(`${note} q=${left}`);
  } finally {
    beating = false;
  }
}

function startHeartbeat() {
  stopHeartbeat();
  lastFix = Date.now();
  hb = setInterval(() => { beat().catch(() => {}); }, HB_MS);
}

function stopHeartbeat() {
  if (hb) { clearInterval(hb); hb = null; }
}

export async function startSharing() {
  await log('ask foreground perm');
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') throw new Error('Location permission is needed');
  await log('ask background perm');
  const bg = await Location.requestBackgroundPermissionsAsync();
  await log(`background perm: ${bg.status}`);
  if (bg.status !== 'granted') throw new Error('Set location to "Allow all the time"');
  await waitActive();
  await log('starting service');
  await Location.stopLocationUpdatesAsync(TASK).catch(() => {}); // clear any stale registration
  await Location.startLocationUpdatesAsync(TASK, OPTS);
  await AsyncStorage.setItem(K.sharing, '1');
  startHeartbeat();
  await log('service started');
}

export async function stopSharing() {
  stopHeartbeat();
  await AsyncStorage.setItem(K.sharing, '0');
  if (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TASK).catch(() => {});
  }
}

/** Call on launch. Stops a service left over from a crashed run; returns true if sharing is genuinely on. */
export async function reconcile(): Promise<boolean> {
  const running = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  const wanted = (await AsyncStorage.getItem(K.sharing)) === '1';
  if (running && !wanted) {
    await log('stale service found: stopping');
    await stopSharing();
    return false;
  }
  if (running && wanted) startHeartbeat();
  return running && wanted;
}
