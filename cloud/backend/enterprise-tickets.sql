-- Enterprise 2.0 staging schema. Do not apply to production before multi-user testing.
begin;
create table public.tp_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(trim(display_name)) between 1 and 120),
 active boolean not null default true
);
alter table public.tp_members enable row level security;
create schema if not exists tp_private;
create or replace function tp_private.enterprise_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tp_members where user_id=(select auth.uid()) and active)
$$;
create or replace function tp_private.enterprise_admin() returns boolean language sql stable security definer set search_path='' as $$
 select tp_private.enterprise_member() and exists(select 1 from public.tp_app_admins where user_id=(select auth.uid()))
$$;
revoke all on function tp_private.enterprise_member(),tp_private.enterprise_admin() from public,anon;
grant usage on schema tp_private to authenticated;
grant execute on function tp_private.enterprise_member(),tp_private.enterprise_admin() to authenticated;
create policy member_directory on public.tp_members for select to authenticated using(tp_private.enterprise_member() and (active or tp_private.enterprise_admin()));
revoke all on public.tp_members from anon,authenticated;
grant select on public.tp_members to authenticated;
-- Existing admins are the only automatically enrolled users; review all other accounts before enabling.
insert into public.tp_members(user_id,display_name)
select a.user_id,coalesce(nullif(split_part(u.email,'@',1),''),'Administrator') from public.tp_app_admins a join auth.users u on u.id=a.user_id on conflict do nothing;
create table public.tp_ticket_companies(
 id bigint generated always as identity primary key,
 name text unique not null check(length(trim(name)) between 1 and 200),
 active boolean not null default true
);
create table public.tp_tickets(
 id bigint generated always as identity primary key,
 creator_id uuid not null references public.tp_members(user_id),
 company_id bigint not null references public.tp_ticket_companies(id),
 title text not null check(length(trim(title)) between 1 and 200),
 description text not null check(length(trim(description)) between 1 and 20000),
 priority text not null check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','accepted','rejected','closed')),
 assignee_id uuid references public.tp_members(user_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reminded_at timestamptz,
 resolution text,
 check((status in ('accepted','closed'))=(assignee_id is not null))
);
create table public.tp_ticket_candidates(
 ticket_id bigint references public.tp_tickets(id) on delete cascade,
 user_id uuid references public.tp_members(user_id),
 response text not null default 'pending' check(response in ('pending','accepted','declined','withdrawn')),
 responded_at timestamptz,
 primary key(ticket_id,user_id)
);
create unique index tp_one_ticket_acceptance on public.tp_ticket_candidates(ticket_id) where response='accepted';
create index tp_candidate_user on public.tp_ticket_candidates(user_id,response);
create table public.tp_ticket_events(
 id bigint generated always as identity primary key,
 ticket_id bigint not null references public.tp_tickets(id) on delete cascade,
 actor_id uuid references public.tp_members(user_id),
 kind text not null,
 message text not null default '',
 created_at timestamptz not null default now()
);
create table public.tp_ticket_notifications(
 id bigint generated always as identity primary key,
 ticket_id bigint not null references public.tp_tickets(id) on delete cascade,
 recipient_id uuid not null references public.tp_members(user_id),
 event_id bigint not null references public.tp_ticket_events(id),
 message text not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 delivered_at timestamptz,
 lease_until timestamptz,
 unique(event_id,recipient_id)
);
create index tp_ticket_notification_queue on public.tp_ticket_notifications(id) where delivered_at is null;
do $$ declare t text; begin
 foreach t in array array['tp_ticket_companies','tp_tickets','tp_ticket_candidates','tp_ticket_events','tp_ticket_notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t <> 'tp_ticket_notifications' then
 execute format('create policy enterprise_read on public.%I for select to authenticated using (tp_private.enterprise_member())',t);
 end if;
 end loop;
end $$;
create policy notification_owner on public.tp_ticket_notifications for select to authenticated using(tp_private.enterprise_member() and recipient_id=(select auth.uid()));
create or replace function public.tp_create_ticket(p_company bigint,p_title text,p_description text,p_priority text,p_users uuid[]) returns bigint language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t bigint; e bigint; n integer;
begin
 if not tp_private.enterprise_member() then raise exception 'Access denied'; end if;
 if not exists(select 1 from public.tp_ticket_companies where id=p_company and active) then raise exception 'Invalid company'; end if;
 if p_users is null or cardinality(p_users) not between 1 and 100 or array_position(p_users,null) is not null then raise exception 'Select at least one employee'; end if;
 select count(*) into n from public.tp_members where active and user_id=any(p_users);
 if n<>(select count(distinct x) from unnest(p_users) x) then raise exception 'Invalid employee'; end if;
 insert into public.tp_tickets(creator_id,company_id,title,description,priority) values(u,p_company,trim(p_title),trim(p_description),p_priority) returning id into t;
 insert into public.tp_ticket_candidates(ticket_id,user_id) select distinct t,x from unnest(p_users) x;
 insert into public.tp_ticket_events(ticket_id,actor_id,kind) values(t,u,'created') returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) select t,c.user_id,e,'Neues Ticket #'||t||' für dich verfügbar.' from public.tp_ticket_candidates c where c.ticket_id=t;
 return t;
end $$;
create or replace function public.tp_respond_ticket(p_ticket bigint,p_accept boolean) returns text language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.tp_tickets%rowtype; e bigint; k text; msg text;
begin
 if not tp_private.enterprise_member() or p_accept is null then raise exception 'Access denied'; end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status<>'open' then raise exception 'Ticket ist nicht mehr offen'; end if;
 if not exists(select 1 from public.tp_ticket_candidates where ticket_id=p_ticket and user_id=u and response='pending') then raise exception 'Keine offene Zuweisung'; end if;
 k:=case when p_accept then 'accepted' else 'declined' end;
 update public.tp_ticket_candidates set response=k,responded_at=now() where ticket_id=p_ticket and user_id=u;
 if p_accept then
 update public.tp_tickets set status='accepted',assignee_id=u,updated_at=now() where id=p_ticket;
 update public.tp_ticket_candidates set response='withdrawn' where ticket_id=p_ticket and response='pending';
 msg:='Ticket #'||p_ticket||' wurde angenommen.';
 else
 msg:='Ein Mitarbeiter hat Ticket #'||p_ticket||' abgelehnt.';
 if not exists(select 1 from public.tp_ticket_candidates where ticket_id=p_ticket and response='pending') then
 update public.tp_tickets set status='rejected',updated_at=now() where id=p_ticket;
 msg:='Alle Mitarbeiter haben Ticket #'||p_ticket||' abgelehnt.';
 end if;
 end if;
 insert into public.tp_ticket_events(ticket_id,actor_id,kind) values(p_ticket,u,k) returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) values(p_ticket,t.creator_id,e,msg);
 return k;
