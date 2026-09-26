-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles Table with Public Report & Block Counters
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  gender text check (gender in ('male', 'female', 'other')) not null,
  target_gender text check (target_gender in ('male', 'female', 'all')) default 'all',
  age int not null check (age >= 18),
  bio text default '',
  insta_handle text not null unique,
  library_card_hash text not null unique,
  photo_urls text[] default array[]::text[],
  is_verified boolean default false,
  report_count int default 0 not null,
  block_count int default 0 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Matches Table with Initiation & Media Permission Flags
create table public.matches (
  id uuid default uuid_generate_v4() primary key,
  female_id uuid references public.profiles(id) on delete cascade not null,
  male_id uuid references public.profiles(id) on delete cascade not null,
  has_female_initiated boolean default false not null,
  media_allowed boolean default false not null,
  matched_at timestamptz default now() not null,
  unique (female_id, male_id)
);

-- Blocks Table
create table public.blocks (
  id uuid default uuid_generate_v4() primary key,
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique (blocker_id, blocked_id)
);

-- Reports Table
create table public.reports (
  id uuid default uuid_generate_v4() primary key,
  reporter_id uuid references public.profiles(id) on delete cascade not null,
  reported_id uuid references public.profiles(id) on delete cascade not null,
  reason text not null,
  created_at timestamptz default now() not null
);

-- Atomic Functions for Counters
create or replace function public.handle_new_block()
returns trigger as $$
begin
  update public.profiles set block_count = block_count + 1 where id = new.blocked_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_on_block
after insert on public.blocks
for each row execute function public.handle_new_block();

create or replace function public.handle_new_report()
returns trigger as $$
begin
  update public.profiles set report_count = report_count + 1 where id = new.reported_id;
  return new;
end;
$$ language plpgsql security definer;

create trigger trigger_on_report
after insert on public.reports
for each row execute function public.handle_new_report();

-- RLS
alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

create policy "Profiles viewable except if blocked"
  on public.profiles for select to authenticated
  using (
    id not in (select blocked_id from public.blocks where blocker_id = auth.uid()) and
    id not in (select blocker_id from public.blocks where blocked_id = auth.uid())
  );

create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "View matches"
  on public.matches for select to authenticated
  using (auth.uid() = female_id or auth.uid() = male_id);

create policy "Create matches"
  on public.matches for insert to authenticated
  with check (auth.uid() = female_id or auth.uid() = male_id);

create policy "Female controls initiation & media permissions"
  on public.matches for update to authenticated
  using (auth.uid() = female_id);

create policy "Insert blocks"
  on public.blocks for insert to authenticated
  with check (auth.uid() = blocker_id);

create policy "Insert reports"
  on public.reports for insert to authenticated
  with check (auth.uid() = reporter_id);
