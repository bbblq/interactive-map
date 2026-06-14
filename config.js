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

  // Get admin password (async)
  // Priority: settings.json > environment variable
  async getAdminPassword() {
    try {
      const settingsPath = path.join(__dirname, 'data', 'settings.json');
      if (fsSync.existsSync(settingsPath)) {
        const data = await fs.readFile(settingsPath, 'utf8');
        const settings = JSON.parse(data);

        if (settings.adminPasswordHash) {
          return { hash: settings.adminPasswordHash, isHash: true };
        }
      }
    } catch (error) {
      console.error('Error reading password from settings:', error);
    }

    // Fallback to environment variable
    return { password: this.ADMIN_PASSWORD, isHash: false };
  }
};
