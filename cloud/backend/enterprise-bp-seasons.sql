begin;
alter table tp_private.bp_seasons add column published boolean not null default true, add column level_count integer not null default 30 check(level_count between 1 and 30), add column xp_per_level integer not null default 1000 check(xp_per_level between 100 and 5000), add column daily_bonus integer not null default 200 check(daily_bonus between 0 and 2000), add column weekly_bonus integer not null default 750 check(weekly_bonus between 0 and 5000), add column revision bigint not null default 1;
alter table tp_private.bp_rewards add column art text;
create table tp_private.bp_missions(season_id integer references tp_private.bp_seasons(id),period_kind text not null check(period_kind in ('daily','weekly','season')),code text not null check(code ~ '^[a-z0-9_]{1,32}$' and code<>'bonus'),label text not null check(length(label) between 1 and 200),goal integer not null check(goal between 1 and 100),xp integer not null check(xp between 1 and 5000),metric text not null check(metric in ('comment','task','action','closed','description_edited','days')),primary key(season_id,period_kind,code));
alter table tp_private.bp_missions enable row level security;
revoke all on tp_private.bp_missions from public,anon,authenticated;
insert into tp_private.bp_missions select 1,v.* from (values
 ('daily','comment','Einen hilfreichen Ticketkommentar schreiben',1,200,'comment'),
 ('daily','task','Eine Aufgabe erledigen',1,200,'task'),
 ('daily','action','Ein Ticket annehmen, bearbeiten oder abschließen',1,200,'action'),
 ('weekly','comment','Drei verschiedene Tickets kommentieren',3,750,'comment'),
 ('weekly','task','Drei verschiedene Aufgaben erledigen',3,750,'task'),
 ('weekly','action','Drei verschiedene Tickets bearbeiten',3,750,'action'),
 ('season','comment','Zehn verschiedene Tickets kommentieren',10,1500,'comment'),
 ('season','task','Zehn Aufgaben erledigen',10,1500,'task'),
 ('season','close','Fünf Tickets abschließen',5,1500,'closed'),
 ('season','edit','Drei Ticketbeschreibungen verbessern',3,1500,'description_edited'),
 ('season','days','An zwölf verschiedenen Tagen Aufgaben oder Tickets bearbeiten',12,1500,'days')
) v(period_kind,code,label,goal,xp,metric);
create or replace function tp_private.bp_challenges(p_owner uuid,p_season integer,p_now timestamptz)
returns table(period_kind text,period_start date,period_end date,code text,label text,goal integer,xp integer,progress integer)
language sql stable set search_path='' as $$
 with s as (select * from tp_private.bp_seasons where id=p_season),
 days as (select g::date d from s cross join lateral generate_series(s.starts::timestamp,least(s.ends-1,(p_now at time zone 'Europe/Vienna')::date)::timestamp,interval '1 day') g),
 periods as (
 select 'daily'::text k,d a,d+1 b from days
 union all select distinct 'weekly',greatest(s.starts,date_trunc('week',d)::date),least(s.ends,date_trunc('week',d)::date+7) from days cross join s
 union all select 'season',starts,ends from s where starts<=(p_now at time zone 'Europe/Vienna')::date
 ),
 defs(k,code,label,goal,xp,metric) as (select period_kind,code,label,goal,xp,metric from tp_private.bp_missions where season_id=p_season),
 activity as materialized (
 select e.kind::text kind,'t:'||e.ticket_id::text item,e.created_at ts,(e.created_at at time zone 'Europe/Vienna')::date d
 from public.tp_ticket_events e cross join s where e.actor_id=p_owner and e.kind in ('comment','accepted','closed','description_edited') and e.created_at >= (s.starts::timestamp at time zone 'Europe/Vienna') and e.created_at < (s.ends::timestamp at time zone 'Europe/Vienna') and e.created_at<=p_now
 union all
 select 'task','a:'||e.entry_id::text,e.awarded_at,(e.awarded_at at time zone 'Europe/Vienna')::date
 from public.tp_game_xp_events e cross join s where e.owner_id=p_owner and e.awarded_at >= (s.starts::timestamp at time zone 'Europe/Vienna') and e.awarded_at < (s.ends::timestamp at time zone 'Europe/Vienna') and e.awarded_at<=p_now
 )
 select p.k,p.a,p.b,f.code,f.label,f.goal,f.xp,
 (select case when f.metric='days' then count(distinct x.d) else count(distinct x.item) end::integer from activity x where x.d>=p.a and x.d<p.b and (f.metric='days' or (f.metric='action' and x.kind in ('accepted','closed','description_edited')) or x.kind=f.metric))
 from periods p join defs f on f.k=p.k;
