-- Paste this whole file into Supabase Dashboard > SQL Editor > New query, then Run.
-- Covers: profiles (auto-created on signup), families, friendships, duels.
-- Every table has Row Level Security ON with policies scoping access to the
-- caller's own rows/relationships — the anon key shipped in the app can only
-- ever do what these policies allow, regardless of what a client sends.

-- 1. PROFILES ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any signed-in user"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "a user can update only their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row the moment someone confirms signup, using the
-- part before @ in their email as a default display name. Also stashes the
-- email itself (added below) so "add a friend by email" has something to
-- search against — never exposed through the open SELECT policy above; see
-- the column-privilege lockdown and find_profile_by_email() further down.
alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, split_part(new.email, '@', 1), lower(trim(new.email)))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS is row-level, not column-level — the broad "readable by any signed-in
-- user" policy above would otherwise let any client SELECT the new email
-- column directly (e.g. `supabase.from('profiles').select('email')`),
-- silently defeating the whole point of routing lookups through a function.
-- Locking column privileges down to what the UI actually needs (id,
-- display_name) closes that, while find_profile_by_email() below — a
-- SECURITY DEFINER function — can still read email internally to do the
-- match, and only ever returns id/display_name, never the email back out.
revoke select on public.profiles from authenticated;
grant select (id, display_name, created_at) on public.profiles to authenticated;

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

create policy "a user can see friendships they're part of"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "a user can request a friendship as themselves"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "either side can update a friendship they're part of"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Covers both declining a pending request and unfriending an accepted one —
-- one row, one action, no separate "declined" status needed.
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

create policy "a member can see their own family"
  on public.families for select
  using (id in (select family_id from public.family_members where user_id = auth.uid()));

create policy "a signed-in user can create a family (becoming its owner)"
  on public.families for insert
  with check (auth.uid() = owner_id);

create policy "a member can see other members of their own family"
  on public.family_members for select
  using (family_id in (select family_id from public.family_members where user_id = auth.uid()));

create policy "a user can add themself to a family"
  on public.family_members for insert
  with check (auth.uid() = user_id);

create policy "a user can remove themself from a family"
  on public.family_members for delete
  using (auth.uid() = user_id);

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
  -- challengeFamily for why: a true aggregate needs every member's own
  -- device to individually report a baseline). The schema doesn't assume
  -- exactly two, though — kept as a plain array rather than a join table,
  -- so a future full-roster mode is just a client-side change, not a
  -- migration. A duel's roster never changes after it starts either way.
  participant_ids uuid[] not null,
  -- "No time-skipping unless every participant agrees" — reframed here as
  -- ending the duel early rather than fast-forwarding a simulated clock
  -- (see the comment above on why there isn't one): a unanimous vote here
  -- ends the duel at the current scores instead of waiting for ends_at.
  time_skip_votes uuid[] not null default '{}',
  baseline_net_worths jsonb not null default '{}'::jsonb,
  live_net_worths jsonb not null default '{}'::jsonb,
  starting_cash numeric not null default 100000,
  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  ends_at timestamptz
);

alter table public.duels enable row level security;

drop policy if exists "a participant can see a duel they're in" on public.duels;
create policy "a participant can see a duel they're in"
  on public.duels for select
  using (auth.uid() = any(participant_ids));

drop policy if exists "a participant can create a duel that includes themself" on public.duels;
create policy "a participant can create a duel that includes themself"
  on public.duels for insert
  with check (auth.uid() = any(participant_ids));

drop policy if exists "a participant can update a duel they're in (e.g. casting a time-skip vote)" on public.duels;
create policy "a participant can update a duel they're in (e.g. declining it)"
  on public.duels for update
  using (auth.uid() = any(participant_ids));

-- Every write to baseline/live net worth and every time-skip vote goes
-- through these two functions rather than a plain client-side .update() —
-- a read-modify-write from the client on a shared jsonb/array column would
-- race the other participant's device writing at the same moment. Both are
-- SECURITY DEFINER so they can do the read+write atomically inside one
-- statement, but each still re-checks auth.uid() = any(participant_ids)
-- itself rather than trusting RLS alone, since the row-level UPDATE policy
-- above doesn't know which jsonb key is being touched.

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
    update public.duels
    set baseline_net_worths = jsonb_set(baseline_net_worths, array[auth.uid()::text], to_jsonb(p_net_worth))
    where id = p_duel_id and auth.uid() = any(participant_ids)
    returning * into d;

    if d.id is null then
      return;
    end if;

    -- Once every participant has a baseline in, the duel is no longer
    -- "pending a response" — it's on. A friend duel goes active the moment
    -- the challenged side accepts (accepting IS reporting a baseline).
    select bool_and(d.baseline_net_worths ? pid::text) into all_have_baseline
    from unnest(d.participant_ids) as pid;

    if all_have_baseline and d.status = 'pending' then
      update public.duels set status = 'active' where id = p_duel_id;
    end if;
  else
    update public.duels
    set live_net_worths = jsonb_set(live_net_worths, array[auth.uid()::text], to_jsonb(p_net_worth))
    where id = p_duel_id and auth.uid() = any(participant_ids);
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
begin
  update public.duels
  set time_skip_votes = array_append(time_skip_votes, auth.uid())
  where id = p_duel_id
    and status = 'active'
    and auth.uid() = any(participant_ids)
    and not (auth.uid() = any(time_skip_votes));
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

  unanimous := array_length(d.time_skip_votes, 1) is not null
    and array_length(d.time_skip_votes, 1) >= array_length(d.participant_ids, 1);
  expired := d.ends_at is not null and now() >= d.ends_at;
  if not (unanimous or expired) then
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

-- MANUAL DASHBOARD STEP — not something this file's SQL can turn on safely
-- from here (publication membership behaves inconsistently with a plain
-- IF NOT EXISTS across Postgres versions): open Database > Replication in
-- the Supabase dashboard and toggle "duels" on for the supabase_realtime
-- publication. Without this, everything above still works — duels.ts's
-- subscribeToDuel() just never fires, so live score updates only appear on
-- the next manual refresh/reopen instead of pushing immediately.
