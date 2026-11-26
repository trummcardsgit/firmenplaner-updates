-- Synthetic, isolated CI database. No production data or credentials.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated,service_role,anon;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
grant usage on schema storage to authenticated;
grant select,insert,delete on storage.objects to authenticated;
create table public.tp_app_admins(user_id uuid primary key references auth.users(id));
create table public.tp_companies(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id),name text not null check(length(trim(name)) between 1 and 160),created_at timestamptz default now(),unique(id,owner_id));
create table public.tp_entries(id uuid primary key default gen_random_uuid(),owner_id uuid not null,company_id uuid not null,title text not null check(length(trim(title)) between 1 and 180),description text not null default '',kind text default 'task',status text default 'open',priority text default 'normal' check(priority in ('low','normal','high')),updated_at timestamptz default now(),unique(id,owner_id),foreign key(company_id,owner_id) references public.tp_companies(id,owner_id) on delete cascade);
create table public.tp_solutions(id uuid primary key default gen_random_uuid(),owner_id uuid not null,source_entry_id uuid unique references public.tp_entries(id) on delete set null,company_name text,problem_title text,problem_description text,solution_text text);
create table public.tp_game_profiles(owner_id uuid primary key,stage text default 'normal',prestige int default 0,level int default 1,xp_in_level int default 0,total_xp bigint default 0,tasks_rewarded int default 0,updated_at timestamptz default now());
create table public.tp_game_xp_events(id bigint generated always as identity primary key,owner_id uuid,entry_id uuid,entry_title text,xp int,rank_before int,rank_after int,prestige int,stage text,awarded_at timestamptz default now(),unique(owner_id,entry_id));
CREATE OR REPLACE FUNCTION public.tp_game_reward_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.tp_game_profiles%rowtype;
 gain integer; current_level integer; current_xp integer;
 requirement integer; cap integer;
begin
 if new.kind is distinct from 'task' or new.status is distinct from 'done' then return new; end if;
 if TG_OP='UPDATE' then
  if old.kind='task' and old.status='done' then return new; end if;
 end if;
 insert into public.tp_game_profiles(owner_id) values(new.owner_id)
 on conflict (owner_id) do nothing;
 select * into p from public.tp_game_profiles where owner_id=new.owner_id for update;
 if exists(select 1 from public.tp_game_xp_events
           where owner_id=new.owner_id and entry_id=new.id) then return new; end if;
 gain:=75+floor(random()*176)::integer;
 current_level:=p.level;current_xp:=p.xp_in_level+gain;
 cap:=case when p.stage='master' then 1000 else 55 end;
 while current_level<cap loop
  requirement:=case when p.stage='master' then 250+5*(current_level-1)
                    else 150+12*(current_level-1) end;
  exit when current_xp<requirement;
  current_xp:=current_xp-requirement;
  current_level:=current_level+1;
 end loop;
 if current_level=cap then current_xp:=0;end if;
 update public.tp_game_profiles set
  level=current_level,xp_in_level=current_xp,total_xp=total_xp+gain,
  tasks_rewarded=tasks_rewarded+1,updated_at=now()
 where owner_id=new.owner_id;
 insert into public.tp_game_xp_events(owner_id,entry_id,entry_title,xp,
                                      rank_before,rank_after,prestige,stage)
 values(new.owner_id,new.id,left(new.title,180),gain,
        p.level,current_level,p.prestige,p.stage);
 return new;
end;
$function$
;
create trigger tp_game_reward_on_completion after update of status,kind on public.tp_entries for each row when(new.kind='task' and new.status='done' and (old.status is distinct from 'done' or old.kind is distinct from 'task')) execute function public.tp_game_reward_task();
create trigger tp_game_reward_on_insert after insert on public.tp_entries for each row when(new.kind='task' and new.status='done') execute function public.tp_game_reward_task();
do $$ declare t text; begin
 foreach t in array array['tp_companies','tp_entries','tp_solutions','tp_game_profiles','tp_game_xp_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy own on public.%I for select to authenticated using (owner_id=auth.uid())',t);
 end loop;
end $$;
grant insert,update,delete on public.tp_entries,public.tp_solutions to authenticated;
create policy entry_update on public.tp_entries for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy solution_insert on public.tp_solutions for insert to authenticated with check(owner_id=auth.uid());
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','admin@example.invalid'),
 ('00000000-0000-0000-0000-000000000002','employee2@example.invalid'),
 ('00000000-0000-0000-0000-000000000003','employee3@example.invalid'),
 ('00000000-0000-0000-0000-000000000004','inactive@example.invalid');
insert into public.tp_app_admins values('00000000-0000-0000-0000-000000000001');

-- Simulate the two existing privileged RPCs so the hardening migration actually exercises its rewrite.
create function public.tp_game_enter_prestige() returns public.tp_game_profiles language plpgsql security definer set search_path='' as $$
begin
 return null;
end;
$$;
create function public.tp_sync_trophies() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 return '{}'::jsonb;
end;
$$;
revoke all on function public.tp_game_enter_prestige(),public.tp_sync_trophies() from public,anon;
grant execute on function public.tp_game_enter_prestige(),public.tp_sync_trophies() to authenticated;
insert into storage.buckets(id,name,public) values('tp-private-files','tp-private-files',false);
create policy fixture_private_storage on storage.objects for select to authenticated using(bucket_id='tp-private-files' and (storage.foldername(name))[1]=auth.uid()::text);
insert into storage.objects(bucket_id,name) values('tp-private-files','00000000-0000-0000-0000-000000000002/test.pdf');
