begin;
create table tp_private.bp_card_art(id integer primary key check(id=1),cards jsonb not null,updated_at timestamptz not null default now());
alter table tp_private.bp_card_art enable row level security;
revoke all on tp_private.bp_card_art from public,anon,authenticated;
create function public.tp_bp_art_get() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not tp_private.enterprise_member() then raise exception 'Access denied';end if;
 select cards into result from tp_private.bp_card_art where id=1;
 return jsonb_build_object('cards',coalesce(result,'{}'::jsonb),'can_install',tp_private.enterprise_admin(),'test_unlocked',false);
end $$;
create function public.tp_bp_art_install(p_cards jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; v text; raw bytea;
begin
 if auth.uid() is null or not tp_private.enterprise_admin() then raise exception 'Access denied';end if;
 if p_cards is null or jsonb_typeof(p_cards) is distinct from 'object' or octet_length(p_cards::text)>1200000 then raise exception 'Ungültiges Grafikpaket';end if;
 if (select count(*) from jsonb_object_keys(p_cards))<>5 then raise exception 'Fünf Visitenkarten erforderlich';end if;
 foreach k in array array['0','3','11','21','30'] loop
  if jsonb_typeof(p_cards->k) is distinct from 'string' then raise exception 'Grafik fehlt';end if;
  v:=p_cards->>k;
  if length(v)>230000 or v !~ '^data:image/webp;base64,[A-Za-z0-9+/]+={0,2}$' then raise exception 'Nur begrenzte WebP-Bilder erlaubt';end if;
  raw:=decode(split_part(v,',',2),'base64');
  if octet_length(raw)<24 or substring(raw from 1 for 4)<>convert_to('RIFF','UTF8') or substring(raw from 9 for 4)<>convert_to('WEBP','UTF8') then raise exception 'Ungültiges WebP-Bild';end if;
 end loop;
 insert into tp_private.bp_card_art(id,cards) values(1,p_cards) on conflict(id) do update set cards=excluded.cards,updated_at=now();
 return public.tp_bp_art_get();
end $$;
revoke all on function public.tp_bp_art_get(),public.tp_bp_art_install(jsonb) from public,anon,authenticated;
grant execute on function public.tp_bp_art_get(),public.tp_bp_art_install(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
