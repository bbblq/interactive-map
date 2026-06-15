const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const backupUtils = require('./backup-utils');

const app = express();
const PORT = config.PORT;

// Session Management
app.use(session({
  secret: config.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.SESSION_MAX_AGE,
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' // Default to false unless explicitly enabled
  }
}));

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Rate Limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

// Memory Cache
const cache = {
  markers: null,
  map: null,
  categories: null,
  iconTypes: null,
  settings: null,
  lastUpdate: {}
};

// Helper: Ensure directory exists (async)
async function ensureDir(dir) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Helper: Read JSON file with cache
async function readJSON(filePath, cacheKey) {
  const now = Date.now();
  if (cache[cacheKey] && now - (cache.lastUpdate[cacheKey] || 0) < config.CACHE_TTL) {
    return cache[cacheKey];
  }

  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    cache[cacheKey] = parsed;
    cache.lastUpdate[cacheKey] = now;
    return parsed;
  } catch (error) {
    return null;
  }
}

// Helper: Write JSON file and invalidate cache
async function writeJSON(filePath, data, cacheKey) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  if (cacheKey) {
    cache[cacheKey] = data;
    cache.lastUpdate[cacheKey] = Date.now();
  }
}

// Initialize directories and files
async function initialize() {
  await ensureDir(config.UPLOADS_DIR);
  await ensureDir(config.ICONS_DIR);
  await ensureDir(config.DATA_DIR);

  // Check if this is first-time setup (no markers file exists)
  const isFirstSetup = !fsSync.existsSync(config.MARKERS_DATA_FILE);

  // Initialize data files if they don't exist
  if (!fsSync.existsSync(config.MAP_DATA_FILE)) {
    // Copy default map if available
    const defaultMapPath = path.join(__dirname, 'data', 'default-map.json');
    if (fsSync.existsSync(defaultMapPath)) {
      const defaultMapData = JSON.parse(fsSync.readFileSync(defaultMapPath, 'utf8'));
      await writeJSON(config.MAP_DATA_FILE, defaultMapData);

      // Copy default map image to uploads
      const defaultImagePath = path.join(__dirname, 'public', 'default-map.png');
      const targetImagePath = path.join(config.UPLOADS_DIR, 'default-map.png');
      if (fsSync.existsSync(defaultImagePath) && !fsSync.existsSync(targetImagePath)) {
        fsSync.copyFileSync(defaultImagePath, targetImagePath);
      }
    } else {
      await writeJSON(config.MAP_DATA_FILE, { imageUrl: '' });
    }
  }

  if (!fsSync.existsSync(config.MARKERS_DATA_FILE)) {
    // Copy default markers if available
    const defaultMarkersPath = path.join(__dirname, 'data', 'default-markers.json');
    if (fsSync.existsSync(defaultMarkersPath)) {
      const defaultMarkers = JSON.parse(fsSync.readFileSync(defaultMarkersPath, 'utf8'));
      await writeJSON(config.MARKERS_DATA_FILE, defaultMarkers);
    } else {
      await writeJSON(config.MARKERS_DATA_FILE, []);
    }
  }

  if (!fsSync.existsSync(config.CATEGORIES_DATA_FILE)) {
    // Copy default categories if available
    const defaultCategoriesPath = path.join(__dirname, 'data', 'default-categories.json');
    if (fsSync.existsSync(defaultCategoriesPath)) {
      const defaultCategories = JSON.parse(fsSync.readFileSync(defaultCategoriesPath, 'utf8'));
      await writeJSON(config.CATEGORIES_DATA_FILE, defaultCategories);
    } else {
      const defaultCategories = {
        person: { name: '人员', icon: '👤', color: '#4a90e2' },
        printer: { name: '打印机', icon: '🖨️', color: '#7b68ee' },
        water: { name: '饮水机', icon: '💧', color: '#00bcd4' },
        meeting: { name: '会议室', icon: '🏢', color: '#ff6b6b' },
        other: { name: '其他', icon: '📌', color: '#ffa726' }
      };
      await writeJSON(config.CATEGORIES_DATA_FILE, defaultCategories);
    }
  }

  // Initialize Icon Types (This is what frontend actually uses for categories)
  if (!fsSync.existsSync(config.ICON_TYPES_FILE)) {
    const defaultIconTypesPath = path.join(__dirname, 'data', 'default-icon-types.json');
    if (fsSync.existsSync(defaultIconTypesPath)) {
      const defaultIconTypes = JSON.parse(fsSync.readFileSync(defaultIconTypesPath, 'utf8'));
      await writeJSON(config.ICON_TYPES_FILE, defaultIconTypes);
    } else {
      // Will be initialized with defaults in GET /api/icon-types if file missing
      // But we can pre-create it here if needed
    }
  }

  if (!fsSync.existsSync(config.VIEWS_FILE)) {
    await writeJSON(config.VIEWS_FILE, []);
  }

  if (isFirstSetup) {
    console.log('✅ First-time setup completed with example office map and markers');
  }
}

