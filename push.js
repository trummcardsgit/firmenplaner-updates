'use strict';
// No external packages required. RFC 8291 (aes128gcm) + RFC 8292 (VAPID).
const crypto = require('node:crypto');
const dns = require('node:dns').promises;
const https = require('node:https');
const net = require('node:net');
const { URL } = require('node:url');

const b64 = buf => Buffer.from(buf).toString('base64url');
const from64 = value => Buffer.from(value, 'base64url');
const hmac = (key, bytes) => crypto.createHmac('sha256', key).update(bytes).digest();
const expand = (prk, info, size) => hmac(prk, Buffer.concat([Buffer.from(info), Buffer.from([1])])).subarray(0, size);
const PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'fcm-xm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com'
]);
const NON_PUBLIC_ADDRESSES = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96],
  ['64:ff9b:1::', 48], ['100::', 64], ['2001::', 23], ['2001:db8::', 32],
  ['2002::', 16], ['3fff::', 20], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
]) NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv6');

function isAllowedPushHost(hostname) {
  return PUSH_HOSTS.has(hostname) || hostname.endsWith('.push.apple.com') || hostname.endsWith('.notify.windows.com');
}

function validatePushEndpoint(endpoint) {
  let u;
  try { u = typeof endpoint === 'string' ? new URL(endpoint) : null; } catch {}
  if (!u || u.protocol !== 'https:' || !u.hostname || u.username || u.password || u.port || !isAllowedPushHost(u.hostname)) {
    throw new Error('Invalid push endpoint');
  }
  return u;
}

function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !NON_PUBLIC_ADDRESSES.check(address, 'ipv4');
  if (family !== 6) return false;
  const firstHextet = Number.parseInt(address.split(':', 1)[0], 16);
  return firstHextet >= 0x2000 && firstHextet <= 0x3fff && !NON_PUBLIC_ADDRESSES.check(address, 'ipv6');
}

async function resolvePublicAddresses(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Push endpoint resolved to a non-public address');
  }
  return addresses;
}

function withAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); }
    );
  });
}

function pinnedLookup(hostname, addresses) {
  return (requestedHostname, options, callback) => {
    if (requestedHostname !== hostname) {
      const error = Object.assign(new Error('Unexpected push hostname'), { code: 'ENOTFOUND' });
      return callback(error);
    }
    const family = typeof options === 'number' ? options : options?.family;
    const eligible = family === 4 || family === 6 ? addresses.filter(item => item.family === family) : addresses;
    if (!eligible.length) {
      const error = Object.assign(new Error('No approved push address for requested family'), { code: 'ENOTFOUND' });
      return callback(error);
    }
    if (typeof options === 'object' && options.all) return callback(null, eligible);
    return callback(null, eligible[0].address, eligible[0].family);
  };
}

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
  const u = validatePushEndpoint(subscription.endpoint);
  const body = encryptPayload(subscription, value);
  const token = vapidToken(vapid, u.origin, subject);
  const signal = AbortSignal.timeout(10000);
  const addresses = await withAbort(resolvePublicAddresses(u.hostname), signal);
  const status = await new Promise((resolve, reject) => {
    const request = https.request(u, {
      method: 'POST',
      signal,
      agent: false,
      autoSelectFamily: true,
      lookup: pinnedLookup(u.hostname, addresses),
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Content-Length': String(body.length),
        'TTL': '86400',
        'Urgency': 'normal',
        'Authorization': `vapid t=${token}, k=${vapid.publicKey}`
      }
    }, response => {
      response.on('error', reject);
      response.resume();
      resolve(response.statusCode || 0);
    });
    request.on('error', reject);
    request.end(body);
  });
  if (status < 200 || status >= 300) {
    const err = new Error(`Push gateway rejected notification (${status})`);
    err.status = status;
    throw err;
  }
}

module.exports = { createVapid, encryptPayload, vapidToken, validatePushEndpoint, isPublicAddress, sendPush };
