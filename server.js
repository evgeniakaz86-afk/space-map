import express from 'express';
import compression from 'compression';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db } from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Безопасный импорт vision.js (чтобы сервер не падал, если wopencv сломается)
let autoPlanFromImage, build3DFromPhotos;
try {
    const vision = await import('./vision.js');
    autoPlanFromImage = vision.autoPlanFromImage;
    build3DFromPhotos = vision.build3DFromPhotos;
    console.log('✅ Модуль vision.js успешно загружен');
} catch (e) {
    console.error('⚠️ ОШИБКА ЗАГРУЗКИ vision.js:', e.message);
    console.error('Сервер запустится, но функции склейки панорам будут недоступны.');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const SECRET = process.env.SECRET || 'demo-secret-change-me';
const upload = multer({ dest: 'uploads/', limits: { fileSize: 25 * 1024 * 1024 } });

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());

// 1. Отдаем статику (public)
app.use(express.static(path.join(__dirname, 'public')));

// 2. Раздаем папку node_modules 
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

// 3. Раздаем папку uploads (для загруженных файлов)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ЗАЩИТА ДОСТУПА ---
function auth(req, res, next) {
  const t = req.cookies.token;
  if (!t) return res.status(401).json({ error: 'unauthorized' });
  try { req.user = jwt.verify(t, SECRET); next(); }
  catch { return res.status(401).json({ error: 'unauthorized' }); }
}

