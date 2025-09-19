// server.js — Updated, robust API (ESM)
// Run: node server.js (Node 18+)
// Env (optional): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, PORT

import fs from 'fs';
import path from 'path';
import express from 'express';
import 'dotenv/config';
import cors from 'cors';
import multer from 'multer';
import { nanoid } from 'nanoid';
import dayjsBase from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { fileURLToPath } from 'url';

// ----- Setup -----
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Dayjs with timezone
const dayjs = dayjsBase;
dayjs.extend(utc);
dayjs.extend(timezone);
const DEFAULT_TZ = 'Asia/Baku';

const PORT = process.env.PORT || 3000;

// Paths
const DB_DIR = path.join(__dirname, 'db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORAGE_DIR = path.join(__dirname, 'storage');
const UPLOAD_DIR = path.join(STORAGE_DIR, 'uploads');
for (const d of [DB_DIR, PUBLIC_DIR, STORAGE_DIR, UPLOAD_DIR]) fs.mkdirSync(d, { recursive: true });

// ----- Helpers -----
function readJsonSafe(p, fallback=[]) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('readJsonSafe error for', p, e);
    return fallback;
  }
}
function writeJsonSafe(p, data){
  try {
    const tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  } catch (e) {
    console.error('writeJsonSafe error for', p, e);
  }
}
function normPlate(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function toMs(x) { const d = new Date(x); return isNaN(+d) ? null : +d; }
function rangeOverlap(aStart, aEnd, bStart, bEnd) { return aStart <= bEnd && bStart <= aEnd; }
function daysBetweenInclusive(startISO, endISO, tz=DEFAULT_TZ){
  const s = dayjs.tz(startISO, tz).startOf('day');
  const e = dayjs.tz(endISO, tz).startOf('day');
  return Math.max(1, e.diff(s, 'day') + 1);
}
function computeCarStatus(carId, reservations){
  const now = Date.now();
  let hasActive = false, hasBooked = false;
  for (const r of reservations.filter(r=>r.carId===carId).filter(r=>!['COMPLETED','CANCELED'].includes(String(r.status||'').toUpperCase()))) {
    const s = toMs(r.startAt ?? r.startDate);
    const e = toMs(r.endAt   ?? r.endDate);
    if (s==null || e==null) continue;
    if (s<=now && now<=e) hasActive = true;
    if (s>now) hasBooked = true;
  }
  if (hasActive) return 'IN_USE';
  if (hasBooked) return 'RESERVED';
  return 'FREE';
}

// ----- App -----
const app = express();
app.set('trust proxy', true); // safer if behind proxy

// Log incoming for debugging
app.use((req,res,next)=>{ console.log(req.method, req.url); next(); });

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true })); // <— added to support forms

// Static files
app.use(express.static(PUBLIC_DIR));        // serve /public at root
app.use('/public', express.static(PUBLIC_DIR));
app.use('/storage', express.static(STORAGE_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// Root redirect if no index.html
app.get('/', (req, res) => res.redirect('/public/login.html'));

// File uploads
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:   (_, file, cb) => {
    const ext = path.extname(file.originalname || '');
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});
const upload = multer({ storage });

// ----- DB file paths -----
const carsPath         = path.join(DB_DIR, 'cars.json');
const customersPath    = path.join(DB_DIR, 'customers.json');
const reservationsPath = path.join(DB_DIR, 'reservations.json');
const expensesPath     = path.join(DB_DIR, 'expenses.json'); // legacy (mixed)
const adminExpensesPath = path.join(DB_DIR, 'admin_expenses.json');
const carExpensesPath   = path.join(DB_DIR, 'car_expenses.json');
const usersPath        = path.join(DB_DIR, 'users.json');

// Ensure files exist
for (const p of [carsPath, customersPath, reservationsPath, expensesPath, adminExpensesPath, carExpensesPath, usersPath]) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]', 'utf8');
}

