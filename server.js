'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { createVapid, sendPush } = require('./push');
// Update management runs in the parent process, never via user-submitted shell commands.
const updaterRequests = new Map();
process.on('message', message => {
  if (message?.type !== 'update:response') return;
  const pending = updaterRequests.get(message.id);
  if (!pending) return;
  updaterRequests.delete(message.id);
  clearTimeout(pending.timer);
  if (message.error) pending.reject(new Error(message.error));
  else pending.resolve(message.data);
});
function askUpdater(action, payload) {
  if (!process.send) return Promise.reject(Object.assign(new Error('Update-Manager nicht aktiv. Bitte start-windows.bat verwenden.'), { code: 503 }));
  return new Promise((resolve,reject) => {
    const requestId = crypto.randomUUID();
    const timer = setTimeout(() => {
      updaterRequests.delete(requestId);
      reject(Object.assign(new Error('Update-Manager antwortet nicht'), { code: 504 }));
    }, action === 'check' ? 40000 : 12000);
    updaterRequests.set(requestId,{resolve,reject,timer});
    process.send({ type: 'update:request', id: requestId, action, payload });
  });
}


const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'firmenplaner.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const attemptMap = new Map();
let isChecking = false;

fs.mkdirSync(DATA_DIR, { recursive: true });
const freshDb = () => ({ version: 1, user: null, sessions: [], companies: [], tasks: [], subscriptions: [], vapid: createVapid(), pushSubject: null });
let db;
if (fs.existsSync(DATA_FILE)) {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!db.vapid) db.vapid = createVapid();
} else db = freshDb();
function persist() {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, DATA_FILE);
}
persist();

