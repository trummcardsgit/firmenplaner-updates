-- Clean TrummPlaner baseline, derived from schema-only migration history.
-- No production users, records, push keys or credentials are included.
-- Install only into the cleared TEST project.
begin;

-- create_trummplaner_companies_entries_rls
create extension if not exists pgcrypto;
create table if not exists public.tp_companies (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 160),
 contact text not null default '',
 phone text not null default '',
 email text not null default '',
 created_at timestamptz not null default now(),
 unique (id, owner_id)
);
create table if not exists public.tp_entries (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 company_id uuid not null,
 title text not null check (length(trim(title)) between 1 and 180),
 description text not null default '',
 kind text not null default 'task' check (kind in ('task','note')),
 status text not null default 'open' check (status in ('open','done')),
 priority text not null default 'normal' check (priority in ('low','normal','high')),
 due_at timestamptz,
 remind_at timestamptz,
 reminder_sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint tp_entries_company_owner_fk foreign key(company_id,owner_id) references public.tp_companies(id,owner_id) on delete cascade
);
create index if not exists tp_companies_owner on public.tp_companies(owner_id);
create index if not exists tp_entries_owner_due on public.tp_entries(owner_id,due_at);
create index if not exists tp_entries_owner_remind on public.tp_entries(owner_id,remind_at) where status='open';
alter table public.tp_companies enable row level security;
alter table public.tp_entries enable row level security;
revoke all on public.tp_companies, public.tp_entries from anon;
grant select,insert,update,delete on public.tp_companies,public.tp_entries to authenticated;
create policy "tp_companies_select_own" on public.tp_companies for select to authenticated using (owner_id = (select auth.uid()));
create policy "tp_companies_insert_own" on public.tp_companies for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "tp_companies_update_own" on public.tp_companies for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "tp_companies_delete_own" on public.tp_companies for delete to authenticated using (owner_id = (select auth.uid()));
create policy "tp_entries_select_own" on public.tp_entries for select to authenticated using (owner_id = (select auth.uid()));
create policy "tp_entries_insert_own" on public.tp_entries for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "tp_entries_update_own" on public.tp_entries for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "tp_entries_delete_own" on public.tp_entries for delete to authenticated using (owner_id = (select auth.uid()));

-- restrict_auth_to_admin_invites

create schema if not exists tp_private;
revoke all on schema tp_private from public, anon, authenticated;
create table if not exists public.tp_app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 assigned_at timestamptz not null default now()
);
alter table public.tp_app_admins enable row level security;
revoke all on public.tp_app_admins from anon, authenticated;
grant select on public.tp_app_admins to authenticated;
create policy tp_admins_self_read on public.tp_app_admins
 for select to authenticated using (user_id = (select auth.uid()));
-- Staging administrator must be bootstrapped separately.

create table if not exists public.tp_invites (
 email text primary key,
 invited_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 status text not null default 'pending' check (status in ('pending','sent','failed')),
 constraint tp_invites_email_normalized check (email = lower(trim(email)) and length(email) between 5 and 254)
);
create index if not exists tp_invites_admin_date_idx on public.tp_invites (invited_by,created_at);
alter table public.tp_invites enable row level security;
revoke all on public.tp_invites from anon, authenticated;
grant select on public.tp_invites to authenticated;
create policy tp_invites_admin_read on public.tp_invites
 for select to authenticated using (
 exists (select 1 from public.tp_app_admins a where a.user_id = (select auth.uid()))
 );

create or replace function tp_private.enforce_invited_accounts()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
 if coalesce(new.is_anonymous,false)
 or new.email is null
 or new.encrypted_password is not null
 or not exists (
  select 1 from public.tp_invites
  where email = lower(trim(new.email))
 ) then
  raise exception 'TrummPlaner: Registrierung nur durch Einladung'
   using errcode='P0001';
 end if;
 return new;
end;
$$;
revoke all on function tp_private.enforce_invited_accounts() from public,anon,authenticated;
drop trigger if exists tp_require_invitation on auth.users;
create trigger tp_require_invitation
  before insert on auth.users
  for each row execute function tp_private.enforce_invited_accounts();