// ----- One-time migration: split legacy expenses.json into separate files -----
try {
  const legacy = readJsonSafe(expensesPath);
  const adminOld = readJsonSafe(adminExpensesPath);
  const carOld = readJsonSafe(carExpensesPath);
  if (Array.isArray(legacy) && legacy.length > 0 && (adminOld.length === 0 && carOld.length === 0)) {
    const adminList = legacy.filter(x => !x.carId);
    const carList   = legacy.filter(x => x.carId);
    writeJsonSafe(adminExpensesPath, adminList);
    writeJsonSafe(carExpensesPath, carList);
    // keep legacy file as-is for backup
    console.log('[MIGRATION] Split expenses.json into admin_expenses.json and car_expenses.json');
  }
} catch(e){ console.warn('Migration failed:', e?.message || String(e)); }

// ----- Telegram Notify (via Bot HTTP API) -----
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID || '';
const tgEscape = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function telegramGetMe() {
  if (!TELEGRAM_BOT_TOKEN) return { ok:false, error:'NO_TOKEN' };
  try{
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const json = await res.json();
    return json;
  } catch (e) {
    return { ok:false, error: e?.message || String(e) };
  }
}

async function sendTelegram(messageHtml){
  try{
    if(!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return; // silent if not configured
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: messageHtml, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    await res.text();
  }catch(e){ console.error('Telegram send error:', e?.message || e); }
}

// On boot: log Telegram connectivity
(async () => {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('ℹ Telegram bot token is not set; notifications disabled.');
  } else {
    const info = await telegramGetMe();
    if (info?.ok) {
      console.log(`✅ Telegram bot connected: @${info.result?.username} (id: ${info.result?.id})`);
    } else {
      console.warn('⚠ Telegram getMe failed:', info?.error || info);
    }
  }
})();

// Expose Telegram status over HTTP
app.get('/api/telegram/status', async (_req, res) => {
  const info = await telegramGetMe();
  res.json({
    ok: Boolean(info?.ok),
    username: info?.result?.username || null,
    name: info?.result?.first_name || null,
    botId: info?.result?.id || null,
    error: info?.error || null,
    chatConfigured: Boolean(TELEGRAM_CHAT_ID)
  });
});

// ----- Auth (file-based) -----
const SESSIONS = new Map(); // token -> { id, email, role }
const readUsers = () => readJsonSafe(usersPath, []);
const requireAuth = (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = SESSIONS.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session; next();
};

app.post('/api/auth/login', (req, res) => {
  const { email = '', password = '' } = req.body || {};
  const user = readUsers().find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'Email və ya şifrə səhvdir' });
  const token = nanoid(24);
  SESSIONS.set(token, { id: user.id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

app.get('/api/auth/me', (req, res) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const session = SESSIONS.get(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ user: session });
});

