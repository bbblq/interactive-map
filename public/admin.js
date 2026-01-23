// Admin Panel - Authentication handled by backend
let isAuthenticated = false;

// XSS Protection
function escapeHtml(text) {
    if (!text) return text;
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Rich Text Editor Functions
function formatText(command) {
    document.execCommand(command, false, null);
    document.getElementById('textDetails').focus();
}

function insertLink() {
    const url = prompt('请输入链接地址:', 'https://');
    if (url && url.trim()) {
        document.execCommand('createLink', false, url);
        document.getElementById('textDetails').focus();
    }
}

// DOM elements - will be initialized in init()
let loginScreen;
let adminPanel;
let passwordInput;
let loginBtn;
let loginError;
let logoutBtn;

// Map editor state
let mapData = null;
let markers = [];
let editorScale = 1;
let editorTranslateX = 0;
let editorTranslateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let isAddingMarker = false;
let editingMarkerId = null;

// DOM elements - Editor
const editorMapWrapper = document.getElementById('editorMapWrapper');
const editorMapImage = document.getElementById('editorMapImage');
const editorMapImg = document.getElementById('editorMapImg');
const editorMarkersContainer = document.getElementById('editorMarkers');
const editorEmptyState = document.getElementById('editorEmptyState');
const editorZoomControls = document.getElementById('editorZoomControls');
const markersList = document.getElementById('markersList');

// Modal
const markerFormModal = document.getElementById('markerFormModal');
const markerFormTitle = document.getElementById('markerFormTitle');
const markerForm = document.getElementById('markerForm');
const closeMarkerForm = document.getElementById('closeMarkerForm');
const cancelMarkerForm = document.getElementById('cancelMarkerForm');

// Context Menu
const contextMenu = document.getElementById('contextMenu');
let contextMenuX = 0;
let contextMenuY = 0;

// Marker selection and resizing
let selectedMarkerId = null;
let selectionBox = null;
let isResizing = false;
let resizeHandle = null;
let isDraggingMarker = false;
let dragStartX = 0;
let dragStartY = 0;
let markerStartX = 0;
let markerStartY = 0;
let markerStartScale = 1.0;

// Icon Types Management
let iconTypes = {};
let editingIconTypeId = null;

// SVG Icons Library
const SVG_ICONS = {
    printer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>`,
    shredder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="10" rx="1"/><path d="M6 12v2m4-2v2m4-2v2m4-2v2M6 18v3m4-3v3m4-3v3m4-3v3"/></svg>`,
    tv: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M17 2l-5 5-5-5"/></svg>`,
    screen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
    server: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><path d="M6 6h.01M6 18h.01"/></svg>`,
    console: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8l4 4-4 4M12 16h6"/></svg>`,
    icemaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18M7 7l10 10M17 7L7 17"/></svg>`,
    water: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg>`,
    snacks: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`,
    person: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a7.5 7.5 0 0115 0v2"/></svg>`,
    meeting: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/></svg>`,
    coffee: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>`,
    other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`
};

// Default Icon Types Configuration
const DEFAULT_ICON_TYPES = {
    printer: { name: '打印机', icon: 'printer', color: '#7b68ee' },
    shredder: { name: '碎纸机', icon: 'shredder', color: '#ff6b6b' },
    tv: { name: '电视', icon: 'tv', color: '#4a90e2' },
    screen: { name: '大屏幕', icon: 'screen', color: '#00bcd4' },
    server: { name: '机房', icon: 'server', color: '#9c27b0' },
    console: { name: '控制台', icon: 'console', color: '#ff9800' },
    icemaker: { name: '制冰机', icon: 'icemaker', color: '#03a9f4' },
    water: { name: '饮水机', icon: 'water', color: '#00bcd4' },
    coffee: { name: '咖啡机', icon: 'coffee', color: '#795548' },
    snacks: { name: '零食台', icon: 'snacks', color: '#ffa726' },
    person: { name: '人员', icon: 'person', color: '#4a90e2' },
    meeting: { name: '会议室', icon: 'meeting', color: '#ff6b6b' },
    other: { name: '其他', icon: 'other', color: '#9e9e9e' }
};

// ============================================
// Backup Management Functions
// ============================================

// Load backup info
async function loadBackupInfo() {
    try {
        const response = await fetch('/api/backup/info');
        const info = await response.json();

        document.getElementById('backupVersion').textContent = info.version || '-';
        document.getElementById('markerCount').textContent = info.markerCount || '0';
        document.getElementById('mapStatus').textContent = info.dataFiles.map ? '已上传' : '未上传';
    } catch (error) {
        console.error('Failed to load backup info:', error);
    }
}

// Export backup
async function exportBackup() {
    const btn = document.getElementById('exportBackupBtn');
    const status = document.getElementById('exportStatus');

    btn.disabled = true;
    btn.textContent = '导出中...';
    status.textContent = '';
    status.className = 'status-message';

    try {
        const response = await fetch('/api/backup/export');

        if (!response.ok) {
            throw new Error('Export failed');
        }

        const backup = await response.json();

        // Create download link
        const dataStr = JSON.stringify(backup, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `office-map-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        status.textContent = '✓ 配置已成功导出!';
        status.className = 'status-message success';
    } catch (error) {
        console.error('Export failed:', error);
        status.textContent = '✗ 导出失败: ' + error.message;
        status.className = 'status-message error';
    } finally {
        btn.disabled = false;
        btn.textContent = '📥 导出配置文件';
    }
}

// Handle import file selection
function handleImportFileSelect(event) {
    const file = event.target.files[0];
    const fileNameDisplay = document.getElementById('importFileName');
    const importBtn = document.getElementById('importBackupBtn');
    const status = document.getElementById('importStatus');

    if (file) {
        fileNameDisplay.textContent = `已选择: ${file.name}`;
        importBtn.style.display = 'block';
        status.textContent = '';
        status.className = 'status-message';
    } else {
        fileNameDisplay.textContent = '';
        importBtn.style.display = 'none';
    }
}

// Import backup
async function importBackup() {
    const fileInput = document.getElementById('importBackupFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('请先选择备份文件');
        return;
    }

    // Confirm import
    if (!confirm('导入配置将覆盖当前所有数据。\n\n系统会自动备份当前配置,确定要继续吗?')) {
        return;
    }

    const btn = document.getElementById('importBackupBtn');
    const status = document.getElementById('importStatus');

    btn.disabled = true;
    btn.textContent = '导入中...';
    status.textContent = '';
    status.className = 'status-message';

    try {
        // Read file
        const fileContent = await file.text();
        const backup = JSON.parse(fileContent);

        // Send to server
        const response = await fetch('/api/backup/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(backup)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || result.details || 'Import failed');
        }

        // Show success message
        let message = `✓ 配置已成功导入!\n\n`;
        message += `恢复的项目:\n`;
        message += `- 标记: ${result.itemsRestored.markers} 个\n`;
        message += `- 分类: ${result.itemsRestored.categories} 个\n`;
        message += `- 图标类型: ${result.itemsRestored.iconTypes} 个\n`;
        message += `- 地图: ${result.itemsRestored.mapImage ? '已恢复' : '无'}\n`;
        if (result.autoBackupPath) {
            message += `\n旧配置已自动备份到: ${result.autoBackupPath}`;
        }

        status.textContent = message;
        status.className = 'status-message success';
        status.style.whiteSpace = 'pre-line';

        // Reload data
        setTimeout(async () => {
            await loadMap();
            await loadMarkers();
            await loadSettings();
            await loadIconTypes();
            await loadBackupInfo();

            alert('配置导入成功!页面数据已刷新。');
        }, 2000);

    } catch (error) {
        console.error('Import failed:', error);
        status.textContent = '✗ 导入失败: ' + error.message;
        status.className = 'status-message error';
    } finally {
        btn.disabled = false;
        btn.textContent = '⬆️ 导入并恢复';
        fileInput.value = '';
        document.getElementById('importFileName').textContent = '';
        btn.style.display = 'none';
    }
}

// Setup backup listeners
function setupBackupListeners() {
    const exportBtn = document.getElementById('exportBackupBtn');
    const importBtn = document.getElementById('importBackupBtn');
    const importFileInput = document.getElementById('importBackupFile');

    if (exportBtn) {
        exportBtn.addEventListener('click', exportBackup);
    }

    if (importBtn) {
        importBtn.addEventListener('click', importBackup);
    }

    if (importFileInput) {
        importFileInput.addEventListener('change', handleImportFileSelect);
    }
}

