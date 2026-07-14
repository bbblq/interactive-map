const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Backup Utility Module
 * Handles system configuration backup and restore with version compatibility.
 * Now reads/writes via the db module (SQLite) instead of JSON files directly.
 */

const CURRENT_VERSION = '1.0.0';

/**
 * Compare two semantic version strings
 * @returns -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
        if (parts1[i] > parts2[i]) return 1;
        if (parts1[i] < parts2[i]) return -1;
    }
    return 0;
}

/**
 * Validate backup data structure
 */
function validateBackup(backup) {
    if (!backup || typeof backup !== 'object') {
        throw new Error('Invalid backup format: not an object');
    }

    if (!backup.version) {
        throw new Error('Invalid backup format: missing version');
    }

    if (!backup.data) {
        throw new Error('Invalid backup format: missing data');
    }

    return true;
}

/**
 * Migrate backup data to current version
 */
function migrateBackup(backup) {
    const version = backup.version || '1.0.0';
    let data = { ...backup.data };

    // Future version migrations can be added here
    // if (compareVersions(version, '1.1.0') < 0) { ... }

    return {
        ...backup,
        version: CURRENT_VERSION,
        data
    };
}

/**
 * Create backup object from current system state (reads from SQLite via db module)
 */
async function createBackup(config, db) {
    const backup = {
        version: CURRENT_VERSION,
        exportDate: new Date().toISOString(),
        metadata: {
            appName: 'Office Map System',
            description: 'System configuration backup'
        },
        data: {}
    };

    // Markers
    backup.data.markers = db.getMarkers();

    // Categories
    backup.data.categories = db.getCategories();

    // Icon Types
    backup.data.iconTypes = db.getIconTypes();

    // Settings (exclude adminPasswordHash from export for security)
    const settings = db.getSettings();
    const { adminPasswordHash, ...safeSettings } = settings;
    backup.data.settings = safeSettings;

    // Map image
    const mapData = db.getMap();
    if (mapData && mapData.imageUrl) {
        try {
            const imagePath = path.join(config.UPLOADS_DIR, path.basename(mapData.imageUrl));
            if (fsSync.existsSync(imagePath)) {
                const imageBuffer = await fs.readFile(imagePath);
                const base64Image = imageBuffer.toString('base64');
                const ext = path.extname(imagePath).substring(1);
                const mimeType = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);

                backup.data.mapImage = {
                    filename: path.basename(imagePath),
                    mimeType: mimeType,
                    base64: 'data:' + mimeType + ';base64,' + base64Image
                };
            }
        } catch (e) {
            console.warn('Could not include map image in backup:', e.message);
        }
    }

    return backup;
}

/**
 * Restore system from backup (writes into SQLite via db module)
 */
async function restoreBackup(backup, config, db) {
    validateBackup(backup);
    const migratedBackup = migrateBackup(backup);
    const data = migratedBackup.data;

    // Restore markers
    if (Array.isArray(data.markers)) {
        db.replaceAllMarkers(data.markers);
    }

    // Restore categories
    if (data.categories && typeof data.categories === 'object') {
        db.setCategories(data.categories);
    }

    // Restore icon types
    if (data.iconTypes && typeof data.iconTypes === 'object') {
        db.setIconTypes(data.iconTypes);
    }

    // Restore settings (preserve existing password hash if not in backup)
    if (data.settings && typeof data.settings === 'object') {
        const currentSettings = db.getSettings();
        const merged = { ...data.settings };
        // Keep the existing password hash (don't overwrite with backup's)
        if (currentSettings.adminPasswordHash && !merged.adminPasswordHash) {
            merged.adminPasswordHash = currentSettings.adminPasswordHash;
        }
        db.setSettings(merged);
    }

    // Restore map image
    if (data.mapImage && data.mapImage.base64) {
        const base64Data = data.mapImage.base64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        await ensureDir(config.UPLOADS_DIR);
        const imagePath = path.join(config.UPLOADS_DIR, data.mapImage.filename);
        await fs.writeFile(imagePath, imageBuffer);

        db.setMap({ imageUrl: '/uploads/' + data.mapImage.filename });
    }

    return {
        success: true,
        message: 'Backup restored successfully',
        version: migratedBackup.version,
        itemsRestored: {
            markers: data.markers ? data.markers.length : 0,
            categories: Object.keys(data.categories || {}).length,
            iconTypes: Object.keys(data.iconTypes || {}).length,
            settings: Object.keys(data.settings || {}).length,
            mapImage: !!data.mapImage
        }
    };
}

/**
 * Create automatic backup before restore
 */
async function createAutoBackup(config, db) {
    try {
        const backup = await createBackup(config, db);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(config.DATA_DIR, 'auto-backup-' + timestamp + '.json');

        await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

        return backupPath;
    } catch (error) {
        console.error('Auto backup failed:', error);
        return null;
    }
}

/**
 * Helper: ensure directory exists
 */
async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

module.exports = {
    CURRENT_VERSION,
    compareVersions,
    validateBackup,
    migrateBackup,
    createBackup,
    restoreBackup,
    createAutoBackup
};
