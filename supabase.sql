-- cLocation backend. Paste into Supabase -> SQL Editor -> Run. Safe to re-run (idempotent).
-- Tables are fully locked (RLS on, no policies, no grants). The app only calls the functions below.

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  custom_code text,
  secret text not null,
  name text not null default '',
  sharing boolean not null default false,
  last_lat double precision, last_lng double precision, last_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Optional vanity code (null by default). Set it by hand in Table Editor / SQL. Works for watching only.
-- ---------------------------------------------------------------------------
alter table vehicles add column if not exists custom_code text;
alter table vehicles drop constraint if exists vehicles_custom_code_ok;
alter table vehicles add constraint vehicles_custom_code_ok
  check (custom_code is null or (custom_code = upper(custom_code) and custom_code ~ '^[A-Z0-9_-]{3,16}$'));
create unique index if not exists vehicles_custom_code_u on vehicles(custom_code);

-- a custom code may never equal anyone's random code (and vice versa)
create or replace function vehicles_code_clash() returns trigger language plpgsql as $$
begin
  if new.custom_code is not null and (new.custom_code = new.code
     or exists (select 1 from vehicles where id <> new.id and code = new.custom_code)) then
    raise exception 'custom_code % clashes with an existing code', new.custom_code;
  end if;
  if exists (select 1 from vehicles where id <> new.id and custom_code = new.code) then
    raise exception 'code % clashes with an existing custom_code', new.code;
  end if;
  return new;
end $$;
drop trigger if exists vehicles_code_clash on vehicles;
create trigger vehicles_code_clash before insert or update of code, custom_code on vehicles
  for each row execute function vehicles_code_clash();

-- ---------------------------------------------------------------------------
-- Realtime channel id, code expiry, arrival-alert default
--   chan          secret topic viewers subscribe to. Rotates with the code, so an old watcher is cut off.
--   expiry_hours  null = code never expires; otherwise 24 / 48 / 168 (7 d) / 336 (14 d)
--   expires_at    when the code stops working. Restarted by set_expiry() and by a new code.
--                 You can also edit/null it by hand (applies to both the random and the custom code).
--   alert_m       default arrival-alert distance for watchers in metres: 0 (off) / 100 / 200 / 500
-- ---------------------------------------------------------------------------
alter table vehicles add column if not exists chan text not null default gen_random_uuid()::text;
alter table vehicles add column if not exists expiry_hours int;
alter table vehicles add column if not exists expires_at timestamptz;
alter table vehicles add column if not exists alert_m int not null default 0;
create unique index if not exists vehicles_chan_u on vehicles(chan);
alter table vehicles drop constraint if exists vehicles_expiry_ok;
alter table vehicles add constraint vehicles_expiry_ok check (expiry_hours is null or expiry_hours in (24, 48, 168, 336));
alter table vehicles drop constraint if exists vehicles_alert_ok;
alter table vehicles add constraint vehicles_alert_ok check (alert_m in (0, 100, 200, 500));

create table if not exists points (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  lat double precision not null, lng double precision not null,
  spd real, hdg real,
  recorded_at timestamptz not null
);
create index if not exists points_v_t on points(vehicle_id, recorded_at desc);
create index if not exists points_t on points(recorded_at);
create table if not exists viewers (
  vehicle_id uuid references vehicles(id) on delete cascade,
  viewer_id text,
  name text not null default '',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (vehicle_id, viewer_id)
);
create index if not exists viewers_t on viewers(last_seen);

alter table vehicles enable row level security;
alter table points   enable row level security;
alter table viewers  enable row level security;
revoke all on vehicles, points, viewers from anon, authenticated;

-- 6-char code, no look-alike characters (never collides with a random or a custom code)
create or replace function gen_code() returns text language plpgsql as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from vehicles where code = c or custom_code = c);
  end loop;
  return c;
end $$;
revoke execute on function gen_code() from public, anon, authenticated;