-- allow_only_pending_sent_invitations
create or replace function tp_private.enforce_invited_accounts()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
 if coalesce(new.is_anonymous,false)
 or new.email is null
 or new.encrypted_password is not null
 or not exists (
   select 1 from public.tp_invites
   where email = lower(trim(new.email))
     and status in ('pending','sent')
 ) then
  raise exception 'TrummPlaner: Registrierung nur durch Einladung'
   using errcode='P0001';
 end if;
 return new;
end;
$$;
revoke all on function tp_private.enforce_invited_accounts() from public,anon,authenticated;

-- solutions_and_background_push_security

-- Keep resolved knowledge even when a task or its company is later removed.
create table if not exists public.tp_solutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_entry_id uuid unique references public.tp_entries(id) on delete set null,
  company_name text not null default '',
  problem_title text not null check (char_length(trim(problem_title)) between 1 and 180),
  problem_description text not null default '',
  solution_text text not null check (char_length(trim(solution_text)) between 3 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tp_solutions_owner_created on public.tp_solutions(owner_id,created_at desc);
alter table public.tp_solutions enable row level security;
revoke all on public.tp_solutions from anon;
grant select,insert,update,delete on public.tp_solutions to authenticated;
create policy "tp_solutions_read_own" on public.tp_solutions for select to authenticated
  using (owner_id=(select auth.uid()));
create policy "tp_solutions_insert_own" on public.tp_solutions for insert to authenticated
  with check (owner_id=(select auth.uid()) and
    (source_entry_id is null or exists (select 1 from public.tp_entries e where e.id=source_entry_id and e.owner_id=(select auth.uid()))));
create policy "tp_solutions_update_own" on public.tp_solutions for update to authenticated
  using (owner_id=(select auth.uid()))
  with check (owner_id=(select auth.uid()) and
    (source_entry_id is null or exists (select 1 from public.tp_entries e where e.id=source_entry_id and e.owner_id=(select auth.uid()))));
create policy "tp_solutions_delete_own" on public.tp_solutions for delete to authenticated
  using (owner_id=(select auth.uid()));
-- Atomic complete+record, honoring row policies with SECURITY INVOKER.
create or replace function public.tp_complete_task(p_entry_id uuid,p_solution text)
returns uuid
language plpgsql security invoker
set search_path=''
as $fn$
declare
  e public.tp_entries%rowtype;
  company text;
  solution_id uuid;
begin
  if auth.uid() is null then raise exception 'Bitte anmelden'; end if;
  if p_solution is null or char_length(trim(p_solution)) < 3 or char_length(p_solution) > 20000 then
    raise exception 'Bitte eine Problemlösung mit mindestens drei Zeichen eintragen';
  end if;
  select * into e from public.tp_entries
   where id=p_entry_id and owner_id=(select auth.uid()) and kind='task'
   for update;
  if not found then raise exception 'Aufgabe nicht gefunden'; end if;
  select c.name into company from public.tp_companies c
    where c.id=e.company_id and c.owner_id=(select auth.uid());
  insert into public.tp_solutions(
    owner_id,source_entry_id,company_name,problem_title,problem_description,solution_text
  ) values(
    e.owner_id,e.id,coalesce(company,''),e.title,e.description,trim(p_solution)
  )
  on conflict (source_entry_id) do update set
    company_name=excluded.company_name,
    problem_title=excluded.problem_title,
    problem_description=excluded.problem_description,
    solution_text=excluded.solution_text,
    updated_at=now()
  returning id into solution_id;
  update public.tp_entries set status='done',updated_at=now() where id=e.id and owner_id=(select auth.uid());
  return solution_id;
end;
$fn$;
revoke all on function public.tp_complete_task(uuid,text) from public,anon;
grant execute on function public.tp_complete_task(uuid,text) to authenticated;

-- One push subscription per device/browser; each belongs to exactly one user.
create table if not exists public.tp_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 endpoint text not null unique check(char_length(endpoint) between 50 and 2500 and endpoint like 'https://%'),
 p256dh text not null check (char_length(p256dh) between 30 and 300),
 auth_secret text not null check (char_length(auth_secret) between 8 and 300),
 device_name text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_push_subscriptions_owner on public.tp_push_subscriptions(owner_id);
alter table public.tp_push_subscriptions enable row level security;
revoke all on public.tp_push_subscriptions from anon;
grant select,insert,update,delete on public.tp_push_subscriptions to authenticated;
create policy "tp_push_read_own" on public.tp_push_subscriptions for select to authenticated using (owner_id=(select auth.uid()));
create policy "tp_push_insert_own" on public.tp_push_subscriptions for insert to authenticated with check(owner_id=(select auth.uid()));
create policy "tp_push_update_own" on public.tp_push_subscriptions for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "tp_push_delete_own" on public.tp_push_subscriptions for delete to authenticated using(owner_id=(select auth.uid()));

-- Private to service_role. Never read this table from a browser.
create table if not exists public.tp_push_config (
 only_row boolean primary key default true check(only_row),
 vapid_public_key text not null,
 vapid_jwk jsonb not null,
 cron_token text not null,
 created_at timestamptz not null default now()
);
alter table public.tp_push_config enable row level security;
revoke all on public.tp_push_config from public,anon,authenticated;
grant select on public.tp_push_config to service_role;

create or replace function public.tp_claim_due_reminders(p_limit integer default 50)
returns table(entry_id uuid,owner_id uuid,company_id uuid,title text,due_at timestamptz,remind_at timestamptz)
language sql security invoker set search_path=''
as $claim$
 with due as (
  select e.id from public.tp_entries e
  where e.kind='task' and e.status='open'
    and e.remind_at is not null and e.remind_at<=now()
    and e.remind_at > now()-interval '14 days'
    and (e.reminder_sent_at is null or e.reminder_sent_at<e.remind_at)
    and exists(select 1 from public.tp_push_subscriptions s where s.owner_id=e.owner_id)
  order by e.remind_at
  limit least(greatest(coalesce(p_limit,50),1),100)
  for update skip locked
 )
 update public.tp_entries t set reminder_sent_at=now()
 from due where due.id=t.id
 returning t.id,t.owner_id,t.company_id,t.title,t.due_at,t.remind_at;
$claim$;
revoke all on function public.tp_claim_due_reminders(integer) from public,anon,authenticated;
grant execute on function public.tp_claim_due_reminders(integer) to service_role;


-- push_config_service_only_policy
create policy "tp_push_config_service_role_only" on public.tp_push_config
for select to service_role using (true);

-- trummplaner_projects_documents_private_attachments
alter table public.tp_entries add constraint tp_entries_id_owner_unique unique (id,owner_id);

create table public.tp_projects(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 company_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 180),
 summary text not null default '',
 content_html text not null default '',
 status text not null default 'active' check(status in ('active','paused','done')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint tp_projects_owner_company_fk foreign key(company_id,owner_id)
   references public.tp_companies(id,owner_id) on delete cascade,
 constraint tp_projects_id_owner_unique unique(id,owner_id),
 constraint tp_projects_content_limit check(length(content_html)<=500000)
);
create index tp_projects_owner_company on public.tp_projects(owner_id,company_id,updated_at desc);
alter table public.tp_projects enable row level security;
revoke all on public.tp_projects from anon;
grant select,insert,update,delete on public.tp_projects to authenticated;
create policy tp_projects_read_own on public.tp_projects for select to authenticated using(owner_id=(select auth.uid()));
create policy tp_projects_add_own on public.tp_projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy tp_projects_edit_own on public.tp_projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy tp_projects_remove_own on public.tp_projects for delete to authenticated using(owner_id=(select auth.uid()));

create table public.tp_documents(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 entry_id uuid,
 project_id uuid,
 title text not null check(length(trim(title)) between 1 and 180),
 content_html text not null default '',
 storage_path text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint tp_docs_single_attachment check(not (entry_id is not null and project_id is not null)),
 constraint tp_docs_entry_owner_fk foreign key(entry_id,owner_id)
   references public.tp_entries(id,owner_id) on delete set null (entry_id),
 constraint tp_docs_project_owner_fk foreign key(project_id,owner_id)
   references public.tp_projects(id,owner_id) on delete set null (project_id),
 constraint tp_docs_html_limit check(length(content_html)<=500000)
);
create index tp_documents_owner on public.tp_documents(owner_id,updated_at desc);
alter table public.tp_documents enable row level security;
revoke all on public.tp_documents from anon;
grant select,insert,update,delete on public.tp_documents to authenticated;
create policy tp_docs_read_own on public.tp_documents for select to authenticated using(owner_id=(select auth.uid()));
create policy tp_docs_add_own on public.tp_documents for insert to authenticated with check(owner_id=(select auth.uid()));
create policy tp_docs_edit_own on public.tp_documents for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy tp_docs_remove_own on public.tp_documents for delete to authenticated using(owner_id=(select auth.uid()));

create table public.tp_attachments(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 entry_id uuid,
 project_id uuid,
 file_name text not null check(length(trim(file_name)) between 1 and 250),
 storage_path text not null unique,
 mime_type text not null default 'application/octet-stream',
 file_size bigint not null check(file_size between 0 and 15728640),
 created_at timestamptz not null default now(),
 constraint tp_attach_parent_required check((entry_id is not null) <> (project_id is not null)),
 constraint tp_attach_entry_owner_fk foreign key(entry_id,owner_id)
   references public.tp_entries(id,owner_id) on delete cascade,
 constraint tp_attach_project_owner_fk foreign key(project_id,owner_id)
   references public.tp_projects(id,owner_id) on delete cascade
);
create index tp_attachments_owner_entry on public.tp_attachments(owner_id,entry_id);
create index tp_attachments_owner_project on public.tp_attachments(owner_id,project_id);
alter table public.tp_attachments enable row level security;
revoke all on public.tp_attachments from anon;
grant select,insert,delete on public.tp_attachments to authenticated;
create policy tp_attach_read_own on public.tp_attachments for select to authenticated using(owner_id=(select auth.uid()));
create policy tp_attach_add_own on public.tp_attachments for insert to authenticated with check(owner_id=(select auth.uid()));
create policy tp_attach_remove_own on public.tp_attachments for delete to authenticated using(owner_id=(select auth.uid()));

-- Private Supabase Storage bucket access; bucket is created via the Storage API.
create policy tp_private_storage_read on storage.objects for select to authenticated
 using (bucket_id='tp-private-files' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text);
create policy tp_private_storage_add on storage.objects for insert to authenticated
 with check (bucket_id='tp-private-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy tp_private_storage_change on storage.objects for update to authenticated
 using (bucket_id='tp-private-files' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text)
 with check (bucket_id='tp-private-files' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy tp_private_storage_remove on storage.objects for delete to authenticated
 using (bucket_id='tp-private-files' and (storage.foldername(name))[1]=(select auth.uid())::text and owner_id=(select auth.uid())::text);

alter table public.tp_projects add constraint tp_projects_id_company_owner_unique unique(id,company_id,owner_id);
alter table public.tp_entries add column project_id uuid;
alter table public.tp_entries add constraint tp_entries_project_only_for_tasks_check check(kind='task' or project_id is null);
alter table public.tp_entries add constraint tp_entries_project_same_company_owner_fk foreign key(project_id,company_id,owner_id) references public.tp_projects(id,company_id,owner_id) on delete set null(project_id);
insert into storage.buckets(id,name,public,file_size_limit) values('tp-private-files','tp-private-files',false,15728640) on conflict(id) do nothing;

create table public.tp_game_profiles(owner_id uuid not null,stage text not null default 'normal',prestige integer not null default 0,level integer not null default 1,xp_in_level integer not null default 0,total_xp bigint not null default 0,tasks_rewarded integer not null default 0,updated_at timestamptz not null default now());
create table public.tp_game_xp_events(id bigint generated always as identity,owner_id uuid not null,entry_id uuid not null,entry_title text not null default '',xp integer not null,rank_before integer not null,rank_after integer not null,prestige integer not null,stage text not null,awarded_at timestamptz not null default now());
alter table public.tp_game_profiles add constraint tp_game_profiles_level_check CHECK (((level >= 1) AND (level <= 1000)));
alter table public.tp_game_profiles add constraint tp_game_profiles_prestige_check CHECK (((prestige >= 0) AND (prestige <= 10)));
alter table public.tp_game_profiles add constraint tp_game_profiles_stage_check CHECK ((stage = ANY (ARRAY['normal'::text, 'master'::text])));
alter table public.tp_game_profiles add constraint tp_game_profiles_tasks_rewarded_check CHECK ((tasks_rewarded >= 0));
alter table public.tp_game_profiles add constraint tp_game_profiles_total_xp_check CHECK ((total_xp >= 0));
alter table public.tp_game_profiles add constraint tp_game_profiles_xp_in_level_check CHECK ((xp_in_level >= 0));
alter table public.tp_game_profiles add constraint tp_game_stage_valid CHECK ((((stage = 'normal'::text) AND ((level >= 1) AND (level <= 55))) OR ((stage = 'master'::text) AND (prestige = 10) AND ((level >= 1) AND (level <= 1000)))));
alter table public.tp_game_profiles add constraint tp_game_profiles_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tp_game_profiles add constraint tp_game_profiles_pkey PRIMARY KEY (owner_id);
alter table public.tp_game_xp_events add constraint tp_game_xp_events_xp_check CHECK (((xp >= 75) AND (xp <= 250)));
alter table public.tp_game_xp_events add constraint tp_game_xp_events_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.tp_game_xp_events add constraint tp_game_xp_events_pkey PRIMARY KEY (id);
alter table public.tp_game_xp_events add constraint tp_game_xp_events_owner_id_entry_id_key UNIQUE (owner_id, entry_id);
alter table public.tp_game_profiles enable row level security;
alter table public.tp_game_xp_events enable row level security;
revoke all on public.tp_game_profiles,public.tp_game_xp_events from public,anon,authenticated;
grant select on public.tp_game_profiles,public.tp_game_xp_events to authenticated;
create policy tp_game_profiles_owner_read on public.tp_game_profiles for select to authenticated using(owner_id=(select auth.uid()));
create policy tp_game_events_owner_read on public.tp_game_xp_events for select to authenticated using(owner_id=(select auth.uid()));
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
CREATE OR REPLACE FUNCTION public.tp_game_enter_prestige()
 RETURNS tp_game_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.tp_game_profiles%rowtype;
begin
 if (select auth.uid()) is null then raise exception 'Bitte anmelden'; end if;
 select * into p from public.tp_game_profiles
  where owner_id=(select auth.uid()) for update;
 if not found then raise exception 'Schließe zuerst Aufgaben ab, um XP zu erhalten'; end if;
 if p.stage <> 'normal' or p.level <> 55 then
  raise exception 'Prestige ist erst ab Level 55 verfügbar';
 end if;
 if p.prestige<10 then
  update public.tp_game_profiles
   set prestige=prestige+1,level=1,xp_in_level=0,updated_at=now()
   where owner_id=p.owner_id returning * into p;
 else
  -- CoD-inspired Prestige Master has no last level reset:
  -- complete Prestige 10 at Level 55, then continue 55 -> 1000.
  update public.tp_game_profiles
   set stage='master',level=55,xp_in_level=0,updated_at=now()
   where owner_id=p.owner_id returning * into p;
 end if;
 return p;
end;
$function$
;
revoke all on function public.tp_game_reward_task(),public.tp_game_enter_prestige() from public,anon,authenticated;
grant execute on function public.tp_game_enter_prestige() to authenticated;
CREATE TRIGGER tp_game_reward_on_completion AFTER UPDATE OF status, kind ON public.tp_entries FOR EACH ROW WHEN (((new.kind = 'task'::text) AND (new.status = 'done'::text) AND ((old.status IS DISTINCT FROM 'done'::text) OR (old.kind IS DISTINCT FROM 'task'::text)))) EXECUTE FUNCTION tp_game_reward_task();
CREATE TRIGGER tp_game_reward_on_insert AFTER INSERT ON public.tp_entries FOR EACH ROW WHEN (((new.kind = 'task'::text) AND (new.status = 'done'::text))) EXECUTE FUNCTION tp_game_reward_task();


-- tp_trophy_catalog_and_awards
create table public.tp_trophy_definitions(id integer primary key,title text not null,description text not null,rarity text not null check(rarity in ('bronze','silver','gold','platinum')),xp_reward integer not null check(xp_reward in (50,150,500,1000)),category text not null,is_secret boolean not null,target integer not null check(target>0)); alter table public.tp_trophy_definitions enable row level security; revoke all on public.tp_trophy_definitions from anon,authenticated; grant select on public.tp_trophy_definitions to authenticated; create policy tp_trophy_catalog_read on public.tp_trophy_definitions for select to authenticated using(true); create table public.tp_user_trophies(owner_id uuid not null references auth.users(id) on delete cascade,trophy_id integer not null references public.tp_trophy_definitions(id),unlocked_at timestamptz not null default now(),primary key(owner_id,trophy_id)); alter table public.tp_user_trophies enable row level security; revoke all on public.tp_user_trophies from anon,authenticated; grant select on public.tp_user_trophies to authenticated; create policy tp_own_trophies_read on public.tp_user_trophies for select to authenticated using(owner_id=(select auth.uid())); insert into public.tp_trophy_definitions values (1,'Der erste Schritt','Erste Aufgabe erledigen','bronze',50,'tasks',false,1),
(2,'Jetzt geht’s los','10 Aufgaben erledigen','bronze',50,'tasks',false,10),
(3,'Fleißiges Bienchen','25 Aufgaben erledigen','bronze',50,'tasks',false,25),
(4,'Arbeitstier','50 Aufgaben erledigen','silver',150,'tasks',false,50),
(5,'Die Maschine','100 Aufgaben erledigen','silver',150,'tasks',false,100),
(6,'Unaufhaltsam','250 Aufgaben erledigen','gold',500,'tasks',false,250),
(7,'Der Terminator','500 Aufgaben erledigen','gold',500,'tasks',false,500),
(8,'Legende der Arbeit','1000 Aufgaben erledigen','platinum',1000,'tasks',false,1000),
(9,'Multitasking-Monster','5 Aufgaben an einem Tag erledigen','bronze',50,'tasks',false,5),
(10,'Absoluter Ausnahmezustand','20 Aufgaben an einem Tag erledigen','gold',500,'tasks',false,20),
(11,'Pünktlich wie die Feuerwehr','Erste Aufgabe vor Fälligkeit erledigen','bronze',50,'time',false,1),
(12,'Der Zeitreisende','Aufgabe 7 Tage vor Fälligkeit erledigen','silver',150,'time',false,1),
(13,'In letzter Sekunde','Aufgabe in den letzten 5 Minuten vor Fälligkeit erledigen','silver',150,'time',false,1),
(14,'Besser spät als nie','Überfällige Aufgabe erledigen','bronze',50,'time',false,1),
(15,'Altlastenbeseitigung','30 Tage überfällige Aufgabe erledigen','silver',150,'time',false,1),
(16,'Frühaufsteher','Aufgabe vor 07:00 Uhr erledigen','bronze',50,'time',false,1),
(17,'Nachteule','Aufgabe nach 22:00 Uhr erledigen','bronze',50,'time',false,1),
(18,'Freitag, Feierabend!','Freitags alle offenen Aufgaben erledigen','silver',150,'time',false,1),
(19,'Deadline-Dominator','100 Aufgaben rechtzeitig erledigen','gold',500,'time',false,100),
(20,'Meister der Zeit','30 Aufgaben in Folge rechtzeitig erledigen','platinum',1000,'time',false,30),
(21,'Geistesblitz','Erste Notiz erstellen','bronze',50,'knowledge',false,1),
(22,'Das wandelnde Lexikon','50 Notizen erstellen','silver',150,'knowledge',false,50),
(23,'Sherlock Holmes','Erste Lösung dokumentieren','bronze',50,'knowledge',false,1),
(24,'Problem? Welches Problem?','25 Lösungen dokumentieren','silver',150,'knowledge',false,25),
(25,'IT-Gott','100 Lösungen dokumentieren','gold',500,'knowledge',false,100),
(26,'Projektmanager','Erstes Projekt erstellen','bronze',50,'knowledge',false,1),
(27,'Mission erfüllt','Erstes Projekt abschließen','silver',150,'knowledge',false,1),
(28,'Generaldirektor','25 Projekte abschließen','gold',500,'knowledge',false,25),
(29,'Der Schriftsteller','10 Word-Dokumente erstellen','silver',150,'knowledge',false,10),
(30,'Dokumentationslegende','100 Word-Dokumente erstellen','gold',500,'knowledge',false,100),
(31,'Vom Tellerwäscher zum Millionär','Level 10 erreichen','bronze',50,'career',false,10),
(32,'Kein Anfänger mehr','Level 25 erreichen','bronze',50,'career',false,25),
(33,'Bereit für mehr','Level 55 erreichen','silver',150,'career',false,55),
(34,'Eine neue Ära','Prestige 1 erreichen','silver',150,'career',false,1),
(35,'Veteran','Prestige 5 erreichen','gold',500,'career',false,5),
(36,'Elite der Elite','Prestige 10 erreichen','gold',500,'career',false,10),
(37,'Prestige-Meister','Meisterrang freischalten','platinum',1000,'career',false,1),
(38,'Die halbe Ewigkeit','Meister-Level 500 erreichen','platinum',1000,'career',false,500),
(39,'Endgegner','Meister-Level 1000 erreichen','platinum',1000,'career',false,1000),
(40,'XP-Millionär','1.000.000 Gesamt-XP verdienen','platinum',1000,'career',false,1000000),
(41,'Hast du es schon neu gestartet?','Lösung mit Neustart dokumentieren','bronze',50,'secret',true,1),
(42,'Der Druckerflüsterer','10 Drucker-Aufgaben erledigen','silver',150,'secret',true,10),
(43,'Netzwerk-Ninja','10 Netzwerk-Aufgaben erledigen','silver',150,'secret',true,10),
(44,'Glückspilz','250 XP bei einer Aufgabe erhalten','bronze',50,'secret',true,1),
(45,'Pechvogel','75 XP bei einer Aufgabe erhalten','bronze',50,'secret',true,1),
(46,'Jackpot','Dreimal hintereinander mindestens 230 XP erhalten','gold',500,'secret',true,3),
(47,'Speedrun','3 Aufgaben in 60 Sekunden erledigen','silver',150,'secret',true,3),
(48,'Das Imperium','Aufgaben für 5 Firmen an einem Tag erledigen','gold',500,'secret',true,5),
(49,'Feierabend-Boss','Um 17:00 Uhr eine Aufgabe erledigen','silver',150,'secret',true,1),
(50,'Mr. TrummPlaner','Alle anderen 49 Trophäen freischalten','platinum',1000,'secret',true,49);

-- tp_trophy_automatic_unlock
create schema if not exists tp_private;
revoke all on schema tp_private from public,anon,authenticated;
create or replace function tp_private.trophy_metrics(u uuid) returns bigint[] language sql stable security invoker set search_path='' as $$
with ev as (select x.*,e.due_at,e.company_id,e.description, x.awarded_at at time zone 'Europe/Vienna' as lt from public.tp_game_xp_events x left join public.tp_entries e on e.id=x.entry_id and e.owner_id=u where x.owner_id=u),
days as (select lt::date,count(*) n,count(distinct company_id) firms from ev group by lt::date),
streak as (select *,sum(case when due_at is null or awarded_at>due_at then 1 else 0 end) over(order by awarded_at,id) grp,lag(xp,1) over(order by awarded_at,id) prev1,lag(xp,2) over(order by awarded_at,id) prev2,lag(awarded_at,2) over(order by awarded_at,id) third from ev),
p as (select * from public.tp_game_profiles where owner_id=u),
s as (select count(*) n,count(*) filter(where solution_text ilike '%neustart%') restarts from public.tp_solutions where owner_id=u),
pr as (select count(*) n,count(*) filter(where status in ('done','completed','closed')) finished from public.tp_projects where owner_id=u),
d as (select count(*) n from public.tp_documents where owner_id=u),
n as (select count(*) n from public.tp_entries where owner_id=u and kind='note'),
a as (select count(*) n,count(*) filter(where awarded_at<=due_at) timely,count(*) filter(where due_at-awarded_at>=interval '7 days') early,count(*) filter(where due_at-awarded_at between interval '0' and interval '5 minutes') lastminute,count(*) filter(where awarded_at>due_at) late,count(*) filter(where awarded_at-due_at>=interval '30 days') verylate,count(*) filter(where lt::time<time '07:00') morning,count(*) filter(where lt::time>=time '22:00') night,count(*) filter(where lt::time>=time '17:00' and lt::time<time '17:01') evening,count(*) filter(where extract(isodow from lt)=5) friday,count(*) filter(where concat(entry_title,' ',description) ilike '%drucker%') printer,count(*) filter(where concat(entry_title,' ',description) ilike '%netzwerk%') network,count(*) filter(where xp=250) lucky,count(*) filter(where xp=75) unlucky from ev)
select array[a.n,a.n,a.n,a.n,a.n,a.n,a.n,a.n,coalesce((select max(n) from days),0),coalesce((select max(n) from days),0),a.timely,a.early,a.lastminute,a.late,a.verylate,a.morning,a.night,case when a.friday>0 and not exists(select 1 from public.tp_entries where owner_id=u and kind='task' and status<>'done') and extract(isodow from now() at time zone 'Europe/Vienna')=5 then 1 else 0 end,a.timely,coalesce((select max(c) from (select count(*) c from streak where awarded_at<=due_at group by grp) t),0),n.n,n.n,s.n,s.n,s.n,pr.n,pr.finished,pr.finished,d.n,d.n,coalesce((select case when prestige>0 or stage='master' then 55 else level end from p),0),coalesce((select case when prestige>0 or stage='master' then 55 else level end from p),0),coalesce((select case when prestige>0 or stage='master' then 55 else level end from p),0),coalesce((select prestige from p),0),coalesce((select prestige from p),0),coalesce((select prestige from p),0),coalesce((select (stage='master')::int from p),0),coalesce((select case when stage='master' then level else 0 end from p),0),coalesce((select case when stage='master' then level else 0 end from p),0),coalesce((select total_xp from p),0),s.restarts,a.printer,a.network,a.lucky,a.unlucky,case when exists(select 1 from streak where xp>=230 and prev1>=230 and prev2>=230) then 3 else 0 end,case when exists(select 1 from streak where awarded_at-third<=interval '60 seconds') then 3 else 0 end,coalesce((select max(firms) from days),0),a.evening,(select count(*) from public.tp_user_trophies where owner_id=u and trophy_id<>50)]::bigint[] from a,n,s,pr,d;
$$;
revoke all on function tp_private.trophy_metrics(uuid) from public,anon,authenticated;
create or replace function public.tp_sync_trophies() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); m bigint[]; t record; p public.tp_game_profiles%rowtype; gain integer; req integer; cap integer; lvl integer; xp integer; awarded integer; fresh integer[]:='{}'; pass integer;
begin
if u is null then raise exception 'Bitte anmelden'; end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,81));
insert into public.tp_game_profiles(owner_id) values(u) on conflict(owner_id) do nothing;
select * into p from public.tp_game_profiles where owner_id=u for update;
for pass in 1..51 loop
m:=tp_private.trophy_metrics(u);
gain:=0;
for t in select * from public.tp_trophy_definitions where m[id]>=target order by id loop
insert into public.tp_user_trophies(owner_id,trophy_id) values(u,t.id) on conflict do nothing;
get diagnostics awarded=row_count;
if awarded=1 then gain:=gain+t.xp_reward;fresh:=array_append(fresh,t.id);end if;
end loop;
exit when gain=0;
lvl:=p.level;xp:=p.xp_in_level+gain;cap:=case when p.stage='master' then 1000 else 55 end;
while lvl<cap loop
req:=case when p.stage='master' then 250+5*(lvl-1) else 150+12*(lvl-1) end;
exit when xp<req; xp:=xp-req;lvl:=lvl+1;
end loop;
if lvl=cap then xp:=0;end if;
update public.tp_game_profiles set level=lvl,xp_in_level=xp,total_xp=total_xp+gain,updated_at=now() where owner_id=u returning * into p;
end loop;
m:=tp_private.trophy_metrics(u);
return jsonb_build_object('new',to_jsonb(fresh),'profile',to_jsonb(p),'trophies',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'title',case when d.is_secret and a.trophy_id is null then '???' else d.title end,'description',case when d.is_secret and a.trophy_id is null then 'Geheime Trophäe' else d.description end,'rarity',d.rarity,'category',d.category,'xp_reward',d.xp_reward,'target',d.target,'progress',case when d.is_secret and a.trophy_id is null then 0 else least(m[d.id],d.target) end,'unlocked_at',a.unlocked_at) order by d.id),'[]'::jsonb) from public.tp_trophy_definitions d left join public.tp_user_trophies a on a.trophy_id=d.id and a.owner_id=u));
end;$$;
revoke all on function public.tp_sync_trophies() from public,anon,authenticated;
grant execute on function public.tp_sync_trophies() to authenticated;

commit;
