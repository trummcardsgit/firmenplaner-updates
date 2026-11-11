'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createVapid, vapidToken, encryptPayload } = require('../push');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const exp = (prk, info, len) => hmac(prk, Buffer.concat([Buffer.from(info),Buffer.from([1])])).subarray(0,len);

test('VAPID JWT can be verified using the public JWK', () => {
  const vapid=createVapid(), token=vapidToken(vapid,'https://example.push.test');
  const [head,payload,signature]=token.split('.');
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  assert.equal(claims.aud,'https://example.push.test');
  const jwtKey=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:vapid.jwk.x,y:vapid.jwk.y},format:'jwk'});
  assert.ok(crypto.verify('sha256',Buffer.from(`${head}.${payload}`),{key:jwtKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
});

test('AES128GCM Web Push payload decrypts with user agent keys', () => {
  const ua=crypto.createECDH('prime256v1');
  const uaPublic=ua.generateKeys();
  const auth=crypto.randomBytes(16);
  const subscription={endpoint:'https://example.push.test/push/123',keys:{p256dh:uaPublic.toString('base64url'),auth:auth.toString('base64url')}};
  const data={title:'Aufgabe fällig',body:'Bitte jetzt erledigen',taskId:'abc'};
  const encrypted=encryptPayload(subscription,data);
  const salt=encrypted.subarray(0,16),rs=encrypted.readUInt32BE(16),idlen=encrypted[20],asPublic=encrypted.subarray(21,21+idlen);
  assert.equal(rs,4096);assert.equal(idlen,65);
  const shared=ua.computeSecret(asPublic);
  const ikm=exp(hmac(auth,shared),Buffer.concat([Buffer.from('WebPush: info\0'),uaPublic,asPublic]),32);
  const prk=hmac(salt,ikm);
  const key=exp(prk,Buffer.from('Content-Encoding: aes128gcm\0'),16);
  const nonce=exp(prk,Buffer.from('Content-Encoding: nonce\0'),12);
  const record=encrypted.subarray(21+idlen);
  const decipher=crypto.createDecipheriv('aes-128-gcm',key,nonce);
  decipher.setAuthTag(record.subarray(-16));
  const plain=Buffer.concat([decipher.update(record.subarray(0,-16)),decipher.final()]);
  assert.equal(plain.at(-1),2);
  assert.deepEqual(JSON.parse(plain.subarray(0,-1).toString()),data);
});
