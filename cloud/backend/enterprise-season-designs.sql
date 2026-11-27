begin;
create table tp_private.season_designs(
 id bigint generated always as identity primary key,
 name text not null check(length(name) between 1 and 80),
 starts date not null, ends date not null check(ends>starts),
 published boolean not null default false,
 palette jsonb not null default '{}'::jsonb,
 assets jsonb not null default '{}'::jsonb,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
alter table tp_private.season_designs enable row level security;
revoke all on tp_private.season_designs from public,anon,authenticated;
create function public.tp_season_branding(p_revision text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r tp_private.season_designs%rowtype; rev text; d date:=(now() at time zone 'Europe/Vienna')::date;
begin
 -- Public by design: only published artwork and colors, no user/account data.
 select * into r from tp_private.season_designs where published and starts<=d and ends>d order by starts desc,updated_at desc,id desc limit 1;
 if not found then return jsonb_build_object('revision','default','unchanged',p_revision='default','design',null);end if;
 rev:=r.id::text||':'||r.revision::text;
 if p_revision=rev then return jsonb_build_object('revision',rev,'unchanged',true);end if;
 return jsonb_build_object('revision',rev,'design',jsonb_build_object('name',r.name,'palette',r.palette,'assets',r.assets));
end $$;
create function public.tp_admin_season_design(p_action text,p_id bigint default null,p_revision bigint default null,p_payload jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r tp_private.season_designs%rowtype; k text; v text; raw bytea; n text; a jsonb; p jsonb; s date; e date; pub boolean; d date:=(now() at time zone 'Europe/Vienna')::date;
begin
 if auth.uid() is null or not tp_private.enterprise_admin() then raise exception 'Access denied';end if;
 if p_action='list' then
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'starts',starts,'ends',ends,'published',published,'revision',revision) order by starts desc,id desc) from tp_private.season_designs),'[]'::jsonb);
 end if;
 if p_action='get' then
 select * into r from tp_private.season_designs where id=p_id;
 if not found then raise exception 'Design nicht gefunden';end if;return to_jsonb(r);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_season_design',0));
 if p_action='disable' then
 update tp_private.season_designs set published=false,revision=revision+1,updated_at=now() where id=p_id and revision=p_revision returning * into r;
 if not found then raise exception 'Design wurde geändert. Bitte neu laden.';end if;return to_jsonb(r);
 end if;
 if p_action<>'save' or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Ungültige Aktion';end if;
 if octet_length(p_payload::text)>4000000 then raise exception 'Designpaket zu groß';end if;
 n:=trim(p_payload->>'name');s:=(p_payload->>'starts')::date;e:=(p_payload->>'ends')::date;pub:=(p_payload->>'published')::boolean;
 a:=p_payload->'assets';p:=p_payload->'palette';
 if n is null or length(n) not between 1 and 80 or s is null or e is null or e<=s or pub is null or jsonb_typeof(a) is distinct from 'object' or jsonb_typeof(p) is distinct from 'object' then raise exception 'Ungültiges Design';end if;
 if (select count(*) from jsonb_object_keys(a))>17 then raise exception 'Zu viele Grafiken';end if;
 for k,v in select key,value from jsonb_each_text(p) loop
 if k not in ('accent','secondary','background','surface') or v is null or v !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Ungültige Farbe';end if;
 end loop;
 for k,v in select key,value from jsonb_each_text(a) loop
 if k not in ('logo','appIcon','background','battlepass','dashboard','career','tickets','statistics','inventory','tasks','notes','solutions','projects','documents','companies','admin','settings') or v is null or length(v)>260000 or v !~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Ungültige Grafik';end if;
 raw:=decode(split_part(v,',',2),'base64');
 if octet_length(raw)<24 or substring(raw from 1 for 4)<>convert_to('RIFF','UTF8') or substring(raw from 9 for 4)<>convert_to('WEBP','UTF8') then raise exception 'Ungültiges WebP-Bild';end if;
 end loop;
 if p_id is null then
 if (select count(*) from tp_private.season_designs)>=24 then raise exception 'Maximal 24 gespeicherte Designs';end if;
 insert into tp_private.season_designs(name,starts,ends,published,palette,assets) values(n,s,e,pub,p,a) returning * into r;
 else
 update tp_private.season_designs set name=n,starts=s,ends=e,published=pub,palette=p,assets=a,revision=revision+1,updated_at=now() where id=p_id and revision=p_revision returning * into r;
 if not found then raise exception 'Design wurde geändert. Bitte neu laden.';end if;
 end if;
 return to_jsonb(r);
end $$;
revoke all on function public.tp_season_branding(text),public.tp_admin_season_design(text,bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.tp_season_branding(text) to anon,authenticated;
grant execute on function public.tp_admin_season_design(text,bigint,bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