// Initialize
function init() {
    // Initialize DOM elements first
    loginScreen = document.getElementById('loginScreen');
    adminPanel = document.getElementById('adminPanel');
    passwordInput = document.getElementById('passwordInput');
    loginBtn = document.getElementById('loginBtn');
    loginError = document.getElementById('loginError');
    logoutBtn = document.getElementById('logoutBtn');

    // Setup listeners first
    setupLoginListeners();

    // Check if already authenticated
    checkAuth();
}

// Check authentication
async function checkAuth() {
    try {
        const response = await fetch('/api/admin/status');
        const data = await response.json();

        if (data.isAuthenticated) {
            showAdminPanel();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
}

// Setup login listeners
function setupLoginListeners() {
    if (!loginBtn || !passwordInput || !logoutBtn) return;

    loginBtn.addEventListener('click', login);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') login();
    });
    logoutBtn.addEventListener('click', logout);
}

// Login - now uses backend API
async function login() {
    if (!passwordInput || !loginError || !loginBtn) return;

    const password = passwordInput.value;
    if (!password) {
        loginError.textContent = '请输入密码';
        return;
    }

    // Show loading state
    loginBtn.disabled = true;
    loginBtn.textContent = '登录中...';
    loginError.textContent = '';

    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showAdminPanel();
        } else {
            loginError.textContent = data.error || '密码错误,请重试';
            passwordInput.value = '';
        }
    } catch (error) {
        loginError.textContent = '登录失败,请重试';
        console.error('Login error:', error);
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = '登录';
    }
}

// Logout - now uses backend API
async function logout() {
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
        loginScreen.style.display = 'flex';
        adminPanel.style.display = 'none';
        passwordInput.value = '';
        loginError.textContent = '';
    } catch (error) {
        console.error('Logout error:', error);
        // Force logout on client side even if API fails
        loginScreen.style.display = 'flex';
        adminPanel.style.display = 'none';
    }
}

// Show admin panel
async function showAdminPanel() {
    loginScreen.style.display = 'none';
    adminPanel.style.display = 'block';
    isAuthenticated = true;

    await loadMap();
    await loadMarkers();
    await loadSettings();
    setupTabNavigation();
    setupAdminListeners();
    await loadIconTypes();
    setupBackupListeners();
    await loadBackupInfo();
}

// Setup admin listeners
function setupAdminListeners() {
    // Map upload
    const mapFileInput = document.getElementById('mapFileInput');
    const uploadMapBtn = document.getElementById('uploadMapBtn');

    mapFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = `已选择: ${file.name}`;
            uploadMapBtn.style.display = 'block';
        }
    });

    uploadMapBtn.addEventListener('click', uploadMap);

    // Basic Settings
    const logoFileInput = document.getElementById('logoFileInput');
    if (logoFileInput) {
        logoFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                document.getElementById('logoFileName').textContent = file.name;
                const formData = new FormData();
                formData.append('logo', file);

                try {
                    const response = await fetch('/api/upload-logo', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    if (data.success) {
                        const preview = document.getElementById('siteLogoPreview');
                        const placeholder = document.getElementById('noLogoPlaceholder');
                        preview.src = data.url;
                        preview.style.display = 'block';
                        placeholder.style.display = 'none';
                        preview.dataset.newUrl = data.url;
                    }
                } catch (error) {
                    console.error('Logo upload failed:', error);
                    alert('Logo 上传失败');
                }
            }
        });
    }

    // Editor zoom controls
    document.getElementById('editorZoomIn').addEventListener('click', () => {
        editorZoom(1.1);
    });

    document.getElementById('editorZoomOut').addEventListener('click', () => {
        editorZoom(0.9);
    });

    document.getElementById('editorResetZoom').addEventListener('click', () => {
        centerEditorMap();
    });

    // Editor drag
    editorMapWrapper.addEventListener('mousedown', startEditorDrag);
    editorMapWrapper.addEventListener('mousemove', editorDrag);
    editorMapWrapper.addEventListener('mouseup', endEditorDrag);
    editorMapWrapper.addEventListener('mouseleave', endEditorDrag);

    // Editor wheel zoom
    editorMapWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.15;
        editorZoom(delta, e.clientX, e.clientY);
    });

    // Marker form
    markerForm.addEventListener('submit', saveMarker);
    closeMarkerForm.addEventListener('click', closeMarkerFormModal);
    cancelMarkerForm.addEventListener('click', closeMarkerFormModal);

    markerFormModal.addEventListener('click', (e) => {
        if (e.target === markerFormModal) {
            closeMarkerFormModal();
        }
    });

    // Context menu
    editorMapWrapper.addEventListener('contextmenu', showContextMenu);
    document.addEventListener('click', hideContextMenu);

    // Context menu items
    const contextMenuItems = contextMenu.querySelectorAll('.context-menu-item');
    contextMenuItems.forEach(item => {
        item.addEventListener('click', handleContextMenuClick);
    });

    // Marker type toggle
    const markerTypeRadios = document.querySelectorAll('input[name="markerType"]');
    markerTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleMarkerTypeChange);
    });

    // Icon category change
    document.getElementById('iconCategory').addEventListener('change', updateMarkerIconPreview);
}

// Setup tab navigation
function setupTabNavigation() {
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;

            // Update active menu item
            menuItems.forEach(mi => mi.classList.remove('active'));
            item.classList.add('active');

            // Update active tab
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            document.getElementById(tab + 'Tab').classList.add('active');

            // 如果切换到标记管理标签，强制重新加载和居中地图
            if (tab === 'markers') {
                setTimeout(() => {
                    if (editorMapImg.src && editorMapImg.naturalWidth > 0) {
                        centerEditorMap();
                        renderEditorMarkers();
                    }
                }, 100);
            }
        });
    });
}

// Load map
async function loadMap() {
    try {
        const response = await fetch('/api/map');
        mapData = await response.json();

        if (mapData.imageUrl) {
            // Update preview
            const preview = document.getElementById('currentMapPreview');
            preview.innerHTML = `<img src="${mapData.imageUrl}" alt="当前地图">`;

            // Update editor - 添加时间戳防止缓存
            editorMapImg.src = mapData.imageUrl + '?t=' + Date.now();
            editorMapImg.style.display = 'block';
            editorEmptyState.style.display = 'none';
            editorZoomControls.style.display = 'flex';

            // 确保图片加载完成后再居中
            editorMapImg.onload = () => {
                setTimeout(() => {
                    centerEditorMap();
                    renderEditorMarkers();
                }, 100);
            };

            // 如果图片已经缓存，立即触发
            if (editorMapImg.complete) {
                setTimeout(() => {
                    centerEditorMap();
                    renderEditorMarkers();
                }, 100);
            }
        }
    } catch (error) {
        console.error('Failed to load map:', error);
    }
}

// Upload map
async function uploadMap() {
    const fileInput = document.getElementById('mapFileInput');
    const file = fileInput.files[0];

    if (!file) return;

    const formData = new FormData();
    formData.append('map', file);

    const progressDiv = document.getElementById('uploadProgress');
    progressDiv.textContent = '上传中...';

    try {
        const response = await fetch('/api/map/upload', {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            progressDiv.textContent = '✓ 上传成功！';
            setTimeout(() => {
                progressDiv.textContent = '';
                document.getElementById('fileName').textContent = '';
                document.getElementById('uploadMapBtn').style.display = 'none';
                fileInput.value = '';
            }, 2000);

            await loadMap();
        } else {
            progressDiv.textContent = '✗ 上传失败: ' + data.error;
        }
    } catch (error) {
        progressDiv.textContent = '✗ 上传失败: ' + error.message;
    }
}

// Load markers
async function loadMarkers() {
    try {
        const response = await fetch('/api/markers');
        markers = await response.json();
        renderEditorMarkers();
        renderMarkersList();
    } catch (error) {
        console.error('Failed to load markers:', error);
    }
}

// Center editor map
function centerEditorMap() {
    const containerWidth = editorMapWrapper.offsetWidth;
    const containerHeight = editorMapWrapper.offsetHeight;
    const imgWidth = editorMapImg.naturalWidth;
    const imgHeight = editorMapImg.naturalHeight;

    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    editorScale = Math.min(scaleX, scaleY) * 0.9;

    editorTranslateX = (containerWidth - imgWidth * editorScale) / 2;
    editorTranslateY = (containerHeight - imgHeight * editorScale) / 2;

    updateEditorTransform();
}

// Update editor transform
function updateEditorTransform() {
    editorMapImage.style.transform = `translate(${editorTranslateX}px, ${editorTranslateY}px) scale(${editorScale})`;
    document.getElementById('editorZoomLevel').textContent = Math.round(editorScale * 100) + '%';
    // 标记现在是地图的子元素，会自动跟随地图transform，只需要更新缩放
    updateEditorMarkerScales();
}

// Update editor marker scales (位置由CSS自动处理，只更新缩放)
function updateEditorMarkerScales() {
    const markerElements = editorMarkersContainer.querySelectorAll('.marker');
    markerElements.forEach((markerEl) => {
        const markerId = markerEl.dataset.id;
        const marker = markers.find(m => m.id === markerId);
        if (!marker) return;

        const markerScale = marker.scale || 1.0;

        // 文字标记：使用固定scale
        if (markerEl.classList.contains('marker-text-only')) {
            markerEl.style.transform = `translate(-50%, -50%) scale(${markerScale})`;
        } else {
            // 图标标记：使用固定scale
            markerEl.style.transform = `translate(-50%, -100%) scale(${markerScale})`;
        }
    });
}

// 保留旧函数名以兼容其他调用
function updateEditorMarkerPositions() {
    updateEditorMarkerScales();
}

// Editor zoom
function editorZoom(factor, centerX, centerY) {
    const oldScale = editorScale;
    editorScale *= factor;
    editorScale = Math.max(0.1, Math.min(editorScale, 5));

    if (centerX !== undefined && centerY !== undefined) {
        const rect = editorMapWrapper.getBoundingClientRect();
        const x = centerX - rect.left;
        const y = centerY - rect.top;

        editorTranslateX = x - (x - editorTranslateX) * (editorScale / oldScale);
        editorTranslateY = y - (y - editorTranslateY) * (editorScale / oldScale);
    }

    updateEditorTransform();
}

// Editor drag
function startEditorDrag(e) {
    if (isAddingMarker) return;
    isDragging = true;
    startX = e.clientX - editorTranslateX;
    startY = e.clientY - editorTranslateY;
    editorMapWrapper.classList.add('grabbing');
}

function editorDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    editorTranslateX = e.clientX - startX;
    editorTranslateY = e.clientY - startY;
    updateEditorTransform();
}

