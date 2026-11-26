-- Shared company master. Apply to enterprise TEST after enterprise-hardening.
begin;
lock table public.tp_companies,public.tp_ticket_companies,public.tp_tickets in access exclusive mode;
-- Preserve the existing company IDs and map each historical ticket company.
create temporary table company_merge_map(old_id bigint primary key,new_id uuid not null) on commit drop;
do $$ declare c record; target uuid; creator uuid; matches int; begin
 select user_id into creator from public.tp_app_admins order by user_id limit 1;
 for c in select * from public.tp_ticket_companies order by id loop
  select count(*) into matches from public.tp_companies where lower(trim(name))=lower(trim(c.name));
  if matches>1 then raise exception 'Ambiguous existing company; reconcile before migration: %',c.name; end if;
  select id into target from public.tp_companies where lower(trim(name))=lower(trim(c.name));
  if target is null then
   if creator is null or length(trim(c.name))>160 then raise exception 'Company requires manual migration: %',c.name; end if;
   insert into public.tp_companies(owner_id,name) values(creator,trim(c.name)) returning id into target;
  end if;
  insert into company_merge_map values(c.id,target);
 end loop;
end $$;
-- Personal records retain their owner policies, but may reference any shared firm.
do $$ declare c record; begin
 for c in select conrelid::regclass as tbl,conname from pg_constraint where confrelid='public.tp_companies'::regclass and contype='f' and cardinality(conkey)=2 loop
  execute format('alter table %s drop constraint %I',c.tbl,c.conname);
  execute format('alter table %s add constraint %I foreign key(company_id) references public.tp_companies(id) on delete restrict',c.tbl,c.conname);
 end loop;
end $$;
-- Keep shared firms when a creator's user account is removed.
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.tp_companies'::regclass and confrelid='auth.users'::regclass and contype='f' loop
  execute format('alter table public.tp_companies drop constraint %I',c.conname);
 end loop;
end $$;
alter table public.tp_companies alter column owner_id drop not null;
alter table public.tp_companies add constraint tp_companies_creator_fk foreign key(owner_id) references auth.users(id) on delete set null;
-- Convert ticket company IDs without losing ticket records.
alter table public.tp_tickets add column shared_company_id uuid;
update public.tp_tickets t set shared_company_id=m.new_id from company_merge_map m where m.old_id=t.company_id;
alter table public.tp_tickets alter column shared_company_id set not null;
alter table public.tp_tickets drop column company_id;
alter table public.tp_tickets rename column shared_company_id to company_id;
alter table public.tp_tickets add constraint tp_tickets_shared_company_fk foreign key(company_id) references public.tp_companies(id) on delete restrict;
create index tp_tickets_shared_company_idx on public.tp_tickets(company_id);
-- Update accepted-ticket personal task references to the same canonical firm.
update public.tp_entries e set company_id=t.company_id from public.tp_ticket_task_links l join public.tp_tickets t on t.id=l.ticket_id where e.id=l.entry_id and e.owner_id=l.owner_id and e.company_id is distinct from t.company_id;
-- Replace all company policies; never relax private entry/project policies.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='tp_companies' loop execute format('drop policy %I on public.tp_companies',p.policyname);end loop;
end $$;
alter table public.tp_companies enable row level security;
create policy shared_company_read on public.tp_companies for select to authenticated using(tp_private.enterprise_member());
create policy shared_company_insert on public.tp_companies for insert to authenticated with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy shared_company_edit on public.tp_companies for update to authenticated using(tp_private.enterprise_member() and (owner_id=(select auth.uid()) or tp_private.enterprise_admin())) with check(tp_private.enterprise_member() and (owner_id=(select auth.uid()) or tp_private.enterprise_admin()));
create policy shared_company_delete on public.tp_companies for delete to authenticated using(tp_private.enterprise_admin());
revoke all on public.tp_companies from anon;
grant select,insert,delete on public.tp_companies to authenticated;
revoke update on public.tp_companies from authenticated;
-- Grant update only on editable fields, not creator/ID. Fixture has only name.
do $$ declare cols text; begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns where table_schema='public' and table_name='tp_companies' and column_name in ('name','contact','phone','email');
 execute 'grant update ('||cols||') on public.tp_companies to authenticated';
end $$;
-- Old PWA builds retain their read interface, but the data source is the same.
alter table public.tp_ticket_companies rename to tp_ticket_companies_legacy;
revoke all on public.tp_ticket_companies_legacy from public,anon,authenticated;
create view public.tp_ticket_companies with (security_invoker=true) as select id,name,true as active from public.tp_companies;
revoke all on public.tp_ticket_companies from public,anon;
grant select on public.tp_ticket_companies to authenticated,service_role;
-- Replace ticket creation with the UUID-based canonical company reference.
do $$ declare d text; begin
 d:=pg_get_functiondef('public.tp_create_ticket(bigint,text,text,text,uuid[])'::regprocedure);
 d:=replace(d,'p_company bigint','p_company uuid');
 d:=replace(d,'public.tp_ticket_companies where id=p_company and active','public.tp_companies where id=p_company');
 execute d;
end $$;
revoke all on function public.tp_create_ticket(uuid,text,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.tp_create_ticket(uuid,text,text,text,uuid[]) to authenticated;
drop function public.tp_create_ticket(bigint,text,text,text,uuid[]);
create or replace function tp_private.ticket_task(p_ticket bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype; entry uuid;
begin
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status not in ('accepted','closed') or t.assignee_id is null then raise exception 'Ticket unavailable'; end if;
 select entry_id into entry from public.tp_ticket_task_links where ticket_id=p_ticket and owner_id=t.assignee_id;
 if entry is not null then return entry; end if;
 insert into public.tp_entries(owner_id,company_id,title,description,kind,status,priority)
 values(t.assignee_id,t.company_id,left('Ticket #'||t.id||' – '||t.title,180),t.description,'task','open',case when t.priority='urgent' then 'high' else t.priority end) returning id into entry;
 insert into public.tp_ticket_task_links(ticket_id,owner_id,entry_id) values(p_ticket,t.assignee_id,entry);
 return entry;
end $$;
-- Legacy admin screen may still create a shared company during rollout.
create or replace function public.tp_admin_company(p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not tp_private.enterprise_admin() then raise exception 'Access denied'; end if;
 if not exists(select 1 from public.tp_companies where lower(trim(name))=lower(trim(p_name))) then
  insert into public.tp_companies(owner_id,name) values(auth.uid(),trim(p_name));
 end if;
end $$;
do $$ declare d text; begin
 d:=pg_get_functiondef('public.tp_publish_ticket_solution(bigint)'::regprocedure);
 execute replace(d,'public.tp_ticket_companies where id=t.company_id','public.tp_companies where id=t.company_id');
 if to_regprocedure('public.tp_complete_task(uuid,text)') is not null then
  d:=pg_get_functiondef('public.tp_complete_task(uuid,text)'::regprocedure);
  execute replace(d,'where c.id=e.company_id and c.owner_id=(select auth.uid())','where c.id=e.company_id');
 end if;
end $$;
notify pgrst,'reload schema';
commit;
