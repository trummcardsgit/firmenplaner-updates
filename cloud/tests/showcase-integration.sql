begin;
insert into public.tp_user_trophies(owner_id,trophy_id) values('00000000-0000-0000-0000-000000000001',1),('00000000-0000-0000-0000-000000000002',2) on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
insert into public.tp_trophy_showcases(owner_id,trophy_ids) values(auth.uid(),array[1]);
do $$ begin
 begin update public.tp_trophy_showcases set trophy_ids=array[2] where owner_id=auth.uid();raise exception 'Locked trophy accepted';exception when others then if sqlerrm='Locked trophy accepted' then raise;end if;end;
 begin update public.tp_trophy_showcases set trophy_ids=array[1,1] where owner_id=auth.uid();raise exception 'Duplicate accepted';exception when others then if sqlerrm='Duplicate accepted' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
insert into public.tp_trophy_showcases(owner_id,trophy_ids) values(auth.uid(),array[2]);
do $$ begin
 if not exists(select 1 from public.tp_trophy_showcases where owner_id='00000000-0000-0000-0000-000000000001' and trophy_ids=array[1]) then raise exception 'Colleague showcase missing';end if;
 update public.tp_trophy_showcases set trophy_ids='{}' where owner_id='00000000-0000-0000-0000-000000000001';
 if found then raise exception 'Modified colleague';end if;
 if exists(select 1 from public.tp_user_trophies where owner_id='00000000-0000-0000-0000-000000000001') then raise exception 'Private trophy collection exposed';end if;
end $$;
reset role;
update public.tp_members set active=false where user_id='00000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin if exists(select 1 from public.tp_trophy_showcases where owner_id='00000000-0000-0000-0000-000000000002') then raise exception 'Inactive showcase exposed';end if;end $$;
rollback;