-- Realtime push (Supabase "Broadcast from the database"). Sends on the public topic v:<chan>.
-- Best effort: if Realtime is unavailable this silently does nothing and watchers fall back to polling.
-- Internal only: never callable from the app, otherwise anyone could spoof updates.
create or replace function bcast(p_chan text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform realtime.send(p_payload, 'u', 'v:' || p_chan, false);
exception when others then
  null;
end $$;
revoke execute on function bcast(text, jsonb) from public, anon, authenticated;

create or replace function create_vehicle(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vehicles;
begin
  insert into vehicles(code, secret, name)
  values (gen_code(), gen_random_uuid()::text, left(coalesce(p_name, ''), 40))
  returning * into v;
  return jsonb_build_object('code', v.code, 'secret', v.secret);
end $$;

create or replace function push_points(p_code text, p_secret text, p_points jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v vehicles; n int; nw record; trail jsonb; shr boolean;
begin
  select * into v from vehicles where code = upper(p_code) and secret = p_secret;
  if not found then raise exception 'denied'; end if;
  if jsonb_array_length(p_points) > 500 then raise exception 'too many points'; end if;

  insert into points(vehicle_id, lat, lng, spd, hdg, recorded_at)
  select v.id, (e->>'lat')::float8, (e->>'lng')::float8, (e->>'spd')::real, (e->>'hdg')::real,
         to_timestamp((e->>'t')::float8 / 1000.0)
  from jsonb_array_elements(p_points) e
  where to_timestamp((e->>'t')::float8 / 1000.0) > now() - interval '48 hours';

  with b as (
    select (e->>'lat')::float8 lat, (e->>'lng')::float8 lng,
           to_timestamp((e->>'t')::float8 / 1000.0) at
    from jsonb_array_elements(p_points) e order by 3 desc limit 1
  )
  update vehicles x
     set last_lat = b.lat, last_lng = b.lng, last_at = b.at,
         sharing = case when b.at > now() - interval '2 minutes' then true else x.sharing end
    from b
   where x.id = v.id and (x.last_at is null or b.at > x.last_at);
  get diagnostics n = row_count;

  -- Realtime: only when this batch moved the vehicle forward, the code is live, and someone is
  -- actually watching (viewers poll at least every 30 s, so "seen in the last 90 s" = watching now).
  -- Skipping empty rooms keeps the message count (and the free-tier quota) low.
  if n > 0 and (v.expires_at is null or v.expires_at > now())
     and exists (select 1 from viewers w where w.vehicle_id = v.id and w.last_seen > now() - interval '90 seconds') then
    select (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'t')::float8 as t
      into nw
      from jsonb_array_elements(p_points) e order by (e->>'t')::float8 desc limit 1;
    select coalesce(jsonb_agg(jsonb_build_array(s.lat, s.lng) order by s.t), '[]'::jsonb) into trail
      from (select (e->>'lat')::float8 as lat, (e->>'lng')::float8 as lng, (e->>'t')::float8 as t
              from jsonb_array_elements(p_points) e order by (e->>'t')::float8 desc limit 30) s;
    select sharing into shr from vehicles where id = v.id;
    perform bcast(v.chan, jsonb_build_object('lat', nw.lat, 'lng', nw.lng, 'at', nw.t,
                                             'sharing', shr, 'trail', trail));
  end if;

  -- lazy cleanup (backup for the cron job)
  if random() < 0.05 then
    delete from points  where recorded_at < now() - interval '48 hours';
    delete from viewers where last_seen  < now() - interval '48 hours';
  end if;
end $$;

create or replace function stop_sharing(p_code text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
declare v vehicles;
begin
  update vehicles set sharing = false where code = upper(p_code) and secret = p_secret returning * into v;
  if found then perform bcast(v.chan, jsonb_build_object('sharing', false)); end if;
end $$;

-- New random code + new realtime channel. Anyone holding the old random code is cut off.
-- A custom code is untouched (only you can edit it). If expiry is on, the timer restarts.
create or replace function rotate_code(p_code text, p_secret text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := gen_code(); v vehicles;
begin
  select * into v from vehicles where code = upper(p_code) and secret = p_secret;
  if not found then raise exception 'denied'; end if;
  perform bcast(v.chan, jsonb_build_object('refresh', true)); -- watchers on the old channel re-check right away
  update vehicles
     set code = n,
         chan = gen_random_uuid()::text,
         expires_at = case when expiry_hours is not null then now() + make_interval(hours => expiry_hours)
                           else expires_at end
   where id = v.id;
  delete from viewers where vehicle_id = v.id;
  return n;
end $$;

-- p_hours: null = never expires, else 24 / 48 / 168 / 336. The timer starts now.
create or replace function set_expiry(p_code text, p_secret text, p_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vehicles;
begin
  if p_hours is not null and p_hours not in (24, 48, 168, 336) then raise exception 'bad hours'; end if;
  update vehicles
     set expiry_hours = p_hours,
         expires_at = case when p_hours is null then null else now() + make_interval(hours => p_hours) end
   where code = upper(p_code) and secret = p_secret
  returning * into v;
  if not found then raise exception 'denied'; end if;
  perform bcast(v.chan, jsonb_build_object('refresh', true));
  return jsonb_build_object('expiry_hours', v.expiry_hours,
                            'expires_at', case when v.expires_at is not null then extract(epoch from v.expires_at) * 1000 end);
end $$;

-- p_m: default arrival-alert distance for watchers (0 off / 100 / 200 / 500 m). Watchers can override it.
create or replace function set_alert(p_code text, p_secret text, p_m int) returns void
language plpgsql security definer set search_path = public as $$
declare v vehicles;
begin
  if p_m is null or p_m not in (0, 100, 200, 500) then raise exception 'bad distance'; end if;
  update vehicles set alert_m = p_m where code = upper(p_code) and secret = p_secret returning * into v;
  if not found then raise exception 'denied'; end if;
  perform bcast(v.chan, jsonb_build_object('refresh', true));
end $$;

create or replace function get_latest(p_code text, p_viewer text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vehicles; trail jsonb; fresh boolean; c text := upper(trim(p_code));
begin
  select * into v from vehicles where code = c or custom_code = c;
  if not found then return null; end if;

  -- expired: say so, reveal nothing else (no location, no channel), don't log the viewer
  if v.expires_at is not null and v.expires_at <= now() then
    return jsonb_build_object('name', v.name, 'expired', true,
                              'expires_at', extract(epoch from v.expires_at) * 1000,
                              'now', extract(epoch from now()) * 1000);
  end if;

  if p_viewer is not null and length(p_viewer) between 8 and 64 then
    insert into viewers(vehicle_id, viewer_id, name)
    values (v.id, p_viewer, left(coalesce(p_name, ''), 30))
    on conflict (vehicle_id, viewer_id) do update set last_seen = now(), name = excluded.name;
  end if;
  select coalesce(jsonb_agg(jsonb_build_array(lat, lng) order by recorded_at), '[]'::jsonb) into trail
  from (select lat, lng, recorded_at from points
        where vehicle_id = v.id and recorded_at > now() - interval '30 minutes'
        order by recorded_at desc limit 60) t;
  fresh := v.last_at is not null and v.last_at > now() - interval '48 hours';
  return jsonb_build_object(
    'name', v.name, 'sharing', v.sharing, 'expired', false,
    'lat', case when fresh then v.last_lat end,
    'lng', case when fresh then v.last_lng end,
    'at',  case when fresh then extract(epoch from v.last_at) * 1000 end,
    'now', extract(epoch from now()) * 1000,
    'trail', trail,
    'chan', v.chan,
    'alert_m', v.alert_m,
    'expires_at', case when v.expires_at is not null then extract(epoch from v.expires_at) * 1000 end);
end $$;

create or replace function get_viewers(p_code text, p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vehicles;
begin
  select * into v from vehicles where code = upper(p_code) and secret = p_secret;
  if not found then raise exception 'denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('name', name, 'at', extract(epoch from last_seen) * 1000)
                                    order by last_seen desc)
                   from viewers where vehicle_id = v.id and last_seen > now() - interval '48 hours'), '[]'::jsonb);
end $$;

-- Everything the Share screen needs in one call: settings + who watched
create or replace function get_sharer(p_code text, p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vehicles;
begin
  select * into v from vehicles where code = upper(p_code) and secret = p_secret;
  if not found then raise exception 'denied'; end if;
  return jsonb_build_object(
    'name', v.name,
    'custom_code', v.custom_code,
    'expiry_hours', v.expiry_hours,
    'expires_at', case when v.expires_at is not null then extract(epoch from v.expires_at) * 1000 end,
    'alert_m', v.alert_m,
    'now', extract(epoch from now()) * 1000,
    'viewers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'at', extract(epoch from last_seen) * 1000)
                                          order by last_seen desc)
                         from viewers where vehicle_id = v.id and last_seen > now() - interval '48 hours'), '[]'::jsonb));
end $$;

grant execute on function create_vehicle(text), push_points(text,text,jsonb), stop_sharing(text,text),
  rotate_code(text,text), get_latest(text,text,text), get_viewers(text,text),
  set_expiry(text,text,int), set_alert(text,text,int), get_sharer(text,text) to anon;

-- Scheduled 48h delete. If this errors, enable it in Dashboard -> Integrations -> Cron, then re-run only this block.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('clocation-cleanup', '*/30 * * * *', $$
  delete from points  where recorded_at < now() - interval '48 hours';
  delete from viewers where last_seen  < now() - interval '48 hours';
$$);
