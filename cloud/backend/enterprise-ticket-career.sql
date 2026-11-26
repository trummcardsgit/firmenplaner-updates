-- Apply after enterprise-ticket-extras.sql, in staging only.
begin;
create table public.tp_ticket_task_links(
 ticket_id bigint primary key references public.tp_tickets(id) on delete restrict,
 owner_id uuid not null references public.tp_members(user_id),
 entry_id uuid unique not null references public.tp_entries(id) on delete restrict,
 foreign key(entry_id,owner_id) references public.tp_entries(id,owner_id)
);
alter table public.tp_ticket_task_links enable row level security;
revoke all on public.tp_ticket_task_links from public,anon,authenticated;
grant select on public.tp_ticket_task_links to authenticated;
create policy ticket_task_owner on public.tp_ticket_task_links for select to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create or replace function tp_private.ticket_task(p_ticket bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype; entry uuid; firm uuid; firmname text;
begin
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status not in ('accepted','closed') or t.assignee_id is null then raise exception 'Ticket unavailable'; end if;
 select entry_id into entry from public.tp_ticket_task_links where ticket_id=p_ticket and owner_id=t.assignee_id;
 if entry is not null then return entry; end if;
 select left(name,160) into firmname from public.tp_ticket_companies where id=t.company_id;
 perform pg_advisory_xact_lock(hashtextextended(t.assignee_id::text||':'||firmname,0));
 select id into firm from public.tp_companies where owner_id=t.assignee_id and name=firmname order by created_at,id limit 1;
 if firm is null then insert into public.tp_companies(owner_id,name) values(t.assignee_id,firmname) returning id into firm; end if;
 insert into public.tp_entries(owner_id,company_id,title,description,kind,status,priority)
 values(t.assignee_id,firm,left('Ticket #'||t.id||' – '||t.title,180),t.description,'task','open',case when t.priority='urgent' then 'high' else t.priority end) returning id into entry;
 insert into public.tp_ticket_task_links(ticket_id,owner_id,entry_id) values(p_ticket,t.assignee_id,entry);
 return entry;
end $$;
revoke all on function tp_private.ticket_task(bigint) from public,anon,authenticated;
create or replace function public.tp_import_ticket_task(p_ticket bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype;
begin
 if not tp_private.enterprise_member() then raise exception 'Access denied'; end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status<>'accepted' or t.assignee_id is distinct from auth.uid() then raise exception 'Not your accepted ticket'; end if;
 return tp_private.ticket_task(p_ticket);
end $$;
revoke all on function public.tp_import_ticket_task(bigint) from public,anon,authenticated;
grant execute on function public.tp_import_ticket_task(bigint) to authenticated;
-- Linked tasks cannot be completed, reopened, changed to notes or moved to another owner independently of the ticket.
create or replace function tp_private.ticket_task_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare s text;
begin
 select t.status into s from public.tp_ticket_task_links l join public.tp_tickets t on t.id=l.ticket_id where l.entry_id=old.id;
 if found and (new.owner_id is distinct from old.owner_id or new.kind is distinct from old.kind or (new.status is distinct from old.status and new.status is distinct from case when s='closed' then 'done' else 'open' end)) then
 raise exception 'Ticket-Aufgaben bitte im Ticket-Center abschließen oder weiterleiten';
 end if;
 return new;
end $$;
revoke all on function tp_private.ticket_task_guard() from public,anon,authenticated;
create trigger tp_ticket_task_guard before update on public.tp_entries for each row execute function tp_private.ticket_task_guard();
-- Awards are separate from the original 50 trophies so existing trophy progress is unchanged.
create table public.tp_ticket_awards(
 owner_id uuid references public.tp_members(user_id),
 threshold integer check(threshold in (1,10,50,100)),
 awarded_at timestamptz not null default now(),
 primary key(owner_id,threshold)
);
alter table public.tp_ticket_awards enable row level security;
revoke all on public.tp_ticket_awards from public,anon,authenticated;
grant select on public.tp_ticket_awards to authenticated;
create policy ticket_award_owner on public.tp_ticket_awards for select to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create or replace function tp_private.ticket_sync_task() returns trigger language plpgsql security definer set search_path='' as $$
declare entry uuid; n integer; threshold_value integer; p public.tp_game_profiles%rowtype; gain integer; lv integer; xp integer; cap integer; req integer;
begin
 if old.status='accepted' and new.status='open' then
  delete from public.tp_ticket_task_links where ticket_id=new.id returning entry_id into entry;
  if entry is not null then delete from public.tp_entries where id=entry and status='open'; end if;
 elsif old.status='accepted' and new.status='closed' then
  entry:=tp_private.ticket_task(new.id);
  -- The existing task reward trigger supplies 75–250 XP exactly once.
  update public.tp_entries set status='done',updated_at=now() where id=entry;
  select * into p from public.tp_game_profiles where owner_id=new.assignee_id for update;
  select count(*) into n from public.tp_tickets where assignee_id=new.assignee_id and status='closed';
  gain:=0;
  foreach threshold_value in array array[1,10,50,100] loop
   if n>=threshold_value then
    insert into public.tp_ticket_awards(owner_id,threshold) values(new.assignee_id,threshold_value) on conflict do nothing;
    if found then gain:=gain+case threshold_value when 1 then 50 when 10 then 150 when 50 then 500 else 1000 end; end if;
   end if;
  end loop;
  if gain>0 then
   lv:=p.level;xp:=p.xp_in_level+gain;cap:=case when p.stage='master' then 1000 else 55 end;
   while lv<cap loop
    req:=case when p.stage='master' then 250+5*(lv-1) else 150+12*(lv-1) end;
    exit when xp<req;xp:=xp-req;lv:=lv+1;
   end loop;
   if lv=cap then xp:=0;end if;
   update public.tp_game_profiles set level=lv,xp_in_level=xp,total_xp=total_xp+gain,updated_at=now() where owner_id=new.assignee_id;
  end if;
 end if;
 return new;
end $$;
revoke all on function tp_private.ticket_sync_task() from public,anon,authenticated;
create trigger tp_ticket_sync_task after update of status on public.tp_tickets for each row execute function tp_private.ticket_sync_task();
-- Publish deliberately, never automatically expose the private linked task.
create or replace function public.tp_publish_ticket_solution(p_ticket bigint) returns void language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype; entry uuid; firm text;
begin
 if not tp_private.enterprise_member() then raise exception 'Access denied'; end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status<>'closed' or (t.assignee_id is distinct from auth.uid() and not tp_private.enterprise_admin()) then raise exception 'Not allowed'; end if;
 if length(trim(t.resolution))<3 then raise exception 'Lösung benötigt mindestens drei Zeichen'; end if;
 select entry_id into entry from public.tp_ticket_task_links where ticket_id=p_ticket;
 if entry is null then raise exception 'Linked task missing'; end if;
 select name into firm from public.tp_ticket_companies where id=t.company_id;
 insert into public.tp_solutions(owner_id,source_entry_id,company_name,problem_title,problem_description,solution_text)
 values(t.assignee_id,entry,firm,left(t.title,180),t.description,t.resolution)
 on conflict(source_entry_id) do nothing;
end $$;
revoke all on function public.tp_publish_ticket_solution(bigint) from public,anon,authenticated;
grant execute on function public.tp_publish_ticket_solution(bigint) to authenticated;
commit;
