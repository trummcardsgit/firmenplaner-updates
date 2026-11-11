'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {validateRepo,compareVersions,packZip,unpackZip,getFiles,sha256,applyUpdate,latestRelease}=require('../update-core');
const root=path.resolve(__dirname,'..');
test('versions and safe repositories',()=>{
  assert.equal(compareVersions('1.1.0','1.0.9'),1);
  assert.equal(compareVersions('1.1.0','v1.1.0'),0);
  assert.equal(compareVersions('1.1.0','1.1.1'),-1);
  assert.equal(validateRepo('meinname/FirmenPlaner'),'meinname/FirmenPlaner');
  assert.throws(()=>validateRepo('https://evil.com'),/Repository/);
  assert.throws(()=>validateRepo('foo/../bar'),/Repository/);
});
test('release archive includes program, no user data and CRC verification',()=>{
  const zip=packZip(getFiles(root)),entries=unpackZip(zip);
  assert.equal(JSON.parse(entries.get('package.json').toString()).version,require('../package.json').version);
  assert.ok(entries.has('public/app.js'));
  assert.ok(![...entries.keys()].some(f=>f.startsWith('data/')));
  const bad=Buffer.from(zip);bad[100]^=1;
  assert.throws(()=>unpackZip(bad),/Prüfsumme/);
  assert.equal(sha256(zip).length,64);
});
test('path traversal is rejected',()=>{
  assert.throws(()=>packZip([['public/../../tmp',Buffer.from('pwn')]]),/nicht erlaubt/);
});
test('update backs up code, preserves existing firms and tasks, supports restore',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'firmenplaner-update-'));
  try{
    const fakeRoot=path.join(dir,'app'),data=path.join(fakeRoot,'data');
    fs.mkdirSync(path.join(fakeRoot,'public'),{recursive:true});fs.mkdirSync(data);
    fs.writeFileSync(path.join(fakeRoot,'server.js'),'OLD SERVER');
    const records={companies:[{name:'Testbetrieb'}],tasks:[{title:'Telefonanlage prüfen'}]};
    fs.writeFileSync(path.join(data,'firmenplaner.json'),JSON.stringify(records));
    const zip=packZip(getFiles(root));
    const result=applyUpdate(fakeRoot,data,zip,require('../package.json').version);
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,'firmenplaner.json'))).tasks[0].title,'Telefonanlage prüfen');
    assert.equal(fs.readFileSync(path.join(result.backup,'server.js'),'utf8'),'OLD SERVER');
    assert.ok(fs.existsSync(path.join(result.backup,'firmenplaner.json.backup')));
    assert.ok(fs.readFileSync(path.join(fakeRoot,'server.js'),'utf8').includes('createVapid'));
    result.restore();
    assert.equal(fs.readFileSync(path.join(fakeRoot,'server.js'),'utf8'),'OLD SERVER');
    assert.equal(JSON.parse(fs.readFileSync(path.join(data,'firmenplaner.json'))).companies[0].name,'Testbetrieb');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('GitHub release metadata and manifest are checked',async()=>{
  const repo='example/FirmenPlaner';
  const zipurl=`https://github.com/${repo}/releases/download/v1.2.0/firmenplaner-update.zip`;
  const manifesturl=`https://github.com/${repo}/releases/download/v1.2.0/update.json`;
  const hex='a'.repeat(64);
  const makeResult=data=>({ok:true,status:200,headers:{get:()=>null},arrayBuffer:async()=>Uint8Array.from(Buffer.from(JSON.stringify(data))).buffer});
  const fakeFetch=async url=>{
    if(url.includes('api.github.com'))return makeResult({tag_name:'v1.2.0',assets:[{name:'firmenplaner-update.zip',browser_download_url:zipurl},{name:'update.json',browser_download_url:manifesturl}]});
    if(url===manifesturl)return makeResult({version:'1.2.0',sha256:hex,archive:'firmenplaner-update.zip'});
    throw new Error('Unexpected '+url);
  };
  const release=await latestRelease(repo,fakeFetch);
  assert.equal(release.version,'1.2.0');assert.equal(release.sha256,hex);
});
