-- cLocation backend. Paste into Supabase -> SQL Editor -> Run.
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
-- Vanity code (optional, null by default). Set it by hand in Table Editor / SQL. Works for watching only.
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

-- 6-char code, no look-alike characters
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
declare v vehicles;
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

  -- lazy cleanup (backup for the cron job)
  if random() < 0.05 then
    delete from points  where recorded_at < now() - interval '48 hours';
    delete from viewers where last_seen  < now() - interval '48 hours';
  end if;
end $$;

create or replace function stop_sharing(p_code text, p_secret text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update vehicles set sharing = false where code = upper(p_code) and secret = p_secret;
end $$;

create or replace function rotate_code(p_code text, p_secret text) returns text
language plpgsql security definer set search_path = public as $$
declare n text := gen_code(); v vehicles;
begin
  update vehicles set code = n where code = upper(p_code) and secret = p_secret returning * into v;
  if not found then raise exception 'denied'; end if;
  delete from viewers where vehicle_id = v.id;
  return n;
end $$;

create or replace function get_latest(p_code text, p_viewer text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v vehicles; trail jsonb; fresh boolean;
begin
  select * into v from vehicles
   where code = upper(trim(p_code)) or custom_code = upper(trim(p_code));
  if not found then return null; end if;
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
    'name', v.name, 'sharing', v.sharing,
    'lat', case when fresh then v.last_lat end,
    'lng', case when fresh then v.last_lng end,
    'at',  case when fresh then extract(epoch from v.last_at) * 1000 end,
    'now', extract(epoch from now()) * 1000,
    'trail', trail);
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

grant execute on function create_vehicle(text), push_points(text,text,jsonb), stop_sharing(text,text),
  rotate_code(text,text), get_latest(text,text,text), get_viewers(text,text) to anon;

-- Scheduled 48h delete. If this errors, enable it in Dashboard -> Integrations -> Cron, then re-run only this block.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('clocation-cleanup', '*/30 * * * *', $$
  delete from points  where recorded_at < now() - interval '48 hours';
  delete from viewers where last_seen  < now() - interval '48 hours';
$$);