function endEditorDrag() {
    isDragging = false;
    editorMapWrapper.classList.remove('grabbing');
}

// Toggle add marker mode
function toggleAddMarkerMode() {
    isAddingMarker = !isAddingMarker;

    if (isAddingMarker) {
        addMarkerBtn.textContent = '✕ 取消添加';
        addMarkerBtn.classList.remove('btn-primary');
        addMarkerBtn.classList.add('btn-secondary');
        addMarkerHint.style.display = 'inline';
        editorMapWrapper.classList.add('adding-marker');

        // 禁用地图拖动
        editorMapWrapper.removeEventListener('mousedown', startEditorDrag);

        // 在地图中心创建一个可拖动的临时标记
        createTemporaryMarker();
    } else {
        addMarkerBtn.textContent = '➕ 添加标记';
        addMarkerBtn.classList.remove('btn-secondary');
        addMarkerBtn.classList.add('btn-primary');
        addMarkerHint.style.display = 'none';
        editorMapWrapper.classList.remove('adding-marker');

        // 恢复地图拖动
        editorMapWrapper.addEventListener('mousedown', startEditorDrag);

        // 移除临时标记
        removeTemporaryMarker();
    }
}

// 创建临时标记
let tempMarker = null;
let tempMarkerDragging = false;
let tempMarkerX = 0;
let tempMarkerY = 0;
let confirmMarkerBtn = null;

function createTemporaryMarker() {
    // 计算地图中心位置
    const containerWidth = editorMapWrapper.offsetWidth;
    const containerHeight = editorMapWrapper.offsetHeight;

    // 转换为图片坐标
    tempMarkerX = (containerWidth / 2 - editorTranslateX) / editorScale;
    tempMarkerY = (containerHeight / 2 - editorTranslateY) / editorScale;

    // 创建临时标记元素
    tempMarker = document.createElement('div');
    tempMarker.className = 'marker temp-marker person';
    tempMarker.innerHTML = `
    <div class="marker-icon">
      <div class="marker-icon-inner">📍</div>
    </div>
    <div class="marker-text">拖动定位</div>
  `;

    editorMarkersContainer.appendChild(tempMarker);
    updateTempMarkerPosition();

    // 添加拖动事件
    tempMarker.addEventListener('mousedown', startTempMarkerDrag);

    // 创建确认按钮
    confirmMarkerBtn = document.createElement('button');
    confirmMarkerBtn.className = 'btn btn-primary confirm-marker-btn';
    confirmMarkerBtn.innerHTML = '✓ 确认位置';
    confirmMarkerBtn.style.position = 'fixed';
    confirmMarkerBtn.style.bottom = '40px';
    confirmMarkerBtn.style.left = '50%';
    confirmMarkerBtn.style.transform = 'translateX(-50%)';
    confirmMarkerBtn.style.zIndex = '1000';
    confirmMarkerBtn.style.padding = '15px 30px';
    confirmMarkerBtn.style.fontSize = '16px';
    confirmMarkerBtn.style.fontWeight = '600';
    confirmMarkerBtn.style.boxShadow = '0 4px 20px rgba(74, 144, 226, 0.4)';
    confirmMarkerBtn.style.animation = 'pulse 2s infinite';
    confirmMarkerBtn.onclick = confirmTempMarkerPosition;

    document.body.appendChild(confirmMarkerBtn);
}

function updateTempMarkerPosition() {
    if (!tempMarker) return;

    // 使用百分比定位，与其他标记保持一致
    const imgWidth = editorMapImg.naturalWidth || 1;
    const imgHeight = editorMapImg.naturalHeight || 1;
    const leftPercent = (tempMarkerX / imgWidth) * 100;
    const topPercent = (tempMarkerY / imgHeight) * 100;

    tempMarker.style.left = leftPercent + '%';
    tempMarker.style.top = topPercent + '%';

    // 反向缩放以保持固定大小
    const iconScale = Math.min(1 / editorScale, 1);
    tempMarker.style.transform = `translate(-50%, -100%) scale(${iconScale})`;
}

function startTempMarkerDrag(e) {
    e.stopPropagation();
    tempMarkerDragging = true;
    editorMapWrapper.style.cursor = 'grabbing';

    document.addEventListener('mousemove', dragTempMarker);
    document.addEventListener('mouseup', endTempMarkerDrag);
}

function dragTempMarker(e) {
    if (!tempMarkerDragging) return;

    const rect = editorMapWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 转换为图片坐标
    tempMarkerX = (x - editorTranslateX) / editorScale;
    tempMarkerY = (y - editorTranslateY) / editorScale;

    updateTempMarkerPosition();
}

function endTempMarkerDrag(e) {
    if (!tempMarkerDragging) return;

    tempMarkerDragging = false;
    editorMapWrapper.style.cursor = '';

    document.removeEventListener('mousemove', dragTempMarker);
    document.removeEventListener('mouseup', endTempMarkerDrag);

    // 双击确认位置
    if (e.detail === 2) {
        confirmTempMarkerPosition();
    }
}

function confirmTempMarkerPosition() {
    openMarkerForm(null, tempMarkerX, tempMarkerY);
    toggleAddMarkerMode();
}

function removeTemporaryMarker() {
    if (tempMarker) {
        tempMarker.remove();
        tempMarker = null;
    }
    if (confirmMarkerBtn) {
        confirmMarkerBtn.remove();
        confirmMarkerBtn = null;
    }
}

// Handle map click - 保留但不使用
function handleMapClick(e) {
    // 不再使用点击添加，改为拖动添加
    return;
}

