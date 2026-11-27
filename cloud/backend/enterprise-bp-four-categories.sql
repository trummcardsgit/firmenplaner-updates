begin;
-- The level remains the durable entitlement; no BP claims or career XP are modified.
update tp_private.bp_rewards r set name=v.name,kind=v.kind from (values
(1,'Vice City Rookie','Trophäe'),
(2,'Night Shift','Titel'),
(3,'Ocean Drive','Visitenkarte'),
(4,'Neon Runner','Titel'),
(5,'Neon Pink','Profilbildrahmen'),
(6,'Sunset Rookie','Trophäe'),
(7,'Skyline Award','Trophäe'),
(8,'Ticket Surfer','Titel'),
(9,'Neon Specialist','Titel'),
(10,'Palm Glow','Profilbildrahmen'),
(11,'Tropical Hotline','Visitenkarte'),
(12,'Flamingo Crest','Trophäe'),
(13,'Problem Hunter','Titel'),
(14,'Sunset Flash','Trophäe'),
(15,'Neon Mechanic','Trophäe'),
(16,'Aqua Pulse','Titel'),
(17,'Vice Purple','Profilbildrahmen'),
(18,'Gold Palm','Trophäe'),
(19,'After Hours Agent','Titel'),
(20,'Vice Diamond','Profilbildrahmen'),
(21,'Midnight Boulevard','Visitenkarte'),
(22,'City Heat','Trophäe'),
(23,'Retro Agent','Titel'),
(24,'Service King','Titel'),
(25,'Chrome Flamingo','Trophäe'),
(26,'Night Coast','Profilbildrahmen'),
(27,'Vice Gold','Profilbildrahmen'),
(28,'Vice Legend','Titel'),
(29,'Neon Trophy Tower','Trophäe'),
(30,'Vice City Master','Visitenkarte')
) v(level,name,kind) where r.season_id=1 and r.level=v.level;
create or replace function tp_private.bp_slot(kind text) returns text language sql immutable set search_path='' as $$
 select case kind when 'Visitenkarte' then 'banner' when 'Titel' then 'title' when 'Profilbildrahmen' then 'frame' when 'Trophäe' then 'showcase' end
$$;
-- Move a previously equipped Master package to its standalone calling card, unless a card is already selected.
insert into tp_private.bp_equipped(owner_id,slot,season_id,level)
select e.owner_id,'banner',e.season_id,e.level from tp_private.bp_equipped e
where e.slot='master' and e.season_id=1 and e.level=30
and coalesce((select sum(c.xp) from tp_private.bp_claims c where c.owner_id=e.owner_id and c.season_id=e.season_id),0)>=30000
on conflict(owner_id,slot) do nothing;
delete from tp_private.bp_equipped e using tp_private.bp_rewards r where e.season_id=r.season_id and e.level=r.level and e.slot is distinct from tp_private.bp_slot(r.kind);
alter table tp_private.bp_equipped drop constraint bp_equipped_slot_check;
alter table tp_private.bp_equipped add constraint bp_equipped_slot_check check(slot in ('banner','title','frame','showcase'));
alter table tp_private.bp_rewards add constraint bp_reward_four_kinds check(kind in ('Visitenkarte','Titel','Profilbildrahmen','Trophäe'));
create or replace function public.tp_bp_member_cosmetics() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('owner_id',e.owner_id,'slot',e.slot,'season_id',r.season_id,'level',r.level,'name',r.name,'glyph',r.glyph,'equipped',true) order by e.owner_id,e.slot),'[]'::jsonb)
 into result
 from tp_private.bp_equipped e
 join public.tp_members m on m.user_id=e.owner_id and m.active
 join tp_private.bp_rewards r on r.season_id=e.season_id and r.level=e.level
 where e.slot in ('banner','title','frame')
 and e.slot=tp_private.bp_slot(r.kind)
 and coalesce((select sum(c.xp) from tp_private.bp_claims c where c.owner_id=e.owner_id and c.season_id=e.season_id),0)>=r.level*1000;
 return result;
end $$;
revoke all on function public.tp_bp_member_cosmetics() from public,anon,authenticated;
grant execute on function public.tp_bp_member_cosmetics() to authenticated;

-- TEST-only preset RPC exists only on the test project. Preserve its scope and adapt the presets.
do $outer$ begin
 if to_regprocedure('public.tp_test_bp_preset(text)') is not null then
 execute $ddl$
 create or replace function public.tp_test_bp_preset(p_preset text) returns jsonb language plpgsql security definer set search_path='' as $body$
 declare u uuid:=auth.uid(); selected integer[];
 begin
 if u is null or not tp_private.enterprise_member() or not exists(select 1 from tp_private.bp_test_art_installers where owner_id=u) then raise exception 'Access denied';end if;
 selected:=case p_preset when 'master' then array[30,28,27,29] when 'ocean' then array[3,2,5,1] when 'tropical' then array[11,8,10,12] when 'midnight' then array[21,19,20,25] else null end;
 if selected is null then raise exception 'Unbekannte Ausrüstung';end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp_equip:'||u::text,0));
 if coalesce((select sum(xp) from tp_private.bp_claims where owner_id=u and season_id=1),0)<(select max(x)*1000 from unnest(selected) x) then raise exception 'Belohnungen noch gesperrt';end if;
 delete from tp_private.bp_equipped where owner_id=u;
 insert into tp_private.bp_equipped(owner_id,slot,season_id,level) select u,tp_private.bp_slot(r.kind),r.season_id,r.level from tp_private.bp_rewards r where r.season_id=1 and r.level=any(selected);
 return public.tp_bp_inventory();
 end $body$;
 $ddl$;
 end if;
end $outer$;
notify pgrst,'reload schema';
commit;