// ----- Cars CRUD -----
app.get('/api/cars', (req, res)=> res.json(readJsonSafe(carsPath)));
app.post('/api/cars', (req, res)=> {
  const list = readJsonSafe(carsPath);
  const id = nanoid(12);
  const now = new Date().toISOString();
  const car = {
    id,
    brand: req.body.brand || '',
    model: req.body.model || '',
    year: req.body.year || null,
    plate: req.body.plate || '',
    vin: req.body.vin || null,
    basePricePerDay: Number(req.body.basePricePerDay ?? 0),
    status: req.body.status || 'FREE',
    createdAt: now,
    updatedAt: now,
  };
  list.push(car);
  writeJsonSafe(carsPath, list);
  res.status(201).json(car);
});
app.patch('/api/cars/:id', (req, res)=> {
  const list = readJsonSafe(carsPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  list[i] = { ...list[i], ...req.body, updatedAt: new Date().toISOString() };
  writeJsonSafe(carsPath, list);
  res.json(list[i]);
});
app.delete('/api/cars/:id', (req, res)=> {
  const list = readJsonSafe(carsPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  const removed = list.splice(i,1)[0];
  writeJsonSafe(carsPath, list);
  res.json(removed);
});

// ----- Customers CRUD + upload -----
app.get('/api/customers', (req, res)=> res.json(readJsonSafe(customersPath)));
app.post('/api/customers', upload.single('idCard'), (req, res)=> {
  const list = readJsonSafe(customersPath);
  const id = nanoid(12);
  const now = new Date().toISOString();
  const item = {
    id,
    firstName: req.body.firstName || '',
    lastName: req.body.lastName || '',
    phone: req.body.phone || '',
    email: req.body.email || '',
    idCardPath: req.file ? ('/uploads/' + path.basename(req.file.path)) : null,
    createdAt: now,
    updatedAt: now,
  };
  list.push(item);
  writeJsonSafe(customersPath, list);
  res.status(201).json(item);
});
app.patch('/api/customers/:id', (req, res)=> {
  const list = readJsonSafe(customersPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  list[i] = { ...list[i], ...req.body, updatedAt: new Date().toISOString() };
  writeJsonSafe(customersPath, list);
  res.json(list[i]);
});
app.delete('/api/customers/:id', (req, res)=> {
  const list = readJsonSafe(customersPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  const removed = list.splice(i,1)[0];
  writeJsonSafe(customersPath, list);
  res.json(removed);
});

// ----- Reservations -----
app.get('/api/reservations', (req, res)=> res.json(readJsonSafe(reservationsPath)));

function hasOverlap(reservations, carId, startAt, endAt, ignoreId=null){
  const s = toMs(startAt), e = toMs(endAt);
  if (s==null || e==null) return false;
  for (const r of reservations) {
    if (r.carId !== carId) continue;
    if (ignoreId && r.id === ignoreId) continue;
    const rs = toMs(r.startAt ?? r.startDate);
    const re = toMs(r.endAt   ?? r.endDate);
    if (rs==null || re==null) continue;
    if (rangeOverlap(s,e,rs,re)) return true;
  }
  return false;
}

// CHECK must be BEFORE 404 handler
app.get('/api/reservations/check', (req, res)=> {
  const { carId, startAt, endAt, ignoreId } = req.query;
  const reservations = readJsonSafe(reservationsPath);
  const overlap = hasOverlap(reservations, String(carId||''), startAt, endAt, ignoreId || null);
  res.json({ overlap });
});

// NEW: POST variant (fixes 404 when frontend sends POST)
app.post('/api/reservations/check', (req, res)=> {
  const { carId, startAt, endAt, ignoreId } = req.body || {};
  const reservations = readJsonSafe(reservationsPath);
  const overlap = hasOverlap(reservations, String(carId||''), startAt, endAt, ignoreId || null);
  res.json({ overlap });
});

// COMPAT wrappers for legacy front-end paths
app.post('/reservations', (req, res, next) => { req.url = '/api/reservations'; next(); });
app.get('/reservations/check', (req, res, next) => { req.url = '/api/reservations/check'; next(); });
app.post('/reservations/check', (req, res, next) => { req.url = '/api/reservations/check'; next(); });

app.post('/api/reservations', (req, res)=> {
  const { carId, customerId, startAt, endAt, pricePerDay, discountPercent=0, destination='' } = req.body || {};
  if (!carId || !customerId || !startAt || !endAt) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const reservations = readJsonSafe(reservationsPath);
  if (hasOverlap(reservations, carId, startAt, endAt, null)) {
    return res.status(409).json({ error:'overlap', message:'This car already has a reservation in that interval.' });
  }
  const cars = readJsonSafe(carsPath);
  const customers = readJsonSafe(customersPath);
  const car = cars.find(x=>x.id===carId) || {};
  const cust = customers.find(x=>x.id===customerId) || {};

  const unit = Number(pricePerDay ?? car?.basePricePerDay ?? 0);
  const days = daysBetweenInclusive(startAt, endAt, DEFAULT_TZ);
  const totalPrice = Math.round(unit * days * (1 - Number(discountPercent||0)/100));

  const now = new Date().toISOString();
  const id = nanoid(12);
  const item = {
    id, carId, customerId, startAt, endAt,
    pricePerDay: unit,
    discountPercent: Number(discountPercent||0),
    days,
    totalPrice,
    destination,
    status: 'BOOKED',
    createdAt: now, updatedAt: now,
  };
  reservations.push(item);
  writeJsonSafe(reservationsPath, reservations);

  // Update car status
  const status = computeCarStatus(carId, reservations);
  const ci = cars.findIndex(c=>c.id===carId);
  if (ci>=0) { cars[ci] = { ...cars[ci], status, updatedAt: now }; writeJsonSafe(carsPath, cars); }

  // Telegram notify for new reservation
  (async () => {
    try {
      const carTitle = [car.brand || car.model || '', car.plate || ''].filter(Boolean).join(' — ');
      const customerName = [(cust.firstName||''), (cust.lastName||'')].filter(Boolean).join(' ').trim();
      const msg = [
        '🚗 <b>Yeni rezervasiya</b>',
        `ℹ <b>Maşın:</b> ${tgEscape(carTitle)}`,
        `🚹 <b>Müştəri:</b> ${tgEscape(customerName)}`,
        `📅 <b>Başlama:</b> ${tgEscape(dayjs.tz(startAt, DEFAULT_TZ).format('YYYY-MM-DD'))}`,
        `📅 <b>Bitmə:</b> ${tgEscape(dayjs.tz(endAt, DEFAULT_TZ).format('YYYY-MM-DD'))}`,
        `⏰ <b>Qaytarma saatı:</b> ${tgEscape((req.body.returnTime||'').toString())}`,
        `🚙 <b>İstiqamət:</b> ${tgEscape(String(destination||''))}`,
        `💰 <b>Endirim:</b> ${tgEscape(String(discountPercent))}${String(discountPercent).toString().includes('%')?'':'%'}`,
        `💸 <b>Total Qiymət:</b> ${tgEscape(String(totalPrice))}`
      ].join('\n');
      await sendTelegram(msg);
    } catch (e) {}
  })();

  res.status(201).json(item);
});

app.patch('/api/reservations/:id', (req, res)=> {
  const list = readJsonSafe(reservationsPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });

  const next = { ...list[i], ...req.body, updatedAt: new Date().toISOString() };

  const changedDates = (req.body.startAt || req.body.endAt || req.body.carId);
  if (changedDates) {
    if (hasOverlap(list, next.carId, next.startAt, next.endAt, next.id)) {
      return res.status(409).json({ error:'overlap', message:'This car already has a reservation in that interval.' });
    }
    next.days = daysBetweenInclusive(next.startAt, next.endAt, DEFAULT_TZ);
    const unit = Number(next.pricePerDay ?? 0);
    next.totalPrice = Math.round(unit * next.days * (1 - Number(next.discountPercent||0)/100));
  }
  list[i] = next; writeJsonSafe(reservationsPath, list);

  const cars = readJsonSafe(carsPath);
  const status = computeCarStatus(next.carId, list);
  const ci = cars.findIndex(c=>c.id===next.carId);
  if (ci>=0) { cars[ci] = { ...cars[ci], status, updatedAt: new Date().toISOString() }; writeJsonSafe(carsPath, cars); }

  res.json(list[i]);
});

app.delete('/api/reservations/:id', (req, res)=> {
  const list = readJsonSafe(reservationsPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  const removed = list.splice(i,1)[0];
  writeJsonSafe(reservationsPath, list);

  const cars = readJsonSafe(carsPath);
  const status = computeCarStatus(removed.carId, list);
  const ci = cars.findIndex(c=>c.id===removed.carId);
  if (ci>=0) { cars[ci] = { ...cars[ci], status, updatedAt: new Date().toISOString() }; writeJsonSafe(carsPath, cars); }

  res.json(removed);
});

// ----- Search -----
app.get('/api/search', (req, res)=> {
  try {
    const plateQ = String(req.query.plate || '').trim();
    if (!plateQ) return res.status(400).json({ error: 'plate_required' });
    const normQ = normPlate(plateQ);

    const cars = readJsonSafe(carsPath);
    const reservations = readJsonSafe(reservationsPath);
    const customers = readJsonSafe(customersPath);

    const car = cars.find(c => normPlate(c?.plate) === normQ);
    if (!car) return res.status(404).json({ found:false, message:'Car not found' });

    const now = Date.now();
    const rlist = reservations.filter(r => r?.carId === car.id).map(r => ({
      ...r,
      _start: toMs(r.startAt ?? r.startDate),
      _end:   toMs(r.endAt   ?? r.endDate),
    }));

    const current = rlist.find(r => r._start!=null && r._end!=null && r._start<=now && now<=r._end) || null;
    const next = rlist.filter(r => r._start!=null && r._start>now).sort((a,b)=>a._start-b._start)[0] || null;

    const findCustomerName = (cid) => {
      const cu = customers.find(x=>x.id===cid);
      return cu ? `${cu.firstName ?? ''} ${cu.lastName ?? ''}`.trim() : null;
    };
    const shape = (r)=> r && ({
      id: r.id,
      startAt: r.startAt ?? r.startDate,
      endAt:   r.endAt   ?? r.endDate,
      status:  r.status,
      days:    r.days,
      unitPrice: r.pricePerDay,
      discountPercent: r.discountPercent,
      totalPrice: r.totalPrice,
      destination: r.destination,
      customerId: r.customerId,
      customerName: findCustomerName(r.customerId),
    });

    res.json({
      found: true,
      car: { id:car.id, plate:car.plate, brand:car.brand, model:car.model, status:car.status },
      currentReservation: shape(current),
      nextReservation: shape(next),
    });
  } catch (e) {
    console.error('GET /api/search failed', e);
    res.status(500).json({ error:'internal_error', message:String(e?.message || e) });
  }
});


// ===== Admin Expenses (no carId) =====
app.get('/api/admin-expenses', (req, res)=> {
  const month = String(req.query.month || '').trim(); // YYYY-MM
  const list = readJsonSafe(adminExpensesPath);
  let start = dayjs.tz().startOf('month'); let end = dayjs.tz().endOf('month');
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y,m] = month.split('-').map(Number);
    start = dayjs.tz(new Date(y, m-1, 1)).startOf('month');
    end   = start.endOf('month');
  }
  const items = list.filter(x => {
    const when = x.when || x.createdAt;
    const t = when ? dayjs.tz(when, DEFAULT_TZ) : null;
    return t && t.isAfter(start.subtract(1,'millisecond')) && t.isBefore(end.add(1,'millisecond'));
  });
  res.json({ items, total: items.reduce((s,x)=>s+Number(x.amount||0),0), count: items.length });
});

app.post('/api/admin-expenses', (req, res)=> {
  if (req.body.carId) return res.status(400).json({ error:'invalid_field', message:'carId allowed only for car-expenses' });
  const list = readJsonSafe(adminExpensesPath);
  const nowISO = new Date().toISOString();
  const item = {
    id: nanoid(12),
    title: req.body.title || '',
    payee: req.body.payee || '',
    purpose: req.body.purpose || '',
    amount: Number(req.body.amount || 0),
    when: req.body.when || nowISO,
    createdAt: nowISO, updatedAt: nowISO,
  };
  list.push(item);
  writeJsonSafe(adminExpensesPath, list);

  (async () => {
    try {
      const now = dayjs.tz(item.when || nowISO, DEFAULT_TZ);
      const userName = (req.user && (req.user.email || req.user.id)) || 'İstifadəçi';
      const who = item.payee ? ` (${item.payee})` : '';
      const what = item.purpose ? ` — ${item.purpose}` : '';
      const msg = [
        'ℹ <b>Xərc bildirişi</b>',
        `📅 <b>Tarix:</b> ${tgEscape(now.format('YYYY-MM-DD'))}`,
        `⏰ <b>Saat:</b> ${tgEscape(now.format('HH:mm'))}`,
        `⏳ <b>${tgEscape(userName)}</b> inzibati xərc əlavə etdi`,
        `🆕 ${tgEscape(String(item.amount))} manat${tgEscape(who)}${tgEscape(what)}`
      ].join('\n');
      await sendTelegram(msg);
    } catch (e) {}
  })();

  res.status(201).json(item);
});

app.patch('/api/admin-expenses/:id', (req, res)=> {
  const list = readJsonSafe(adminExpensesPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  if ('carId' in req.body) delete req.body.carId;
  list[i] = { ...list[i], ...req.body, updatedAt: new Date().toISOString() };
  writeJsonSafe(adminExpensesPath, list);
  res.json(list[i]);
});

app.delete('/api/admin-expenses/:id', (req, res)=> {
  const list = readJsonSafe(adminExpensesPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  const removed = list.splice(i,1)[0];
  writeJsonSafe(adminExpensesPath, list);
  res.json(removed);
});

app.get('/api/admin-expenses.csv', (req, res)=> {
  const list = readJsonSafe(adminExpensesPath);
  const header = ['id','title','payee','purpose','amount','when','createdAt','updatedAt'];
  const rows = [header.join(',')].concat(
    list.map(x => header.map(k => {
      const v = x[k] ?? '';
      const s = String(v).replace(/"/g,'""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(','))
  );
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.send(rows.join('\n'));
});

// ===== Car Expenses (requires carId) =====
app.get('/api/car-expenses', (req, res)=> {
  const month = String(req.query.month || '').trim(); // YYYY-MM
  const carId = String(req.query.carId || '').trim();
  const list = readJsonSafe(carExpensesPath);
  let start = dayjs.tz().startOf('month'); let end = dayjs.tz().endOf('month');
  if (/^\d{4}-\d{2}$/.test(month)) {
    const [y,m] = month.split('-').map(Number);
    start = dayjs.tz(new Date(y, m-1, 1)).startOf('month');
    end   = start.endOf('month');
  }
  const items = list.filter(x => {
    if (carId && x.carId !== carId) return false;
    const when = x.when || x.createdAt;
    const t = when ? dayjs.tz(when, DEFAULT_TZ) : null;
    return t && t.isAfter(start.subtract(1,'millisecond')) && t.isBefore(end.add(1,'millisecond'));
  });
  res.json({ items, total: items.reduce((s,x)=>s+Number(x.amount||0),0), count: items.length });
});

app.post('/api/car-expenses', (req, res)=> {
  const carId = String(req.body.carId || '').trim();
  if (!carId) return res.status(400).json({ error:'missing_carId' });
  const list = readJsonSafe(carExpensesPath);
  const nowISO = new Date().toISOString();
  const item = {
    id: nanoid(12),
    carId,
    title: req.body.title || '',
    payee: req.body.payee || '',
    purpose: req.body.purpose || '',
    amount: Number(req.body.amount || 0),
    when: req.body.when || nowISO,
    createdAt: nowISO, updatedAt: nowISO,
  };
  list.push(item);
  writeJsonSafe(carExpensesPath, list);

  (async () => {
    try {
      const now = dayjs.tz(item.when || nowISO, DEFAULT_TZ);
      const userName = (req.user && (req.user.email || req.user.id)) || 'İstifadəçi';
      const who = item.payee ? ` (${item.payee})` : '';
      const what = item.purpose ? ` — ${item.purpose}` : '';
      const msg = [
        'ℹ <b>Xərc bildirişi</b>',
        `📅 <b>Tarix:</b> ${tgEscape(now.format('YYYY-MM-DD'))}`,
        `⏰ <b>Saat:</b> ${tgEscape(now.format('HH:mm'))}`,
        `⏳ <b>${tgEscape(userName)}</b> maşın xərci əlavə etdi`,
        `🆕 ${tgEscape(String(item.amount))} manat${tgEscape(who)}${tgEscape(what)}`
      ].join('\n');
      await sendTelegram(msg);
    } catch (e) {}
  })();

  res.status(201).json(item);
});

app.patch('/api/car-expenses/:id', (req, res)=> {
  const list = readJsonSafe(carExpensesPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  if (req.body.carId) list[i].carId = String(req.body.carId);
  list[i] = { ...list[i], ...req.body, updatedAt: new Date().toISOString() };
  writeJsonSafe(carExpensesPath, list);
  res.json(list[i]);
});

app.delete('/api/car-expenses/:id', (req, res)=> {
  const list = readJsonSafe(carExpensesPath);
  const i = list.findIndex(x=>x.id===req.params.id);
  if (i<0) return res.status(404).json({ error:'not_found' });
  const removed = list.splice(i,1)[0];
  writeJsonSafe(carExpensesPath, list);
  res.json(removed);
});

app.get('/api/car-expenses.csv', (req, res)=> {
  const list = readJsonSafe(carExpensesPath);
  const header = ['id','carId','title','payee','purpose','amount','when','createdAt','updatedAt'];
  const rows = [header.join(',')].concat(
    list.map(x => header.map(k => {
      const v = x[k] ?? '';
      const s = String(v).replace(/"/g,'""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(','))
  );
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.send(rows.join('\n'));
});

// ----- Legacy mixed endpoints: return 410 Gone
app.all('/api/expenses', (req,res)=> res.status(410).json({ error:'gone', message:'Use /api/admin-expenses or /api/car-expenses' }));
app.all('/api/expenses.csv', (req,res)=> res.status(410).json({ error:'gone', message:'Use /api/admin-expenses.csv or /api/car-expenses.csv' }));
app.all('/api/expenses/:id', (req,res)=> res.status(410).json({ error:'gone', message:'Use the new endpoints' }));


// ----- Revenue (monthly) -----
app.get('/api/revenue', (req, res)=> {
  try {
    const month = String(req.query.month || '').trim(); // YYYY-MM
    let start = dayjs.tz().startOf('month'); let end = dayjs.tz().endOf('month');
    if (/^\d{4}-\d{2}$/.test(month)) {
      const [y,m] = month.split('-').map(Number);
      start = dayjs.tz(new Date(y, m-1, 1)).startOf('month');
      end   = start.endOf('month');
    }
    const reservations = readJsonSafe(reservationsPath);
    const cars = readJsonSafe(carsPath);
    const customers = readJsonSafe(customersPath);

    const items = reservations.filter(r => {
      const rs = toMs(r.startAt || r.startDate);
      const re = toMs(r.endAt   || r.endDate);
      if (rs==null || re==null) return false;
      // overlap with month window
      return !(re < +start || rs > +end);
    }).map(r => {
      const car = cars.find(c => c.id === r.carId) || {};
      const cust = customers.find(u => u.id === r.customerId) || {};
      return {
        id: r.id,
        carId: r.carId,
        customerId: r.customerId,
        startAt: r.startAt,
        endAt: r.endAt,
        days: r.days,
        unitPrice: r.pricePerDay,
        discountPercent: r.discountPercent,
        totalPrice: r.totalPrice,
        destination: r.destination,
        status: r.status || 'BOOKED',
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        car: { plate:car.plate, brand:car.brand, model:car.model },
        customer: { name: cust.name || (cust.firstName? (cust.firstName+' '+(cust.lastName||'')) : ''), phone: cust.phone || cust.tel || '' }
      };
    });

    const total = items.reduce((s,x)=> s + Number(x.totalPrice||0), 0);
    res.json({ items, total, count: items.length });
  } catch (e) {
    console.error('GET /api/revenue failed', e);
    res.status(500).json({ error:'internal_error', message:String(e?.message||e) });
  }
});

// ----- API 404 JSON (keep LAST) -----
app.use('/api', (req,res)=> res.status(404).json({ error:'Not found' }));

// ----- Favicon quiet -----
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ----- Start -----
app.listen(PORT, ()=> {
  console.log(`Server on http://localhost:${PORT}`);
  console.log(`Serving static from: ${PUBLIC_DIR}`);
});
