begin;
do $$ begin
 if (select count(*) from tp_private.bp_missions where season_id=1)<>11 then raise exception 'Legacy tasks lost';end if;
 if (select xp_per_level from tp_private.bp_seasons where id=1)<>1000 then raise exception 'Legacy rate lost';end if;
 if has_function_privilege('anon','public.tp_admin_bp_seasons(text,integer,bigint,jsonb)','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_missions','INSERT') then raise exception 'Unsafe grants';end if;
end $$;
rollback;
