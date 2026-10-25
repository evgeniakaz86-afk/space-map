import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export const db = new Database('spacemap.db');

// Включаем поддержку внешних ключей и режим WAL для лучшей производительности
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
-- 1. Пользователи (для входа организатора)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('organizer'))
);

-- 2. Карты (основная сущность)
CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  plan_url TEXT,
  floors INTEGER DEFAULT 1,
  published INTEGER DEFAULT 0,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

-- 3. Здания (если несколько зданий)
CREATE TABLE IF NOT EXISTS buildings (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  name TEXT NOT NULL,
  plan_url TEXT,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
);

-- 4. Точки (метки на карте)
CREATE TABLE IF NOT EXISTS points (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  building_id TEXT,
  floor INTEGER DEFAULT 1,
  name TEXT NOT NULL,
  category TEXT,
  description TEXT,
  x REAL, y REAL,
  wifi INTEGER DEFAULT 0,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
);

-- 5. Панорамы (3D-снимки)
CREATE TABLE IF NOT EXISTS panoramas (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  building_id TEXT,
  floor INTEGER DEFAULT 1,
  url TEXT NOT NULL,
  x REAL, y REAL,
  is3d INTEGER DEFAULT 0,
  FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
);

-- 6. Статистика (просмотры)
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  map_id TEXT NOT NULL,
  point_id TEXT,
  event TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 7. Опубликованные карты (для ссылки на просмотр)
CREATE TABLE IF NOT EXISTS published_maps (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8. Автосоздание планов (история)
CREATE TABLE IF NOT EXISTS auto_plans (
  id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  result_url TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Создаем пользователя admin по умолчанию (если его нет)
const adminExists = db.prepare('SELECT id FROM users WHERE login=?').get('admin');
if (!adminExists) {
  db.prepare('INSERT INTO users(login, pass_hash, role) VALUES(?, ?, ?)')
    .run('admin', bcrypt.hashSync('admin', 10), 'organizer');
  console.log('✅ Создан пользователь: admin / admin');
}