$$;
revoke all on function tp_private.bp_challenges(uuid,integer,timestamptz) from public,anon,authenticated;

create or replace function public.tp_sync_battlepass() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s tp_private.bp_seasons%rowtype; stamp timestamptz:=now(); d date:=(stamp at time zone 'Europe/Vienna')::date; points integer; result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select * into s from tp_private.bp_seasons where published and starts<=d order by starts desc limit 1;
 if not found then
 select * into s from tp_private.bp_seasons where published and starts>d order by starts,id limit 1;
 if not found then return jsonb_build_object('available',false);end if;
 return jsonb_build_object('available',false,'pending',true,'season_id',s.id,'name',s.name,'starts',s.starts,'starts_at',s.starts::timestamp at time zone 'Europe/Vienna','server_now',stamp,'level_count',s.level_count,'xp_per_level',s.xp_per_level);
 end if;
 for s in select * from tp_private.bp_seasons where published and starts<=d order by id loop
 perform pg_advisory_xact_lock(hashtextextended('tp_bp:'||u::text||':'||s.id::text,0));
 insert into tp_private.bp_claims(season_id,owner_id,period_kind,period_start,code,xp)
 select s.id,u,c.period_kind,c.period_start,c.code,c.xp from tp_private.bp_challenges(u,s.id,stamp) c where c.progress>=c.goal on conflict do nothing;
 insert into tp_private.bp_claims(season_id,owner_id,period_kind,period_start,code,xp)
 select s.id,u,c.period_kind,c.period_start,'bonus',case c.period_kind when 'daily' then s.daily_bonus else s.weekly_bonus end
 from tp_private.bp_claims c where c.season_id=s.id and c.owner_id=u and c.period_kind in ('daily','weekly') and c.code<>'bonus' and exists(select 1 from tp_private.bp_missions m where m.season_id=s.id and m.period_kind=c.period_kind and m.code=c.code) and (case c.period_kind when 'daily' then s.daily_bonus else s.weekly_bonus end)>0 group by c.period_kind,c.period_start having count(*)=(select count(*) from tp_private.bp_missions m where m.season_id=s.id and m.period_kind=c.period_kind) on conflict do nothing;
 end loop;
 select * into s from tp_private.bp_seasons where published and starts<=d order by starts desc limit 1;
 select coalesce(sum(c.xp),0)::integer into points from tp_private.bp_claims c where c.season_id=s.id and c.owner_id=u;
 select jsonb_build_object('available',true,'season_id',s.id,'name',s.name,'starts',s.starts,'ends',s.ends,'active',d<s.ends,'days_left',greatest(s.ends-d,0),'xp',points,'level_count',s.level_count,'xp_per_level',s.xp_per_level,'daily_bonus',s.daily_bonus,'weekly_bonus',s.weekly_bonus,'level',least(s.level_count,points/s.xp_per_level),
 'challenges',coalesce((select jsonb_agg(jsonb_build_object('period',c.period_kind,'code',c.code,'label',c.label,'goal',c.goal,'xp',c.xp,'progress',case when a.code is not null then greatest(c.goal,c.progress) else c.progress end,'earned',a.code is not null) order by case c.period_kind when 'daily' then 1 when 'weekly' then 2 else 3 end,c.code) from tp_private.bp_challenges(u,s.id,stamp) c left join tp_private.bp_claims a on a.season_id=s.id and a.owner_id=u and a.period_kind=c.period_kind and a.period_start=c.period_start and a.code=c.code where c.period_kind='season' or (d<s.ends and d>=c.period_start and d<c.period_end)),'[]'::jsonb),
 'archive',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'level',least(h.level_count,coalesce((select sum(c.xp) from tp_private.bp_claims c where c.season_id=h.id and c.owner_id=u),0)/h.xp_per_level),'level_count',h.level_count) order by h.starts desc),'[]'::jsonb) from tp_private.bp_seasons h where h.published and h.ends<=d and h.id<>s.id),'rewards',(select jsonb_agg(jsonb_build_object('season_id',r.season_id,'art',r.art,'level',r.level,'name',r.name,'kind',r.kind,'rarity',r.rarity,'glyph',r.glyph,'unlocked',r.level<=least(s.level_count,points/s.xp_per_level)) order by r.level) from tp_private.bp_rewards r where r.season_id=s.id)) into result;
 return result;