// Render editor markers
function renderEditorMarkers() {
    editorMarkersContainer.innerHTML = '';

    markers.forEach((marker) => {
        const markerEl = document.createElement('div');

        // 计算百分比位置（基于图片的自然尺寸）
        const imgWidth = editorMapImg.naturalWidth || 1;
        const imgHeight = editorMapImg.naturalHeight || 1;
        const leftPercent = (marker.x / imgWidth) * 100;
        const topPercent = (marker.y / imgHeight) * 100;

        markerEl.dataset.id = marker.id;
        markerEl.style.left = leftPercent + '%';
        markerEl.style.top = topPercent + '%';
        markerEl.style.transform = 'translate(-50%, -50%)';

        // 判断标记类型
        const markerType = marker.type || 'icon';

        if (markerType === 'text') {
            // 文字标记
            markerEl.className = 'marker marker-text-only';
            const textStyle = `
                font-size: ${marker.fontSize || 14}px;
                color: ${marker.textColor || '#333333'};
                background: ${marker.bgColor || '#ffffff'};
                border: ${marker.borderWidth || 1}px solid ${marker.borderColor || '#cccccc'};
                padding: 8px 12px;
                border-radius: 4px;
                white-space: nowrap;
            `;
            markerEl.innerHTML = `
                <div class="text-label" style="${textStyle}">${escapeHtml(marker.content || marker.label || '')}</div>
            `;
        } else {
            // 图标标记
            const showIcon = marker.showIcon !== false;
            const showLabel = marker.showLabel !== false;
            const type = iconTypes[marker.category] || iconTypes.other || DEFAULT_ICON_TYPES.other;

            markerEl.className = `marker ${marker.category || 'other'}`;

            // Background logic
            const bgColor = type.bgColor || '#f8f9fa';
            const isTransparent = bgColor === 'transparent';
            const shadowStyle = isTransparent ? '' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.05);';
            const bgStyle = `background: ${bgColor};`;
            const textColor = isTransparent || bgColor === '#ffffff' || bgColor === '#fff' ? '#333' : '#333';

            markerEl.innerHTML = `
                <div class="marker-capsule" style="
                    display: flex; 
                    align-items: center; 
                    ${bgStyle} 
                    border-radius: 30px; 
                    padding: 4px; 
                    ${shadowStyle}
                    transition: transform 0.2s;
                    cursor: pointer;
                    white-space: nowrap;
                ">
                    ${showIcon ? `
                    <div class="marker-icon-part" style="
                        width: 32px; 
                        height: 32px; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        flex-shrink: 0;
                    ">
                        ${getMarkerIcon(marker.category)}
                    </div>` : ''}
                    
                    ${showLabel && marker.label ? `
                        <div class="marker-label-part" style="
                            padding-left: ${showIcon ? '4px' : '8px'}; 
                            padding-right: 10px; 
                            font-size: 13px; 
                            font-weight: 600; 
                            color: ${textColor};
                            text-shadow: none;
                        ">
                            ${escapeHtml(marker.label)}
                        </div>
                    ` : ''}
                </div>
            `;

            // 如果都不显示，显示占位
            if (!showIcon && !showLabel && !marker.label) {
                markerEl.innerHTML = `<div class="marker-icon"><div class="marker-icon-inner">📍</div></div>`;
            }
        }

        // 添加点击事件，用于选中标记
        markerEl.addEventListener('mousedown', (e) => {
            // 如果点击的是标记本身（不是调整手柄），选中它
            if (!e.target.classList.contains('resize-handle')) {
                e.stopPropagation();
                selectMarker(marker.id, e);
            }
        });

        editorMarkersContainer.appendChild(markerEl);
    });

    updateEditorMarkerScales();
}

// Render markers list
function renderMarkersList() {
    if (markers.length === 0) {
        markersList.innerHTML = '<div class="empty-preview"><p>暂无标记</p></div>';
        return;
    }

    markersList.innerHTML = markers.map(marker => `
    <div class="marker-item">
      <div class="marker-item-header">
        <div class="marker-item-title">
          <span class="marker-item-icon">${getMarkerIcon(marker.category)}</span>
          <span>${escapeHtml(marker.label)}</span>
        </div>
        <div class="marker-item-actions">
          <button class="icon-btn" onclick="editMarker('${marker.id}')" title="编辑">✏️</button>
          <button class="icon-btn delete" onclick="deleteMarker('${marker.id}')" title="删除">🗑️</button>
        </div>
      </div>
      ${marker.description ? `<div class="marker-item-info">${escapeHtml(marker.description)}</div>` : ''}
    </div>
  `).join('');
}

// Get marker icon
function getMarkerIcon(category) {
    const type = iconTypes[category] || iconTypes.other || DEFAULT_ICON_TYPES.other;

    if (type && type.imageUrl) {
        return `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
             <img src="${type.imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">
         </div>`;
    }

    const svg = (type && SVG_ICONS[type.icon]) ? SVG_ICONS[type.icon] : SVG_ICONS.other;
    const color = (type && type.color) ? type.color : '#9e9e9e';

    return `<div style="color: ${color}; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${svg}</div>`;
}

// Open marker form
function openMarkerForm(markerId = null, x = 0, y = 0, defaultType = 'icon') {
    editingMarkerId = markerId;

    if (markerId) {
        // 编辑现有标记
        const marker = markers.find(m => m.id === markerId);
        if (!marker) return;

        markerFormTitle.textContent = '编辑标记';
        document.getElementById('markerId').value = marker.id;
        document.getElementById('markerX').value = marker.x;
        document.getElementById('markerY').value = marker.y;
        document.getElementById('markerScale').value = marker.scale || 1.0;

        // 确定标记类型（向后兼容）
        const markerType = marker.type || 'icon';

        // 设置类型单选按钮
        document.querySelector(`input[name="markerType"][value="${markerType}"]`).checked = true;

        if (markerType === 'text') {
            // 文字标记
            document.getElementById('textContent').value = marker.content || marker.label || '';
            document.getElementById('fontSize').value = marker.fontSize || 14;
            document.getElementById('textColor').value = marker.textColor || '#333333';
            document.getElementById('bgColor').value = marker.bgColor || '#ffffff';
            document.getElementById('borderColor').value = marker.borderColor || '#cccccc';
            document.getElementById('borderWidth').value = marker.borderWidth || 1;
            document.getElementById('textDetails').innerHTML = marker.details || '';
        } else {
            // 图标标记
            document.getElementById('iconCategory').value = marker.category || 'other';
            updateMarkerIconPreview();
            document.getElementById('showIcon').checked = marker.showIcon !== false;
            document.getElementById('iconLabel').value = marker.label || '';
            document.getElementById('showIconLabel').checked = marker.showLabel !== false;
            document.getElementById('markerDescription').value = marker.description || '';
            document.getElementById('markerDepartment').value = marker.department || '';
            document.getElementById('markerPhone').value = marker.phone || '';
            document.getElementById('markerEmail').value = marker.email || '';
        }

        // 通用字段
        document.getElementById('showDetails').checked = marker.showDetails === true;

        // 触发类型切换以显示正确的表单部分
        handleMarkerTypeChange({ target: { value: markerType } });
    } else {
        // 添加新标记
        markerFormTitle.textContent = '添加标记';
        markerForm.reset();
        document.getElementById('markerId').value = '';
        document.getElementById('markerX').value = x;
        document.getElementById('markerY').value = y;
        document.getElementById('markerScale').value = 1.0;

        // 设置默认类型
        document.querySelector(`input[name="markerType"][value="${defaultType}"]`).checked = true;

        // 设置默认值
        document.getElementById('fontSize').value = 14;
        document.getElementById('textColor').value = '#333333';
        document.getElementById('bgColor').value = '#ffffff';
        document.getElementById('borderColor').value = '#cccccc';
        document.getElementById('borderWidth').value = 1;
        document.getElementById('showIcon').checked = true;
        document.getElementById('showIconLabel').checked = true;
        document.getElementById('showDetails').checked = false;

        // 触发类型切换
        handleMarkerTypeChange({ target: { value: defaultType } });
        updateMarkerIconPreview();
    }

    markerFormModal.classList.add('active');
}

// Close marker form modal
function closeMarkerFormModal() {
    markerFormModal.classList.remove('active');
    markerForm.reset();
    editingMarkerId = null;
}

