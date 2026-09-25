-- Paste this whole file into Supabase Dashboard > SQL Editor > New query, then Run.
-- Covers: profiles (auto-created on signup), friendships, families, duels,
-- plus the "Markva Bot" demo opponent. Safe to re-run: every object is
-- created with IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS.
--
-- Every table has Row Level Security ON with policies scoping access to the
-- caller's own rows/relationships — the anon key shipped in the app can only
-- ever do what these policies (and the column grants below) allow,
-- regardless of what a client sends.

-- 0. APP CONFIG ---------------------------------------------------------------
-- Server-side settings the functions below read (currently just the demo
-- bot's user id). RLS on with no policies: clients can't read or write it,
-- only SECURITY DEFINER functions can.
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;

create or replace function public.bot_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select value::uuid from public.app_config where key = 'bot_user_id';
$$;

-- 1. PROFILES ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Stashes the email so "add a friend by email" has something to search
-- against — never exposed through a direct SELECT; see the column-privilege
-- lockdown and find_profile_by_email() below.
alter table public.profiles add column if not exists email text;

alter table public.profiles enable row level security;

drop policy if exists "profiles are readable by any signed-in user" on public.profiles;
create policy "profiles are readable by any signed-in user"
  on public.profiles for select
  using (auth.uid() is not null);

drop policy if exists "a user can update only their own profile" on public.profiles;
create policy "a user can update only their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- RLS is row-level, not column-level. Without these grants any signed-in
-- client could SELECT everyone's email, or UPDATE its own email to someone
-- else's and hijack find_profile_by_email(). Clients only ever need to read
-- id/display_name and rename themselves.
revoke select, update on public.profiles from anon, authenticated;
grant select (id, display_name, created_at) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.find_profile_by_email(lookup_email text)
returns table (id uuid, display_name text)
language sql
security definer
set search_path = public
as $$
  select p.id, p.display_name from public.profiles p
  where p.email = lower(trim(lookup_email))
  limit 1;
$$;

grant execute on function public.find_profile_by_email(text) to authenticated;

-- 2. FRIENDSHIPS --------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

drop policy if exists "a user can see friendships they're part of" on public.friendships;
create policy "a user can see friendships they're part of"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists "a user can request a friendship as themselves" on public.friendships;
create policy "a user can request a friendship as themselves"
  on public.friendships for insert
  with check (auth.uid() = requester_id and requester_id <> addressee_id and status = 'pending');

-- Only the person who RECEIVED a request can accept it — the requester
-- accepting their own request would make anyone anyone's friend.
drop policy if exists "either side can update a friendship they're part of" on public.friendships;
drop policy if exists "the addressee can accept a request" on public.friendships;
create policy "the addressee can accept a request"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id and status = 'accepted');

revoke update on public.friendships from anon, authenticated;
grant update (status) on public.friendships to authenticated;

-- Covers both declining a pending request and unfriending an accepted one —
-- one row, one action, no separate "declined" status needed.
drop policy if exists "either side can delete a friendship they're part of" on public.friendships;
create policy "either side can delete a friendship they're part of"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- 3. FAMILIES -----------------------------------------------------------------
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

alter table public.families enable row level security;
alter table public.family_members enable row level security;

-- A family_members policy that queries family_members directly makes
-- Postgres fail every read with "infinite recursion detected in policy".
-- Membership is checked through this SECURITY DEFINER function instead,
-- which reads the table without re-entering its own policy.
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members
    where family_id = p_family_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_family_member(uuid) to authenticated;

-- The owner clause matters on creation: the app inserts the family and
-- reads its id back before the owner's membership row exists.
drop policy if exists "a member can see their own family" on public.families;
create policy "a member can see their own family"
  on public.families for select
  using (owner_id = auth.uid() or public.is_family_member(id));

drop policy if exists "a signed-in user can create a family (becoming its owner)" on public.families;
create policy "a signed-in user can create a family (becoming its owner)"
  on public.families for insert
  with check (auth.uid() = owner_id);

drop policy if exists "a member can see other members of their own family" on public.family_members;
create policy "a member can see other members of their own family"
  on public.family_members for select
  using (public.is_family_member(family_id));

