begin;
create table public.tp_profile_avatars(
 owner_id uuid primary key references public.tp_members(user_id) on delete cascade,
 avatar text not null,
 constraint tp_avatar_format check(length(avatar)<=96000 and avatar ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]*={0,2}$')
);
alter table public.tp_profile_avatars enable row level security;
revoke all on public.tp_profile_avatars from public,anon,authenticated;
grant select,insert,update,delete on public.tp_profile_avatars to authenticated;
grant all on public.tp_profile_avatars to service_role;
create policy profile_avatar_read on public.tp_profile_avatars for select to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy profile_avatar_insert on public.tp_profile_avatars for insert to authenticated with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy profile_avatar_update on public.tp_profile_avatars for update to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid())) with check(tp_private.enterprise_member() and owner_id=(select auth.uid()));
create policy profile_avatar_delete on public.tp_profile_avatars for delete to authenticated using(tp_private.enterprise_member() and owner_id=(select auth.uid()));
commit;