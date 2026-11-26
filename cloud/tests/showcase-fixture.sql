create table if not exists public.tp_user_trophies(owner_id uuid references auth.users(id),trophy_id integer,unlocked_at timestamptz default now(),primary key(owner_id,trophy_id));
alter table public.tp_user_trophies enable row level security;
grant select on public.tp_user_trophies to authenticated;
create policy showcase_fixture_own on public.tp_user_trophies for select to authenticated using(owner_id=auth.uid());
