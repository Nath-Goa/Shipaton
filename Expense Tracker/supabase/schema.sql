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
-- part before @ in their email as a default display name.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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

-- 4. DUELS ----------------------------------------------------------------------
create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('friend', 'family')),
  status text not null default 'pending' check (status in ('pending', 'active', 'completed')),
  -- For a friend duel: exactly two entries. For a family duel: every member
  -- of each participating family. Kept as a plain array rather than a join
  -- table — a duel's roster never changes after it starts.
  participant_ids uuid[] not null,
  time_skip_votes uuid[] not null default '{}',
  starting_cash numeric not null default 100000,
  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  ends_at timestamptz
);

alter table public.duels enable row level security;

create policy "a participant can see a duel they're in"
  on public.duels for select
  using (auth.uid() = any(participant_ids));

create policy "a participant can create a duel that includes themself"
  on public.duels for insert
  with check (auth.uid() = any(participant_ids));

create policy "a participant can update a duel they're in (e.g. casting a time-skip vote)"
  on public.duels for update
  using (auth.uid() = any(participant_ids));
