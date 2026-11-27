begin;
do $$ begin
 if (select count(*) from tp_private.bp_rewards where season_id=1)<>30 then raise exception 'Reward count changed';end if;
 if (select count(distinct kind) from tp_private.bp_rewards where season_id=1)<>4 then raise exception 'Wrong category count';end if;
 if exists(select 1 from tp_private.bp_rewards where tp_private.bp_slot(kind) is null) then raise exception 'Invalid category';end if;
 if exists(select 1 from tp_private.bp_equipped e join tp_private.bp_rewards r using(season_id,level) where e.slot is distinct from tp_private.bp_slot(r.kind)) then raise exception 'Stale equipment';end if;
 if tp_private.bp_slot('Emblem') is not null or tp_private.bp_slot('Design') is not null or tp_private.bp_slot('Komplettpaket') is not null then raise exception 'Retired category still allowed';end if;
 if (select kind from tp_private.bp_rewards where season_id=1 and level=30)<>'Visitenkarte' then raise exception 'Master must be a calling card';end if;
end $$;
rollback;