const iso = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const sha = input => crypto.createHash('sha256').update(input).digest('hex');
const clean = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const hashPassword = password => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
};
function passwordMatches(password, stored) {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const given = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, given);
}
function sendJson(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}
function fail(res, code, message) { sendJson(res, code, { error: message }); }
function parseCookies(header) {
  return Object.fromEntries((header || '').split(';').map(s => s.trim().split(/=(.*)/s).slice(0,2)).filter(p => p[0] && p[1]));
}
function getSession(req) {
  const cookie = parseCookies(req.headers.cookie).fp_session;
  if (!cookie) return null;
  const tokenHash = sha(cookie);
  return db.sessions.find(s => s.hash === tokenHash && s.expiresAt > Date.now()) || null;
}
function cookieFor(req, token, maxAge) {
  const forwardedHttps = req.headers['x-forwarded-proto'] === 'https';
  const secure = Boolean(req.socket.encrypted || forwardedHttps);
  return `fp_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
function newSession(req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions = db.sessions.filter(s => s.expiresAt > Date.now());
  db.sessions.push({ hash: sha(token), expiresAt: Date.now() + SESSION_MS });
  persist();
  res.setHeader('Set-Cookie', cookieFor(req, token, SESSION_MS / 1000));
}
async function readJson(req) {
  const ct = req.headers['content-type'] || '';
  if (!ct.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('JSON-Inhalt erwartet'), { code: 415 });
  let data = '';
  for await (const chunk of req) {
    data += chunk.toString();
    if (data.length > 100000) throw Object.assign(new Error('Anfrage ist zu groß'), { code: 413 });
  }
  try { return JSON.parse(data || '{}'); } catch { throw Object.assign(new Error('Ungültiges JSON'), { code: 400 }); }
}
function validateOrigin(req) {
  if (!req.headers.origin) return true;
  try {
    const source = new URL(req.headers.origin);
    const ownHost = req.headers.host;
    return source.host === ownHost && (source.protocol === 'http:' || source.protocol === 'https:');
  } catch { return false; }
}
const validDatetime = value => value === null || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)));
const reminderOptions = [0, 5, 15, 30, 60, 1440];
function normalizeTask(body, previous = null) {
  const companyId = clean(body.companyId, 80);
  if (!db.companies.some(c => c.id === companyId)) throw Object.assign(new Error('Bitte eine gültige Firma auswählen'), { code: 400 });
  const title = clean(body.title, 140);
  if (!title) throw Object.assign(new Error('Bitte einen Titel eingeben'), { code: 400 });
  if (!['note', 'task'].includes(body.type)) throw Object.assign(new Error('Ungültiger Eintragstyp'), { code: 400 });
  if (body.dueAt !== null && body.dueAt !== undefined && !validDatetime(body.dueAt)) throw Object.assign(new Error('Ungültiger Zeitpunkt'), { code: 400 });
  const dueAt = body.type === 'task' ? (body.dueAt || null) : null;
  const remindBefore = Number(body.remindBefore ?? 0);
  if (!reminderOptions.includes(remindBefore)) throw Object.assign(new Error('Ungültige Vorwarnzeit'), { code: 400 });
  const status = body.type === 'note' ? 'open' : (body.status || 'open');
  if (!['open', 'done'].includes(status)) throw Object.assign(new Error('Ungültiger Status'), { code: 400 });
  const priority = body.priority || 'normal';
  if (!['low', 'normal', 'high'].includes(priority)) throw Object.assign(new Error('Ungültige Priorität'), { code: 400 });
  const modifiedSchedule = !previous || previous.dueAt !== dueAt || previous.remindBefore !== remindBefore || previous.type !== body.type || (previous.status === 'done' && status === 'open');
  return {
    title, description: clean(body.description, 10000), companyId, type: body.type, dueAt,
    remindBefore, priority, status,
    createdAt: previous?.createdAt || iso(), updatedAt: iso(),
    reminderSentAt: modifiedSchedule ? null : previous.reminderSentAt,
    dueSentAt: modifiedSchedule ? null : previous.dueSentAt
  };
}
function safeSubscription(body) {
  const subscription = body?.subscription;
  if (!subscription?.endpoint || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2500) throw Object.assign(new Error('Ungültiges Push-Abonnement'), { code: 400 });
  let u;
  try { u = new URL(subscription.endpoint); } catch { throw Object.assign(new Error('Ungültige Push-Adresse'), { code: 400 }); }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) throw Object.assign(new Error('Ungültige Push-Adresse'), { code: 400 });
  if (!subscription.keys || typeof subscription.keys.p256dh !== 'string' || typeof subscription.keys.auth !== 'string') throw Object.assign(new Error('Push-Schlüssel fehlen'), { code: 400 });
  if (Buffer.from(subscription.keys.p256dh, 'base64url').length !== 65 || Buffer.from(subscription.keys.auth, 'base64url').length < 16) throw Object.assign(new Error('Ungültige Push-Schlüssel'), { code: 400 });
  return { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } };
}

async function pushToAll(data) {
  const bad = [];
  const results = await Promise.allSettled(db.subscriptions.map(async item => {
    try { await sendPush(item, data, db.vapid, db.pushSubject); }
    catch (error) {
      if (error.status === 404 || error.status === 410) bad.push(item.endpoint);
      throw error;
    }
  }));
  if (bad.length) {
    db.subscriptions = db.subscriptions.filter(s => !bad.includes(s.endpoint));
    persist();
  }
  return { delivered: results.filter(r => r.status === 'fulfilled').length, failed: results.filter(r => r.status === 'rejected').length };
}
async function checkReminders() {
  if (isChecking || !db.user || !db.subscriptions.length) return;
  isChecking = true;
  try {
    const now = Date.now();
    const candidates = db.tasks.filter(t => t.type === 'task' && t.status === 'open' && t.dueAt).slice().sort((a,b) => a.dueAt.localeCompare(b.dueAt));
    for (const task of candidates) {
      const due = Date.parse(task.dueAt);
      if (due > now && task.remindBefore > 0 && !task.reminderSentAt && now >= due - task.remindBefore * 60000) {
        const c = db.companies.find(c => c.id === task.companyId);
        const result = await pushToAll({ title: `Bald fällig: ${task.title}`, body: `${c?.name || 'Firma'} · ${task.remindBefore} Min. vorher`, taskId: task.id, tag: `early-${task.id}-${due}` });
        if (result.delivered > 0) { task.reminderSentAt = iso(); persist(); }
      }
      if (due <= now && !task.dueSentAt) {
        const c = db.companies.find(c => c.id === task.companyId);
        const result = await pushToAll({ title: `Jetzt fällig: ${task.title}`, body: `${c?.name || 'Firma'} · Aufgabe jetzt erledigen`, taskId: task.id, tag: `due-${task.id}-${due}` });
        if (result.delivered > 0) { task.dueSentAt = iso(); persist(); }
      }
    }
  } finally { isChecking = false; }
}

const mimeTypes = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  let filepath = path.resolve(PUBLIC, '.' + pathname);
  if (pathname === '/') filepath = path.join(PUBLIC, 'index.html');
  if (!filepath.startsWith(PUBLIC + path.sep) && filepath !== path.join(PUBLIC, 'index.html')) return fail(res, 403, 'Zugriff verweigert');
  if (!fs.existsSync(filepath) || !fs.statSync(filepath).isFile()) return fail(res, 404, 'Nicht gefunden');
  const ext = path.extname(filepath);
  res.writeHead(200, {
    'Content-Type': `${mimeTypes[ext] || 'application/octet-stream'}; charset=utf-8`,
    'Cache-Control': ['.html', '.js', '.css', '.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=3600'
  });
  fs.createReadStream(filepath).pipe(res);
}

async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Methode nicht erlaubt');
    return serveStatic(req, res, pathname);
  }
  if (!validateOrigin(req)) return fail(res, 403, 'Ungültige Herkunft');
  const method = req.method;
  if (method === 'GET' && pathname === '/api/setup') return sendJson(res, 200, {
    setupRequired: !db.user, authenticated: Boolean(getSession(req)), publicVapidKey: db.vapid.publicKey
  });
  if (method === 'POST' && pathname === '/api/setup') {
    if (db.user) return fail(res, 409, 'Konto ist schon eingerichtet');
    const body = await readJson(req);
    if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 128) return fail(res, 400, 'Passwort muss 10 bis 128 Zeichen lang sein');
    db.user = { passwordHash: hashPassword(body.password), createdAt: iso() };
    newSession(req, res);
    persist();
    return sendJson(res, 201, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    const attempts = (attemptMap.get(ip) || []).filter(t => t > Date.now() - 15 * 60000);
    if (attempts.length >= 8) return fail(res, 429, 'Zu viele Versuche. Bitte später erneut versuchen');
    const body = await readJson(req);
    if (!db.user || typeof body.password !== 'string' || !passwordMatches(body.password, db.user.passwordHash)) {
      attempts.push(Date.now()); attemptMap.set(ip, attempts);
      return fail(res, 401, 'Passwort stimmt nicht');
    }
    attemptMap.delete(ip);
    newSession(req, res);
    return sendJson(res, 200, { ok: true });
  }
  if (!getSession(req)) return fail(res, 401, 'Bitte zuerst anmelden');
  if (method === 'POST' && pathname === '/api/logout') {
    const token = parseCookies(req.headers.cookie).fp_session;
    db.sessions = db.sessions.filter(s => s.hash !== sha(token || ''));
    persist();
    res.setHeader('Set-Cookie', cookieFor(req, '', 0));
    return sendJson(res, 200, { ok: true });
  }
  if (method === 'GET' && pathname === '/api/bootstrap') return sendJson(res, 200, { companies: db.companies, tasks: db.tasks, subscriptionCount: db.subscriptions.length });
  if (method === 'GET' && pathname === '/api/updates') return sendJson(res,200,await askUpdater('status'));
  if (method === 'POST' && pathname === '/api/updates/check') return sendJson(res,200,await askUpdater('check'));
  if (method === 'POST' && pathname === '/api/updates/config') {
    const b=await readJson(req);
    return sendJson(res,200,await askUpdater('config',{repo:b.repo,autoOnStart:b.autoOnStart}));
  }
  if (method === 'POST' && pathname === '/api/updates/install') return sendJson(res,202,await askUpdater('install'));

  if (method === 'POST' && pathname === '/api/companies') {
    const b = await readJson(req);
    const name = clean(b.name, 120);
    if (!name) return fail(res, 400, 'Firmenname fehlt');
    if (db.companies.some(c => c.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) return fail(res, 409, 'Firma ist bereits vorhanden');
    const company = { id: id(), name, contact: clean(b.contact, 200), createdAt: iso() };
    db.companies.push(company); persist();
    return sendJson(res, 201, company);
  }
  const companyMatch = pathname.match(/^\/api\/companies\/([0-9a-f-]+)$/);
  if (companyMatch && method === 'PATCH') {
    const company = db.companies.find(c => c.id === companyMatch[1]);
    if (!company) return fail(res, 404, 'Firma nicht gefunden');
    const b = await readJson(req);
    const name = clean(b.name, 120);
    if (!name) return fail(res, 400, 'Firmenname fehlt');
    if (db.companies.some(c => c.id !== company.id && c.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'))) return fail(res, 409, 'Firma ist bereits vorhanden');
    company.name = name; company.contact = clean(b.contact, 200);
    persist(); return sendJson(res, 200, company);
  }
  if (companyMatch && method === 'DELETE') {
    if (db.tasks.some(t => t.companyId === companyMatch[1])) return fail(res, 409, 'Firma ist noch mit Einträgen verknüpft');
    db.companies = db.companies.filter(c => c.id !== companyMatch[1]); persist();
    return sendJson(res, 200, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/tasks') {
    const b = await readJson(req);
    const task = { id: id(), ...normalizeTask(b) };
    db.tasks.unshift(task); persist();
    void checkReminders().catch(console.error);
    return sendJson(res, 201, task);
  }
  const taskMatch = pathname.match(/^\/api\/tasks\/([0-9a-f-]+)$/);
  if (taskMatch && method === 'PATCH') {
    const t = db.tasks.find(t => t.id === taskMatch[1]);
    if (!t) return fail(res, 404, 'Eintrag nicht gefunden');
    const b = await readJson(req);
    Object.assign(t, normalizeTask(b, t)); persist();
    void checkReminders().catch(console.error);
    return sendJson(res, 200, t);
  }
  if (taskMatch && method === 'DELETE') {
    db.tasks = db.tasks.filter(t => t.id !== taskMatch[1]); persist();
    return sendJson(res, 200, { ok: true });
  }
  if (method === 'GET' && pathname === '/api/push/config') return sendJson(res, 200, { subject: db.pushSubject || '' });
  if (method === 'POST' && pathname === '/api/push/config') {
    const b = await readJson(req);
    let subject = clean(b.subject, 255);
    if (subject && !subject.startsWith('mailto:') && !subject.startsWith('https://')) subject = `mailto:${subject}`;
    if (subject && !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(subject) && !/^https:\/\/[^/\s.]+\.[^/\s]+/.test(subject)) return fail(res, 400, 'Bitte eine gültige E-Mail-Adresse oder HTTPS-Adresse eingeben');
    db.pushSubject = subject || null; persist();
    return sendJson(res, 200, { subject: db.pushSubject || '' });
  }
  if (method === 'POST' && pathname === '/api/push/subscribe') {
    const subscription = safeSubscription(await readJson(req));
    db.subscriptions = db.subscriptions.filter(s => s.endpoint !== subscription.endpoint);
    db.subscriptions.push(subscription); persist();
    void checkReminders().catch(console.error);
    return sendJson(res, 201, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/push/unsubscribe') {
    const body = await readJson(req);
    db.subscriptions = db.subscriptions.filter(s => s.endpoint !== body.endpoint); persist();
    return sendJson(res, 200, { ok: true });
  }
  if (method === 'POST' && pathname === '/api/push/test') {
    const r = await pushToAll({ title: 'Test-Erinnerung', body: 'FirmenPlaner kann dich benachrichtigen.', tag: 'test' });
    return sendJson(res, 200, r);
  }
  if (method === 'GET' && pathname === '/api/export') {
    const exportData = { format: 'firmenplaner-backup-1', exportedAt: iso(), companies: db.companies, tasks: db.tasks };
    return sendJson(res, 200, exportData, { 'Content-Disposition': `attachment; filename="firmenplaner-backup-${iso().slice(0,10)}.json"` });
  }
  return fail(res, 404, 'API nicht gefunden');
}
const server = http.createServer((req, res) => {
  handler(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) fail(res, err.code && Number.isInteger(err.code) ? err.code : 500, err.code ? err.message : 'Interner Serverfehler');
  });
});
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`FirmenPlaner gestartet: http://${HOST}:${PORT}`);
    console.log(`Datenspeicher: ${DATA_FILE}`);
    if (process.send) process.send({type:'server:ready'});
    if (HOST === '0.0.0.0') console.log('ACHTUNG: Fuer Zugang aus dem Internet zwingend HTTPS-Reverse-Proxy verwenden.');
  });
  setInterval(() => { void checkReminders().catch(console.error); }, 30000);
  setTimeout(() => { void checkReminders().catch(console.error); }, 1000);
}
module.exports = { server, normalizeTask, checkReminders };
