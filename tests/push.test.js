'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createVapid, vapidToken, encryptPayload, validatePushEndpoint, isPublicAddress } = require('../push');
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

test('push endpoint policy accepts supported browser gateways', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/chrome',
    'https://fcm-xm.googleapis.com/fcm/send/chrome',
    'https://android.googleapis.com/gcm/send/chrome',
    'https://updates.push.services.mozilla.com/wpush/v2/firefox',
    'https://web.push.apple.com/QHLegitimateToken',
    'https://wns2-am3p.notify.windows.com/w/?token=edge',
    'https://fcm.googleapis.com:443/fcm/send/explicit-standard-port'
  ]) assert.doesNotThrow(() => validatePushEndpoint(endpoint));
});

test('push endpoint policy rejects attacker-controlled destinations', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/fcm/send/insecure',
    'https://127.0.0.1/internal',
    'https://2130706433/internal',
    'https://0x7f000001/internal',
    'https://[::1]/internal',
    'https://attacker.example/push',
    'https://fcm.googleapis.com.attacker.example/push',
    'https://fcm.googleapis.com@127.0.0.1/internal',
    'https://fcm.googleapis.com./fcm/send/trailing-dot',
    'https://fcm.googleapis.com:8443/push',
    'https://user@fcm.googleapis.com/push'
  ]) assert.throws(() => validatePushEndpoint(endpoint), /Invalid push endpoint/);
});

test('push DNS policy rejects private and special-use addresses', () => {
  assert.equal(isPublicAddress('142.250.185.78'), true);
  assert.equal(isPublicAddress('2607:f8b0:4005:805::200e'), true);
  for (const address of [
    '0.0.0.0', '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.1.1', '192.0.2.1', '198.18.0.1', '224.0.0.1',
    '240.0.0.1', '::1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2001:db8::1',
    'fc00::1', 'fe80::1', 'ff02::1'
  ]) assert.equal(isPublicAddress(address), false);
});
