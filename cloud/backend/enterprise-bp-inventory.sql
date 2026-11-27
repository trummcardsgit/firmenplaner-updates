begin;
create table tp_private.bp_equipped(
 owner_id uuid not null references public.tp_members(user_id) on delete cascade,
 slot text not null check(slot in ('emblem','title','banner','frame','background','stamp','effect','color','theme','comment','menu','showcase','master')),
 season_id integer not null, level integer not null,
 foreign key(season_id,level) references tp_private.bp_rewards(season_id,level),
 primary key(owner_id,slot)
);
alter table tp_private.bp_equipped enable row level security;
revoke all on tp_private.bp_equipped from public,anon,authenticated;
create function tp_private.bp_slot(kind text) returns text language sql immutable set search_path='' as $$
 select case kind when 'Emblem' then 'emblem' when 'Titel' then 'title' when 'Banner' then 'banner' when 'Profilrahmen' then 'frame' when 'Hintergrund' then 'background' when 'Stempel' then 'stamp' when 'Effekt' then 'effect' when 'Profilfarbe' then 'color' when 'Design' then 'theme' when 'Kommentarstil' then 'comment' when 'Menüdesign' then 'menu' when 'Trophäe' then 'showcase' when 'Vitrinenobjekt' then 'showcase' when 'Sammlerobjekt' then 'showcase' when 'Komplettpaket' then 'master' end
$$;
revoke all on function tp_private.bp_slot(text) from public,anon,authenticated;
create function public.tp_bp_inventory() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('season_id',r.season_id,'season',s.name,'level',r.level,'name',r.name,'kind',r.kind,'rarity',r.rarity,'glyph',r.glyph,'slot',tp_private.bp_slot(r.kind),'equipped',e.slot is not null) order by r.season_id desc,r.level),'[]'::jsonb) into result
 from tp_private.bp_rewards r join tp_private.bp_seasons s on s.id=r.season_id
 join (select season_id,sum(xp) points from tp_private.bp_claims where owner_id=u group by season_id) p on p.season_id=r.season_id and p.points>=r.level*1000
 left join tp_private.bp_equipped e on e.owner_id=u and e.season_id=r.season_id and e.level=r.level and e.slot=tp_private.bp_slot(r.kind);
 return result;
end $$;
create function public.tp_bp_equip(p_season integer,p_level integer,p_equip boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target_slot text; points bigint;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 if p_equip is null then raise exception 'Invalid action';end if;
 select tp_private.bp_slot(kind) into target_slot from tp_private.bp_rewards where season_id=p_season and level=p_level;
 if target_slot is null then raise exception 'Invalid reward';end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp_equip:'||u::text,0));
 select coalesce(sum(xp),0) into points from tp_private.bp_claims where owner_id=u and season_id=p_season;
 if points<p_level*1000 then raise exception 'Belohnung noch gesperrt';end if;
 if p_equip then
 insert into tp_private.bp_equipped(owner_id,slot,season_id,level) values(u,target_slot,p_season,p_level)
 on conflict(owner_id,slot) do update set season_id=excluded.season_id,level=excluded.level;
 else delete from tp_private.bp_equipped where owner_id=u and slot=target_slot and season_id=p_season and level=p_level;
 end if;
 return public.tp_bp_inventory();
end $$;
revoke all on function public.tp_bp_inventory(),public.tp_bp_equip(integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.tp_bp_inventory(),public.tp_bp_equip(integer,integer,boolean) to authenticated;
alter table public.tp_menu_preferences drop constraint tp_menu_order_valid, drop constraint tp_menu_hidden_valid;
alter table public.tp_menu_preferences add constraint tp_menu_order_valid check(cardinality(menu_order)<=13 and coalesce(array_ndims(menu_order),1)=1 and array_position(menu_order,null) is null and menu_order <@ array['dashboard','career','tickets','statistics','inventory','tasks','notes','solutions','projects','documents','companies','admin','settings']::text[]), add constraint tp_menu_hidden_valid check(cardinality(hidden_items)<=13 and coalesce(array_ndims(hidden_items),1)=1 and array_position(hidden_items,null) is null and hidden_items <@ array['dashboard','career','tickets','statistics','inventory','tasks','notes','solutions','projects','documents','companies','admin','settings']::text[]);
notify pgrst,'reload schema';
commit;
