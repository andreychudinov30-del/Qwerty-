-- METRO HORROR: players, friends, co-op rooms, invites.
-- Tables are RLS-locked with no policies (no direct access); clients call SECURITY DEFINER RPCs that verify the player secret.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.mh_players (
  id text primary key, secret_hash text not null, name text not null default 'Выживший', skin text not null default 'stalker',
  status text not null default 'menu', room text, last_seen timestamptz not null default now(), created_at timestamptz not null default now());
alter table public.mh_players enable row level security;

create table if not exists public.mh_friends (
  a text not null references public.mh_players(id) on delete cascade, b text not null references public.mh_players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')), created_at timestamptz not null default now(),
  primary key (a, b), check (a <> b));
alter table public.mh_friends enable row level security;
create index if not exists mh_friends_b_idx on public.mh_friends(b);

create table if not exists public.mh_rooms (
  code text primary key, host text not null references public.mh_players(id) on delete cascade,
  guest text references public.mh_players(id) on delete set null, mission text not null,
  state text not null default 'lobby' check (state in ('lobby','playing','closed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.mh_rooms enable row level security;
create index if not exists mh_rooms_host_idx on public.mh_rooms(host);

create table if not exists public.mh_invites (
  id bigint generated always as identity primary key, from_id text not null references public.mh_players(id) on delete cascade,
  to_id text not null references public.mh_players(id) on delete cascade, room text not null, seen boolean not null default false,
  created_at timestamptz not null default now());
alter table public.mh_invites enable row level security;
create index if not exists mh_invites_to_idx on public.mh_invites(to_id, seen);

create or replace function public.mh_auth(p_id text, p_secret text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_id is null or p_secret is null or not exists (
    select 1 from public.mh_players where id = p_id and secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')) then
    raise exception 'auth failed' using errcode = '28000';
  end if;
end $$;
revoke all on function public.mh_auth(text, text) from public, anon, authenticated;

create or replace function public.mh_register(p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_id text; v_secret text; i int := 0; alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; k int;
begin
  loop
    v_id := 'MH-';
    for k in 1..6 loop v_id := v_id || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.mh_players where id = v_id);
    i := i + 1; if i > 30 then raise exception 'id generation failed'; end if;
  end loop;
  v_secret := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.mh_players(id, secret_hash, name)
  values (v_id, encode(extensions.digest(v_secret, 'sha256'), 'hex'), left(coalesce(nullif(trim(p_name), ''), 'Выживший'), 18));
  return jsonb_build_object('id', v_id, 'secret', v_secret);
end $$;

create or replace function public.mh_heartbeat(p_id text, p_secret text, p_status text, p_room text, p_name text, p_skin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_friends jsonb; v_requests jsonb; v_invites jsonb;
begin
  perform public.mh_auth(p_id, p_secret);
  update public.mh_players set last_seen = now(), status = coalesce(nullif(p_status, ''), 'menu'), room = nullif(p_room, ''),
    name = left(coalesce(nullif(trim(p_name), ''), name), 18), skin = left(coalesce(nullif(p_skin, ''), skin), 24)
  where id = p_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'skin', p.skin, 'status', p.status,
      'room', case when p.status = 'lobby' then p.room else null end,
      'online', p.last_seen > now() - interval '35 seconds') order by p.last_seen desc), '[]'::jsonb) into v_friends
    from public.mh_friends f join public.mh_players p on p.id = case when f.a = p_id then f.b else f.a end
    where f.status = 'accepted' and (f.a = p_id or f.b = p_id);
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name)), '[]'::jsonb) into v_requests
    from public.mh_friends f join public.mh_players p on p.id = f.a where f.b = p_id and f.status = 'pending';
  with inv as (
    update public.mh_invites i set seen = true
    where i.to_id = p_id and i.seen = false and i.created_at > now() - interval '3 minutes'
    returning i.from_id, i.room, i.created_at)
  select coalesce(jsonb_agg(jsonb_build_object('from', inv.from_id, 'name', p.name, 'room', inv.room)), '[]'::jsonb) into v_invites
    from inv join public.mh_players p on p.id = inv.from_id;
  return jsonb_build_object('friends', v_friends, 'requests', v_requests, 'invites', v_invites);
end $$;