// Save marker
async function saveMarker(e) {
    e.preventDefault();

    const markerId = document.getElementById('markerId').value;
    const markerType = document.querySelector('input[name="markerType"]:checked').value;

    // 基础数据
    const baseData = {
        type: markerType,
        x: parseFloat(document.getElementById('markerX').value),
        y: parseFloat(document.getElementById('markerY').value),
        scale: parseFloat(document.getElementById('markerScale').value) || 1.0,
        showDetails: document.getElementById('showDetails').checked
    };

    let markerData;

    if (markerType === 'text') {
        // 文字标记数据
        markerData = {
            ...baseData,
            content: document.getElementById('textContent').value,
            fontSize: parseInt(document.getElementById('fontSize').value),
            textColor: document.getElementById('textColor').value,
            bgColor: document.getElementById('bgColor').value,
            borderColor: document.getElementById('borderColor').value,
            borderWidth: parseInt(document.getElementById('borderWidth').value),
            details: document.getElementById('textDetails').innerHTML
        };
    } else {
        // 图标标记数据
        markerData = {
            ...baseData,
            category: document.getElementById('iconCategory').value,
            showIcon: document.getElementById('showIcon').checked,
            label: document.getElementById('iconLabel').value,
            showLabel: document.getElementById('showIconLabel').checked,
            description: document.getElementById('markerDescription').value,
            department: document.getElementById('markerDepartment').value,
            phone: document.getElementById('markerPhone').value,
            email: document.getElementById('markerEmail').value
        };
    }

    try {
        let response;
        if (markerId) {
            // Update existing marker
            response = await fetch(`/api/markers/${markerId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(markerData)
            });
        } else {
            // Create new marker
            response = await fetch('/api/markers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(markerData)
            });
        }

        if (response.ok) {
            await loadMarkers();
            closeMarkerFormModal();
        } else {
            try {
                const errData = await response.json();
                console.error('Save failed:', errData);
                alert(`保存失败: ${errData.error || errData.message || '未知错误'} (${response.status})`);
            } catch (e) {
                alert(`保存失败: 服务器返回错误 status ${response.status}`);
            }
        }
    } catch (error) {
        console.error('Failed to save marker:', error);
        alert('保存失败: ' + error.message);
    }
}

// Edit marker (global function for onclick)
window.editMarker = function (markerId) {
    const marker = markers.find(m => m.id === markerId);
    if (marker) {
        openMarkerForm(markerId);
    }
};

// Delete marker (global function for onclick)
window.deleteMarker = async function (markerId) {
    if (!confirm('确定要删除这个标记吗？')) return;

    try {
        const response = await fetch(`/api/markers/${markerId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadMarkers();
        } else {
            alert('删除失败，请重试');
        }
    } catch (error) {
        console.error('Failed to delete marker:', error);
        alert('删除失败: ' + error.message);
    }
};

// Context Menu Functions
let contextMenuTargetMarkerId = null;

function showContextMenu(e) {
    e.preventDefault();

    // 只在有地图时显示右键菜单
    if (!mapData || !mapData.imageUrl) {
        return;
    }

    // 计算地图上的坐标
    const rect = editorMapWrapper.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // 转换为地图坐标
    contextMenuX = (clientX - editorTranslateX) / editorScale;
    contextMenuY = (clientY - editorTranslateY) / editorScale;

    // 检查是否点击在标记上
    const clickedElement = e.target;
    const markerElement = clickedElement.closest('.marker');

    const editMenuItem = document.getElementById('editMarkerMenuItem');
    const deleteMenuItem = document.getElementById('deleteMarkerMenuItem');
    const editDivider = document.getElementById('editMarkerDivider');

    if (markerElement && markerElement.dataset.id) {
        // 点击在标记上，显示编辑和删除选项
        contextMenuTargetMarkerId = markerElement.dataset.id;
        editMenuItem.style.display = 'flex';
        if (deleteMenuItem) deleteMenuItem.style.display = 'flex';
        editDivider.style.display = 'block';
    } else {
        // 点击在空白处，隐藏编辑和删除选项
        contextMenuTargetMarkerId = null;
        editMenuItem.style.display = 'none';
        if (deleteMenuItem) deleteMenuItem.style.display = 'none';
        editDivider.style.display = 'none';
    }

    // 显示菜单
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
    contextMenu.classList.add('active');
}

function hideContextMenu() {
    contextMenu.classList.remove('active');
}

function handleContextMenuClick(e) {
    const action = e.currentTarget.dataset.action;
    hideContextMenu();

    switch (action) {
        case 'add-text':
            openMarkerForm(null, contextMenuX, contextMenuY, 'text');
            break;
        case 'add-marker':
            openMarkerForm(null, contextMenuX, contextMenuY, 'icon');
            break;
        case 'edit-marker':
            if (contextMenuTargetMarkerId) {
                openMarkerForm(contextMenuTargetMarkerId);
            }
            break;
        case 'delete-marker':
            if (contextMenuTargetMarkerId) {
                deleteMarker(contextMenuTargetMarkerId);
            }
            break;
    }
}

// Handle marker type change
function handleMarkerTypeChange(e) {
    const markerType = e.target.value;
    const textSettings = document.getElementById('textMarkerSettings');
    const iconSettings = document.getElementById('iconMarkerSettings');
    const iconExtraInfo = document.getElementById('iconExtraInfo');

    if (markerType === 'text') {
        textSettings.style.display = 'block';
        iconSettings.style.display = 'none';
        iconExtraInfo.style.display = 'none';
        // 文字标记的必填字段
        document.getElementById('textContent').required = true;
        document.getElementById('iconCategory').required = false;
        document.getElementById('iconLabel').required = false;
    } else {
        textSettings.style.display = 'none';
        iconSettings.style.display = 'block';
        iconExtraInfo.style.display = 'block';
        // 图标标记的必填字段
        document.getElementById('textContent').required = false;
        document.getElementById('iconCategory').required = true;
        document.getElementById('iconLabel').required = true;
    }
}

// Update marker icon preview in form
function updateMarkerIconPreview() {
    const category = document.getElementById('iconCategory').value;
    const preview = document.getElementById('markerIconPreview');
    if (preview) {
        preview.innerHTML = getMarkerIconSVG(category);
    }
}

// ========== Marker Selection and Resizing ==========

// Select a marker
function selectMarker(markerId, event) {
    // 如果已经在拖动或调整大小，不处理
    if (isDraggingMarker || isResizing) return;

    selectedMarkerId = markerId;
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    // 移除之前的选中状态
    document.querySelectorAll('.marker.selected').forEach(el => el.classList.remove('selected'));

    // 添加选中状态
    const markerEl = document.querySelector(`.marker[data-id="${markerId}"]`);
    if (markerEl) {
        markerEl.classList.add('selected');
    }

    // 创建或更新选择框
    createSelectionBox(marker, markerEl);

    // 开始拖动标记
    if (event) {
        isDraggingMarker = true;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        markerStartX = marker.x;
        markerStartY = marker.y;
        markerEl.classList.add('dragging');
    }
}

// Deselect marker
function deselectMarker() {
    selectedMarkerId = null;
    document.querySelectorAll('.marker.selected').forEach(el => el.classList.remove('selected'));
    if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
    }
}

// Create selection box with resize handles
function createSelectionBox(marker, markerEl) {
    // 移除旧的选择框
    if (selectionBox) {
        selectionBox.remove();
    }

    // 创建选择框
    selectionBox = document.createElement('div');
    selectionBox.className = 'marker-selection-box active';
    selectionBox.style.position = 'absolute';

    // 直接使用标记的位置和大小
    // 标记已经使用百分比定位，我们需要获取其实际渲染的位置和大小
    const markerRect = markerEl.getBoundingClientRect();
    const containerRect = editorMarkersContainer.getBoundingClientRect();

    // 计算相对于容器的位置（需要除以缩放比例）
    const left = (markerRect.left - containerRect.left) / editorScale;
    const top = (markerRect.top - containerRect.top) / editorScale;

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = (markerRect.width / editorScale) + 'px';
    selectionBox.style.height = (markerRect.height / editorScale) + 'px';

    // 创建8个调整手柄（四角+四边）
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${position}`;
        handle.dataset.position = position;

        // 添加鼠标按下事件
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startResize(position, e);
        });

        selectionBox.appendChild(handle);
    });

    editorMarkersContainer.appendChild(selectionBox);
}

// Start resizing
function startResize(handlePosition, event) {
    isResizing = true;
    resizeHandle = handlePosition;
    dragStartX = event.clientX;
    dragStartY = event.clientY;

    const marker = markers.find(m => m.id === selectedMarkerId);
    if (marker) {
        markerStartX = marker.x;
        markerStartY = marker.y;
        // 记录开始时的缩放值
        markerStartScale = marker.scale || 1.0;
    }
}

// Handle mouse move for dragging and resizing
function handleEditorMouseMove(e) {
    if (isDraggingMarker && selectedMarkerId) {
        // 拖动标记
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (!marker) return;

        const deltaX = (e.clientX - dragStartX) / editorScale;
        const deltaY = (e.clientY - dragStartY) / editorScale;

        marker.x = markerStartX + deltaX;
        marker.y = markerStartY + deltaY;

        // 更新标记位置
        const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
        if (markerEl) {
            const imgWidth = editorMapImg.naturalWidth || 1;
            const imgHeight = editorMapImg.naturalHeight || 1;
            markerEl.style.left = ((marker.x / imgWidth) * 100) + '%';
            markerEl.style.top = ((marker.y / imgHeight) * 100) + '%';
        }

        // 更新选择框位置
        if (selectionBox && markerEl) {
            const rect = markerEl.getBoundingClientRect();
            const containerRect = editorMarkersContainer.getBoundingClientRect();
            const left = (rect.left - containerRect.left) / editorScale;
            const top = (rect.top - containerRect.top) / editorScale;
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
        }
    } else if (isResizing && selectedMarkerId) {
        // 调整标记大小 - 累积式缩放
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (!marker) return;

        const deltaX = e.clientX - dragStartX;
        const deltaY = e.clientY - dragStartY;

        // 计算拖动距离（使用主方向）
        let delta = 0;
        if (resizeHandle.includes('e')) {
            delta = deltaX;
        } else if (resizeHandle.includes('w')) {
            delta = -deltaX;
        } else if (resizeHandle.includes('s')) {
            delta = deltaY;
        } else if (resizeHandle.includes('n')) {
            delta = -deltaY;
        }

        // 从起始缩放值开始累积调整，灵敏度适中
        const scaleDelta = delta / 200; // 每200px改变1倍
        let newScale = markerStartScale + scaleDelta;

        // 限制范围并四舍五入到0.1
        newScale = Math.max(0.2, Math.min(5.0, newScale));
        newScale = Math.round(newScale * 10) / 10;

        marker.scale = newScale;

        // 更新标记的视觉效果
        const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
        if (markerEl) {
            if (markerEl.classList.contains('marker-text-only')) {
                markerEl.style.transform = `translate(-50%, -50%) scale(${newScale})`;
            } else {
                markerEl.style.transform = `translate(-50%, -100%) scale(${newScale})`;
            }

            // 更新选择框大小
            if (selectionBox) {
                const rect = markerEl.getBoundingClientRect();
                const containerRect = editorMarkersContainer.getBoundingClientRect();
                const left = (rect.left - containerRect.left) / editorScale;
                const top = (rect.top - containerRect.top) / editorScale;
                selectionBox.style.width = (rect.width / editorScale) + 'px';
                selectionBox.style.height = (rect.height / editorScale) + 'px';
                selectionBox.style.left = left + 'px';
                selectionBox.style.top = top + 'px';

                // 显示当前缩放比例
                updateScaleIndicator(newScale);
            }
        }
    }
}

// 显示缩放比例指示器
function updateScaleIndicator(scale) {
    let indicator = document.getElementById('scaleIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'scaleIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: 600;
            z-index: 10001;
            pointer-events: none;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(indicator);
    }

    indicator.textContent = `${Math.round(scale * 100)}%`;
    indicator.style.opacity = '1';

    clearTimeout(indicator.hideTimeout);
    indicator.hideTimeout = setTimeout(() => {
        indicator.style.opacity = '0';
    }, 1000);
}

// Handle mouse up for dragging and resizing
async function handleEditorMouseUp() {
    if (isDraggingMarker && selectedMarkerId) {
        const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
        if (markerEl) {
            markerEl.classList.remove('dragging');
        }

        // 保存标记位置
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (marker) {
            try {
                await fetch(`/api/markers/${marker.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(marker)
                });
            } catch (error) {
                console.error('Failed to update marker position:', error);
            }
        }
    } else if (isResizing && selectedMarkerId) {
        // 保存标记大小
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (marker) {
            try {
                await fetch(`/api/markers/${marker.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(marker)
                });
            } catch (error) {
                console.error('Failed to update marker scale:', error);
            }
        }
    }

    isDraggingMarker = false;
    isResizing = false;
    resizeHandle = null;
}

// Add global mouse event listeners
document.addEventListener('mousemove', handleEditorMouseMove);
document.addEventListener('mouseup', handleEditorMouseUp);

// Click on map background to deselect
if (editorMapWrapper) {
    editorMapWrapper.addEventListener('mousedown', (e) => {
        if (e.target === editorMapWrapper || e.target === editorMapImage || e.target === editorMapImg) {
            deselectMarker();
        }
    });
}

// ========== Icon Types Management ==========

// Load icon types
async function loadIconTypes() {
    try {
        const response = await fetch('/api/icon-types');
        if (response.ok) {
            iconTypes = await response.json();
        } else {
            // Use default configuration if API fails
            iconTypes = { ...DEFAULT_ICON_TYPES };
        }
    } catch (error) {
        console.log('Using default icon types configuration');
        iconTypes = { ...DEFAULT_ICON_TYPES };
    }

    renderIconsGrid();
    updateIconCategorySelect();
}

// Render icons grid
function renderIconsGrid() {
    const iconsGrid = document.getElementById('iconsGrid');
    if (!iconsGrid) return;

    iconsGrid.innerHTML = '';

    Object.keys(iconTypes).forEach(typeId => {
        const type = iconTypes[typeId];
        const card = document.createElement('div');
        card.className = 'icon-type-card';

        let iconContent;
        if (type.imageUrl) {
            iconContent = `<img src="${type.imageUrl}" style="width: 24px; height: 24px; object-fit: contain;">`;
        } else {
            iconContent = `<div style="color: ${type.color};">${SVG_ICONS[type.icon] || SVG_ICONS.other}</div>`;
        }

        card.innerHTML = `
            <div class="icon-display" style="background: ${type.color}15;">
                ${iconContent}
            </div>
            <div class="icon-name">${escapeHtml(type.name)}</div>
            <div class="icon-id">${escapeHtml(typeId)}</div>
            <div class="icon-actions">
                <button class="btn-icon" onclick="editIconType('${typeId}')">✏️ 编辑</button>
            </div>
        `;
        iconsGrid.appendChild(card);
    });
}

// Toggle icon source
window.toggleIconSource = function (source) {
    const presetSection = document.getElementById('presetSection');
    const uploadSection = document.getElementById('uploadSection');

    if (source === 'preset') {
        presetSection.style.display = 'block';
        uploadSection.style.display = 'none';
        const radio = document.querySelector('input[name="iconSource"][value="preset"]');
        if (radio) radio.checked = true;
    } else {
        presetSection.style.display = 'none';
        uploadSection.style.display = 'block';
        const radio = document.querySelector('input[name="iconSource"][value="custom"]');
        if (radio) radio.checked = true;
    }
}

// Upload custom icon
async function handleIconUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('iconFile', file);

    try {
        const response = await fetch('/api/upload-icon', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            const imageUrl = data.url;
            document.getElementById('customIconUrl').value = imageUrl;

            // Update custom preview
            const preview = document.getElementById('customIconPreview');
            preview.innerHTML = `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">`;

            // Update main preview
            const color = document.getElementById('iconTypeColor').value;
            updateIconPreview(null, color, imageUrl);
        } else {
            alert('Upload failed');
        }
    } catch (error) {
        console.error('Error uploading icon:', error);
        alert('Upload failed');
    }
}

// Add icon type
function addIconType() {
    editingIconTypeId = null;

    const modal = document.getElementById('iconTypeModal');
    const modalTitle = document.getElementById('iconTypeModalTitle');
    const iconTypeId = document.getElementById('iconTypeId');
    const iconTypeName = document.getElementById('iconTypeName');
    const iconTypeColor = document.getElementById('iconTypeColor');
    const iconTypeShape = document.getElementById('iconTypeShape');

    modalTitle.textContent = '添加图标类型';

    // Generate unique ID
    const newId = 'custom_' + Date.now();
    iconTypeId.value = newId;

    iconTypeName.value = '';
    iconTypeColor.value = '#4a90e2';
    document.getElementById('iconTypeBgColor').value = '#f8f9fa';
    document.getElementById('iconTypeTransparent').checked = false;

    // Reset inputs
    document.getElementById('customIconUrl').value = '';
    document.getElementById('customIconFile').value = '';
    document.getElementById('customIconPreview').innerHTML = '<span style="font-size: 12px; color: #999;">预览</span>';

    // Default to preset
    toggleIconSource('preset');

    // Default shape
    const defaultShape = Object.keys(SVG_ICONS)[0];
    iconTypeShape.value = defaultShape;
    renderIconShapeSelector(defaultShape);
    updateIconPreview(defaultShape, '#4a90e2');

    modal.classList.add('active');
}

// Render icon shape selector
function renderIconShapeSelector(selectedShape) {
    const container = document.getElementById('iconShapeSelector');
    if (!container) return;

    container.innerHTML = '';

    Object.keys(SVG_ICONS).forEach(shapeKey => {
        const option = document.createElement('div');
        option.className = `shape-option ${shapeKey === selectedShape ? 'active' : ''}`;
        option.dataset.shape = shapeKey;
        option.innerHTML = SVG_ICONS[shapeKey];
        option.onclick = () => {
            document.querySelectorAll('.shape-option').forEach(el => el.classList.remove('active'));
            option.classList.add('active');
            document.getElementById('iconTypeShape').value = shapeKey;

            // Switch to preset if not already
            toggleIconSource('preset');

            // Update preview
            const color = document.getElementById('iconTypeColor').value;
            updateIconPreview(shapeKey, color);
        };
        container.appendChild(option);
    });
}

// Update icon preview
function updateIconPreview(shape, color, imageUrl = null) {
    const preview = document.getElementById('iconTypePreview');
    const bgColor = document.getElementById('iconTypeBgColor').value;
    const isTransparent = document.getElementById('iconTypeTransparent').checked;

    if (preview) {
        if (imageUrl) {
            preview.innerHTML = `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">`;
        } else if (shape) {
            preview.innerHTML = `
                <div style="color: ${color};">
                    ${SVG_ICONS[shape] || SVG_ICONS.other}
                </div>
            `;
        }
        preview.style.background = isTransparent ? 'transparent' : bgColor;

        // Add border for visibility if white/transparent
        if (isTransparent || bgColor === '#ffffff' || bgColor.toLowerCase() === '#fff') {
            preview.style.border = '1px solid #ddd';
        } else {
            preview.style.border = '1px solid transparent';
        }
    }
}

// Edit icon type
function editIconType(typeId) {
    editingIconTypeId = typeId;
    const type = iconTypes[typeId];

    const modal = document.getElementById('iconTypeModal');
    const modalTitle = document.getElementById('iconTypeModalTitle');
    const iconTypeId = document.getElementById('iconTypeId');
    const iconTypeName = document.getElementById('iconTypeName');
    const iconTypeColor = document.getElementById('iconTypeColor');
    const iconTypeShape = document.getElementById('iconTypeShape');

    modalTitle.textContent = '编辑图标类型';
    iconTypeId.value = typeId;
    iconTypeName.value = type.name;
    iconTypeColor.value = type.color;

    // Fill background settings
    if (type.bgColor === 'transparent') {
        document.getElementById('iconTypeTransparent').checked = true;
        document.getElementById('iconTypeBgColor').value = '#f8f9fa'; // default
    } else {
        document.getElementById('iconTypeTransparent').checked = false;
        document.getElementById('iconTypeBgColor').value = type.bgColor || '#f8f9fa';
    }

    // Handle Custom Image vs Preset
    if (type.imageUrl) {
        toggleIconSource('custom');
        document.getElementById('customIconUrl').value = type.imageUrl;
        document.getElementById('customIconPreview').innerHTML = `<img src="${type.imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">`;
        updateIconPreview(null, type.color, type.imageUrl);

        // Also set shape backup
        iconTypeShape.value = type.icon || 'other';
        renderIconShapeSelector(type.icon || 'other');
    } else {
        toggleIconSource('preset');
        iconTypeShape.value = type.icon;
        renderIconShapeSelector(type.icon);
        updateIconPreview(type.icon, type.color);
    }

    modal.classList.add('active');
}

// Save icon type
async function saveIconType(e) {
    e.preventDefault();

    const typeId = document.getElementById('iconTypeId').value;
    const name = document.getElementById('iconTypeName').value;
    const color = document.getElementById('iconTypeColor').value;
    const bgColor = document.getElementById('iconTypeBgColor').value;
    const isTransparent = document.getElementById('iconTypeTransparent').checked;
    const iconSource = document.querySelector('input[name="iconSource"]:checked').value;

    let typeData = {
        name: name,
        color: color,
        bgColor: isTransparent ? 'transparent' : bgColor
    };

    if (iconSource === 'custom') {
        const imageUrl = document.getElementById('customIconUrl').value;
        if (!imageUrl) {
            alert('请上传图片或选择预设形状');
            return;
        }
        typeData.imageUrl = imageUrl;
        typeData.icon = 'other'; // fallback
    } else {
        typeData.icon = document.getElementById('iconTypeShape').value;
        typeData.imageUrl = null;
    }

    try {
        const response = await fetch(`/api/icon-types/${typeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(typeData)
        });

        if (response.ok) {
            iconTypes[typeId] = typeData;
            renderIconsGrid();
            updateIconCategorySelect();
            closeIconTypeModal();
        } else {
            // Update locally (fallback)
            iconTypes[typeId] = typeData;
            renderIconsGrid();
            updateIconCategorySelect();
            closeIconTypeModal();
        }
    } catch (error) {
        // Update locally (fallback)
        iconTypes[typeId] = typeData;
        renderIconsGrid();
        updateIconCategorySelect();
        closeIconTypeModal();
    }
}

// Close icon type modal
function closeIconTypeModal() {
    const modal = document.getElementById('iconTypeModal');
    modal.classList.remove('active');
    editingIconTypeId = null;
}

// Update icon category select in marker form
function updateIconCategorySelect() {
    const select = document.getElementById('iconCategory');
    if (!select) return;

    select.innerHTML = '';

    Object.keys(iconTypes).forEach(typeId => {
        const type = iconTypes[typeId];
        const option = document.createElement('option');
        option.value = typeId;
        option.textContent = type.name;
        select.appendChild(option);
    });
}

// Get marker icon (updated to use SVG or Custom Image)
function getMarkerIconSVG(category) {
    const type = iconTypes[category] || iconTypes.other;

    if (type && type.imageUrl) {
        // Use custom image
        return `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
            <img src="${type.imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>`;
    }

    const svg = (type && SVG_ICONS[type.icon]) ? SVG_ICONS[type.icon] : SVG_ICONS.other;
    const color = (type && type.color) ? type.color : '#9e9e9e';

    return `<div style="color: ${color}; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${svg}</div>`;
}

// Setup icon type modal listeners
function setupIconTypeListeners() {
    const iconTypeForm = document.getElementById('iconTypeForm');
    const closeIconTypeModal = document.getElementById('closeIconTypeModal');
    const cancelIconTypeForm = document.getElementById('cancelIconTypeForm');
    const iconTypeColor = document.getElementById('iconTypeColor');
    const addIconTypeBtn = document.getElementById('addIconTypeBtn');
    const customIconFile = document.getElementById('customIconFile');

    if (addIconTypeBtn) {
        addIconTypeBtn.addEventListener('click', addIconType);
    }

    if (iconTypeForm) {
        iconTypeForm.addEventListener('submit', saveIconType);
    }

    if (closeIconTypeModal) {
        closeIconTypeModal.addEventListener('click', () => {
            document.getElementById('iconTypeModal').classList.remove('active');
        });
    }

    if (cancelIconTypeForm) {
        cancelIconTypeForm.addEventListener('click', () => {
            document.getElementById('iconTypeModal').classList.remove('active');
        });
    }

    if (customIconFile) {
        customIconFile.addEventListener('change', handleIconUpload);
    }

    if (iconTypeColor) {
        iconTypeColor.addEventListener('input', (e) => updateCurrentIconPreview());
    }

    const iconTypeBgColor = document.getElementById('iconTypeBgColor');
    if (iconTypeBgColor) {
        iconTypeBgColor.addEventListener('input', updateCurrentIconPreview);
    }

    const iconTypeTransparent = document.getElementById('iconTypeTransparent');
    if (iconTypeTransparent) {
        iconTypeTransparent.addEventListener('change', updateCurrentIconPreview);
    }
}

// Helper to update preview based on current form state
function updateCurrentIconPreview() {
    const isCustom = document.querySelector('input[name="iconSource"][value="custom"]').checked;
    const imageUrl = isCustom ? document.getElementById('customIconUrl').value : null;
    const shape = document.getElementById('iconTypeShape').value;
    const color = document.getElementById('iconTypeColor').value;

    updateIconPreview(shape, color, imageUrl);
}

// Toggle icon source (Preset Shape vs Custom Image)
function toggleIconSource(source) {
    const presetSection = document.getElementById('presetSection');
    const uploadSection = document.getElementById('uploadSection');

    if (source === 'preset') {
        presetSection.style.display = 'block';
        uploadSection.style.display = 'none';
    } else {
        presetSection.style.display = 'none';
        uploadSection.style.display = 'block';
    }
}

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        if (settings.title) {
            document.getElementById('siteTitle').value = settings.title;
        }

        if (settings.logoUrl) {
            const preview = document.getElementById('siteLogoPreview');
            const placeholder = document.getElementById('noLogoPlaceholder');
            preview.src = settings.logoUrl;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Save Settings
async function saveSettings() {
    const title = document.getElementById('siteTitle').value.trim();
    if (!title) {
        alert('请输入网站名称');
        return;
    }

    // Check if we have a new logo URL from upload
    const preview = document.getElementById('siteLogoPreview');
    // If preview has a src and it's visible, use it. 
    // Prioritize dataset.newUrl if it exists (freshly uploaded), otherwise use current src
    let logoUrl = preview.dataset.newUrl || (preview.style.display !== 'none' ? preview.getAttribute('src') : '');

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                logoUrl
            })
        });

        if (response.ok) {
            alert('设置已保存');
            // Clear newUrl flag
            delete preview.dataset.newUrl;
        } else {
            alert('保存失败');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        alert('保存失败: ' + error.message);
    }
}
// Upload Logo Handler
async function handleLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert('Logo 图片大小不能超过 2MB');
        return;
    }

    const formData = new FormData();
    formData.append('logo', file);

    const fileNameDisplay = document.getElementById('logoFileName');
    fileNameDisplay.textContent = 'Uploading...';

    try {
        const response = await fetch('/api/upload-logo', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            const logoUrl = data.url;

            // Update preview
            const preview = document.getElementById('siteLogoPreview');
            const placeholder = document.getElementById('noLogoPlaceholder');
            preview.src = logoUrl;
            preview.style.display = 'block';
            preview.dataset.newUrl = logoUrl; // Mark as new for save
            placeholder.style.display = 'none';
            fileNameDisplay.textContent = file.name;
        } else {
            alert('Logo 上传失败');
            fileNameDisplay.textContent = '';
        }
    } catch (error) {
        console.error('Error uploading logo:', error);
        alert('Logo 上传失败');
        fileNameDisplay.textContent = '';
    }
}

