
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  role text check (role in ('student','admin')) default 'student',
  coins int default 0,
  time_ms bigint default 0,
  correct int default 0,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "self read" on public.profiles for select using (true);
create policy "self update" on public.profiles for update using (auth.uid() = id);
create policy "admin update" on public.profiles for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  book text not null,
  unit int not null,
  title text not null,
  created_at timestamptz default now()
);
alter table public.sets enable row level security;
create policy "read sets" on public.sets for select using (true);
create policy "admin insert" on public.sets for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  term text not null,
  definition text not null,
  example text,
  language text default 'EN',
  created_at timestamptz default now()
);
alter table public.cards enable row level security;
create policy "read cards" on public.cards for select using (true);
create policy "admin insert cards" on public.cards for insert with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'));

create table if not exists public.progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  box int not null default 1,
  next_review timestamptz default now(),
  primary key (user_id, card_id)
);
alter table public.progress enable row level security;
create policy "own progress" on public.progress for select using (auth.uid() = user_id);
create policy "own progress upsert" on public.progress for insert with check (auth.uid() = user_id);
create policy "own progress update" on public.progress for update using (auth.uid() = user_id);

create or replace function public.add_coins(p_user_id uuid, p_amount int)
returns void language sql security definer as $$
  update public.profiles set coins = coalesce(coins,0) + p_amount where id = p_user_id;
$$;

create or replace function public.add_correct(p_user_id uuid, p_amount int)
returns void language sql security definer as $$
  update public.profiles set correct = coalesce(correct,0) + p_amount where id = p_user_id;
$$;

create or replace function public.add_study_time(p_user_id uuid, p_ms bigint)
returns void language sql security definer as $$
  update public.profiles set time_ms = coalesce(time_ms,0) + p_ms where id = p_user_id;
$$;
