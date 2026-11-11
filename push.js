'use strict';
// No external packages required. RFC 8291 (aes128gcm) + RFC 8292 (VAPID).
const crypto = require('node:crypto');
const { URL } = require('node:url');

const b64 = buf => Buffer.from(buf).toString('base64url');
const from64 = value => Buffer.from(value, 'base64url');
const hmac = (key, bytes) => crypto.createHmac('sha256', key).update(bytes).digest();
const expand = (prk, info, size) => hmac(prk, Buffer.concat([Buffer.from(info), Buffer.from([1])])).subarray(0, size);

function createVapid() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { jwk, publicKey: b64(Buffer.concat([Buffer.from([4]), from64(jwk.x), from64(jwk.y)])) };
}

function encryptPayload(subscription, value) {
  const uaPublic = from64(subscription.keys.p256dh);
  const authSecret = from64(subscription.keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) {
    throw new Error('Invalid push subscription keys');
  }
  const as = crypto.createECDH('prime256v1');
  const asPublic = as.generateKeys();
  const shared = as.computeSecret(uaPublic);
  const ikm = expand(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = expand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = expand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const message = Buffer.from(JSON.stringify(value), 'utf8');
  if (message.length > 3500) throw new Error('Push payload too long');
  const recordSize = 4096;
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const payload = Buffer.concat([cipher.update(Buffer.concat([message, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(recordSize);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, payload]);
}

function vapidToken(vapid, audience, subject = null) {
  const header = b64(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = { aud: audience, exp: Math.floor(Date.now() / 1000) + 3600 };
  if (subject) payload.sub = subject;
  const claims = b64(JSON.stringify(payload));
  const unsigned = `${header}.${claims}`;
  const key = crypto.createPrivateKey({ key: vapid.jwk, format: 'jwk' });
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${b64(signature)}`;
}

async function sendPush(subscription, value, vapid, subject = null) {
  const u = new URL(subscription.endpoint);
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) throw new Error('Invalid push endpoint');
  const body = encryptPayload(subscription, value);
  const token = vapidToken(vapid, u.origin, subject);
  const response = await fetch(u.href, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Content-Length': String(body.length),
      'TTL': '86400',
      'Urgency': 'normal',
      'Authorization': `vapid t=${token}, k=${vapid.publicKey}`
    },
    body
  });
  if (!response.ok) {
    const err = new Error(`Push gateway rejected notification (${response.status})`);
    err.status = response.status;
    throw err;
  }
}

module.exports = { createVapid, encryptPayload, vapidToken, sendPush };
