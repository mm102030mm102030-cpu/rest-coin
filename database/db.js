const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'rest.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    coins INTEGER DEFAULT 0,
    messages_count INTEGER DEFAULT 0,
    voice_minutes INTEGER DEFAULT 0,
    last_message_time INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    last_claim_timestamp INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT,
    price_usd REAL DEFAULT 0,
    price_coins INTEGER DEFAULT 0,
    stock INTEGER DEFAULT 0,
    category TEXT,
    discord_channel_id TEXT
  )
`).run();

// Drop old orders table if it exists (for development migration)
try {
  const tableInfo = db.prepare('PRAGMA table_info(orders)').all();
  if (tableInfo.length > 0 && !tableInfo.some(col => col.name === 'product_name')) {
    db.prepare('DROP TABLE orders').run();
  }
} catch (e) {}

db.prepare(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_tag TEXT,
    user_avatar TEXT,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER,
    total_price REAL,
    currency TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();



db.prepare(`
  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    discount_percent INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    current_uses INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL
  )
`).run();

// Ensure owner is admin
try {
  db.prepare('INSERT OR IGNORE INTO admins (user_id) VALUES (?)').run('760911731399589888');
} catch (err) {}

// Season Default Settings
try {
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('season_number', '1');
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('season_is_active', 'false');
  db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run('season_end_date', '0');
} catch (err) {}

module.exports = db;
