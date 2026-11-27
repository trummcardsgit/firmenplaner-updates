begin;
-- Private, server-owned progression. No client-supplied time, user, XP or level.
create table tp_private.bp_seasons(
 id integer primary key, name text not null, starts date not null, ends date not null check(ends>starts)
);
create table tp_private.bp_rewards(
 season_id integer references tp_private.bp_seasons(id), level integer check(level between 1 and 30), name text not null, kind text not null, rarity text not null, glyph text not null, primary key(season_id,level)
);
create table tp_private.bp_claims(
 season_id integer references tp_private.bp_seasons(id), owner_id uuid references public.tp_members(user_id), period_kind text not null check(period_kind in ('daily','weekly','season')), period_start date not null, code text not null, xp integer not null check(xp>0), awarded_at timestamptz not null default now(), primary key(season_id,owner_id,period_kind,period_start,code)
);
alter table tp_private.bp_seasons enable row level security;
alter table tp_private.bp_rewards enable row level security;
alter table tp_private.bp_claims enable row level security;
revoke all on tp_private.bp_seasons,tp_private.bp_rewards,tp_private.bp_claims from public,anon,authenticated;
insert into tp_private.bp_seasons select 1,'Vice City',d,(d+interval '1 month')::date from (select (now() at time zone 'Europe/Vienna')::date d) q;
insert into tp_private.bp_rewards(season_id,level,name,kind,rarity,glyph) values
(1,1,'Vice City Starter','Emblem','common','✦'),
(1,2,'Night Shift','Titel','common','☾'),
(1,3,'Ocean Drive','Banner','rare','☀'),
(1,4,'Neon Token','Sammlerobjekt','common','◆'),
(1,5,'Neon Pink','Profilrahmen','rare','◇'),
(1,6,'Sunset Rookie','Trophäe','rare','★'),
(1,7,'Vice Skyline','Hintergrund','rare','▥'),
(1,8,'Ticket Surfer','Titel','common','≈'),
(1,9,'Neon Check','Stempel','common','✓'),
(1,10,'Palm Glow','Profilrahmen','epic','✧'),
(1,11,'Tropical Hotline','Banner','rare','☀'),
(1,12,'Flamingo Crest','Emblem','rare','♢'),
(1,13,'Problem Hunter','Titel','rare','⌖'),
(1,14,'Sunset Flash','Effekt','epic','✴'),
(1,15,'Neon Mechanic','Trophäe','rare','⚙'),
(1,16,'Aqua Pulse','Profilfarbe','rare','≈'),
(1,17,'Vice Purple','Design','epic','◆'),
(1,18,'Gold Palm','Emblem','epic','✦'),
(1,19,'After Hours Agent','Titel','rare','☾'),
(1,20,'Vice Diamond','Profilrahmen','epic','◇'),
(1,21,'Midnight Boulevard','Banner','epic','☾'),
(1,22,'City Heat','Trophäe','epic','★'),
(1,23,'Retro Glow','Kommentarstil','epic','✧'),
(1,24,'Service King','Titel','epic','♛'),
(1,25,'Chrome Flamingo','Emblem','epic','♢'),
(1,26,'Night Coast','Hintergrund','epic','≈'),
(1,27,'Vice Gold','Menüdesign','legendary','✦'),
(1,28,'Vice Legend','Titel','legendary','♛'),
(1,29,'Neon Trophy Tower','Vitrinenobjekt','legendary','★'),
(1,30,'Vice City Master','Komplettpaket','legendary','♛');
create function tp_private.bp_challenges(p_owner uuid,p_season integer,p_now timestamptz)
returns table(period_kind text,period_start date,period_end date,code text,label text,goal integer,xp integer,progress integer)
language sql stable set search_path='' as $$
 with s as (select * from tp_private.bp_seasons where id=p_season),
 days as (select g::date d from s cross join lateral generate_series(s.starts::timestamp,least(s.ends-1,(p_now at time zone 'Europe/Vienna')::date)::timestamp,interval '1 day') g),
 periods as (
 select 'daily'::text k,d a,d+1 b from days
 union all select distinct 'weekly',greatest(s.starts,date_trunc('week',d)::date),least(s.ends,date_trunc('week',d)::date+7) from days cross join s
 union all select 'season',starts,ends from s where starts<=(p_now at time zone 'Europe/Vienna')::date
 ),
 defs(k,code,label,goal,xp,metric) as (values
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
 ),
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
create function public.tp_sync_battlepass() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s tp_private.bp_seasons%rowtype; stamp timestamptz:=now(); d date:=(stamp at time zone 'Europe/Vienna')::date; points integer; result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select * into s from tp_private.bp_seasons where starts<=d order by starts desc limit 1;
 if not found then return jsonb_build_object('available',false);end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp:'||u::text||':'||s.id::text,0));
 insert into tp_private.bp_claims(season_id,owner_id,period_kind,period_start,code,xp)
 select s.id,u,c.period_kind,c.period_start,c.code,c.xp from tp_private.bp_challenges(u,s.id,stamp) c where c.progress>=c.goal on conflict do nothing;
 insert into tp_private.bp_claims(season_id,owner_id,period_kind,period_start,code,xp)
 select s.id,u,c.period_kind,c.period_start,'bonus',case c.period_kind when 'daily' then 200 else 750 end
 from tp_private.bp_claims c where c.season_id=s.id and c.owner_id=u and c.period_kind in ('daily','weekly') and c.code<>'bonus' group by c.period_kind,c.period_start having count(*)=3 on conflict do nothing;
 select coalesce(sum(c.xp),0)::integer into points from tp_private.bp_claims c where c.season_id=s.id and c.owner_id=u;
 select jsonb_build_object('available',true,'season_id',s.id,'name',s.name,'starts',s.starts,'ends',s.ends,'active',d<s.ends,'days_left',greatest(s.ends-d,0),'xp',points,'level',least(30,points/1000),
 'challenges',coalesce((select jsonb_agg(jsonb_build_object('period',c.period_kind,'code',c.code,'label',c.label,'goal',c.goal,'xp',c.xp,'progress',case when a.code is not null then greatest(c.goal,c.progress) else c.progress end,'earned',a.code is not null) order by case c.period_kind when 'daily' then 1 when 'weekly' then 2 else 3 end,c.code) from tp_private.bp_challenges(u,s.id,stamp) c left join tp_private.bp_claims a on a.season_id=s.id and a.owner_id=u and a.period_kind=c.period_kind and a.period_start=c.period_start and a.code=c.code where c.period_kind='season' or (d<s.ends and d>=c.period_start and d<c.period_end)),'[]'::jsonb),
 'rewards',(select jsonb_agg(jsonb_build_object('level',r.level,'name',r.name,'kind',r.kind,'rarity',r.rarity,'glyph',r.glyph,'unlocked',r.level<=least(30,points/1000)) order by r.level) from tp_private.bp_rewards r where r.season_id=s.id)) into result;
 return result;
end $$;
revoke all on function public.tp_sync_battlepass() from public,anon,authenticated;
grant execute on function public.tp_sync_battlepass() to authenticated;
notify pgrst,'reload schema';
commit;
