begin;
alter table public.tp_menu_preferences drop constraint tp_menu_order_valid, drop constraint tp_menu_hidden_valid;
alter table public.tp_menu_preferences add constraint tp_menu_order_valid check(cardinality(menu_order)<=12 and coalesce(array_ndims(menu_order),1)=1 and array_position(menu_order,null) is null and menu_order <@ array['dashboard','career','tickets','statistics','tasks','notes','solutions','projects','documents','companies','admin','settings']::text[]), add constraint tp_menu_hidden_valid check(cardinality(hidden_items)<=12 and coalesce(array_ndims(hidden_items),1)=1 and array_position(hidden_items,null) is null and hidden_items <@ array['dashboard','career','tickets','statistics','tasks','notes','solutions','projects','documents','companies','admin','settings']::text[]);
create table public.tp_ticket_time_sessions(
 id bigint generated always as identity primary key,
 ticket_id bigint not null references public.tp_tickets(id) on delete restrict,
 owner_id uuid not null references public.tp_members(user_id) on delete restrict,
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,
 end_reason text,
 check((ended_at is null and end_reason is null) or (ended_at is not null and ended_at>=started_at and end_reason is not null and end_reason in ('pause','stop','automatic')))
);
create unique index tp_ticket_one_running_timer on public.tp_ticket_time_sessions(owner_id) where ended_at is null;
create index tp_ticket_time_ticket_owner on public.tp_ticket_time_sessions(ticket_id,owner_id,id desc);
alter table public.tp_ticket_time_sessions enable row level security;
revoke all on public.tp_ticket_time_sessions from public,anon,authenticated;
grant select on public.tp_ticket_time_sessions to authenticated;
grant all on public.tp_ticket_time_sessions to service_role;
create policy time_read on public.tp_ticket_time_sessions for select to authenticated using(tp_private.enterprise_member() and (owner_id=(select auth.uid()) or tp_private.enterprise_admin()));
create function public.tp_ticket_timer(p_ticket bigint,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.tp_tickets%rowtype; r public.tp_ticket_time_sessions%rowtype;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 if p_action is null or p_action not in ('start','pause','stop') then raise exception 'Invalid timer action';end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status<>'accepted' or t.assignee_id is distinct from u then raise exception 'Not allowed';end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_timer:'||u::text,0));
 select * into r from public.tp_ticket_time_sessions where ticket_id=p_ticket and owner_id=u order by id desc limit 1 for update;
 if p_action='start' then
  if r.id is not null and r.ended_at is null then return;end if;
  if exists(select 1 from public.tp_ticket_time_sessions where owner_id=u and ended_at is null) then raise exception 'Ein anderes Ticket läuft bereits';end if;
  insert into public.tp_ticket_time_sessions(ticket_id,owner_id) values(p_ticket,u);
 elsif r.id is not null and r.ended_at is null then
  update public.tp_ticket_time_sessions set ended_at=greatest(clock_timestamp(),started_at),end_reason=p_action where id=r.id;
 elsif p_action='stop' and r.end_reason='pause' then
  update public.tp_ticket_time_sessions set end_reason='stop' where id=r.id;
 end if;
end $$;
revoke all on function public.tp_ticket_timer(bigint,text) from public,anon,authenticated;
grant execute on function public.tp_ticket_timer(bigint,text) to authenticated;
create function tp_private.stop_ticket_timer() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'accepted' or new.assignee_id is distinct from old.assignee_id then
  update public.tp_ticket_time_sessions set ended_at=greatest(clock_timestamp(),started_at),end_reason='automatic' where ticket_id=new.id and ended_at is null;
  update public.tp_ticket_time_sessions set end_reason='automatic' where ticket_id=new.id and owner_id=old.assignee_id and end_reason='pause' and id=(select max(id) from public.tp_ticket_time_sessions where ticket_id=new.id and owner_id=old.assignee_id);
 end if;
 return new;
end $$;
revoke all on function tp_private.stop_ticket_timer() from public,anon,authenticated;
create trigger tp_stop_ticket_timer after update of status,assignee_id on public.tp_tickets for each row execute function tp_private.stop_ticket_timer();
notify pgrst,'reload schema';
commit;
