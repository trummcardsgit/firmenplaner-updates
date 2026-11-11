'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const datadir=fs.mkdtempSync(path.join(os.tmpdir(),'firmenplaner-test-'));
process.env.DATA_DIR=datadir;
const { server }=require('../server');

test('single-user setup, login, firms, notes, tasks, export and delete',async t=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.close();fs.rmSync(datadir,{recursive:true,force:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  let session='';
  async function req(route,method='GET',body){
    const res=await fetch(origin+route,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(session?{Cookie:session}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    if(res.headers.get('set-cookie'))session=res.headers.get('set-cookie').split(';')[0];
    return {status:res.status,data:await res.json()};
  }
  assert.equal((await req('/api/setup')).data.setupRequired,true);
  assert.equal((await req('/api/bootstrap')).status,401);
  assert.equal((await req('/api/setup','POST',{password:'123'})).status,400);
  assert.equal((await req('/api/setup','POST',{password:'EinSehrSicheresPasswort123!'})).status,201);
  assert.equal((await req('/api/bootstrap')).status,200);
  const company=(await req('/api/companies','POST',{name:'Firma A',contact:'IT-Abteilung'})).data;
  assert.ok(company.id);
  assert.equal((await req('/api/companies','POST',{name:'firma a'})).status,409);
  const due=new Date(Date.now()+3600000).toISOString();
  const base={companyId:company.id,title:'Router prüfen',description:'Internet streikt',type:'task',dueAt:due,remindBefore:15,priority:'high',status:'open'};
  const task=(await req('/api/tasks','POST',base)).data;
  assert.ok(task.id);assert.equal(task.title,base.title);assert.equal(task.dueAt,due);
  assert.equal((await req(`/api/companies/${company.id}`,'DELETE')).status,409);
  assert.equal((await req(`/api/tasks/${task.id}`,'PATCH',{...base,status:'done'})).data.status,'done');
  const note=(await req('/api/tasks','POST',{...base,type:'note',title:'Gedanke',dueAt:null})).data;
  assert.equal(note.dueAt,null);
  const backup=(await req('/api/export')).data;
  assert.equal(backup.tasks.length,2);assert.equal(backup.companies.length,1);
  assert.equal((await req(`/api/tasks/${note.id}`,'DELETE')).status,200);
  assert.equal((await req(`/api/tasks/${task.id}`,'DELETE')).status,200);
  assert.equal((await req(`/api/companies/${company.id}`,'DELETE')).status,200);
  assert.equal((await req('/api/logout','POST',{})).status,200);
  assert.equal((await req('/api/bootstrap')).status,401);
  assert.equal((await req('/api/login','POST',{password:'falsch'})).status,401);
  assert.equal((await req('/api/login','POST',{password:'EinSehrSicheresPasswort123!'})).status,200);
  assert.equal((await req('/api/bootstrap')).status,200);
});
