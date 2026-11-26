import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const schema=read("../backend/staging-baseline.sql");
const quota=schema.match(/create or replace function tp_private\.enforce_push_subscription_quota\(\)[\s\S]*?\n\$\$;/)?.[0]||"";
assert.match(quota,/pg_advisory_xact_lock/);
assert.match(quota,/not exists\([\s\S]*endpoint=new\.endpoint/);
assert.match(quota,/count\(\*\)[\s\S]*>=10/);
assert.match(schema,/create trigger tp_push_subscription_quota before insert on public\.tp_push_subscriptions/);
const rateLimit=schema.match(/create or replace function public\.tp_claim_push_test\(p_owner uuid\)[\s\S]*?\n\$\$;/)?.[0]||"";
assert.match(rateLimit,/on conflict\(owner_id\) do update/);
assert.match(rateLimit,/interval '1 minute'/);
assert.match(schema,/grant execute on function public\.tp_claim_push_test\(uuid\) to service_role/);

for(const path of ["../backend/tp-background-push.ts","../backend/tp-background-push-mfa.ts"]){
 const handler=read(path);
 assert.match(handler,/const maxPushSubscriptions = 10;/);
 assert.match(handler,/const maxPushConcurrency = 3;/);
 assert.match(handler,/\.limit\(maxPushSubscriptions\+1\)/);
 assert.match(handler,/\.slice\(0,maxPushSubscriptions\)/);
 assert.match(handler,/targets\.slice\(offset,offset\+maxPushConcurrency\)/);
 assert.match(handler,/admin\.rpc\("tp_claim_push_test",\{p_owner:userId\}\)/);
 assert.match(handler,/eine Minute warten\."\},429/);
 assert.ok(handler.indexOf('admin.rpc("tp_claim_push_test"')<handler.indexOf("webpush.importVapidKeys"));
}

const app=read("../public/app.js");
assert.match(app,/\.upsert\(\{[\s\S]*endpoint:obj\.endpoint[\s\S]*\},\{onConflict:"endpoint"\}\)/);
assert.match(app,/\.delete\(\)\.eq\("endpoint",subscription\.endpoint\)/);
