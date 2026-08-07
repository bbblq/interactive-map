'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fsSync = require('fs');

// ─── DB Init ──────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'data', 'map.db');

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');   // 写前日志，支持并发读
    _db.pragma('foreign_keys = ON');
  }
  return _db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function initSchema() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS markers (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL DEFAULT 'icon',
      x          REAL NOT NULL,
      y          REAL NOT NULL,
      category   TEXT,
      label      TEXT,
      rotation   REAL DEFAULT 0,
      scale      REAL DEFAULT 1,
      extra_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

// ─── Migration: JSON → SQLite ─────────────────────────────────────────────────

/**
 * 从 JSON 文件加载数据（若存在），并迁移到 SQLite。
 * 迁移完成后将 JSON 文件重命名为 .bak，保留备份。
 */
function migrateFromJson(config) {
  const db = getDb();

  // 1. Markers
  const markersCount = db.prepare('SELECT COUNT(*) as cnt FROM markers').get().cnt;
  if (markersCount === 0 && config.MARKERS_DATA_FILE && fsSync.existsSync(config.MARKERS_DATA_FILE)) {
    try {
      const raw = fsSync.readFileSync(config.MARKERS_DATA_FILE, 'utf8');
      const markers = JSON.parse(raw);
      if (Array.isArray(markers) && markers.length > 0) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO markers (id, type, x, y, category, label, rotation, scale, extra_json)
          VALUES (@id, @type, @x, @y, @category, @label, @rotation, @scale, @extra_json)
        `);
        const insertMany = db.transaction((rows) => {
          for (const m of rows) {
            const { id, type, x, y, category, label, rotation, scale, ...rest } = m;
            insert.run({
              id: String(id != null ? id : Date.now()),
              type: type != null ? type : 'icon',
              x: Number(x),
              y: Number(y),
              category: category != null ? category : null,
              label: label != null ? label : null,
              rotation: Number(rotation != null ? rotation : 0),
              scale: Number(scale != null ? scale : 1),
              extra_json: JSON.stringify(rest)
            });
          }
        });
        insertMany(markers);
        console.log('✅ Migrated ' + markers.length + ' markers from JSON to SQLite');
      }
      fsSync.renameSync(config.MARKERS_DATA_FILE, config.MARKERS_DATA_FILE + '.bak');
    } catch (e) {
      console.error('⚠️  Marker migration failed:', e.message);
    }
  }

  // 2. KV stores: map / settings / categories / icon-types / views
  const kvFiles = [
    { key: 'map',        file: config.MAP_DATA_FILE },
    { key: 'settings',   file: config.SETTINGS_FILE },
    { key: 'categories', file: config.CATEGORIES_DATA_FILE },
    { key: 'iconTypes',  file: config.ICON_TYPES_FILE },
    { key: 'views',      file: config.VIEWS_FILE },
  ];

  const upsertKV = db.prepare('INSERT OR IGNORE INTO kv_store (key, value) VALUES (?, ?)');
  for (const { key, file } of kvFiles) {
    const existing = db.prepare('SELECT 1 FROM kv_store WHERE key = ?').get(key);
    if (!existing && file && fsSync.existsSync(file)) {
      try {
        const raw = fsSync.readFileSync(file, 'utf8').trim();
        upsertKV.run(key, raw);
        fsSync.renameSync(file, file + '.bak');
        console.log('✅ Migrated ' + key + ' from JSON to SQLite');
      } catch (e) {
        console.error('⚠️  KV migration failed for ' + key + ':', e.message);
      }
    }
  }
}

// ─── Public init ──────────────────────────────────────────────────────────────

function initialize(config) {
  initSchema();
  migrateFromJson(config);
  getDb().prepare(`
    UPDATE markers
    SET category = 'area'
    WHERE type = 'fill'
      AND (category IS NULL OR category = '' OR category = 'other')
  `).run();
}

// ─── Markers CRUD ─────────────────────────────────────────────────────────────

function rowToMarker(row) {
  if (!row) return null;
  let extra = {};
  try { extra = JSON.parse(row.extra_json || '{}'); } catch (_) {}
  const { extra_json, ...core } = row;
  // Merge: extra first (lower priority), then core fields override
  return { ...extra, ...core };
}

function getMarkers() {
  return getDb()
    .prepare('SELECT * FROM markers ORDER BY rowid')
    .all()
    .map(rowToMarker);
}

function getMarkerById(id) {
  return rowToMarker(getDb().prepare('SELECT * FROM markers WHERE id = ?').get(id));
}

function addMarker(data) {
  const { id, type, x, y, category, label, rotation, scale, ...rest } = data;
  const markerId = String(id != null ? id : Date.now());
  getDb().prepare(`
    INSERT INTO markers (id, type, x, y, category, label, rotation, scale, extra_json)
    VALUES (@id, @type, @x, @y, @category, @label, @rotation, @scale, @extra_json)
  `).run({
    id: markerId,
    type: type != null ? type : 'icon',
    x: Number(x),
    y: Number(y),
    category: category != null ? category : null,
    label: label != null ? label : null,
    rotation: Number(rotation != null ? rotation : 0),
    scale: Number(scale != null ? scale : 1),
    extra_json: JSON.stringify(rest)
  });
  return getMarkerById(markerId);
}

function updateMarker(id, data) {
  const existing = getMarkerById(id);
  if (!existing) return null;
  // Merge existing with new data
  const merged = { ...existing, ...data };
  const { id: _id, type, x, y, category, label, rotation, scale, ...rest } = merged;
  getDb().prepare(`
    UPDATE markers SET
      type       = @type,
      x          = @x,
      y          = @y,
      category   = @category,
      label      = @label,
      rotation   = @rotation,
      scale      = @scale,
      extra_json = @extra_json
    WHERE id = @id
  `).run({
    id,
    type: type != null ? type : 'icon',
    x: Number(x),
    y: Number(y),
    category: category != null ? category : null,
    label: label != null ? label : null,
    rotation: Number(rotation != null ? rotation : 0),
    scale: Number(scale != null ? scale : 1),
    extra_json: JSON.stringify(rest)
  });
  return getMarkerById(id);
}

function deleteMarker(id) {
  const info = getDb().prepare('DELETE FROM markers WHERE id = ?').run(id);
  return info.changes > 0;
}

/**
 * 批量替换所有标记（用于备份还原）
 */
function replaceAllMarkers(markers) {
  const db = getDb();
  const doReplace = db.transaction((rows) => {
    db.prepare('DELETE FROM markers').run();
    for (const m of rows) {
      const { id, type, x, y, category, label, rotation, scale, ...rest } = m;
      db.prepare(`
        INSERT INTO markers (id, type, x, y, category, label, rotation, scale, extra_json)
        VALUES (@id, @type, @x, @y, @category, @label, @rotation, @scale, @extra_json)
      `).run({
        id: String(id != null ? id : Date.now()),
        type: type != null ? type : 'icon',
        x: Number(x),
        y: Number(y),
        category: category != null ? category : null,
        label: label != null ? label : null,
        rotation: Number(rotation != null ? rotation : 0),
        scale: Number(scale != null ? scale : 1),
        extra_json: JSON.stringify(rest)
      });
    }
  });
  doReplace(markers);
}

// ─── KV Store helpers ─────────────────────────────────────────────────────────

function getKV(key, defaultValue) {
  if (defaultValue === undefined) defaultValue = null;
  const row = getDb().prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); } catch (_) { return row.value; }
}

function setKV(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(
    key,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
}

// ─── Named helpers ────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  title: '互动地图',
  logoUrl: '',
  markerSizeMultiplier: 1.0
};

const DEFAULT_ICON_TYPES = {
  printer:  { name: '打印机',  icon: 'printer',  color: '#7b68ee', showInSidebar: true, order: 1 },
  shredder: { name: '碎纸机',  icon: 'shredder', color: '#ff6b6b', showInSidebar: true, order: 2 },
  tv:       { name: '电视',    icon: 'tv',       color: '#4a90e2', showInSidebar: true, order: 3 },
  screen:   { name: '大屏幕',  icon: 'screen',   color: '#00bcd4', showInSidebar: true, order: 4 },
  server:   { name: '机房',    icon: 'server',   color: '#9c27b0', showInSidebar: true, order: 5 },
  console:  { name: '控制台',  icon: 'console',  color: '#ff9800', showInSidebar: true, order: 6 },
  icemaker: { name: '制冰机',  icon: 'icemaker', color: '#03a9f4', showInSidebar: true, order: 7 },
  water:    { name: '饮水机',  icon: 'water',    color: '#00bcd4', showInSidebar: true, order: 8 },
  coffee:   { name: '咖啡机',  icon: 'coffee',   color: '#795548', showInSidebar: true, order: 9 },
  snacks:   { name: '零食台',  icon: 'snacks',   color: '#ffa726', showInSidebar: true, order: 10 },
  person:   { name: '人员',    icon: 'person',   color: '#4a90e2', showInSidebar: true, order: 11 },
  meeting:  { name: '会议室',  icon: 'meeting',  color: '#ff6b6b', showInSidebar: true, order: 12 },
  wifi:     { name: '无线 AP', icon: 'wifi',     color: '#3f51b5', showInSidebar: true, order: 13 },
  camera:   { name: '摄像头',  icon: 'camera',   color: '#607d8b', showInSidebar: true, order: 14 },
  area:     { name: '区域标记', icon: 'area',     color: '#4a90e2', showInSidebar: true, order: 15 },
  other:    { name: '其他',    icon: 'other',    color: '#9e9e9e', showInSidebar: true, order: 16 }
};

const DEFAULT_CATEGORIES = {
  person:  { name: '人员',   icon: '👤', color: '#4a90e2' },
  printer: { name: '打印机', icon: '🖨️', color: '#7b68ee' },
  water:   { name: '饮水机', icon: '💧', color: '#00bcd4' },
  meeting: { name: '会议室', icon: '🏢', color: '#ff6b6b' },
  area:    { name: '区域标记', icon: '⬟', color: '#4a90e2' },
  other:   { name: '其他',   icon: '📌', color: '#ffa726' }
};

function getMap()         { return getKV('map', { imageUrl: '' }); }
function setMap(v)        { setKV('map', v); }
function getSettings()    { return Object.assign({}, DEFAULT_SETTINGS, getKV('settings', {}) || {}); }
function setSettings(v)   { setKV('settings', v); }
function getCategories()  { return Object.assign({}, DEFAULT_CATEGORIES, getKV('categories', {}) || {}); }
function setCategories(v) { setKV('categories', v); }
function getIconTypes()   { return Object.assign({}, DEFAULT_ICON_TYPES, getKV('iconTypes', {}) || {}); }
function setIconTypes(v)  { setKV('iconTypes', v); }
function getViews()       { return getKV('views', []); }
function setViews(v)      { setKV('views', v); }
function getTagGroups()   { return getKV('tagGroups', []); }
function setTagGroups(v)  { setKV('tagGroups', v); }

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initialize,
  // Markers
  getMarkers,
  getMarkerById,
  addMarker,
  updateMarker,
  deleteMarker,
  replaceAllMarkers,
  // KV generic
  getKV,
  setKV,
  // Named helpers
  getMap, setMap,
  getSettings, setSettings,
  getCategories, setCategories,
  getIconTypes, setIconTypes,
  getViews, setViews,
  getTagGroups, setTagGroups,
  // Defaults
  DEFAULT_SETTINGS,
  DEFAULT_ICON_TYPES,
  DEFAULT_CATEGORIES,
};
