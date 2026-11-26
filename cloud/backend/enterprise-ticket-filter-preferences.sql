begin;
create table public.tp_ticket_filter_preferences(
 owner_id uuid not null references public.tp_members(user_id) on delete cascade,
 category text not null check(category in ('all','open','my')),
 company_filter text not null default '' check(length(company_filter)<=64),
 status_filter text not null default 'open' check(status_filter in ('','open','accepted','rejected','closed')),
 search_filter text not null default '' check(length(search_filter)<=200),
 primary key(owner_id,category)
);
alter table public.tp_ticket_filter_preferences enable row level security;
revoke all on public.tp_ticket_filter_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.tp_ticket_filter_preferences to authenticated;
grant all on public.tp_ticket_filter_preferences to service_role;
create policy ticket_filter_read on public.tp_ticket_filter_preferences for select to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy ticket_filter_insert on public.tp_ticket_filter_preferences for insert to authenticated with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy ticket_filter_update on public.tp_ticket_filter_preferences for update to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid())) with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy ticket_filter_delete on public.tp_ticket_filter_preferences for delete to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
commit;