// Setup Settings Listeners
function setupSettingsListeners() {
    const logoInput = document.getElementById('logoFileInput');
    if (logoInput) {
        logoInput.addEventListener('change', handleLogoUpload);
    }

    const form = document.getElementById('basicSettingsForm');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            saveSettings();
        });
    }

    // Password change form
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await changePassword();
        });
    }
}

// Change password function
async function changePassword() {
    const oldPassword = document.getElementById('oldPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const statusDiv = document.getElementById('passwordChangeStatus');

    // Clear previous status
    statusDiv.textContent = '';
    statusDiv.className = 'status-message';

    // Validate inputs
    if (!oldPassword || !newPassword || !confirmPassword) {
        statusDiv.textContent = '✗ 请填写所有字段';
        statusDiv.className = 'status-message error';
        return;
    }

    if (newPassword.length < 4) {
        statusDiv.textContent = '✗ 新密码至少需要4位';
        statusDiv.className = 'status-message error';
        return;
    }

    if (newPassword !== confirmPassword) {
        statusDiv.textContent = '✗ 两次输入的新密码不一致';
        statusDiv.className = 'status-message error';
        return;
    }

    try {
        const response = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                oldPassword,
                newPassword
            })
        });

        const result = await response.json();

        if (response.ok) {
            statusDiv.textContent = '✓ 密码修改成功!即将跳转到登录页面...';
            statusDiv.className = 'status-message success';

            // Clear form
            document.getElementById('changePasswordForm').reset();

            // Redirect to login after 2 seconds
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            statusDiv.textContent = '✗ ' + (result.error || '密码修改失败');
            statusDiv.className = 'status-message error';
        }
    } catch (error) {
        console.error('Change password error:', error);
        statusDiv.textContent = '✗ 密码修改失败,请重试';
        statusDiv.className = 'status-message error';
    }
}


