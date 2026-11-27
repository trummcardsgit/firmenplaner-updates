begin;
-- Apply only where the TEST artwork tables already exist. Never creates TEST endpoints in production.
do $guard$ begin
 if to_regclass('tp_private.bp_test_card_art') is null or to_regclass('tp_private.bp_test_art_installers') is null then return;end if;
 execute $ddl$CREATE OR REPLACE FUNCTION public.tp_test_bp_art_get()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select cards into result from tp_private.bp_test_card_art where id=1;
 return jsonb_build_object('cards',coalesce(result,'{}'::jsonb),'can_install',tp_private.enterprise_admin(),'test_unlocked',tp_private.enterprise_admin() and exists(select 1 from tp_private.bp_test_art_installers where owner_id=u) and exists(select 1 from tp_private.bp_claims where owner_id=u and season_id=1 and code='manual-test-unlock-v1'));
end $function$;$ddl$;
 execute $ddl$CREATE OR REPLACE FUNCTION public.tp_test_bp_art_install(p_cards jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); k text; v text; raw bytea;
begin
 if u is null or not tp_private.enterprise_admin() then raise exception 'Access denied';end if;
 if p_cards is null or jsonb_typeof(p_cards)<>'object' or octet_length(p_cards::text)>1200000 then raise exception 'Ungültiges Grafikpaket';end if;
 if (select count(*) from jsonb_object_keys(p_cards))<>5 then raise exception 'Fünf Visitenkarten erforderlich';end if;
 foreach k in array array['0','3','11','21','30'] loop
  if jsonb_typeof(p_cards->k) is distinct from 'string' then raise exception 'Grafik fehlt';end if;
  v:=p_cards->>k;
  if length(v)>230000 or v !~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Nur begrenzte WebP-Bilder erlaubt';end if;
  raw:=decode(split_part(v,',',2),'base64');
  if octet_length(raw)<24 or substring(raw from 1 for 4)<>convert_to('RIFF','UTF8') or substring(raw from 9 for 4)<>convert_to('WEBP','UTF8') then raise exception 'Ungültiges WebP-Bild';end if;
 end loop;
 insert into tp_private.bp_test_card_art(id,cards) values(1,p_cards) on conflict(id) do update set cards=excluded.cards,updated_at=now();
 return public.tp_test_bp_art_get();
end $function$;$ddl$;
 if to_regprocedure('public.tp_test_bp_preset(text)') is not null then
 execute $ddl$CREATE OR REPLACE FUNCTION public.tp_test_bp_preset(p_preset text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 declare u uuid:=auth.uid(); selected integer[];
 begin
 if u is null or not tp_private.enterprise_admin() or not exists(select 1 from tp_private.bp_test_art_installers where owner_id=u) then raise exception 'Access denied';end if;
 selected:=case p_preset when 'master' then array[30,28,27,29] when 'ocean' then array[3,2,5,1] when 'tropical' then array[11,8,10,12] when 'midnight' then array[21,19,20,25] else null end;
 if selected is null then raise exception 'Unbekannte Ausrüstung';end if;
 perform pg_advisory_xact_lock(hashtextextended('tp_bp_equip:'||u::text,0));
 if coalesce((select sum(xp) from tp_private.bp_claims where owner_id=u and season_id=1),0)<(select max(x)*1000 from unnest(selected) x) then raise exception 'Belohnungen noch gesperrt';end if;
 delete from tp_private.bp_equipped where owner_id=u;
 insert into tp_private.bp_equipped(owner_id,slot,season_id,level) select u,tp_private.bp_slot(r.kind),r.season_id,r.level from tp_private.bp_rewards r where r.season_id=1 and r.level=any(selected);
 return public.tp_bp_inventory();
 end $function$;$ddl$;
 end if;
 revoke all on function public.tp_test_bp_art_get(),public.tp_test_bp_art_install(jsonb) from public,anon,authenticated;
 grant execute on function public.tp_test_bp_art_get(),public.tp_test_bp_art_install(jsonb) to authenticated;
end $guard$;
notify pgrst,'reload schema';
commit;
