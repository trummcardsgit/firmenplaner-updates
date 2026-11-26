-- Active members may view active colleagues' avatars, but only edit their own.
begin;
alter policy profile_avatar_read on public.tp_profile_avatars
 using (tp_private.enterprise_member() and exists (
  select 1 from public.tp_members m where m.user_id=tp_profile_avatars.owner_id and m.active
 ));
commit;