-- A family's id doubles as its invite code, so anyone holding it may join —
-- but only as a plain member. Joining as 'owner' requires actually owning it.
drop policy if exists "a user can add themself to a family" on public.family_members;
create policy "a user can add themself to a family"
  on public.family_members for insert
  with check (
    auth.uid() = user_id
    and (
      role = 'member'
      or exists (select 1 from public.families f where f.id = family_id and f.owner_id = auth.uid())
    )
  );

drop policy if exists "a user can remove themself from a family" on public.family_members;
create policy "a user can remove themself from a family"
  on public.family_members for delete
  using (auth.uid() = user_id);

-- Challenging another family needs its owner's id, but families are only
-- visible to their own members. This resolves an invite code to exactly
-- that one field and nothing else.
create or replace function public.family_owner_for_invite(p_family_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select owner_id from public.families where id = p_family_id;
$$;

grant execute on function public.family_owner_for_invite(uuid) to authenticated;

-- 4. DUELS ----------------------------------------------------------------------
-- A duel doesn't run its own market — it scores each participant's EXISTING
-- active portfolio (the same one they trade normally in the Portfolio tab)
-- by % net-worth change from a captured baseline, over the duel's real-time
-- window. That's what baseline_net_worths/live_net_worths hold: a map of
-- participant id -> net worth, keyed as text because jsonb object keys are
-- always strings. No second market engine, no simulated clock to keep two
-- devices in sync on — this app already has one real, live market, and a
-- duel is just a lens on it.
create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('friend', 'family')),
  status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'declined')),
  -- Exactly two entries today for both kinds — the app currently scores a
  -- family duel as owner/representative vs. owner/representative rather
  -- than a full-roster aggregate (see services/social/duels.ts's
  -- challengeFamily for why). Kept as a plain array rather than a join
  -- table, so a future full-roster mode is a policy change, not a migration.
  participant_ids uuid[] not null,
  -- "No time-skipping unless every participant agrees" — reframed as
  -- ending the duel early rather than fast-forwarding a simulated clock: a
  -- unanimous vote ends the duel at the current scores instead of ends_at.
  time_skip_votes uuid[] not null default '{}',
  baseline_net_worths jsonb not null default '{}'::jsonb,
  live_net_worths jsonb not null default '{}'::jsonb,
  starting_cash numeric not null default 100000,
  winner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  ends_at timestamptz
);

-- Re-applied so databases created before `on delete set null` was added get
-- it too; without it, deleting any account that ever won a duel fails.
alter table public.duels drop constraint if exists duels_winner_id_fkey;
alter table public.duels
  add constraint duels_winner_id_fkey foreign key (winner_id) references public.profiles(id) on delete set null;

alter table public.duels enable row level security;

drop policy if exists "a participant can see a duel they're in" on public.duels;
create policy "a participant can see a duel they're in"
  on public.duels for select
  using (auth.uid() = any(participant_ids));

-- A new duel must start clean: pending, no winner, no votes, two distinct
-- people, and only the challenger's own net worth filled in.
drop policy if exists "a participant can create a duel that includes themself" on public.duels;
create policy "a participant can create a duel that includes themself"
  on public.duels for insert
  with check (
    auth.uid() = any(participant_ids)
    and status = 'pending'
    and winner_id is null
    and cardinality(time_skip_votes) = 0
    and cardinality(participant_ids) = 2
    and participant_ids[1] <> participant_ids[2]
    and (baseline_net_worths - auth.uid()::text) = '{}'::jsonb
    and (live_net_worths - auth.uid()::text) = '{}'::jsonb
  );

-- The only direct write a client may make is declining a pending duel.
-- Scores, votes and results all go through the functions below.
drop policy if exists "a participant can update a duel they're in (e.g. casting a time-skip vote)" on public.duels;
drop policy if exists "a participant can update a duel they're in (e.g. declining it)" on public.duels;
drop policy if exists "a participant can decline a pending duel" on public.duels;
create policy "a participant can decline a pending duel"
  on public.duels for update
  using (auth.uid() = any(participant_ids) and status = 'pending')
  with check (status = 'declined');

