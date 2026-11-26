#!/usr/bin/env bash
set -euo pipefail
# Only run on the disposable GitHub PostgreSQL service.
[[ "$PGDATABASE" == "enterprise_ci" ]] || { echo "Refusing non-CI database"; exit 1; }
id=$(psql -XqAt -v ON_ERROR_STOP=1 <<'SQL'
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.tp_admin_member('00000000-0000-0000-0000-000000000002','Employee 2',true,false);
select public.tp_admin_member('00000000-0000-0000-0000-000000000003','Employee 3',true,false);
select public.tp_admin_company('Concurrent test');
select public.tp_create_ticket((select id from public.tp_ticket_companies where name='Concurrent test'),'Race test','Simultaneous acceptance','normal',array['00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003']::uuid[]);
SQL
)
id=$(echo "$id" | tail -n 1)
[[ "$id" =~ ^[0-9]+$ ]]
logs=$(mktemp -d)
trap 'rm -rf "$logs"' EXIT
accept() {
  psql -XqAt -v ON_ERROR_STOP=1 -v id="$id" <<SQL
begin;
set role authenticated;
set request.jwt.claim.sub='$1';
select pg_sleep(0.2);
select public.tp_respond_ticket(:id,true);
select pg_sleep(0.5);
commit;
SQL
}
accept 00000000-0000-0000-0000-000000000002 >"$logs/a" 2>&1 & a=$!
accept 00000000-0000-0000-0000-000000000003 >"$logs/b" 2>&1 & b=$!
set +e
wait "$a"; ra=$?
wait "$b"; rb=$?
set -e
if ! { [[ "$ra" -eq 0 && "$rb" -ne 0 ]] || [[ "$rb" -eq 0 && "$ra" -ne 0 ]]; }; then cat "$logs/a" "$logs/b"; exit 1; fi
grep -q 'Ticket ist nicht mehr offen' "$logs/a" "$logs/b"
result=$(psql -XqAt -v ON_ERROR_STOP=1 -v id="$id" <<'SQL'
select count(*) from public.tp_ticket_candidates c join public.tp_tickets t on t.id=c.ticket_id where t.id=:id and t.status='accepted' and c.response='accepted' and c.user_id=t.assignee_id;
SQL
)
[[ "$result" == "1" ]]
echo "Concurrent acceptance passed: one owner and one rejected request."