// Call setup function after DOM is ready
// Check if DOM is already loaded, otherwise wait for DOMContentLoaded
if (document.readyState === 'loading') {
    // DOM is still loading, wait for DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        setupIconTypeListeners();
        setupSettingsListeners();
        init();
    });
} else {
    // DOM is already loaded, execute immediately
    setupIconTypeListeners();
    setupSettingsListeners();
    init();
}

// ============================================
// Sidebar Management Functions
// ============================================

let sidebarConfigData = [];

// Load and render sidebar configuration
async function loadSidebarConfig() {
    try {
        const response = await fetch('/api/icon-types');
        const iconTypes = await response.json();

        // Convert to array and sort by order
        sidebarConfigData = Object.entries(iconTypes)
            .map(([key, data]) => ({
                key: key,
                name: data.name,
                icon: data.icon,
                color: data.color,
                imageUrl: data.imageUrl,
                showInSidebar: data.showInSidebar !== false,
                order: data.order || 999
            }))
            .sort((a, b) => a.order - b.order);

        renderSidebarConfig();
    } catch (error) {
        console.error('Failed to load sidebar config:', error);
        showNotification('加载侧边栏配置失败', 'error');
    }
}

// Render sidebar configuration list
function renderSidebarConfig() {
    const container = document.getElementById('sidebarConfigList');
    if (!container) return;

    container.innerHTML = sidebarConfigData.map((item, index) => {
        const iconHtml = item.imageUrl
            ? `<img src="${item.imageUrl}" style="width: 24px; height: 24px; object-fit: contain;">`
            : `<div style="color: ${item.color}; font-size: 20px;">${getIconSvg(item.icon)}</div>`;

        return `
            <div class="sidebar-config-item" draggable="true" data-key="${item.key}" data-index="${index}">
                <div class="sidebar-config-drag-handle">☰</div>
                <div class="sidebar-config-icon" style="background: ${item.color}20;">
                    ${iconHtml}
                </div>
                <div class="sidebar-config-info">
                    <div class="sidebar-config-name">${escapeHtml(item.name)}</div>
                    <div class="sidebar-config-order">排序: ${item.order}</div>
                </div>
                <div class="sidebar-config-toggle">
                    <label>
                        <input type="checkbox" 
                               ${item.showInSidebar ? 'checked' : ''} 
                               onchange="toggleSidebarVisibility('${item.key}', this.checked)">
                        <span>在侧边栏显示</span>
                    </label>
                </div>
            </div>
        `;
    }).join('');

    // Add drag and drop event listeners
    setupDragAndDrop();
}