create or replace function public.mh_friend_request(p_id text, p_secret text, p_target text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.mh_auth(p_id, p_secret);
  p_target := upper(trim(p_target));
  if p_target = p_id then raise exception 'Нельзя добавить самого себя'; end if;
  if not exists (select 1 from public.mh_players where id = p_target) then raise exception 'Игрок не найден'; end if;
  if exists (select 1 from public.mh_friends where a = p_target and b = p_id) then
    update public.mh_friends set status = 'accepted' where a = p_target and b = p_id;
    return jsonb_build_object('status', 'accepted');
  end if;
  insert into public.mh_friends(a, b) values (p_id, p_target) on conflict do nothing;
  return jsonb_build_object('status', 'pending');
end $$;

create or replace function public.mh_friend_respond(p_id text, p_secret text, p_other text, p_accept boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.mh_auth(p_id, p_secret);
  if p_accept then update public.mh_friends set status = 'accepted' where a = p_other and b = p_id;
  else delete from public.mh_friends where a = p_other and b = p_id; end if;
end $$;

create or replace function public.mh_friend_remove(p_id text, p_secret text, p_other text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.mh_auth(p_id, p_secret);
  delete from public.mh_friends where (a = p_id and b = p_other) or (a = p_other and b = p_id);
end $$;

create or replace function public.mh_room_create(p_id text, p_secret text, p_mission text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; i int := 0;
begin
  perform public.mh_auth(p_id, p_secret);
  update public.mh_rooms set state = 'closed' where host = p_id and state <> 'closed';
  delete from public.mh_rooms where updated_at < now() - interval '1 day';
  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.mh_rooms where code = v_code and state <> 'closed' and updated_at > now() - interval '12 hours');
    i := i + 1; if i > 40 then raise exception 'code generation failed'; end if;
  end loop;
  delete from public.mh_rooms where code = v_code;
  insert into public.mh_rooms(code, host, mission) values (v_code, p_id, left(p_mission, 16));
  return jsonb_build_object('code', v_code, 'mission', p_mission, 'host', p_id);
end $$;

create or replace function public.mh_room_join(p_id text, p_secret text, p_code text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.mh_rooms; hn text; hs text;
begin
  perform public.mh_auth(p_id, p_secret);
  select * into r from public.mh_rooms where code = trim(p_code) and state <> 'closed' and updated_at > now() - interval '12 hours';
  if not found then raise exception 'Комната не найдена'; end if;
  if r.host <> p_id then
    if r.guest is not null and r.guest <> p_id then raise exception 'Комната заполнена'; end if;
    update public.mh_rooms set guest = p_id, updated_at = now() where code = r.code;
  end if;
  select name, skin into hn, hs from public.mh_players where id = r.host;
  return jsonb_build_object('code', r.code, 'host', r.host, 'host_name', hn, 'host_skin', hs, 'mission', r.mission, 'state', r.state);
end $$;

create or replace function public.mh_room_update(p_id text, p_secret text, p_code text, p_mission text, p_state text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.mh_auth(p_id, p_secret);
  update public.mh_rooms set mission = coalesce(nullif(p_mission, ''), mission), state = coalesce(nullif(p_state, ''), state), updated_at = now()
  where code = p_code and host = p_id;
end $$;

create or replace function public.mh_room_leave(p_id text, p_secret text, p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.mh_auth(p_id, p_secret);
  update public.mh_rooms set state = 'closed', updated_at = now() where code = p_code and host = p_id;
  update public.mh_rooms set guest = null, updated_at = now() where code = p_code and guest = p_id;
end $$;

create or replace function public.mh_invite(p_id text, p_secret text, p_to text, p_room text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.mh_auth(p_id, p_secret);
  if not exists (select 1 from public.mh_friends where status = 'accepted' and ((a = p_id and b = p_to) or (a = p_to and b = p_id))) then
    raise exception 'Можно приглашать только друзей';
  end if;
  if (select count(*) from public.mh_invites where from_id = p_id and created_at > now() - interval '1 minute') > 10 then
    raise exception 'Слишком много приглашений';
  end if;
  insert into public.mh_invites(from_id, to_id, room) values (p_id, p_to, p_room);
end $$;

do $$ declare f text; begin
  foreach f in array array['mh_register(text)','mh_heartbeat(text, text, text, text, text, text)','mh_friend_request(text, text, text)',
    'mh_friend_respond(text, text, text, boolean)','mh_friend_remove(text, text, text)','mh_room_create(text, text, text)',
    'mh_room_join(text, text, text)','mh_room_update(text, text, text, text, text)','mh_room_leave(text, text, text)','mh_invite(text, text, text, text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;
