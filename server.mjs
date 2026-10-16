import './ai-planner.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.LIFETEMPO_OPENAI_KEY || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.LIFETEMPO_OPENROUTER_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.LIFETEMPO_ANTHROPIC_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.LIFETEMPO_GEMINI_KEY || '';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.LIFETEMPO_DEEPSEEK_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.LIFETEMPO_GROQ_KEY || '';
const COHERE_API_KEY = process.env.COHERE_API_KEY || process.env.LIFETEMPO_COHERE_KEY || '';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || process.env.LIFETEMPO_MISTRAL_KEY || '';
const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY || process.env.LIFETEMPO_TOGETHER_KEY || '';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.LIFETEMPO_DATA_DIR || path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'lifetempo.sqlite'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS booking_config (
    id INTEGER PRIMARY KEY CHECK(id = 1), slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '預約時間', timezone TEXT NOT NULL DEFAULT 'Asia/Taipei',
    start_hour INTEGER NOT NULL DEFAULT 9, end_hour INTEGER NOT NULL DEFAULT 17,
    duration INTEGER NOT NULL DEFAULT 60, days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',
    enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS busy_periods (
    event_id TEXT PRIMARY KEY, date TEXT NOT NULL, start TEXT NOT NULL,
    end TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS busy_periods_date ON busy_periods(date);
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL,
    name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'confirmed', created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bookings_date ON bookings(date);
  CREATE TABLE IF NOT EXISTS calendar_sync (
    id INTEGER PRIMARY KEY CHECK(id = 1), revision INTEGER NOT NULL,
    state TEXT NOT NULL, updated_at TEXT NOT NULL
  );
`);

let config = db.prepare('SELECT * FROM booking_config WHERE id=1').get();
if (!config) {
  const slug = (process.env.LIFETEMPO_BOOKING_SLUG || randomBytes(6).toString('hex')).toLowerCase();
  db.prepare('INSERT INTO booking_config(id,slug) VALUES(1,?)').run(slug);
  config = db.prepare('SELECT * FROM booking_config WHERE id=1').get();
}
let ownerToken = process.env.LIFETEMPO_OWNER_TOKEN;
if (!ownerToken) {
  const tokenPath = path.join(dataDir, 'owner-token');
  if (fs.existsSync(tokenPath)) ownerToken = fs.readFileSync(tokenPath, 'utf8').trim();
  else {
    ownerToken = randomBytes(32).toString('base64url');
    fs.writeFileSync(tokenPath, ownerToken, { mode: 0o600, flag: 'wx' });
    console.log(`LifeTempo owner token (keep private): ${ownerToken}`);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const androidAppOrigin = 'https://appassets.androidplatform.net';
  const nativeApiMethods = {
    '/api/owner/calendar-sync': 'GET, PUT, OPTIONS',
    '/api/ai/status': 'GET, OPTIONS',
    '/api/ai/plan': 'POST, OPTIONS'
  };
  if (nativeApiMethods[url.pathname] && req.headers.origin === androidAppOrigin) {
    res.setHeader('Access-Control-Allow-Origin', androidAppOrigin);
    res.setHeader('Access-Control-Allow-Methods', nativeApiMethods[url.pathname]);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
  }
  if (req.method === 'GET' && url.pathname === '/api/calendar/config') {
    return json(res, 200, { clientId: process.env.LIFETEMPO_GOOGLE_CLIENT_ID || '' });
  }
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/ai/status') {
      if (req.headers.origin === androidAppOrigin && !authorized(req)) return json(res, 401, { error: 'owner token 無效或尚未連線' });
      const hasGemini = !!GEMINI_API_KEY;
      const hasOpenAI = !!OPENAI_API_KEY;
      const hasOpenRouter = !!OPENROUTER_API_KEY;
      const hasAnthropic = !!ANTHROPIC_API_KEY;
      const hasDeepSeek = !!DEEPSEEK_API_KEY;
      const hasGroq = !!GROQ_API_KEY;
      const hasCohere = !!COHERE_API_KEY;
      const hasMistral = !!MISTRAL_API_KEY;
      const hasTogether = !!TOGETHER_API_KEY;
      return json(res, 200, {
        configured: !!(hasGemini || hasOpenAI || hasOpenRouter || hasAnthropic || hasDeepSeek || hasGroq || hasCohere || hasMistral || hasTogether),
        providerKeys: {gemini:hasGemini,openai:hasOpenAI,openrouter:hasOpenRouter,anthropic:hasAnthropic,deepseek:hasDeepSeek,groq:hasGroq,cohere:hasCohere,mistral:hasMistral,together:hasTogether},
        providers: {
          openai: { configured: hasOpenAI, models: [ {id:'gpt-4o-mini', name:'GPT-4o mini', free:false, desc:'輕量快速，結構化輸出穩定'} ] },
          openrouter: { configured: hasOpenRouter, models: [ {id:'openai/gpt-4o-mini', name:'GPT-4o mini (OpenRouter)', free:false, desc:'透過 OpenRouter 介接'}, {id:'google/gemini-flash-1.5b', name:'Gemini Flash 1.5B (OpenRouter)', free:true, desc:'免費額度高，適合預算規劃'} ] },
          anthropic: { configured: hasAnthropic, models: [ {id:'claude-3-haiku-20240307', name:'Claude 3 Haiku', free:false, desc:'思考流暢，長文整理強'} ] },
          gemini: { configured: hasGemini, models: [ {id:'gemini-1.5-flash-latest', name:'Gemini 1.5 Flash', free:true, desc:'Google 免費額度高，中文優秀（預設免費）'}, {id:'gemini-2.0-flash-exp', name:'Gemini 2.0 Flash', free:true, desc:'最新版本，多模態更強'} ] }
        }
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/ai/plan') {
      if (req.headers.origin === androidAppOrigin && !authorized(req)) return json(res, 401, { error: 'owner token 無效或尚未連線' });
      if (!allowBookingRequest(req)) return json(res, 429, { error: '請稍後再試' });
      const body = await readJson(req);
      return json(res, 200, await generatePlan(body));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/public/')) {
      const slug = decodeURIComponent(url.pathname.slice('/api/public/'.length));
      const published = getConfig(slug);
      if (!published) return json(res, 404, { error: '找不到此預約頁' });
      return json(res, 200, publicConfig(published));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/slots/')) {
      const slug = decodeURIComponent(url.pathname.slice('/api/slots/'.length));
      const published = getConfig(slug);
      if (!published) return json(res, 404, { error: '找不到此預約頁' });
      const from = validDate(url.searchParams.get('from')) ? url.searchParams.get('from') : dateInZone(new Date(), published.timezone);
      const count = Math.min(31, Math.max(1, Number(url.searchParams.get('days')) || 14));
      return json(res, 200, { slots: listSlots(published, from, count) });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/book/')) {
      const slug = decodeURIComponent(url.pathname.slice('/api/book/'.length));
      const published = getConfig(slug);
      if (!published) return json(res, 404, { error: '找不到此預約頁' });
      if (!allowBookingRequest(req)) return json(res, 429, { error: '請稍後再試' });
      const body = await readJson(req);
      const name = clean(body.name, 100), email = clean(body.email, 254), note = clean(body.note, 1000);
      if (!name) return json(res, 400, { error: '請填寫姓名' });
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Email 格式不正確' });
      const { date, start } = body;
      if (!validDate(date) || !/^\d{2}:\d{2}$/.test(start || '')) return json(res, 400, { error: '日期或時間格式不正確' });
      db.exec('BEGIN IMMEDIATE');
      try {
        const slot = listSlots(published, date, 1).find(item => item.date === date && item.start === start);
        if (!slot || zonedInstant(date, start, published.timezone) <= new Date()) {
          db.exec('ROLLBACK');
          return json(res, 409, { error: '此時段已無法預約，請重新選擇' });
        }
        const id = randomBytes(12).toString('hex');
        db.prepare('INSERT INTO bookings(id,date,start,end,name,email,note,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(id, date, start, slot.end, name, email, note, new Date().toISOString());
        db.exec('COMMIT');
        return json(res, 201, { booking: { id, date, start, end: slot.end, name } });
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    if (url.pathname.startsWith('/api/owner/')) {
      if (!authorized(req)) return json(res, 401, { error: '需要有效的 LifeTempo owner token' });
      if (req.method === 'GET' && url.pathname === '/api/owner/config') return json(res, 200, publicConfig(getConfigById()));
      if (req.method === 'GET' && url.pathname === '/api/owner/calendar-sync') {
        const row = db.prepare('SELECT revision,state,updated_at FROM calendar_sync WHERE id=1').get();
        return json(res, 200, row ? { revision: row.revision, state: JSON.parse(row.state), updatedAt: row.updated_at } : { revision: 0, state: null, updatedAt: null });
      }
      if (req.method === 'PUT' && url.pathname === '/api/owner/calendar-sync') {
        const body = await readJson(req, 8_388_608);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validCalendarSyncState(body.state) || JSON.stringify(body.state).length > 8_000_000) {
          return json(res, 400, { error: '同步資料格式無效或超過 8 MB' });
        }
        db.exec('BEGIN IMMEDIATE');
        try {
          const current = db.prepare('SELECT revision,state,updated_at FROM calendar_sync WHERE id=1').get();
          const currentRevision = current?.revision || 0;
          if (body.revision !== currentRevision) {
            db.exec('ROLLBACK');
            return json(res, 409, { error: '伺服器資料已更新', revision: currentRevision, state: current ? JSON.parse(current.state) : null, updatedAt: current?.updated_at || null });
          }
          const revision = currentRevision + 1, updatedAt = new Date().toISOString();
          db.prepare(`INSERT INTO calendar_sync(id,revision,state,updated_at) VALUES(1,?,?,?)
            ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,state=excluded.state,updated_at=excluded.updated_at`)
            .run(revision, JSON.stringify(body.state), updatedAt);
          db.exec('COMMIT');
          return json(res, 200, { revision, state: body.state, updatedAt });
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      if (req.method === 'PUT' && url.pathname === '/api/owner/config') {
        const body = await readJson(req);
        const next = validateConfig(body);
        if (!next) return json(res, 400, { error: '預約設定無效' });
        db.prepare('UPDATE booking_config SET slug=?,title=?,timezone=?,start_hour=?,end_hour=?,duration=?,days=?,enabled=? WHERE id=1')
          .run(next.slug, next.title, next.timezone, next.start, next.end, next.duration, JSON.stringify(next.days), next.enabled ? 1 : 0);
        return json(res, 200, publicConfig(getConfigById()));
      }
      if (req.method === 'PUT' && url.pathname === '/api/owner/busy') {
        const body = await readJson(req);
        if (!Array.isArray(body.events) || body.events.length > 20000) return json(res, 400, { error: '行程清單無效' });
        db.exec('BEGIN IMMEDIATE');
        try {
          db.exec('DELETE FROM busy_periods');
          const insert = db.prepare('INSERT INTO busy_periods(event_id,date,start,end,all_day) VALUES(?,?,?,?,?)');
          for (const event of body.events) {
            if (!event?.id || !validDate(event.date)) continue;
            insert.run(String(event.id).slice(0, 120), event.date, /^\d{2}:\d{2}$/.test(event.start) ? event.start : '00:00', /^\d{2}:\d{2}$/.test(event.end) ? event.end : '23:59', event.allDay ? 1 : 0);
          }
          db.exec('COMMIT');
          return json(res, 200, { ok: true, synced: body.events.length });
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      if (req.method === 'GET' && url.pathname === '/api/owner/bookings') {
        return json(res, 200, { bookings: db.prepare('SELECT * FROM bookings ORDER BY date,start').all() });
      }
      const cancel = url.pathname.match(/^\/api\/owner\/bookings\/([a-f\d]+)$/);
      if (req.method === 'DELETE' && cancel) {
        const result = db.prepare('DELETE FROM bookings WHERE id=?').run(cancel[1]);
        return json(res, result.changes ? 200 : 404, result.changes ? { ok: true } : { error: '找不到預約' });
      }
      return json(res, 404, { error: '找不到 API' });
    }
    const publicPage = url.pathname.match(/^\/book\/([a-z\d-]+)\/?$/i);
    if (req.method === 'GET' && publicPage) return html(res, 200, bookingPage());
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return html(res, 200, fs.readFileSync(path.join(root, 'index.html'), 'utf8'));
    }
    if (req.method === 'GET' && ['/vendor/ical.js','/calendar-ics.js','/booking-client.js','/ai-request.js', '/ai-planner.js', '/ai-browser.js','/calendar-core.js','/enhancements.js','/sw.js','/manifest.webmanifest','/localization-data.js','/localization-core.js','/localization-client.js','/localization.css'].includes(url.pathname)) {
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.webmanifest') ? 'application/manifest+json' : url.pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(fs.readFileSync(path.join(root, url.pathname.slice(1)), 'utf8'));
    }
    if (req.method === 'GET' && url.pathname.startsWith('/LifeTempo-Icons/')) {
      const target = path.resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!target.startsWith(path.join(root, 'LifeTempo-Icons') + path.sep) || !fs.existsSync(target)) return json(res, 404, { error: 'not found' });
      const extension = path.extname(target).toLowerCase();
      const contentType = { '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.icns': 'image/icns' }[extension] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      return fs.createReadStream(target).pipe(res);
    }
    return json(res, 404, { error: 'not found' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.statusCode || 500, { error: error.statusCode === 413 ? '請求資料超過大小限制' : '服務暫時無法處理請求' });
  }
});

function getConfig(slug) { return db.prepare('SELECT * FROM booking_config WHERE slug=? AND enabled=1').get(slug); }
function getConfigById() { return db.prepare('SELECT * FROM booking_config WHERE id=1').get(); }
function publicConfig(row) { return { slug: row.slug, title: row.title, timezone: row.timezone, today: dateInZone(new Date(), row.timezone), start: row.start_hour, end: row.end_hour, duration: row.duration, days: JSON.parse(row.days), enabled: !!row.enabled }; }
function validateConfig(body) {
  const slug = String(body.slug || '').trim().toLowerCase(), title = clean(body.title || '預約時間', 100), timezone = String(body.timezone || 'Asia/Taipei');
  const start = Number(body.start), end = Number(body.end), duration = Number(body.duration), days = [...new Set((Array.isArray(body.days) ? body.days : []).map(Number))];
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { return null; }
  if (!/^[a-z\d](?:[a-z\d-]{0,38}[a-z\d])?$/.test(slug) || !title || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || end <= start || ![15,30,45,60,90,120].includes(duration) || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return null;
  return { slug, title, timezone, start, end, duration, days, enabled: body.enabled !== false };
}
function listSlots(cfg, from, count) {
  if (!cfg || !cfg.enabled) return [];
  const slots = [], startAt = parseLocalDate(from);
  for (let day = 0; day < count; day++) {
    const dateObj = new Date(startAt); dateObj.setUTCDate(dateObj.getUTCDate() + day);
    const date = dateObj.toISOString().slice(0, 10), weekday = dateObj.getUTCDay();
    if (!JSON.parse(cfg.days).includes(weekday)) continue;
    const busy = db.prepare('SELECT start,end,all_day FROM busy_periods WHERE date=?').all(date);
    const booked = db.prepare("SELECT start,end,0 AS all_day FROM bookings WHERE date=? AND status='confirmed'").all(date);
    for (let minute = cfg.start_hour * 60; minute + cfg.duration <= cfg.end_hour * 60; minute += cfg.duration) {
      const start = clock(minute), end = clock(minute + cfg.duration);
      if ([...busy, ...booked].some(period => period.all_day || period.start < end && period.end > start)) continue;
      if (date < dateInZone(new Date(), cfg.timezone)) continue;
      if (date === dateInZone(new Date(), cfg.timezone) && zonedInstant(date, start, cfg.timezone) <= new Date()) continue;
      slots.push({ date, start, end });
    }
  }
  return slots;
}
function parseLocalDate(value) { return new Date(`${value}T00:00:00.000Z`); }
function localDate(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
function dateInZone(date, timezone) { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date); const values = Object.fromEntries(parts.map(part => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function zonedInstant(date, time, timezone) { const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number), desired = Date.UTC(year, month-1, day, hour, minute); let instant = desired; for (let attempt=0; attempt<3; attempt++) { const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(instant)); const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)])); const represented = Date.UTC(values.year, values.month-1, values.day, values.hour, values.minute); const correction = desired-represented; instant += correction; if (!correction) break; } return new Date(instant); }
function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false; const parsed = new Date(`${value}T00:00:00Z`); return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0,10) === value; }
function clock(minutes) { return `${String(Math.floor(minutes / 60)).padStart(2,'0')}:${String(minutes % 60).padStart(2,'0')}`; }
function validCalendarSyncState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) || state.schemaVersion !== 1) return false;
  if (!Array.isArray(state.events) || state.events.length > 20000 || !state.events.every(item => item && typeof item === 'object' && !Array.isArray(item))) return false;
  if (!Array.isArray(state.tasks) || state.tasks.length > 10000 || !state.tasks.every(item => item && typeof item === 'object' && !Array.isArray(item))) return false;
  if (!Array.isArray(state.calendars) || state.calendars.length > 1000 || !state.calendars.every(item => item && typeof item === 'object' && !Array.isArray(item))) return false;
  if (!state.categories || typeof state.categories !== 'object' || Array.isArray(state.categories) || Object.values(state.categories).some(color => typeof color !== 'string' || !/^#[a-f\d]{6}$/i.test(color))) return false;
  if (!Array.isArray(state.inviteChannels) || state.inviteChannels.length > 100 || state.inviteChannels.some(channel => typeof channel !== 'string' || channel.length > 80)) return false;
  if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) return false;
  if (typeof state.settings.timezone !== 'string' || state.settings.timezone.length > 80 || !['12','24'].includes(String(state.settings.clockFormat))) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: state.settings.timezone }); } catch { return false; }
  return true;
}
function clean(value, max) { return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max); }
function authorized(req) {
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(supplied), b = Buffer.from(ownerToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
function allowBookingRequest(req) {
  const now = Date.now(), key = req.socket.remoteAddress || 'unknown';
  const item = limits.get(key) || { start: now, count: 0 };
  if (now - item.start > 60000) { item.start = now; item.count = 0; }
  item.count++; limits.set(key, item);
  return item.count <= 10;
}
const limits = new Map();
async function readJson(req, maxBytes = 2097152) {
  const chunks=[];let size=0;
  for await (const chunk of req) {
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    size+=buffer.length;
    if(size>maxBytes){const error=new Error('request too large');error.statusCode=413;throw error;}
    chunks.push(buffer);
  }
  return JSON.parse(size?Buffer.concat(chunks,size).toString('utf8'):'{}');
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function html(res, status, value) { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(value); }
function bookingPage() {
  return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LifeTempo 預約</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f7f8fc;color:#202439;font:16px system-ui,'Noto Sans TC',sans-serif}.wrap{max-width:760px;margin:5vh auto;padding:24px}.card{background:#fff;border:1px solid #eceef4;border-radius:18px;padding:28px;box-shadow:0 14px 40px #26304b0b}h1{margin:0 0 8px;font-size:26px}.muted{color:#858b9e;font-size:14px}.slots{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:20px}.slot{background:#fff;border:1px solid #dfe2ea;border-radius:9px;min-height:44px;padding:10px;color:#6c5ce7;font:600 14px inherit;cursor:pointer}.slot:hover,.slot.selected{background:#f3f1ff;border-color:#6c5ce7}.field{display:grid;gap:6px;margin:14px 0}.field input,.field textarea{width:100%;padding:11px;border:1px solid #dfe2ea;border-radius:8px;font:inherit}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.actions button{border:0;border-radius:8px;padding:12px 16px;font:600 14px inherit;cursor:pointer}.primary{background:#6c5ce7;color:white}.secondary{background:#f0f1f5;color:#646b7d}.message{margin-top:14px;color:#555d71}.hidden{display:none}@media(max-width:540px){.wrap{padding:12px}.card{padding:20px}}
  </style><body><main class="wrap"><section class="card"><h1 id="title">預約時間</h1><p class="muted" id="timezone"></p><label class="field">選擇日期<input id="date" type="date"></label><div id="slots" class="slots"></div><form id="form" class="hidden"><h2>填寫預約資料</h2><p id="chosen" class="muted"></p><label class="field">姓名<input name="name" maxlength="100" required></label><label class="field">Email（選填）<input name="email" type="email" maxlength="254"></label><label class="field">備註（選填）<textarea name="note" maxlength="1000" rows="3"></textarea></label><div class="actions"><button class="primary">確認預約</button><button type="button" id="cancel" class="secondary">返回選時段</button></div></form><p id="message" class="message" role="status"></p></section></main><script>
  const slug=decodeURIComponent(location.pathname.split('/')[2]||''),$=s=>document.querySelector(s);let cfg,chosen=null;
  async function init(){try{const r=await fetch('/api/public/'+encodeURIComponent(slug));if(!r.ok)throw Error();cfg=await r.json();$('#title').textContent=cfg.title;$('#timezone').textContent='時區：'+cfg.timezone;$('#date').min=cfg.today;$('#date').value=cfg.today;loadSlots()}catch{$('#message').textContent='此預約頁目前無法使用。'}}
  async function loadSlots(){chosen=null;$('#form').classList.add('hidden');$('#message').textContent='載入可預約時段…';$('#slots').replaceChildren();try{const r=await fetch('/api/slots/'+encodeURIComponent(slug)+'?from='+$('#date').value+'&days=1'),data=await r.json();if(!r.ok)throw Error();$('#message').textContent=data.slots.length?'選擇一個時段：':'這天沒有可預約時段。';for(const slot of data.slots){const b=document.createElement('button');b.type='button';b.className='slot';b.textContent=slot.start+' – '+slot.end;b.onclick=()=>{chosen=slot;$('#chosen').textContent=slot.date+'　'+slot.start+' – '+slot.end+'（'+cfg.timezone+'）';$('#form').classList.remove('hidden');document.querySelector('[name=name]').focus()};$('#slots').append(b)}}catch{$('#message').textContent='讀取時段失敗，請稍後再試。'}}
  $('#date').onchange=loadSlots;$('#cancel').onclick=()=>$('#form').classList.add('hidden');$('#form').onsubmit=async e=>{e.preventDefault();if(!chosen)return;const form=new FormData(e.target);const r=await fetch('/api/book/'+encodeURIComponent(slug),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:chosen.date,start:chosen.start,name:form.get('name'),email:form.get('email'),note:form.get('note')})});const data=await r.json();if(r.ok){$('#form').classList.add('hidden');$('#slots').replaceChildren();$('#message').textContent='預約成功！請記下時間：'+data.booking.date+' '+data.booking.start+'–'+data.booking.end+'.';}else{$('#message').textContent=data.error||'預約未完成';loadSlots()}};init();
  </script></body></html>`;
}

function addDays(base, delta) {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function callLLM(prompt, preferredProvider, preferredModel, apiKeys = {}) {
  const providers = [
    { key: 'openai', name:'OpenAI', apiKey: apiKeys.provider==='openai'?apiKeys.key:OPENAI_API_KEY, endpoint: 'https://api.openai.com/v1/chat/completions', defaultModel:'gpt-4o-mini', jsonMode:'response_format', free:false },
    { key: 'openrouter', name:'OpenRouter', apiKey: apiKeys.provider==='openrouter'?apiKeys.key:OPENROUTER_API_KEY, endpoint: 'https://openrouter.ai/api/v1/chat/completions', defaultModel:'google/gemini-flash-1.5', jsonMode:'response_format', free:false },
    { key: 'anthropic', name:'Anthropic', apiKey: apiKeys.provider==='anthropic'?apiKeys.key:ANTHROPIC_API_KEY, endpoint: 'https://api.anthropic.com/v1/messages', defaultModel:'claude-3-haiku-20240307', jsonMode:'system_instruction', free:false },
    { key: 'gemini', name:'Gemini', apiKey: apiKeys.provider==='gemini'?apiKeys.key:GEMINI_API_KEY, endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', defaultModel:'gemini-1.5-flash-latest', jsonMode:'mimeType', free:true },
    { key: 'deepseek', name:'DeepSeek', apiKey: apiKeys.provider==='deepseek'?apiKeys.key:DEEPSEEK_API_KEY, endpoint: 'https://api.deepseek.com/v1/chat/completions', defaultModel:'deepseek-chat', jsonMode:'response_format', free:true },
    { key: 'groq', name:'Groq', apiKey: apiKeys.provider==='groq'?apiKeys.key:GROQ_API_KEY, endpoint: 'https://api.groq.com/openai/v1/chat/completions', defaultModel:'llama-3.3-70b-versatile', jsonMode:'response_format', free:true },
    { key: 'cohere', name:'Cohere', apiKey: apiKeys.provider==='cohere'?apiKeys.key:COHERE_API_KEY, endpoint: 'https://api.cohere.com/v1/chat', defaultModel:'command-r-plus', jsonMode:'none', free:false },
    { key: 'mistral', name:'Mistral', apiKey: apiKeys.provider==='mistral'?apiKeys.key:MISTRAL_API_KEY, endpoint: 'https://api.mistral.ai/v1/chat/completions', defaultModel:'mistral-small-latest', jsonMode:'response_format', free:false },
    { key: 'together', name:'Together', apiKey: apiKeys.provider==='together'?apiKeys.key:TOGETHER_API_KEY, endpoint: 'https://api.together.xyz/v1/chat/completions', defaultModel:'meta-llama/Llama-3.3-70B-Instruct-Turbo', jsonMode:'response_format', free:false }
  ];

  if (apiKeys.provider === 'custom' && apiKeys.key && apiKeys.endpoint && apiKeys.model) {
    providers.push({
      key: 'custom',
      name: 'Custom',
      apiKey: apiKeys.key,
      endpoint: apiKeys.endpoint,
      defaultModel: apiKeys.model,
      jsonMode: 'response_format',
      free: false
    });
  }

  const provider = preferredProvider || 'free';
  const order = provider === 'free'
    ? [...providers].sort((a,b)=> (b.free?1:0) - (a.free?1:0))
    : provider
      ? [providers.find(p=>p.key===provider)].filter(Boolean)
      : [...providers].sort((a,b)=> (b.free?1:0) - (a.free?1:0));

  let failure='尚未設定所選 AI 的 API Key，請到「行事曆設定」儲存 AI 設定。';
  for (const p of order) {
    if (!p.apiKey) continue;
    const modelId = preferredModel || p.defaultModel;
    try {
      if (p.key === 'openai' || p.key === 'openrouter' || p.key === 'custom' || p.key === 'deepseek' || p.key === 'groq' || p.key === 'mistral' || p.key === 'together') {
        const resp = await fetch(p.endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(45000),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({
            model: modelId,
            temperature: 0.6,
            response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if(!resp.ok) {
          const reason=resp.status===401||resp.status===403?'API Key 無效或沒有使用權限':resp.status===429?'額度不足或請求過於頻繁':resp.status===404?'模型或 API 端點不存在':'請確認模型名稱與 API 設定';
          throw new Error(p.name+' 回應 HTTP '+resp.status+'：'+reason+'。請在「行事曆設定」中修正。');
        }
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) return { provider: p.key, model: modelId, content, freeTier: p.free || (p.key==='openrouter' && /gemini/i.test(modelId)) };
      }
      if (p.key === 'anthropic') {
        const resp = await fetch(p.endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(45000),
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': p.apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: modelId,
            max_tokens: 2048,
            system: '你是一個專業的繁體中文行程規劃助手。只可以回傳 JSON，不可有其他文字或解釋。',
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if(!resp.ok) {
          const reason=resp.status===401||resp.status===403?'API Key 無效或沒有使用權限':resp.status===429?'額度不足或請求過於頻繁':resp.status===404?'模型或 API 端點不存在':'請確認模型名稱與 API 設定';
          throw new Error(p.name+' 回應 HTTP '+resp.status+'：'+reason+'。請在「行事曆設定」中修正。');
        }
        const data = await resp.json();
        const text = data.content?.[0]?.text;
        if (text) return { provider: p.key, model: modelId, content: text, freeTier: false };
      }
      if (p.key === 'gemini') {
        const resp = await fetch(`${p.endpoint}/${encodeURIComponent(modelId)}:generateContent?key=${p.apiKey}`, {
          method: 'POST',
          signal: AbortSignal.timeout(45000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        if(!resp.ok) {
          const reason=resp.status===401||resp.status===403?'API Key 無效或沒有使用權限':resp.status===429?'額度不足或請求過於頻繁':resp.status===404?'模型或 API 端點不存在':'請確認模型名稱與 API 設定';
          throw new Error(p.name+' 回應 HTTP '+resp.status+'：'+reason+'。請在「行事曆設定」中修正。');
        }
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return { provider: p.key, model: modelId, content: text, freeTier: true };
      }
      if (p.key === 'cohere') {
        const resp = await fetch(p.endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(45000),
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${p.apiKey}` },
          body: JSON.stringify({
            model: modelId,
            temperature: 0.6,
            message: prompt,
            chat_history: [],
            preamble: '你是一個專業的繁體中文行程規劃助手。只可以回傳 JSON，不可有其他文字或解釋。'
          })
        });
        if(!resp.ok) {
          const reason=resp.status===401||resp.status===403?'API Key 無效或沒有使用權限':resp.status===429?'額度不足或請求過於頻繁':resp.status===404?'模型或 API 端點不存在':'請確認模型名稱與 API 設定';
          throw new Error(p.name+' 回應 HTTP '+resp.status+'：'+reason+'。請在「行事曆設定」中修正。');
        }
        const data = await resp.json();
        const text = data.text;
        if (text) return { provider: p.key, model: modelId, content: text, freeTier: false };
      }
      failure=p.name+' 未回傳有效的行程內容，請重試或更換模型。';
    } catch (e) { failure=e.name==='TimeoutError'?'AI 回應逾時，請稍後重試。':e.message.startsWith(p.name+' 回應 HTTP ')?e.message:p.name+' 連線或回應異常，請確認 API 端點與網路。'; }
  }
  return {error:failure};
}

function generateMockPlan(body) {
  const today = new Date();
  const startStr = body.startDate || isoDate(addDays(today, 1));
  const endStr = body.endDate || isoDate(addDays(today, 3));
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const category = body.category || '工作';
  const keywords = (body.description || body.prompt || '出差 開會').toLowerCase();
  const place = body.location || '台北';

  const templates = {
    '旅遊': [
      {title:'早餐與出發準備',start:'08:00',end:'09:00',category:'旅遊',place:'',notes:'確認今日路線、交通與隨身物品'},
      {title:'前往上午景點',start:'09:00',end:'09:30',category:'旅遊',place:'',notes:'交通時間為範本預留，請依實際路線調整'},
      {title:'上午景點遊覽',start:'09:30',end:'11:30',category:'旅遊',place:'',notes:'請填入想去的景點，並確認開放時間與預約需求'},
      {title:'在地美食午餐與休息',start:'11:30',end:'13:30',category:'旅遊',place:'',notes:'預留用餐、排隊及午間休息時間'},
      {title:'前往下午景點',start:'13:30',end:'14:00',category:'旅遊',place:'',notes:'請依景點距離與交通方式調整'},
      {title:'下午景點與街區散步',start:'14:00',end:'17:00',category:'旅遊',place:'',notes:'安排鄰近景點與彈性休息，避免過度趕路'},
      {title:'晚餐與自由活動',start:'17:30',end:'19:30',category:'旅遊',place:'',notes:'依體力安排在地美食或輕鬆散步'},
      {title:'返回住宿／返程',start:'20:00',end:'21:00',category:'旅遊',place:'',notes:'依住宿地點或返程班次調整，保留交通緩衝'}
    ],


    '工作': [
      { title: '早餐會議', start: '08:00', end: '09:00', category: '工作', place: '', notes: '與團隊簡單對齊進度' },
      { title: '重點工作時間', start: '09:30', end: '12:00', category: '工作', place: '', notes: '深度工作，避免干擾' },
      { title: '午餐', start: '12:00', end: '13:00', category: '個人', place: '', notes: '用餐與短暫休息' },
      { title: '客戶會議', start: '14:00', end: '15:30', category: '工作', place: '', notes: '確認需求與進度' },
      { title: '內部協調', start: '16:00', end: '17:30', category: '工作', place: '', notes: '跨部門事項跟進' },
      { title: '運動放鬆', start: '18:30', end: '19:30', category: '健康', place: '', notes: '慢跑或健身' }
    ],
    '個人': [
      { title: '起床與晨間', start: '07:00', end: '08:00', category: '個人', place: '', notes: '起床梳洗' },
      { title: '早餐', start: '08:00', end: '09:00', category: '個人', place: '', notes: '' },
      { title: '興趣活動', start: '09:30', end: '12:00', category: '個人', place: '', notes: '閱讀、學習或嗜好' },
      { title: '午餐', start: '12:00', end: '13:30', category: '個人', place: '', notes: '' },
      { title: '休閒時間', start: '14:00', end: '17:00', category: '個人', place: '', notes: '看電影、逛街或外出' },
      { title: '晚餐', start: '18:00', end: '19:30', category: '家庭', place: '', notes: '與家人或朋友' },
      { title: '睡前閱讀', start: '21:30', end: '22:30', category: '個人', place: '', notes: '放鬆準備就寢' }
    ],
    '家庭': [
      { title: '全家早餐', start: '08:30', end: '09:30', category: '家庭', place: '', notes: '' },
      { title: '家庭活動', start: '10:00', end: '12:00', category: '家庭', place: '', notes: '出門走走或聚會' },
      { title: '午餐', start: '12:00', end: '13:30', category: '家庭', place: '', notes: '家庭聚餐' },
      { title: '午後休憩', start: '14:00', end: '16:00', category: '家庭', place: '', notes: '小憩或自由活動' },
      { title: '戶外活動', start: '16:30', end: '18:30', category: '健康', place: '', notes: '公園散步或運動' },
      { title: '家庭晚餐', start: '19:00', end: '20:30', category: '家庭', place: '', notes: '共享時光' }
    ],
    '健康': [
      { title: '晨間運動', start: '06:30', end: '07:30', category: '健康', place: '', notes: '慢跑、瑜珈或重訓' },
      { title: '早餐', start: '08:00', end: '09:00', category: '個人', place: '', notes: '健康輕食' },
      { title: '上午活動', start: '10:00', end: '12:00', category: '健康', place: '', notes: '爬山、打球或游泳' },
      { title: '午餐', start: '12:30', end: '13:30', category: '個人', place: '', notes: '營養均衡' },
      { title: '午覺休息', start: '14:00', end: '15:30', category: '個人', place: '', notes: '充足休息' },
      { title: '晚間散步', start: '18:00', end: '19:00', category: '健康', place: '', notes: '飯後走一走' },
      { title: '睡前伸展', start: '22:00', end: '22:30', category: '健康', place: '', notes: '放鬆肌肉' }
    ]
  };

  const plan = [];
  for (let i = 0; i < days; i++) {
    const date = isoDate(addDays(start, i));
    const tpl = templates[category] || templates['個人'];
    for (const ev of tpl) {
      plan.push({
        id: `ai-${Date.now()}-${plan.length}`,
        title: ev.title,
        date,
        start: ev.start,
        end: ev.end,
        category: ev.category,
        place: ev.place || place,
        notes: ev.notes,
        allDay: false,
        repeat: '不重複',
        reminders: [],
        attendees: [],
        links: []
      });
    }
  }

  let summary = `這是為您規劃的 ${days} 天行程：\n`;
  summary += `・從 ${startStr} 到 ${endStr}${place ? `，地點：${place}` : ''}\n`;
  summary += `・主題：${category}，共 ${plan.length} 個行程建議\n`;
  summary += `・每日依主題安排活動與休息\n`;
  if (keywords.includes('出差')) summary += '・包含交通與會議緩衝時間\n';
  if (keywords.includes('旅遊') || keywords.includes('旅行')) summary += '・包含觀光景點與休息時間\n';
  summary += `\n您可以在下方調整、移除或新增行程，確認後即加入行事曆。`;

  return {
    mode: 'demo',
    summary,
    events: plan
  };
}

async function generatePlan(body) { return AIPlanner.generatePlan(body, callLLM); }

const port = Number(process.env.PORT) || 4173;
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`LifeTempo server: http://localhost:${port}`);
  console.log(`Public booking page: http://localhost:${port}/book/${getConfigById().slug}`);
});
