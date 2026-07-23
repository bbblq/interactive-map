const express = require('express');
const multer = require('multer');
const path = require('path');
const fsSync = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const db = require('./db');
const backupUtils = require('./backup-utils');
const packageInfo = require('./package.json');

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
    secure: process.env.COOKIE_SECURE === 'true'
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

// Helper: Ensure directory exists
async function ensureDir(dir) {
  const fs = require('fs').promises;
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Public build version used by the admin UI.
app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: packageInfo.version });
});

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
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
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

      const adminCreds = await config.getAdminPassword();
      let isValid = false;

      if (adminCreds.isHash) {
        isValid = await bcrypt.compare(password, adminCreds.hash);
      } else {
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

      const newPasswordHash = await bcrypt.hash(newPassword, 10);

      // Save password hash into SQLite settings
      const settings = db.getSettings();
      settings.adminPasswordHash = newPasswordHash;
      db.setSettings(settings);

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
app.get('/api/map', (req, res) => {
  try {
    res.json(db.getMap());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load map' });
  }
});

// Upload map image (requires auth)
app.post('/api/map/upload', requireAuth, upload.single('map'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = '/uploads/' + req.file.filename;
    db.setMap({ imageUrl });
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload custom icon (requires auth)
app.post('/api/upload-icon', requireAuth, uploadIcon.single('iconFile'), (req, res) => {
  try {
    if (req.file) {
      const fileUrl = '/uploads/icons/' + req.file.filename;
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
  body('label').optional({ values: 'null' }).isString().trim().isLength({ max: 100 }),
  body('type').optional().isIn(['icon', 'text', 'shape', 'fill']),
  body('category').optional({ values: 'null' }).isString().trim().isLength({ max: 50 }),
  body('points').custom((points, { req }) => {
    if (req.body.type !== 'fill') return true;
    if (!Array.isArray(points) || points.length < 3 || points.length > 500) {
      throw new Error('Fill marker must contain 3 to 500 points');
    }
    const valid = points.every(point => point
      && Number.isFinite(Number(point.x))
      && Number.isFinite(Number(point.y)));
    if (!valid) throw new Error('Fill marker points must be numeric coordinates');
    return true;
  }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Get all markers
app.get('/api/markers', (req, res) => {
  try {
    res.json(db.getMarkers());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load markers' });
  }
});

// Add marker (requires auth)
app.post('/api/markers', requireAuth, validateMarker, (req, res) => {
  try {
    const newMarker = db.addMarker({
      id: Date.now().toString(),
      ...req.body
    });
    res.json(newMarker);
  } catch (error) {
    console.error('Add marker error:', error);
    res.status(500).json({ error: 'Failed to add marker' });
  }
});

// Update marker (requires auth)
app.put('/api/markers/:id', requireAuth, validateMarker, (req, res) => {
  try {
    const updated = db.updateMarker(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Marker not found' });
    }
    res.json(updated);
  } catch (error) {
    console.error('Update marker error:', error);
    res.status(500).json({ error: 'Failed to update marker' });
  }
});

// Delete marker (requires auth)
app.delete('/api/markers/:id', requireAuth, (req, res) => {
  try {
    const deleted = db.deleteMarker(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Marker not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

// ============================================
// Categories APIs
// ============================================

// Get all categories
app.get('/api/categories', (req, res) => {
  try {
    res.json(db.getCategories());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

// Update categories (requires auth)
app.put('/api/categories', requireAuth, (req, res) => {
  try {
    db.setCategories(req.body);
    res.json(req.body);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update categories' });
  }
});

// ============================================
// Icon Types APIs
// ============================================

// Get icon types
app.get('/api/icon-types', (req, res) => {
  try {
    res.json(db.getIconTypes());
  } catch (error) {
    res.json(db.DEFAULT_ICON_TYPES);
  }
});

// Update icon type (requires auth)
app.put('/api/icon-types/:id', requireAuth, (req, res) => {
  try {
    const iconTypes = db.getIconTypes();
    iconTypes[req.params.id] = req.body;
    db.setIconTypes(iconTypes);
    res.json(iconTypes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update icon type' });
  }
});

// ============================================
// Views APIs
// ============================================

// Get all views (admin)
app.get('/api/views', requireAuth, (req, res) => {
  try {
    res.json(db.getViews());
  } catch (error) {
    res.status(500).json({ error: 'Failed to load views' });
  }
});

// Get a specific view by route (public)
app.get('/api/view/:route', (req, res) => {
  try {
    const views = db.getViews();
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
app.post('/api/views', requireAuth, (req, res) => {
  try {
    const views = db.getViews();
    if (views.some(v => v.route === req.body.route)) {
      return res.status(400).json({ error: 'Route already exists' });
    }
    const newView = { id: Date.now().toString(), ...req.body };
    views.push(newView);
    db.setViews(views);
    res.json(newView);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create view' });
  }
});

// Update view (admin)
app.put('/api/views/:id', requireAuth, (req, res) => {
  try {
    const views = db.getViews();
    const index = views.findIndex(v => v.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'View not found' });
    if (views.some(v => v.route === req.body.route && v.id !== req.params.id)) {
      return res.status(400).json({ error: 'Route already exists' });
    }
    views[index] = { ...views[index], ...req.body, id: req.params.id };
    db.setViews(views);
    res.json(views[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update view' });
  }
});

// Clear main view (admin)
app.delete('/api/views/clear-main', requireAuth, (req, res) => {
  try {
    const views = db.getViews();
    views.forEach(v => delete v.isMain);
    db.setViews(views);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear main view' });
  }
});

// Delete view (admin)
app.delete('/api/views/:id', requireAuth, (req, res) => {
  try {
    const views = db.getViews().filter(v => v.id !== req.params.id);
    db.setViews(views);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete view' });
  }
});

// Set a view as main view (admin)
app.put('/api/views/:id/set-main', requireAuth, (req, res) => {
  try {
    const views = db.getViews();
    const index = views.findIndex(v => v.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'View not found' });
    views.forEach(v => delete v.isMain);
    views[index].isMain = true;
    db.setViews(views);
    res.json(views[index]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to set main view' });
  }
});

// ============================================
// Settings APIs
// ============================================

// Get settings
app.get('/api/settings', (req, res) => {
  try {
    res.json(db.getSettings());
  } catch (error) {
    res.json(db.DEFAULT_SETTINGS);
  }
});

// Update settings (requires auth)
app.post('/api/settings', requireAuth, (req, res) => {
  try {
    const current = db.getSettings();
    const updated = { ...current, ...req.body };
    db.setSettings(updated);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Upload logo (requires auth)
app.post('/api/upload-logo', requireAuth, upload.single('logo'), (req, res) => {
  try {
    if (req.file) {
      const fileUrl = '/uploads/' + req.file.filename;
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
    const backup = await backupUtils.createBackup(config, db);

    const filename = 'office-map-backup-' + new Date().toISOString().split('T')[0] + '.json';
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');

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

    backupUtils.validateBackup(backup);

    // Auto-backup before restore
    const autoBackupPath = await backupUtils.createAutoBackup(config, db);

    const result = await backupUtils.restoreBackup(backup, config, db);

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
app.get('/api/backup/info', requireAuth, (req, res) => {
  try {
    const markers = db.getMarkers();
    const info = {
      version: backupUtils.CURRENT_VERSION,
      markerCount: markers.length,
      dataFiles: {
        markers: true,
        categories: true,
        iconTypes: true,
        settings: true,
        map: true
      }
    };
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

// Start server
async function startServer() {
  try {
    // Ensure directories exist
    await ensureDir(config.UPLOADS_DIR);
    await ensureDir(config.ICONS_DIR);
    await ensureDir(config.DATA_DIR);

    // Initialize SQLite (creates tables + migrates JSON data)
    db.initialize(config);

    // Ensure default map image exists
    const mapData = db.getMap();
    if (!mapData.imageUrl) {
      const defaultImageSrc = path.join(__dirname, 'public', 'default-map.png');
      const defaultImageDest = path.join(config.UPLOADS_DIR, 'default-map.png');
      if (fsSync.existsSync(defaultImageSrc) && !fsSync.existsSync(defaultImageDest)) {
        fsSync.copyFileSync(defaultImageSrc, defaultImageDest);
      }
      if (fsSync.existsSync(defaultImageDest)) {
        db.setMap({ imageUrl: '/uploads/default-map.png' });
      }
    }

    app.listen(PORT, () => {
      console.log('✓ Server running on http://localhost:' + PORT);
      console.log('✓ Environment: ' + config.NODE_ENV);
      console.log('✓ Storage: SQLite (data/map.db)');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