// --- ВХОД ---
app.post('/api/login', (req, res) => {
  const { login, pass } = req.body || {};
  if (!login || !pass) return res.status(400).json({ error: 'missing' });
  const u = db.prepare('SELECT * FROM users WHERE login=?').get(login);
  if (!u || !bcrypt.compareSync(pass, u.pass_hash))
    return res.status(401).json({ error: 'bad credentials' });
  
  const token = jwt.sign({ id: u.id, role: u.role }, SECRET, { expiresIn: '30d' });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 3600 * 1000
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/me', auth, (req, res) => res.json(req.user));

// --- СКЛЕЙКА ПАНОРАМ НА СЕРВЕРЕ ---
app.post('/api/stitch', upload.array('photos', 12), async (req, res) => {
    try {
        const files = req.files;
        if (!files || files.length < 2) return res.status(400).json({ error: 'need 2+ photos' });
        if (!build3DFromPhotos) return res.status(500).json({ error: 'vision module not loaded' });
        
        const out = await build3DFromPhotos(files.map(f => f.path), 'uploads');
        res.json({ url: '/uploads/' + out }); // ВАЖНО: добавляем /uploads/
    } catch (e) {
        console.error('Stitch error:', e);
        res.status(500).json({ error: 'stitch_error', details: e.message });
    }
});

// --- КАРТЫ ---
app.post('/api/maps', auth, (req, res) => {
  const id = uuid().slice(0, 8);
  db.prepare('INSERT INTO maps(id,owner_id,title,floors) VALUES(?,?,?,?)')
    .run(id, req.user.id, req.body.title || 'Новая карта', req.body.floors || 1);
  res.json({ id });
});

app.get('/api/maps/mine', auth, (req, res) =>
  res.json(db.prepare('SELECT * FROM maps WHERE owner_id=?').all(req.user.id)));

app.post('/api/maps/:id/plan', auth, upload.single('plan'), (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  const url = '/uploads/' + req.file.filename;
  db.prepare('UPDATE maps SET plan_url=? WHERE id=?').run(url, m.id);
  res.json({ url });
});

// --- ЗДАНИЯ ---
app.post('/api/maps/:id/buildings', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  const id = uuid().slice(0, 8);
  db.prepare('INSERT INTO buildings(id,map_id,name) VALUES(?,?,?)')
    .run(id, m.id, req.body.name || 'Здание');
  res.json({ id });
});

app.post('/api/buildings/:id/plan', auth, upload.single('plan'), (req, res) => {
  const b = db.prepare('SELECT b.*, m.owner_id FROM buildings b JOIN maps m ON m.id=b.map_id WHERE b.id=?')
    .get(req.params.id);
  if (!b || b.owner_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  const url = '/uploads/' + req.file.filename;
  db.prepare('UPDATE buildings SET plan_url=? WHERE id=?').run(url, b.id);
  res.json({ url });
});

// --- ТОЧКИ ---
app.post('/api/maps/:id/points', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  const { name, category, description, x, y, floor, building_id, wifi } = req.body;
  const id = uuid().slice(0, 8);
  db.prepare('INSERT INTO points(id,map_id,building_id,floor,name,category,description,x,y,wifi) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, m.id, building_id || null, floor || 1, name, category || '', description || '', x, y, wifi ? 1 : 0);
  res.json({ id });
});

app.delete('/api/points/:id', auth, (req, res) => {
  const p = db.prepare('SELECT p.*, m.owner_id FROM points p JOIN maps m ON m.id=p.map_id WHERE p.id=?').get(req.params.id);
  if (!p || p.owner_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM points WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// --- ПАНОРАМЫ ---
app.post('/api/maps/:id/panoramas', auth, upload.single('panorama'), (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  const id = uuid().slice(0, 8);
  const { x, y, floor, building_id } = req.body;
  db.prepare('INSERT INTO panoramas(id,map_id,building_id,floor,url,x,y) VALUES(?,?,?,?,?,?,?)')
    .run(id, m.id, building_id || null, floor || 1, '/uploads/' + req.file.filename, x || 0, y || 0);
  res.json({ id });
});

// --- АВТОСОЗДАНИЕ 2D-ПЛАНА ---
app.post('/api/maps/:id/auto-plan', auth, upload.single('image'), async (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  if (!autoPlanFromImage) return res.status(500).json({ error: 'vision module not loaded' });
  
  try {
    const out = await autoPlanFromImage(req.file.path, 'uploads');
    db.prepare('UPDATE maps SET plan_url=? WHERE id=?').run('/uploads/' + out, m.id);
    res.json({ plan: '/uploads/' + out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'image_error' });
  }
});

// --- 3D-МОДЕЛЬ ---
app.post('/api/maps/:id/3d', auth, upload.array('photos', 12), async (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  if (!build3DFromPhotos) return res.status(500).json({ error: 'vision module not loaded' });
  
  try {
    const out = await build3DFromPhotos(req.files.map(f => f.path), 'uploads');
    const id = uuid().slice(0, 8);
    db.prepare('INSERT INTO panoramas(id,map_id,url,is3d) VALUES(?,?,?,1)')
      .run(id, m.id, '/uploads/' + out);
    res.json({ url: '/uploads/' + out });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '3d_error' });
  }
});

// --- ПУБЛИКАЦИЯ КАРТЫ ---
app.post('/api/publish', (req, res) => {
  const { locations, points, panoramas } = req.body;
  const mapId = uuid().slice(0, 8);
  
  try {
    db.prepare('INSERT INTO published_maps(id, data) VALUES(?, ?)')
      .run(mapId, JSON.stringify({ locations, points, panoramas }));
    res.json({ mapId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'save_error' });
  }
});

// --- ПОЛУЧЕНИЕ ОПУБЛИКОВАННОЙ КАРТЫ ---
app.get('/api/published/:id', (req, res) => {
  const row = db.prepare('SELECT data FROM published_maps WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(JSON.parse(row.data));
});

// --- СТАРЫЕ МАРШРУТЫ ---
app.post('/api/maps/:id/publish', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  db.prepare('UPDATE maps SET published=1 WHERE id=?').run(m.id);
  res.json({ link: `/viewer.html?map=${m.id}` });
});

app.get('/api/public/maps/:id', (req, res) => {
  const m = db.prepare('SELECT id,title,plan_url,floors FROM maps WHERE id=? AND published=1').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  m.buildings = db.prepare('SELECT * FROM buildings WHERE map_id=?').all(m.id);
  m.points = db.prepare('SELECT * FROM points WHERE map_id=?').all(m.id);
  m.panoramas = db.prepare('SELECT * FROM panoramas WHERE map_id=?').all(m.id);
  res.json(m);
});

app.post('/api/public/maps/:id/stats', (req, res) => {
  db.prepare('INSERT INTO stats(map_id,point_id,event) VALUES(?,?,?)')
    .run(req.params.id, req.body.point_id || null, req.body.event || 'view');
  res.json({ ok: true });
});

app.get('/api/maps/:id/stats', auth, (req, res) => {
  const m = db.prepare('SELECT * FROM maps WHERE id=? AND owner_id=?').get(req.params.id, req.user.id);
  if (!m) return res.status(403).json({ error: 'forbidden' });
  const rows = db.prepare('SELECT event, point_id, COUNT(*) c FROM stats WHERE map_id=? GROUP BY event, point_id').all(m.id);
  const total = db.prepare('SELECT COUNT(*) c FROM stats WHERE map_id=?').get(m.id).c;
  res.json({ total, rows });
});

// --- ПРЯМЫЕ МАРШРУТЫ ДЛЯ HTML ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/editor.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'editor.html')));
app.get('/viewer.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'viewer.html')));

// --- ОБРАБОТКА ОШИБОК ---
app.use((err, req, res, next) => {
  console.error('SERVER ERROR:', err);
  res.status(500).json({ error: 'server_error', details: err.message });
});

// --- ЗАПУСК СЕРВЕРА ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`📱 Для телефона (в той же Wi-Fi): http://<ВАШ_IP>:${PORT}`);
    console.log(`=========================================`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ ОШИБКА: Порт ${PORT} уже занят другой программой!`);
        console.error(`Закройте старое окно CMD или перезагрузите компьютер.`);
    } else {
        console.error('❌ Ошибка при запуске сервера:', err);
    }
});