// Authentication Middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Configure multer for map uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDir(config.UPLOADS_DIR);
    cb(null, config.UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, 'map-' + Date.now() + path.extname(file.originalname));
  }
});

// Configure multer for icon uploads
const iconStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDir(config.ICONS_DIR);
    cb(null, config.ICONS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, 'icon-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Images only!');
    }
  }
});

const uploadIcon = multer({
  storage: iconStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/; // Allow SVG for icons
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    // Mime type check can be tricky for SVG sometimes, trusting ext for now or simple check
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error('Only images (jpg, png, gif, svg) are allowed'));
    }
  }
});

// ============================================
// Authentication APIs
// ============================================

// Login
app.post('/api/admin/login',
  body('password').trim().notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid input' });
      }

      const { password } = req.body;

      // Get admin password (from settings.json or env)
      const adminCreds = await config.getAdminPassword();
      let isValid = false;

      if (adminCreds.isHash) {
        // Compare with bcrypt hash
        isValid = await bcrypt.compare(password, adminCreds.hash);
      } else {
        // Direct comparison with plain text
        isValid = password === adminCreds.password;
      }

      if (isValid) {
        req.session.isAdmin = true;
        req.session.isAuthenticated = true;
        res.json({ success: true });
      } else {
        res.status(401).json({ error: 'Invalid password' });
      }
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

// Logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Change password
app.post('/api/admin/change-password',
  requireAuth,
  body('oldPassword').trim().notEmpty(),
  body('newPassword').trim().isLength({ min: 4 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid input. New password must be at least 4 characters.' });
      }

      const { oldPassword, newPassword } = req.body;

      // Verify old password
      const adminCreds = await config.getAdminPassword();
      let isValid = false;

      if (adminCreds.isHash) {
        isValid = await bcrypt.compare(oldPassword, adminCreds.hash);
      } else {
        isValid = oldPassword === adminCreds.password;
      }

      if (!isValid) {
        return res.status(401).json({ error: 'Old password is incorrect' });
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Save to settings.json
      const settings = await readJSON(config.SETTINGS_FILE, 'settings');
      settings.adminPasswordHash = newPasswordHash;
      await writeJSON(config.SETTINGS_FILE, settings, 'settings');

      // Destroy session to force re-login
      req.session.destroy();

      res.json({
        success: true,
        message: 'Password changed successfully. Please login again.'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  });

// Check auth status
app.get('/api/admin/status', (req, res) => {
  res.json({ isAuthenticated: !!(req.session && req.session.isAdmin) });
});

// ============================================
// Map APIs
// ============================================

// Get map image
app.get('/api/map', async (req, res) => {
  try {
    const data = await readJSON(config.MAP_DATA_FILE, 'map');
    res.json(data || { imageUrl: '' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load map' });
  }
});

// Upload map image (requires auth)
app.post('/api/map/upload', requireAuth, upload.single('map'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = '/uploads/' + req.file.filename;
    await writeJSON(config.MAP_DATA_FILE, { imageUrl }, 'map');
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload custom icon (requires auth)
app.post('/api/upload-icon', requireAuth, uploadIcon.single('iconFile'), async (req, res) => {
  try {
    if (req.file) {
      const fileUrl = `/uploads/icons/${req.file.filename}`;
      res.json({ success: true, url: fileUrl });
    } else {
      res.status(400).json({ success: false, message: 'No file uploaded' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// ============================================
// Markers APIs
// ============================================

// Validation Middleware
const validateMarker = [
  body('x').isNumeric().withMessage('X coordinate must be a number'),
  body('y').isNumeric().withMessage('Y coordinate must be a number'),
  body('label').optional().isString().trim().isLength({ max: 100 }),
  body('type').optional().isIn(['icon', 'text', 'shape']),
  body('category').optional().isString().trim().isLength({ max: 50 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Get all markers
app.get('/api/markers', async (req, res) => {
  try {
    const markers = await readJSON(config.MARKERS_DATA_FILE, 'markers');
    res.json(markers || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load markers' });
  }
});

// Add marker (requires auth)
app.post('/api/markers', requireAuth, validateMarker, async (req, res) => {
  try {
    const markers = await readJSON(config.MARKERS_DATA_FILE, 'markers') || [];
    const newMarker = {
      id: Date.now().toString(),
      ...req.body
    };
    markers.push(newMarker);
    await writeJSON(config.MARKERS_DATA_FILE, markers, 'markers');
    res.json(newMarker);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add marker' });
  }
});

// Update marker (requires auth)
app.put('/api/markers/:id', requireAuth, validateMarker, async (req, res) => {
  try {
    const markers = await readJSON(config.MARKERS_DATA_FILE, 'markers') || [];
    const index = markers.findIndex(m => m.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Marker not found' });
    }

    markers[index] = { ...markers[index], ...req.body };
    await writeJSON(config.MARKERS_DATA_FILE, markers, 'markers');
    res.json(markers[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update marker' });
  }
});

// Delete marker (requires auth)
app.delete('/api/markers/:id', requireAuth, async (req, res) => {
  try {
    let markers = await readJSON(config.MARKERS_DATA_FILE, 'markers') || [];
    markers = markers.filter(m => m.id !== req.params.id);
    await writeJSON(config.MARKERS_DATA_FILE, markers, 'markers');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

// ============================================
// Categories APIs
// ============================================

// Get all categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await readJSON(config.CATEGORIES_DATA_FILE, 'categories');
    res.json(categories || {});
  } catch (error) {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// Update categories (requires auth)
app.put('/api/categories', requireAuth, async (req, res) => {
  try {
    await writeJSON(config.CATEGORIES_DATA_FILE, req.body, 'categories');
    res.json(req.body);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update categories' });
  }
});

// ============================================
// Icon Types APIs
// ============================================

// Default icon types
const DEFAULT_ICON_TYPES = {
  printer: { name: '打印机', icon: 'printer', color: '#7b68ee', showInSidebar: true, order: 1 },
  shredder: { name: '碎纸机', icon: 'shredder', color: '#ff6b6b', showInSidebar: true, order: 2 },
  tv: { name: '电视', icon: 'tv', color: '#4a90e2', showInSidebar: true, order: 3 },
  screen: { name: '大屏幕', icon: 'screen', color: '#00bcd4', showInSidebar: true, order: 4 },
  server: { name: '机房', icon: 'server', color: '#9c27b0', showInSidebar: true, order: 5 },
  console: { name: '控制台', icon: 'console', color: '#ff9800', showInSidebar: true, order: 6 },
  icemaker: { name: '制冰机', icon: 'icemaker', color: '#03a9f4', showInSidebar: true, order: 7 },
  water: { name: '饮水机', icon: 'water', color: '#00bcd4', showInSidebar: true, order: 8 },
  coffee: { name: '咖啡机', icon: 'coffee', color: '#795548', showInSidebar: true, order: 9 },
  snacks: { name: '零食台', icon: 'snacks', color: '#ffa726', showInSidebar: true, order: 10 },
  person: { name: '人员', icon: 'person', color: '#4a90e2', showInSidebar: true, order: 11 },
  meeting: { name: '会议室', icon: 'meeting', color: '#ff6b6b', showInSidebar: true, order: 12 },
  wifi: { name: '📶 无线 AP', icon: 'wifi', color: '#3f51b5', showInSidebar: true, order: 13 },
  camera: { name: '📹 摄像头', icon: 'camera', color: '#607d8b', showInSidebar: true, order: 14 },
  other: { name: '其他', icon: 'other', color: '#9e9e9e', showInSidebar: true, order: 15 }
};

// Get icon types
app.get('/api/icon-types', async (req, res) => {
  try {
    let iconTypes = await readJSON(config.ICON_TYPES_FILE, 'iconTypes');
    if (!iconTypes) {
      await writeJSON(config.ICON_TYPES_FILE, DEFAULT_ICON_TYPES, 'iconTypes');
      iconTypes = DEFAULT_ICON_TYPES;
    }
    res.json(iconTypes);
  } catch (error) {
    res.json(DEFAULT_ICON_TYPES);
  }
});

// Update icon type (requires auth)
app.put('/api/icon-types/:id', requireAuth, async (req, res) => {
  try {
    let iconTypes = await readJSON(config.ICON_TYPES_FILE, 'iconTypes') || DEFAULT_ICON_TYPES;
    iconTypes[req.params.id] = req.body;
    await writeJSON(config.ICON_TYPES_FILE, iconTypes, 'iconTypes');
    res.json(iconTypes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update icon type' });
  }
});

// ============================================
// Views APIs
// ============================================

// Get all views (admin)
app.get('/api/views', requireAuth, async (req, res) => {
  try {
    const views = await readJSON(config.VIEWS_FILE, 'views') || [];
    res.json(views);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load views' });
  }
});

// Get a specific view by route (public)
// Special route '__main__' returns the view marked as isMain
app.get('/api/view/:route', async (req, res) => {
  try {
    const views = await readJSON(config.VIEWS_FILE, 'views') || [];
    let view;
    if (req.params.route === '__main__') {
      view = views.find(v => v.isMain === true);
    } else {
      view = views.find(v => v.route === req.params.route);
    }
    if (view) {
      res.json(view);
    } else {
      res.status(404).json({ error: 'View not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load view' });
  }
});

// Create view (admin)
app.post('/api/views', requireAuth, async (req, res) => {
  try {
    const views = await readJSON(config.VIEWS_FILE, 'views') || [];
    // Check for duplicate route
    if (views.some(v => v.route === req.body.route)) {
      return res.status(400).json({ error: 'Route already exists' });
    }
    const newView = { id: Date.now().toString(), ...req.body };
    views.push(newView);
    await writeJSON(config.VIEWS_FILE, views, 'views');
    res.json(newView);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create view' });
  }
});

// Update view (admin)
app.put('/api/views/:id', requireAuth, async (req, res) => {
  try {
    const views = await readJSON(config.VIEWS_FILE, 'views') || [];
    const index = views.findIndex(v => v.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'View not found' });
    // Check for duplicate route (ignoring self)
    if (views.some(v => v.route === req.body.route && v.id !== req.params.id)) {
      return res.status(400).json({ error: 'Route already exists' });
    }
    views[index] = { ...views[index], ...req.body, id: req.params.id };
    await writeJSON(config.VIEWS_FILE, views, 'views');
    res.json(views[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update view' });
  }
});

// Clear main view (admin) — must be before /:id route
app.delete('/api/views/clear-main', requireAuth, async (req, res) => {
  try {
    const views = await readJSON(config.VIEWS_FILE, 'views') || [];
    views.forEach(v => delete v.isMain);
    await writeJSON(config.VIEWS_FILE, views, 'views');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear main view' });
  }
});

// Delete view (admin)
app.delete('/api/views/:id', requireAuth, async (req, res) => {
  try {
    let views = await readJSON(config.VIEWS_FILE, 'views') || [];
    views = views.filter(v => v.id !== req.params.id);
    await writeJSON(config.VIEWS_FILE, views, 'views');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete view' });
  }
});

// Set a view as main view (admin)
app.put('/api/views/:id/set-main', requireAuth, async (req, res) => {
  try {
    const views = await readJSON(config.VIEWS_FILE, 'views') || [];
    const index = views.findIndex(v => v.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'View not found' });
    // Clear isMain from all views, then set on the target
    views.forEach(v => delete v.isMain);
    views[index].isMain = true;
    await writeJSON(config.VIEWS_FILE, views, 'views');
    res.json(views[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to set main view' });
  }
});

// ============================================
// Settings APIs
// ============================================

// Default settings
const DEFAULT_SETTINGS = {
  title: '互动地图',
  logoUrl: '',
  // 全局前台标记尺寸倍数, 与单个标记的 scale 相乘得到最终屏幕像素尺寸
  // 0.3 = 最小, 1.0 = 默认, 2.0 = 最大
  markerSizeMultiplier: 1.0
};

// Get settings
app.get('/api/settings', async (req, res) => {
  try {
    let settings = await readJSON(config.SETTINGS_FILE, 'settings');
    if (!settings) {
      await writeJSON(config.SETTINGS_FILE, DEFAULT_SETTINGS, 'settings');
      settings = DEFAULT_SETTINGS;
    }
    res.json({ ...DEFAULT_SETTINGS, ...settings });
  } catch (error) {
    res.json(DEFAULT_SETTINGS);
  }
});

// Update settings (requires auth)
app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const currentSettings = await readJSON(config.SETTINGS_FILE, 'settings') || DEFAULT_SETTINGS;
    const newSettings = { ...currentSettings, ...req.body };
    await writeJSON(config.SETTINGS_FILE, newSettings, 'settings');
    res.json(newSettings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Upload logo (requires auth)
app.post('/api/upload-logo', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    if (req.file) {
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ success: true, url: fileUrl });
    } else {
      res.status(400).json({ success: false, message: 'No file uploaded' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});

// ============================================
// Backup & Restore APIs
// ============================================

// Export system configuration (requires auth)
app.get('/api/backup/export', requireAuth, async (req, res) => {
  try {
    const backup = await backupUtils.createBackup(config);

    // Set headers for file download
    const filename = `office-map-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    res.json(backup);
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export configuration', details: error.message });
  }
});

// Import system configuration (requires auth)
app.post('/api/backup/import', requireAuth, async (req, res) => {
  try {
    const backup = req.body;

    // Validate backup
    backupUtils.validateBackup(backup);

    // Create automatic backup before restore
    const autoBackupPath = await backupUtils.createAutoBackup(config);

    // Restore from backup
    const result = await backupUtils.restoreBackup(backup, config);

    // Clear cache after restore
    Object.keys(cache).forEach(key => {
      if (key !== 'lastUpdate') {
        cache[key] = null;
      }
    });
    cache.lastUpdate = {};

    res.json({
      ...result,
      autoBackupPath: autoBackupPath ? path.basename(autoBackupPath) : null
    });
  } catch (error) {
    console.error('Import failed:', error);
    res.status(500).json({ error: 'Failed to import configuration', details: error.message });
  }
});

// Get backup info (requires auth)
app.get('/api/backup/info', requireAuth, async (req, res) => {
  try {
    const info = {
      version: backupUtils.CURRENT_VERSION,
      dataFiles: {
        markers: fsSync.existsSync(config.MARKERS_DATA_FILE),
        categories: fsSync.existsSync(config.CATEGORIES_DATA_FILE),
        iconTypes: fsSync.existsSync(config.ICON_TYPES_FILE),
        settings: fsSync.existsSync(config.SETTINGS_FILE),
        map: fsSync.existsSync(config.MAP_DATA_FILE)
      }
    };

    // Count items
    if (info.dataFiles.markers) {
      const markersData = await fs.readFile(config.MARKERS_DATA_FILE, 'utf8');
      const markers = JSON.parse(markersData);
      info.markerCount = markers.length;
    }

    res.json(info);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get backup info' });
  }
});

// ============================================
// Error Handling Middleware
// ============================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Frontend Routes
// ============================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/:viewRoute?', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server with initialization
async function startServer() {
  try {
    await initialize();
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log(`✓ Environment: ${config.NODE_ENV}`);
      console.log(`✓ Cache TTL: ${config.CACHE_TTL}ms`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
