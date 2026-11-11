'use strict';
const fs=require('node:fs');const path=require('node:path');
const {getFiles,packZip,sha256}=require('../update-core');
const root=path.join(__dirname,'..');const version=require('../package.json').version;
const out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
const archive=packZip(getFiles(root));fs.writeFileSync(path.join(out,'firmenplaner-update.zip'),archive);
const manifest={version,archive:'firmenplaner-update.zip',sha256:sha256(archive)};
fs.writeFileSync(path.join(out,'update.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Release v${version}: ${archive.length} bytes; SHA-256 ${manifest.sha256}`);
