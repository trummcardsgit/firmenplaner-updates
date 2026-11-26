begin;
insert into auth.sessions values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','aal2',null),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','aal2',null);
insert into auth.mfa_factors values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','totp','verified'),('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','totp','verified');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000001','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
insert into public.tp_ticket_filter_preferences(owner_id,category,status_filter) values(auth.uid(),'all',''),(auth.uid(),'my','accepted'),(auth.uid(),'open','open');
do $$ begin
 if (select count(*) from public.tp_ticket_filter_preferences)<>3 then raise exception 'Category separation failed';end if;
 update public.tp_ticket_filter_preferences set status_filter='closed' where category='my';
 if not exists(select 1 from public.tp_ticket_filter_preferences where category='all' and status_filter='') then raise exception 'Other category altered';end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id','10000000-0000-0000-0000-000000000002','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now())::bigint)))::text,true);
insert into public.tp_ticket_filter_preferences(owner_id,category) values(auth.uid(),'all');
do $$ begin
 if (select count(*) from public.tp_ticket_filter_preferences)<>1 then raise exception 'Other preferences visible';end if;
 update public.tp_ticket_filter_preferences set status_filter='closed' where owner_id='00000000-0000-0000-0000-000000000001';
 if found then raise exception 'Other filter modified';end if;
 delete from public.tp_ticket_filter_preferences where owner_id='00000000-0000-0000-0000-000000000001';
 if found then raise exception 'Other filter deleted';end if;
end $$;
select set_config('request.jwt.claims','{"aal":"aal1"}',true);
do $$ begin if exists(select 1 from public.tp_ticket_filter_preferences) then raise exception 'MFA bypass';end if;end $$;
reset role;
do $$ begin if has_table_privilege('anon','public.tp_ticket_filter_preferences','SELECT') then raise exception 'Anonymous access';end if;end $$;
rollback;