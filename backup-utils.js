const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Backup Utility Module
 * Handles system configuration backup and restore with version compatibility
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
    // Example:
    // if (compareVersions(version, '1.1.0') < 0) {
    //   data.markers = data.markers.map(m => ({
    //     ...m,
    //     newField: m.newField || defaultValue
    //   }));
    // }

    return {
        ...backup,
        version: CURRENT_VERSION,
        data
    };
}

/**
 * Create backup object from current system state
 */
async function createBackup(config) {
    const backup = {
        version: CURRENT_VERSION,
        exportDate: new Date().toISOString(),
        metadata: {
            appName: 'Office Map System',
            description: 'System configuration backup'
        },
        data: {}
    };

    // Read all data files
    try {
        // Markers
        if (fsSync.existsSync(config.MARKERS_DATA_FILE)) {
            const markersData = await fs.readFile(config.MARKERS_DATA_FILE, 'utf8');
            backup.data.markers = JSON.parse(markersData);
        } else {
            backup.data.markers = [];
        }

        // Categories
        if (fsSync.existsSync(config.CATEGORIES_DATA_FILE)) {
            const categoriesData = await fs.readFile(config.CATEGORIES_DATA_FILE, 'utf8');
            backup.data.categories = JSON.parse(categoriesData);
        } else {
            backup.data.categories = {};
        }

        // Icon Types
        if (fsSync.existsSync(config.ICON_TYPES_FILE)) {
            const iconTypesData = await fs.readFile(config.ICON_TYPES_FILE, 'utf8');
            backup.data.iconTypes = JSON.parse(iconTypesData);
        } else {
            backup.data.iconTypes = {};
        }

        // Settings
        if (fsSync.existsSync(config.SETTINGS_FILE)) {
            const settingsData = await fs.readFile(config.SETTINGS_FILE, 'utf8');
            backup.data.settings = JSON.parse(settingsData);
        } else {
            backup.data.settings = {};
        }

        // Map data (including image)
        if (fsSync.existsSync(config.MAP_DATA_FILE)) {
            const mapData = await fs.readFile(config.MAP_DATA_FILE, 'utf8');
            const mapInfo = JSON.parse(mapData);

            if (mapInfo.imageUrl) {
                // Read map image and convert to base64
                const imagePath = path.join(config.UPLOADS_DIR, path.basename(mapInfo.imageUrl));
                if (fsSync.existsSync(imagePath)) {
                    const imageBuffer = await fs.readFile(imagePath);
                    const base64Image = imageBuffer.toString('base64');
                    const ext = path.extname(imagePath).substring(1);
                    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

                    backup.data.mapImage = {
                        filename: path.basename(imagePath),
                        mimeType: mimeType,
                        base64: `data:${mimeType};base64,${base64Image}`
                    };
                }
            }
        }

    } catch (error) {
        throw new Error(`Failed to create backup: ${error.message}`);
    }

    return backup;
}

/**
 * Restore system from backup
 */
async function restoreBackup(backup, config) {
    // Validate and migrate
    validateBackup(backup);
    const migratedBackup = migrateBackup(backup);
    const data = migratedBackup.data;

    try {
        // Restore markers
        if (data.markers) {
            await fs.writeFile(
                config.MARKERS_DATA_FILE,
                JSON.stringify(data.markers, null, 2)
            );
        }

        // Restore categories
        if (data.categories) {
            await fs.writeFile(
                config.CATEGORIES_DATA_FILE,
                JSON.stringify(data.categories, null, 2)
            );
        }

        // Restore icon types
        if (data.iconTypes) {
            await fs.writeFile(
                config.ICON_TYPES_FILE,
                JSON.stringify(data.iconTypes, null, 2)
            );
        }

        // Restore settings
        if (data.settings) {
            await fs.writeFile(
                config.SETTINGS_FILE,
                JSON.stringify(data.settings, null, 2)
            );
        }

        // Restore map image
        if (data.mapImage && data.mapImage.base64) {
            // Extract base64 data
            const base64Data = data.mapImage.base64.replace(/^data:image\/\w+;base64,/, '');
            const imageBuffer = Buffer.from(base64Data, 'base64');

            // Save image
            const imagePath = path.join(config.UPLOADS_DIR, data.mapImage.filename);
            await fs.writeFile(imagePath, imageBuffer);

            // Update map data
            await fs.writeFile(
                config.MAP_DATA_FILE,
                JSON.stringify({ imageUrl: `/uploads/${data.mapImage.filename}` })
            );
        }

        return {
            success: true,
            message: 'Backup restored successfully',
            version: migratedBackup.version,
            itemsRestored: {
                markers: data.markers?.length || 0,
                categories: Object.keys(data.categories || {}).length,
                iconTypes: Object.keys(data.iconTypes || {}).length,
                settings: Object.keys(data.settings || {}).length,
                mapImage: !!data.mapImage
            }
        };

    } catch (error) {
        throw new Error(`Failed to restore backup: ${error.message}`);
    }
}

/**
 * Create automatic backup before restore
 */
async function createAutoBackup(config) {
    try {
        const backup = await createBackup(config);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(config.DATA_DIR, `auto-backup-${timestamp}.json`);

        await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

        return backupPath;
    } catch (error) {
        console.error('Auto backup failed:', error);
        return null;
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
