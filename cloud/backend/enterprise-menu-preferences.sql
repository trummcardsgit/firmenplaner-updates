begin;
create table public.tp_menu_preferences(
 owner_id uuid primary key references public.tp_members(user_id) on delete cascade,
 menu_order text[] not null default '{}',
 hidden_items text[] not null default '{}',
 constraint tp_menu_order_valid check(cardinality(menu_order)<=11 and coalesce(array_ndims(menu_order),1)=1 and array_position(menu_order,null) is null and menu_order <@ array['dashboard','career','tickets','tasks','notes','solutions','projects','documents','companies','admin','settings']::text[]),
 constraint tp_menu_hidden_valid check(cardinality(hidden_items)<=11 and coalesce(array_ndims(hidden_items),1)=1 and array_position(hidden_items,null) is null and hidden_items <@ array['dashboard','career','tickets','tasks','notes','solutions','projects','documents','companies','admin','settings']::text[])
);
alter table public.tp_menu_preferences enable row level security;
revoke all on public.tp_menu_preferences from public,anon,authenticated;
grant select,insert,update on public.tp_menu_preferences to authenticated;
grant all on public.tp_menu_preferences to service_role;
create policy menu_read_own on public.tp_menu_preferences for select to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy menu_insert_own on public.tp_menu_preferences for insert to authenticated with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy menu_update_own on public.tp_menu_preferences for update to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid())) with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
commit;