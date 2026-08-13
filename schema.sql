-- MANDATE — Supabase schema
-- Run this in the Supabase SQL Editor.
-- Anonymous auth can be enabled for frictionless browser cloud saves.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Prime Minister',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_name text not null default 'Main Save',
  country_name text not null default 'Avalon',
  current_week integer not null default 1 check (current_week > 0),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, slot_name)
);

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  short_name text,
  colour text not null default '#888888',
  ideology text,
  leader_name text,
  seats integer not null default 0 check (seats >= 0),
  polling numeric(5,2) not null default 0,
  approval numeric(5,2) not null default 50,
  created_at timestamptz not null default now(),
  unique(game_id,name)
);

create table if not exists public.constituencies (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  region text,
  electorate integer not null default 70000,
  incumbent_party text,
  marginality numeric(6,2) not null default 10,
  local_approval numeric(5,2) not null default 50,
  priorities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(game_id,name)
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  title text not null,
  category text not null,
  description text,
  stage integer not null default 0 check (stage between 0 and 5),
  support numeric(5,2) not null default 50,
  cost_bn numeric(10,2) not null default 0,
  status text not null default 'active' check (status in ('active','passed','failed','withdrawn')),
  effects jsonb not null default '{}'::jsonb,
  introduced_week integer,
  passed_week integer,
  created_at timestamptz not null default now()
);

create table if not exists public.divisions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete cascade,
  week integer not null,
  stage text,
  ayes integer not null default 0,
  noes integer not null default 0,
  abstentions integer not null default 0,
  government_result text check (government_result in ('win','loss','free_vote')),
  created_at timestamptz not null default now()
);

create table if not exists public.cabinet_members (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null,
  role text not null,
  competence integer not null default 60 check (competence between 0 and 100),
  loyalty integer not null default 60 check (loyalty between 0 and 100),
  popularity integer not null default 50 check (popularity between 0 and 100),
  is_active boolean not null default true,
  appointed_week integer not null default 1,
  dismissed_week integer,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  week integer not null,
  type text not null,
  title text not null,
  body text,
  severity integer check (severity between 1 and 5),
  status text not null default 'active' check (status in ('active','resolved','expired')),
  options jsonb not null default '[]'::jsonb,
  outcome jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.polling_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  week integer not null,
  national_approval numeric(5,2),
  party_polling jsonb not null default '{}'::jsonb,
  seat_projection jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(game_id,week)
);

create table if not exists public.economic_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  week integer not null,
  gdp_growth numeric(6,3),
  inflation numeric(6,3),
  unemployment numeric(6,3),
  debt_bn numeric(12,2),
  deficit_bn numeric(12,2),
  wage_growth numeric(6,3),
  nhs_wait_weeks numeric(6,2),
  migration_thousands numeric(12,2),
  crime_index numeric(6,2),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(game_id,week)
);


create table if not exists public.constitutional_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  process_type text not null check (process_type in ('snap_election','resignation')),
  stage text not null,
  scheduled_date date,
  completed_date date,
  monarch_type text check (monarch_type in ('King','Queen')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  week integer not null,
  category text not null,
  headline text not null,
  body text,
  sentiment numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_games_user on public.games(user_id);
create index if not exists idx_parties_game on public.parties(game_id);
create index if not exists idx_constituencies_game on public.constituencies(game_id);
create index if not exists idx_bills_game on public.bills(game_id);
create index if not exists idx_events_game_status on public.events(game_id,status);
create index if not exists idx_news_game_week on public.news_items(game_id,week desc);
create index if not exists idx_constitutional_game on public.constitutional_events(game_id,process_type,scheduled_date);

-- Updated-at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at before update on public.games
for each row execute function public.set_updated_at();

-- Automatically create a profile after auth signup / anonymous auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name','Prime Minister'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS: every save is private to its owner.
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.parties enable row level security;
alter table public.constituencies enable row level security;
alter table public.bills enable row level security;
alter table public.divisions enable row level security;
alter table public.cabinet_members enable row level security;
alter table public.events enable row level security;
alter table public.polling_snapshots enable row level security;
alter table public.economic_snapshots enable row level security;
alter table public.news_items enable row level security;
alter table public.constitutional_events enable row level security;

create policy "profiles own row" on public.profiles
for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "games own rows" on public.games
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Child rows are accessible only when the parent game belongs to the current user.
create policy "parties through own game" on public.parties for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "constituencies through own game" on public.constituencies for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "bills through own game" on public.bills for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "divisions through own game" on public.divisions for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "cabinet through own game" on public.cabinet_members for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "events through own game" on public.events for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "polls through own game" on public.polling_snapshots for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "economy through own game" on public.economic_snapshots for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));

create policy "news through own game" on public.news_items for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));


create policy "constitutional events through own game" on public.constitutional_events for all
using (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()))
with check (exists(select 1 from public.games g where g.id=game_id and g.user_id=auth.uid()));
