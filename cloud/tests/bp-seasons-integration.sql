begin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000005','season-role@example.invalid');
insert into public.tp_members(user_id,display_name,active) values ('00000000-0000-0000-0000-000000000005','CI member',true);
insert into auth.sessions values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','aal2',null),('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','aal2',null);
insert into auth.mfa_factors select id,user_id,'totp','verified' from auth.sessions;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ declare a jsonb; sid integer; d date; p jsonb; before jsonb;
begin
 d:=(public.tp_sync_battlepass()->>'ends')::date;
 p:=jsonb_build_object('name','Winter','starts',d,'ends',d+30,'level_count',2,'xp_per_level',500,'daily_bonus',200,'weekly_bonus',750,'rewards',jsonb_build_array(jsonb_build_object('level',1,'name','Frost','kind','Titel','rarity','rare'),jsonb_build_object('level',2,'name','Snow','kind','Visitenkarte','rarity','epic')),'missions',jsonb_build_array(jsonb_build_object('period_kind','daily','code','task','label','Task','goal',1,'xp',200,'metric','task')));
 a:=public.tp_admin_bp_seasons('save',null,null,p);sid:=(a->>'id')::int;
 if (a->>'published')::boolean then raise exception 'Draft unexpectedly published';end if;
 if public.tp_sync_battlepass()->>'season_id'<>'1' then raise exception 'Draft displaced active season';end if;
 if jsonb_array_length(public.tp_admin_bp_seasons('get',sid)->'rewards')<>2 then raise exception 'Rewards not saved';end if;
 a:=public.tp_admin_bp_seasons('publish',sid,1,null);
 if not (a->>'published')::boolean then raise exception 'Publish failed';end if;
 if public.tp_sync_battlepass()->>'season_id'<>'1' then raise exception 'Future season activated early';end if;
 begin perform public.tp_admin_bp_seasons('save',sid,2,p);raise exception 'Published rewards edited';exception when raise_exception then if sqlerrm<>'Nur unveröffentlichte Entwürfe können bearbeitet werden' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000005','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
do $$ begin
 begin perform public.tp_admin_bp_seasons('list');raise exception 'Non-admin access';exception when raise_exception then if sqlerrm<>'Access denied' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from tp_private.bp_missions where season_id=1)<>11 then raise exception 'Legacy tasks lost';end if;
 if (select xp_per_level from tp_private.bp_seasons where id=1)<>1000 then raise exception 'Legacy rate lost';end if;
 if has_function_privilege('anon','public.tp_admin_bp_seasons(text,integer,bigint,jsonb)','EXECUTE') or has_table_privilege('authenticated','tp_private.bp_missions','INSERT') then raise exception 'Unsafe grants';end if;
end $$;
rollback;