revoke update on public.duels from anon, authenticated;
grant update (status) on public.duels to authenticated;

-- Every write to baseline/live net worth and every time-skip vote goes
-- through these functions rather than a plain client-side .update() — a
-- read-modify-write from the client on a shared jsonb/array column would
-- race the other participant's device writing at the same moment. Each is
-- SECURITY DEFINER so it can do the read+write atomically in one statement,
-- and each re-checks auth.uid() = any(participant_ids) itself.

create or replace function public.report_duel_net_worth(p_duel_id uuid, p_net_worth numeric, p_is_baseline boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.duels;
  all_have_baseline boolean;
begin
  if p_is_baseline then
    -- A baseline is set once, while the duel is still pending. Re-reporting
    -- one mid-duel would let a participant reset their own starting point.
    update public.duels
    set baseline_net_worths = jsonb_set(baseline_net_worths, array[auth.uid()::text], to_jsonb(p_net_worth)),
        live_net_worths = jsonb_set(live_net_worths, array[auth.uid()::text], to_jsonb(p_net_worth))
    where id = p_duel_id
      and status = 'pending'
      and auth.uid() = any(participant_ids)
      and not (baseline_net_worths ? auth.uid()::text)
    returning * into d;

    if d.id is null then
      return;
    end if;

    -- Once every participant has a baseline in, the duel is on. The window
    -- starts now rather than at challenge time, so a late accept doesn't
    -- shorten it.
    select bool_and(d.baseline_net_worths ? pid::text) into all_have_baseline
    from unnest(d.participant_ids) as pid;

    if all_have_baseline then
      update public.duels
      set status = 'active',
          ends_at = case when ends_at is null then null else now() + (ends_at - created_at) end
      where id = p_duel_id;
    end if;
  else
    update public.duels
    set live_net_worths = jsonb_set(live_net_worths, array[auth.uid()::text], to_jsonb(p_net_worth))
    where id = p_duel_id and status = 'active' and auth.uid() = any(participant_ids);
  end if;
end;
$$;

grant execute on function public.report_duel_net_worth(uuid, numeric, boolean) to authenticated;

create or replace function public.cast_duel_time_skip_vote(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bot uuid := public.bot_user_id();
begin
  update public.duels
  set time_skip_votes = array_append(time_skip_votes, auth.uid())
  where id = p_duel_id
    and status = 'active'
    and auth.uid() = any(participant_ids)
    and not (auth.uid() = any(time_skip_votes));

  -- The demo bot always agrees to end early, so a judge duelling it can see
  -- a duel finish without waiting out the whole window.
  if bot is not null then
    update public.duels
    set time_skip_votes = array_append(time_skip_votes, bot)
    where id = p_duel_id
      and status = 'active'
      and bot = any(participant_ids)
      and not (bot = any(time_skip_votes));
  end if;
end;
$$;

grant execute on function public.cast_duel_time_skip_vote(uuid) to authenticated;

-- Called by the client whenever it opens a duel (the app's usual
-- resolve-on-view pattern — see CLAUDE.md §7 rule #6 — rather than a
-- server-side cron job): ends the duel and computes the winner, but only
-- once one of the two real end conditions actually holds. A no-op the rest
-- of the time.
create or replace function public.finalize_duel_if_ready(p_duel_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.duels;
  best_uid uuid;
  best_pct numeric;
  pid uuid;
  bnw numeric;
  lnw numeric;
  pct numeric;
  unanimous boolean;
  expired boolean;
begin
  select * into d from public.duels where id = p_duel_id and auth.uid() = any(participant_ids);
  if not found or d.status <> 'active' then
    return;
  end if;

  unanimous := (select bool_and(p = any(d.time_skip_votes)) from unnest(d.participant_ids) as p);
  expired := d.ends_at is not null and now() >= d.ends_at;
  if not (coalesce(unanimous, false) or expired) then
    return;
  end if;

  best_uid := null;
  best_pct := null;
  foreach pid in array d.participant_ids loop
    bnw := (d.baseline_net_worths ->> pid::text)::numeric;
    lnw := (d.live_net_worths ->> pid::text)::numeric;
    if bnw is not null and bnw > 0 and lnw is not null then
      pct := (lnw - bnw) / bnw;
      if best_pct is null or pct > best_pct then
        best_pct := pct;
        best_uid := pid;
      end if;
    end if;
  end loop;

  update public.duels set status = 'completed', winner_id = best_uid where id = p_duel_id;
end;
$$;

grant execute on function public.finalize_duel_if_ready(uuid) to authenticated;

-- Live score pushes (services/social/duels.ts's subscribeToDuel). Guarded so
-- re-running never errors on a table that's already in the publication.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duels'
     ) then
    alter publication supabase_realtime add table public.duels;
  end if;
end;
$$;

-- 5. SIGN-UP HOOK -------------------------------------------------------------
-- Creates the profile row the moment someone signs up (display name = the
-- part of their email before @), and has the demo bot send them a friend
-- request so there's someone to duel straight away.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bot uuid := public.bot_user_id();
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, split_part(new.email, '@', 1), lower(trim(new.email)))
  on conflict (id) do update set email = excluded.email;

  if bot is not null and bot <> new.id then
    insert into public.friendships (requester_id, addressee_id)
    values (bot, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5b. FUNCTION PRIVILEGES -----------------------------------------------------
-- Postgres lets PUBLIC (and Supabase's `anon` role) execute new functions by
-- default. Every function above is for signed-in users only — left open,
-- find_profile_by_email would let anyone probe which emails have accounts.
revoke execute on function public.bot_user_id() from public, anon, authenticated;
revoke execute on function public.find_profile_by_email(text) from public, anon;
revoke execute on function public.is_family_member(uuid) from public, anon;
revoke execute on function public.family_owner_for_invite(uuid) from public, anon;
revoke execute on function public.report_duel_net_worth(uuid, numeric, boolean) from public, anon;
revoke execute on function public.cast_duel_time_skip_vote(uuid) from public, anon;
revoke execute on function public.finalize_duel_if_ready(uuid) from public, anon;

-- The one thing anon may call: a no-op the daily GitHub Actions keep-alive
-- (.github/workflows/supabase-keepalive.yml) hits so the free-tier project
-- never auto-pauses. Touches no data.
create or replace function public.keepalive()
returns integer
language sql
stable
as $$
  select 1;
$$;

grant execute on function public.keepalive() to anon;

-- 6. DEMO BOT -----------------------------------------------------------------
-- "Markva Bot" lets a single person try friends and duels without a second
-- account: it accepts every friend request and every duel it's sent. It
-- holds $100k in cash, so it always scores 0% — beatable, and honest about
-- being a bot. Both triggers are no-ops until app_config has a bot id.
create or replace function public.bot_auto_accept_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and new.addressee_id = public.bot_user_id() then
    update public.friendships set status = 'accepted' where id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists bot_auto_accept_friendship on public.friendships;
create trigger bot_auto_accept_friendship
  after insert on public.friendships
  for each row execute function public.bot_auto_accept_friendship();

create or replace function public.bot_auto_accept_duel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bot uuid := public.bot_user_id();
begin
  if bot is null or not (bot = any(new.participant_ids)) or new.status <> 'pending'
     or new.baseline_net_worths ? bot::text then
    return null;
  end if;

  update public.duels
  set baseline_net_worths = baseline_net_worths || jsonb_build_object(bot::text, 100000),
      live_net_worths = live_net_worths || jsonb_build_object(bot::text, 100000),
      status = 'active',
      ends_at = case when ends_at is null then null else now() + (ends_at - created_at) end
  where id = new.id;
  return null;
end;
$$;

drop trigger if exists bot_auto_accept_duel on public.duels;
create trigger bot_auto_accept_duel
  after insert on public.duels
  for each row execute function public.bot_auto_accept_duel();

-- Registers the bot once its auth account exists (create it under
-- Authentication > Users as bot@markva.app, auto-confirmed). Does nothing if
-- that account doesn't exist yet, so this file can always be re-run.
insert into public.app_config (key, value)
select 'bot_user_id', id::text from auth.users where email = 'bot@markva.app'
on conflict (key) do update set value = excluded.value;

update public.profiles set display_name = 'Markva Bot' where email = 'bot@markva.app';
