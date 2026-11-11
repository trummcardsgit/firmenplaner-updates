#!/usr/bin/env node
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const version=process.argv[2];
if(!/^\d+\.\d+\.\d+$/.test(version||'')){
 console.error('Aufruf: node scripts/bump-version.js 1.2.0');process.exit(1);
}
const root=path.resolve(__dirname,'..');
const pkg=path.join(root,'package.json');
const data=JSON.parse(fs.readFileSync(pkg,'utf8'));
const old=data.version;
if(old===version){console.log('Version bereits',version);process.exit(0);}
function cmp(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;}
if(cmp(version,old)<=0){console.error(`Neue Version muss hoeher sein als ${old}`);process.exit(1);}
data.version=version;fs.writeFileSync(pkg,JSON.stringify(data,null,2)+'\n');
for(const file of ['public/index.html','public/app.js','public/sw.js']){
 const target=path.join(root,file),content=fs.readFileSync(target,'utf8').split(old).join(version);
 fs.writeFileSync(target,content);
}
console.log(`FirmenPlaner ${old} -> ${version}`);