// Helper function to get icon SVG (simplified version)
function getIconSvg(iconName) {
    const icons = {
        printer: '🖨️',
        shredder: '📄',
        tv: '📺',
        screen: '🖥️',
        server: '🗄️',
        console: '⌨️',
        icemaker: '🧊',
        water: '💧',
        coffee: '☕',
        snacks: '🍿',
        person: '👤',
        meeting: '🏢',
        other: '📌'
    };
    return icons[iconName] || '📌';
}

// Toggle sidebar visibility for an icon type
function toggleSidebarVisibility(key, show) {
    const item = sidebarConfigData.find(i => i.key === key);
    if (item) {
        item.showInSidebar = show;
    }
}

// Setup drag and drop for reordering
function setupDragAndDrop() {
    const items = document.querySelectorAll('.sidebar-config-item');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', (e) => {
            item.classList.remove('dragging');
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = getDragAfterElement(e.currentTarget.parentElement, e.clientY);
            const dragging = document.querySelector('.dragging');

            if (afterElement == null) {
                e.currentTarget.parentElement.appendChild(dragging);
            } else {
                e.currentTarget.parentElement.insertBefore(dragging, afterElement);
            }
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            updateOrderAfterDrag();
        });
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.sidebar-config-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Update order after drag and drop
function updateOrderAfterDrag() {
    const items = document.querySelectorAll('.sidebar-config-item');
    const newOrder = [];

    items.forEach((item, index) => {
        const key = item.getAttribute('data-key');
        const configItem = sidebarConfigData.find(i => i.key === key);
        if (configItem) {
            configItem.order = index + 1;
            newOrder.push(configItem);
        }
    });

    sidebarConfigData = newOrder;
    renderSidebarConfig();
}

// Save sidebar configuration
async function saveSidebarConfig() {
    try {
        const btn = document.getElementById('saveSidebarConfigBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '保存中...';
        }

        // Update all icon types with new order and visibility
        for (const item of sidebarConfigData) {
            const updateData = {
                name: item.name,
                icon: item.icon,
                color: item.color,
                showInSidebar: item.showInSidebar,
                order: item.order
            };

            if (item.imageUrl) {
                updateData.imageUrl = item.imageUrl;
            }
            if (item.bgColor) {
                updateData.bgColor = item.bgColor;
            }

            await fetch('/api/icon-types/' + item.key, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
        }

        showNotification('侧边栏配置已保存', 'success');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 保存侧边栏配置';
        }
    } catch (error) {
        console.error('Failed to save sidebar config:', error);
        showNotification('保存失败', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 保存侧边栏配置';
        }
    }
}

// Initialize sidebar management when icons tab is shown
// Note: We use the existing init() function or event listeners instead of a second DOMContentLoaded if possible,
// but adding a safe listener is fine.
document.addEventListener('DOMContentLoaded', () => {
    const saveSidebarBtn = document.getElementById('saveSidebarConfigBtn');
    if (saveSidebarBtn) {
        saveSidebarBtn.addEventListener('click', saveSidebarConfig);
    }

    // Load sidebar config when switching to icons tab
    const iconsMenuItem = document.querySelector('[data-tab="icons"]');
    if (iconsMenuItem) {
        iconsMenuItem.addEventListener('click', () => {
            setTimeout(loadSidebarConfig, 100);
        });
    }
});