end $$;
revoke all on function public.tp_sync_battlepass() from public,anon,authenticated;
grant execute on function public.tp_sync_battlepass() to authenticated;

create or replace function public.tp_bp_inventory() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('season_id',r.season_id,'season',s.name,'level',r.level,'art',r.art,'name',r.name,'kind',r.kind,'rarity',r.rarity,'glyph',r.glyph,'slot',tp_private.bp_slot(r.kind),'equipped',e.slot is not null) order by r.season_id desc,r.level),'[]'::jsonb) into result
 from tp_private.bp_rewards r join tp_private.bp_seasons s on s.id=r.season_id
 join (select season_id,sum(xp) points from tp_private.bp_claims where owner_id=u group by season_id) p on p.season_id=r.season_id and p.points>=r.level*s.xp_per_level and s.published
 left join tp_private.bp_equipped e on e.owner_id=u and e.season_id=r.season_id and e.level=r.level and e.slot=tp_private.bp_slot(r.kind);
 return result;
end $$;
create or replace function public.tp_bp_equip(p_season integer,p_level integer,p_equip boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target_slot text; points bigint;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 if p_equip is null then raise exception 'Invalid action';end if;
 select tp_private.bp_slot(r.kind) into target_slot from tp_private.bp_rewards r join tp_private.bp_seasons s on s.id=r.season_id and s.published where r.season_id=p_season and r.level=p_level;
 if target_slot is null then raise exception 'Invalid reward';end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp_equip:'||u::text,0));
 select coalesce(sum(xp),0) into points from tp_private.bp_claims where owner_id=u and season_id=p_season;
 if points<p_level*(select xp_per_level from tp_private.bp_seasons where id=p_season) then raise exception 'Belohnung noch gesperrt';end if;
 if p_equip then
 insert into tp_private.bp_equipped(owner_id,slot,season_id,level) values(u,target_slot,p_season,p_level)
 on conflict(owner_id,slot) do update set season_id=excluded.season_id,level=excluded.level;
 else delete from tp_private.bp_equipped where owner_id=u and slot=target_slot and season_id=p_season and level=p_level;
 end if;
 return public.tp_bp_inventory();
end $$;
revoke all on function public.tp_bp_inventory(),public.tp_bp_equip(integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.tp_bp_inventory(),public.tp_bp_equip(integer,integer,boolean) to authenticated;

create or replace function public.tp_bp_member_cosmetics() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select coalesce(jsonb_agg(jsonb_build_object('owner_id',e.owner_id,'slot',e.slot,'season_id',r.season_id,'level',r.level,'art',r.art,'name',r.name,'glyph',r.glyph,'equipped',true) order by e.owner_id,e.slot),'[]'::jsonb)
 into result
 from tp_private.bp_equipped e
 join public.tp_members m on m.user_id=e.owner_id and m.active
 join tp_private.bp_rewards r on r.season_id=e.season_id and r.level=e.level
 join tp_private.bp_seasons s on s.id=r.season_id and s.published
 where e.slot in ('banner','title','frame')
 and e.slot=tp_private.bp_slot(r.kind)
 and coalesce((select sum(c.xp) from tp_private.bp_claims c where c.owner_id=e.owner_id and c.season_id=e.season_id),0)>=r.level*s.xp_per_level;
 return result;
end $$;
revoke all on function public.tp_bp_member_cosmetics() from public,anon,authenticated;
grant execute on function public.tp_bp_member_cosmetics() to authenticated;


create function public.tp_admin_bp_seasons(p_action text,p_id integer default null,p_revision bigint default null,p_payload jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s tp_private.bp_seasons%rowtype; d date:=(now() at time zone 'Europe/Vienna')::date; start_date date; end_date date; levels integer; rate integer; daily integer; weekly integer; nm text; r jsonb; img text; raw bytea; link_id bigint; link_revision bigint; selected_level integer; u uuid:=auth.uid();
begin
 if u is null or not tp_private.enterprise_admin() then raise exception 'Access denied';end if;
 if p_action='list' then return coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from tp_private.bp_seasons x),'[]'::jsonb);end if;
 if p_action='get' then
 select * into s from tp_private.bp_seasons where id=p_id;if not found then raise exception 'Season nicht gefunden';end if;
 return to_jsonb(s)||jsonb_build_object('rewards',(select coalesce(jsonb_agg(to_jsonb(rw) order by rw.level),'[]'::jsonb) from tp_private.bp_rewards rw where rw.season_id=s.id),'missions',(select coalesce(jsonb_agg(to_jsonb(m) order by m.period_kind,m.code),'[]'::jsonb) from tp_private.bp_missions m where m.season_id=s.id));
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp_admin',0));
 if p_action='test_unlock' or p_action='test_reset' then
 if to_regclass('tp_private.bp_test_art_installers') is null then raise exception 'Nur TEST';end if;
 select * into s from tp_private.bp_seasons where id=p_id and published;if not found then raise exception 'Nur veröffentlichte Seasons';end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp:'||u::text||':'||s.id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('tp_bp_equip:'||u::text,0));
 delete from tp_private.bp_claims where owner_id=u and season_id=s.id and code in ('manual-test-unlock-v1','manual-test-unlock-v2');
 if p_action='test_unlock' then
 selected_level:=(p_payload->>'level')::integer;
 if selected_level is null or selected_level not between 1 and s.level_count then raise exception 'Ungültige Stufe';end if;
 insert into tp_private.bp_claims(season_id,owner_id,period_kind,period_start,code,xp) select s.id,u,'season',s.starts,'manual-test-unlock-v2',v.points::integer from (select selected_level*s.xp_per_level-coalesce(sum(xp),0) points from tp_private.bp_claims where owner_id=u and season_id=s.id) v where v.points>0;
 end if;
 delete from tp_private.bp_equipped e where e.owner_id=u and e.season_id=s.id and e.level*s.xp_per_level>coalesce((select sum(c.xp) from tp_private.bp_claims c where c.owner_id=u and c.season_id=s.id),0);
 return jsonb_build_object('ok',true);
 end if;
 if p_action='publish' then
 select * into s from tp_private.bp_seasons where id=p_id and revision=p_revision and not published for update;
 if not found then raise exception 'Entwurf wurde geändert oder bereits veröffentlicht';end if;
 if s.starts<d then raise exception 'Startdatum liegt in der Vergangenheit';end if;
 if exists(select 1 from tp_private.bp_seasons x where x.published and x.starts<s.ends and x.ends>s.starts) then raise exception 'Zeitraum überschneidet sich mit veröffentlichter Season';end if;
 link_id:=(p_payload->>'design_id')::bigint;link_revision:=(p_payload->>'design_revision')::bigint;
 if link_id is not null then
 perform pg_advisory_xact_lock(hashtextextended('tp_season_design',0));
 update tp_private.season_designs set starts=s.starts,ends=s.ends,published=true,revision=revision+1,updated_at=now() where id=link_id and revision=link_revision;
 if not found then raise exception 'Design wurde geändert. Bitte neu laden.';end if;
 end if;
 update tp_private.bp_seasons set published=true,revision=revision+1 where id=s.id returning * into s;return to_jsonb(s);
 end if;
 if p_action<>'save' or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>3500000 then raise exception 'Ungültiger Entwurf';end if;
 nm:=trim(p_payload->>'name');start_date:=(p_payload->>'starts')::date;end_date:=(p_payload->>'ends')::date;levels:=(p_payload->>'level_count')::integer;rate:=(p_payload->>'xp_per_level')::integer;daily:=(p_payload->>'daily_bonus')::integer;weekly:=(p_payload->>'weekly_bonus')::integer;
 if nm is null or length(nm) not between 1 and 80 or start_date is null or end_date is null or end_date-start_date not between 7 and 62 or levels is null or levels not between 1 and 30 or rate is null or rate not between 100 and 5000 or daily is null or daily not between 0 and 2000 or weekly is null or weekly not between 0 and 5000 or jsonb_typeof(p_payload->'rewards') is distinct from 'array' or jsonb_typeof(p_payload->'missions') is distinct from 'array' then raise exception 'Ungültige Season-Daten';end if;
 if jsonb_array_length(p_payload->'rewards')<>levels or jsonb_array_length(p_payload->'missions') not between 1 and 20 then raise exception 'Belohnungen oder Aufgaben fehlen';end if;
 if p_id is null then
 if (select count(*) from tp_private.bp_seasons)>=24 then raise exception 'Maximal 24 Seasons';end if;
 insert into tp_private.bp_seasons(id,name,starts,ends,published,level_count,xp_per_level,daily_bonus,weekly_bonus) select coalesce(max(id),0)+1,nm,start_date,end_date,false,levels,rate,daily,weekly from tp_private.bp_seasons returning * into s;
 else
 update tp_private.bp_seasons set name=nm,starts=start_date,ends=end_date,level_count=levels,xp_per_level=rate,daily_bonus=daily,weekly_bonus=weekly,revision=revision+1 where id=p_id and not published and revision=p_revision returning * into s;
 if not found then raise exception 'Nur unveröffentlichte Entwürfe können bearbeitet werden';end if;
 delete from tp_private.bp_rewards where season_id=s.id;delete from tp_private.bp_missions where season_id=s.id;
 end if;
 for r in select value from jsonb_array_elements(p_payload->'rewards') loop
 if (r->>'level')::integer not between 1 and levels or length(trim(r->>'name')) not between 1 and 80 or r->>'name' is null or r->>'rarity' not in ('common','rare','epic','legendary') or tp_private.bp_slot(r->>'kind') is null then raise exception 'Ungültige Belohnung';end if;
 img:=r->>'art';
 if img is not null and img is distinct from ('./icons/bp-winter-'||(r->>'level')||'.svg') then
 if length(img)>220000 or img !~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Ungültige Grafik';end if;
 raw:=decode(split_part(img,',',2),'base64');if octet_length(raw)<24 or substring(raw from 1 for 4)<>convert_to('RIFF','UTF8') or substring(raw from 9 for 4)<>convert_to('WEBP','UTF8') then raise exception 'Ungültiges WebP-Bild';end if;
 end if;
 insert into tp_private.bp_rewards(season_id,level,name,kind,rarity,glyph,art) values(s.id,(r->>'level')::integer,trim(r->>'name'),r->>'kind',r->>'rarity','★',img);
 end loop;
 for r in select value from jsonb_array_elements(p_payload->'missions') loop
 insert into tp_private.bp_missions(season_id,period_kind,code,label,goal,xp,metric) values(s.id,r->>'period_kind',r->>'code',r->>'label',(r->>'goal')::integer,(r->>'xp')::integer,r->>'metric');
 end loop;
 return to_jsonb(s);
end $$;
revoke all on function public.tp_admin_bp_seasons(text,integer,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.tp_admin_bp_seasons(text,integer,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
