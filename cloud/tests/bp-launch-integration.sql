begin;
-- Rollback-only, never change the deployment's date.
update tp_private.bp_seasons set starts=(now() at time zone 'Europe/Vienna')::date+3,ends=(now() at time zone 'Europe/Vienna')::date+34 where id=1;
insert into auth.sessions values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','aal2',null);
insert into auth.mfa_factors select id,user_id,'totp','verified' from auth.sessions;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare a jsonb; sample text:='data:image/webp;base64,UklGRjgAAABXRUJQVlA4ICwAAABwAQCdASoEAAEAAUAmJaACdAGIQAD+8JCi6T9T/Rf/UGf/6gz//UGfp4AAAA=='; begin
 a:=public.tp_sync_battlepass();
 if a->>'pending'<>'true' or a->>'available'<>'false' or a ? 'challenges' or a ? 'rewards' then raise exception 'Season start not locked';end if;
 if jsonb_array_length(public.tp_bp_inventory())<>0 then raise exception 'Unexpected inventory';end if;
 a:=public.tp_bp_art_install(jsonb_build_object('0',sample,'3',sample,'11',sample,'21',sample,'30',sample));
 if (select count(*) from jsonb_object_keys(a->'cards'))<>5 or a->>'test_unlocked'<>'false' then raise exception 'Production art import wrong';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from tp_private.bp_claims) then raise exception 'Premature XP';end if;
 if has_function_privilege('anon','public.tp_bp_art_install(jsonb)','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_card_art','INSERT') then raise exception 'Unsafe production art grants';end if;
end $$;
rollback;