end $$;
create or replace function public.tp_close_ticket(p_ticket bigint,p_resolution text) returns void language plpgsql security definer set search_path='' as $$
declare t public.tp_tickets%rowtype; u uuid:=auth.uid(); e bigint;
begin
 if not tp_private.enterprise_member() then raise exception 'Access denied'; end if;
 select * into t from public.tp_tickets where id=p_ticket for update;
 if not found or t.status<>'accepted' or (t.assignee_id<>u and not tp_private.enterprise_admin()) then raise exception 'Not allowed'; end if;
 if p_resolution is null or length(trim(p_resolution)) not between 1 and 20000 then raise exception 'Resolution required'; end if;
 update public.tp_tickets set status='closed',resolution=trim(p_resolution),updated_at=now() where id=p_ticket;
 insert into public.tp_ticket_events(ticket_id,actor_id,kind) values(p_ticket,u,'closed') returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) values(p_ticket,t.creator_id,e,'Ticket #'||p_ticket||' wurde erledigt.');
end $$;
create or replace function public.tp_ticket_comment(p_ticket bigint,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); t public.tp_tickets%rowtype; e bigint;
begin
 if not tp_private.enterprise_member() then raise exception 'Access denied'; end if;
 select * into t from public.tp_tickets where id=p_ticket;
 if not found or not (t.creator_id=u or coalesce(t.assignee_id=u,false) or tp_private.enterprise_admin() or exists(select 1 from public.tp_ticket_candidates where ticket_id=p_ticket and user_id=u and response='pending')) then raise exception 'Not allowed'; end if;
 if p_message is null or length(trim(p_message)) not between 1 and 10000 then raise exception 'Invalid comment'; end if;
 insert into public.tp_ticket_events(ticket_id,actor_id,kind,message) values(p_ticket,u,'comment',trim(p_message)) returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message)
 select p_ticket,v,e,'Neuer Kommentar zu Ticket #'||p_ticket from (select t.creator_id v union select t.assignee_id union select user_id from public.tp_ticket_candidates where ticket_id=p_ticket and response='pending') r where v is not null and v<>u;
end $$;
create or replace function public.tp_ticket_remind() returns integer language plpgsql security invoker set search_path='' as $$
declare t record; e bigint; n integer:=0;
begin
 for t in select * from public.tp_tickets x where x.status='open' and x.reminded_at is null and x.created_at<=now()-interval '5 days' and not exists(select 1 from public.tp_ticket_candidates c where c.ticket_id=x.id and c.response<>'pending') for update skip locked loop
 update public.tp_tickets set reminded_at=now() where id=t.id;
 insert into public.tp_ticket_events(ticket_id,kind) values(t.id,'five_day_reminder') returning id into e;
 insert into public.tp_ticket_notifications(ticket_id,recipient_id,event_id,message) values(t.id,t.creator_id,e,'Ticket #'||t.id||' wartet seit fünf Tagen auf eine Antwort.');
 n:=n+1;
 end loop;
 return n;
end $$;
create or replace function public.tp_ticket_claim_notifications(p_limit integer default 50) returns setof public.tp_ticket_notifications language sql security invoker set search_path='' as $$
 with batch as (select id from public.tp_ticket_notifications where delivered_at is null and (lease_until is null or lease_until<now()) order by id limit greatest(1,least(p_limit,100)) for update skip locked)
 update public.tp_ticket_notifications n set lease_until=now()+interval '10 minutes' from batch where n.id=batch.id returning n.*
$$;
revoke all on function public.tp_create_ticket(bigint,text,text,text,uuid[]),public.tp_respond_ticket(bigint,boolean),public.tp_close_ticket(bigint,text),public.tp_ticket_comment(bigint,text),public.tp_ticket_remind(),public.tp_ticket_claim_notifications(integer) from public,anon,authenticated;
grant execute on function public.tp_create_ticket(bigint,text,text,text,uuid[]),public.tp_respond_ticket(bigint,boolean),public.tp_close_ticket(bigint,text),public.tp_ticket_comment(bigint,text) to authenticated;
grant execute on function public.tp_ticket_remind(),public.tp_ticket_claim_notifications(integer) to service_role;
grant all on public.tp_members,public.tp_ticket_companies,public.tp_tickets,public.tp_ticket_candidates,public.tp_ticket_events,public.tp_ticket_notifications to service_role;
grant usage,select on all sequences in schema public to service_role;
commit;
