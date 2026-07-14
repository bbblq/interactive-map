require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

module.exports = {
  // Server Configuration
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Security
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin',
  SESSION_SECRET: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB

  // Paths
  DATA_DIR: path.join(__dirname, 'data'),
  UPLOADS_DIR: path.join(__dirname, 'uploads'),
  ICONS_DIR: path.join(__dirname, 'uploads', 'icons'),
  DB_FILE: path.join(__dirname, 'data', 'map.db'),
  // JSON file paths retained for migration detection on first startup
  MARKERS_DATA_FILE: path.join(__dirname, 'data', 'markers.json'),
  MAP_DATA_FILE: path.join(__dirname, 'data', 'map.json'),
  CATEGORIES_DATA_FILE: path.join(__dirname, 'data', 'categories.json'),
  ICON_TYPES_FILE: path.join(__dirname, 'data', 'icon-types.json'),
  SETTINGS_FILE: path.join(__dirname, 'data', 'settings.json'),
  VIEWS_FILE: path.join(__dirname, 'data', 'views.json'),

  // Cache Configuration
  CACHE_TTL: 5000, // 5 seconds

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100, // max 100 requests per window

  // Get admin password
  // Priority: SQLite settings (adminPasswordHash) > environment variable
  async getAdminPassword() {
    try {
      // Lazy-require to avoid circular dependency during startup
      const db = require('./db');
      const settings = db.getSettings();
      if (settings && settings.adminPasswordHash) {
        return { hash: settings.adminPasswordHash, isHash: true };
      }
    } catch (error) {
      // db may not be initialized yet on very first run — fall through
    }

    // Fallback: also check old settings.json.bak (edge case: migration in progress)
    try {
      const bakPath = path.join(__dirname, 'data', 'settings.json.bak');
      if (fsSync.existsSync(bakPath)) {
        const data = fsSync.readFileSync(bakPath, 'utf8');
        const settings = JSON.parse(data);
        if (settings.adminPasswordHash) {
          return { hash: settings.adminPasswordHash, isHash: true };
        }
      }
    } catch (_) {}

    // Fallback to environment variable
    return { password: this.ADMIN_PASSWORD, isHash: false };
  }
};
