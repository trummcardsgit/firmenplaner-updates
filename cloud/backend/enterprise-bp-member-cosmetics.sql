begin;
-- Share only actively equipped identity cosmetics; never expose the private inventory or XP ledger.
create function public.tp_bp_member_cosmetics() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('owner_id',e.owner_id,'slot',e.slot,'season_id',r.season_id,'level',r.level,'name',r.name,'glyph',r.glyph,'equipped',true) order by e.owner_id,e.slot),'[]'::jsonb)
 into result
 from tp_private.bp_equipped e
 join public.tp_members m on m.user_id=e.owner_id and m.active
 join tp_private.bp_rewards r on r.season_id=e.season_id and r.level=e.level
 where e.slot in ('banner','title','emblem','frame','master')
 and e.slot=tp_private.bp_slot(r.kind)
 and coalesce((select sum(c.xp) from tp_private.bp_claims c where c.owner_id=e.owner_id and c.season_id=e.season_id),0)>=r.level*1000;
 return result;
end $$;
revoke all on function public.tp_bp_member_cosmetics() from public,anon,authenticated;
grant execute on function public.tp_bp_member_cosmetics() to authenticated;
notify pgrst,'reload schema';
commit;
