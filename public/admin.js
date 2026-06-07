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
let editorBaseScale = 1;
let editorTranslateX = 0;
let editorTranslateY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let isAddingMarker = false;
let editingMarkerId = null;
// 全局前台标记尺寸倍数 (来自 settings.markerSizeMultiplier)
let globalMarkerSizeMultiplier = 1.0;

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
let isRotating = false;
let rotateStartAngle = 0;
let markerStartRotation = 0;
let isDraggingMarker = false;
let dragStartX = 0;
let dragStartY = 0;
let markerStartX = 0;
let markerStartY = 0;
let markerStartScale = 1.0;

// Icon Types Management
let iconTypes = {};
let editingIconTypeId = null;

// Copy-Paste State Management
let copiedMarkerData = null;
let hasCopiedData = false;

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

    // 先加载 iconTypes
    await loadIconTypes();
    await loadMap();
    await loadMarkers();
    await loadSettings();
    setupTabNavigation();
    setupAdminListeners();
    setupBackupListeners();
    await loadBackupInfo();

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
}

// Setup keyboard shortcuts for copy-paste
let lastMouseX = 0;
let lastMouseY = 0;

function setupKeyboardShortcuts() {
    // Track mouse position on map
    if (editorMapWrapper) {
        editorMapWrapper.addEventListener('mousemove', (e) => {
            const rect = editorMapWrapper.getBoundingClientRect();
            lastMouseX = (e.clientX - rect.left - editorTranslateX) / editorScale;
            lastMouseY = (e.clientY - rect.top - editorTranslateY) / editorScale;
        });
    }

    document.addEventListener('keydown', (e) => {
        // Check if Ctrl+C (Windows/Linux) or Cmd+C (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
            // Only trigger if there's a selected marker and not in an input field
            if (selectedMarkerId && !isInputFocused()) {
                e.preventDefault();
                copyMarker(selectedMarkerId);
            }
        }

        // Check if Ctrl+V (Windows/Linux) or Cmd+V (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
            // Paste directly to map at mouse position (not in form)
            if (hasCopiedData && !isInputFocused()) {
                e.preventDefault();
                // Use last mouse position, or map center if no mouse position recorded
                const x = lastMouseX || (editorMapImg.naturalWidth / 2);
                const y = lastMouseY || (editorMapImg.naturalHeight / 2);
                pasteMarkerToMap(x, y);
            }
        }

        // Check if Delete or Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Only trigger if there's a selected marker and not in an input field
            if (selectedMarkerId && !isInputFocused()) {
                e.preventDefault();
                deleteMarker(selectedMarkerId);
            }
        }
    });
}

// Check if an input field is currently focused
function isInputFocused() {
    const activeElement = document.activeElement;
    return activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
    );
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
    setupRotationFieldListener();
    setupZIndexButtons();

    // 颜色选择�? �?alpha 滑块和百分比标签绑在一�?
    setupColorPicker('textColor', 'textColorAlpha', 'textColorAlphaLabel');
    setupColorPicker('bgColor', 'bgColorAlpha', 'bgColorAlphaLabel');
    setupColorPicker('borderColor', 'borderColorAlpha', 'borderColorAlphaLabel');

    // 弹窗占据焦点, 不再因点�?backdrop 关闭, 避免误操作丢失未保存内容.
    // 如需关闭请使用右上角 X 按钮或底部取�?保存按钮.
    // markerFormModal 上的 mousedown 阻止冒泡�?backdrop, 防止拖拽选择文本时误�?
    markerFormModal.addEventListener('mousedown', (e) => {
        if (e.target === markerFormModal) {
            e.stopPropagation();
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

            // 如果切换到标记管理标签，强制重新加载和居中地�?
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

            // Update editor - 添加时间戳防止缓�?
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

            // 如果图片已经缓存，立即触�?
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

        // 如果当前有选中的标记，重新建立选择框（以同步位置和状态）
        if (selectedMarkerId) {
            const marker = markers.find(m => m.id === selectedMarkerId);
            const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
            if (marker && markerEl) {
                selectMarker(selectedMarkerId, null);
            } else {
                deselectMarker();
            }
        }
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
    editorBaseScale = editorScale;

    editorTranslateX = (containerWidth - imgWidth * editorScale) / 2;
    editorTranslateY = (containerHeight - imgHeight * editorScale) / 2;

    updateEditorTransform();
}

// requestAnimationFrame 节流: 防止拖拽/滚轮高频触发时的布局抖动
let editorTransformRafId = null;
let editorTransformDirty = false;
function scheduleEditorTransform() {
    if (editorTransformRafId !== null) return;
    editorTransformRafId = requestAnimationFrame(() => {
        editorTransformRafId = null;
        if (!editorTransformDirty) return;
        editorTransformDirty = false;
        editorMapImage.style.transform = `translate(${editorTranslateX}px, ${editorTranslateY}px) scale(${editorScale})`;
        const zoomLabel = document.getElementById('editorZoomLevel');
        if (zoomLabel) zoomLabel.textContent = Math.round(editorScale * 100) + '%';
        editorMapWrapper.style.setProperty('--editor-scale', editorScale);
        updateEditorMarkerScales();
        // 标记位置/尺寸变了, 选中框必须同步跟�? 否则会有"滞后"
        syncSelectionBoxToSelected();
    });
}

// 同步选中�?(�?8 个调整手�?+ 1 个旋转把�? 到当前选中标记的屏幕位�?
// 位置�?AABB 中心 (旋转也是绕中�? AABB 中心 = 标记几何中心, �?text/icon 都对):
//   - 文字标记 transform=translate(-50%,-50%)    锚点=中心  -> AABB 中心 = 锚点 = 标记中心
//   - 图标标记 transform=translate(-50%,-100%)   锚点=底中  -> AABB 中心 �?锚点, 必须在中�?
// 尺寸�?offsetWidth/Height (未旋�?, 不用 AABB 尺寸, 否则旋转�?AABB 比标记大一�?
function syncSelectionBoxToSelected() {
    if (!selectionBox || !selectedMarkerId) return;
    const markerEl = editorMarkersContainer.querySelector(`.marker[data-id="${CSS.escape(selectedMarkerId)}"]`);
    if (!markerEl) return;

    const markerRect = markerEl.getBoundingClientRect();
    const containerRect = editorMarkersContainer.getBoundingClientRect();

    // 位置: AABB 中心 (= 标记几何中心)
    const centerX = markerRect.left + markerRect.width / 2 - containerRect.left;
    const centerY = markerRect.top + markerRect.height / 2 - containerRect.top;

    // 尺寸: offsetWidth/Height (未旋�?
    const width = markerEl.offsetWidth;
    const height = markerEl.offsetHeight;

    const left = centerX - width / 2;
    const top = centerY - height / 2;

    // box 也跟着旋转, 让手柄出现在标记的视觉角�?
    const marker = markers.find(m => m.id === selectedMarkerId);
    const rotation = (marker && marker.rotation) || 0;

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.transform = `rotate(${rotation}deg)`;
    selectionBox.style.transformOrigin = 'center center';

    // 调整手柄尺寸也按新尺寸重�?
    const baseHandleSize = Math.max(12, Math.min(24, Math.min(width, height) * 0.3));
    selectionBox.querySelectorAll('.resize-handle').forEach(handle => {
        handle.style.width = baseHandleSize + 'px';
        handle.style.height = baseHandleSize + 'px';
    });
    updateHandlePositions(baseHandleSize);
}

function updateEditorTransform() {
    editorTransformDirty = true;
    scheduleEditorTransform();
}

// 标记按目标屏幕像素尺寸直接栅格化 (不走 transform: scale), 保证矢量清晰.
//   editorScale >= 阈�?            -> �?marker 自身 scale, 目标像素 = BASE * markerScale * editorScale
const EDITOR_MARKER_BASE = 32;
const EDITOR_MARKER_FONT = 13;

function updateEditorMarkerScales() {
    if (!editorMapImg.naturalWidth) return;
    const sizeMul = globalMarkerSizeMultiplier || 1.0;
    const bs = editorBaseScale || 1;
    const markerElements = editorMarkersContainer.querySelectorAll('.marker');
    for (let i = 0; i < markerElements.length; i++) {
        const markerEl = markerElements[i];
        const markerId = markerEl.dataset.id;
        const marker = markers.find(m => m.id === markerId);
        if (!marker) continue;

        const markerScale = marker.scale || 1.0;
        const rotation = marker.rotation || 0;
        const isText = marker.type === 'text';

        // 目标屏幕像素尺寸: 与地图等比缩�?
        const targetSize = isText
            ? EDITOR_MARKER_BASE * markerScale * sizeMul
            : EDITOR_MARKER_BASE * markerScale * sizeMul * (editorScale / bs);

        // 屏幕像素位置
        const screenX = editorTranslateX + marker.x * editorScale;
        const screenY = editorTranslateY + marker.y * editorScale;
        markerEl.style.left = screenX + 'px';
        markerEl.style.top = screenY + 'px';

        if (isText) {
            // 文字标记: 跟图标标记完全同�? 边长 = targetSize, 文字 = 13 * targetSize / 32.
            // 之前依赖 style.width/height 算字�? �?marker.scale 脱钩, 拖框时字体不�?
            // 现在 box �?font 全部�?targetSize 派生, �?marker.scale / map zoom / 用户拖框
            // 一起联�? 没有 36px 封顶, 想多大就多大.
            const boxSize = targetSize;
            const textWidth = boxSize * 1.5;
            markerEl.style.width = textWidth + 'px';
            markerEl.style.height = boxSize + 'px';
            const label = markerEl.querySelector('.text-label');
            if (label) {
                const fontPx = Math.max(6, EDITOR_MARKER_FONT * boxSize / EDITOR_MARKER_BASE);
                label.style.fontSize = fontPx + 'px';
            }
            markerEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
        } else {
            const iconPart = markerEl.querySelector('.marker-icon-part');
            if (iconPart) {
                iconPart.style.width = targetSize + 'px';
                iconPart.style.height = targetSize + 'px';
            }
            const labelPart = markerEl.querySelector('.marker-label-part');
            if (labelPart) {
                const fontPx = Math.max(10, EDITOR_MARKER_FONT * (targetSize / EDITOR_MARKER_BASE));
                labelPart.style.fontSize = fontPx + 'px';
            }
            markerEl.style.transform = `translate(-50%, -100%) rotate(${rotation}deg)`;
        }
    }
}

// 保留旧函数名以兼容其他调�?
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
        addMarkerBtn.textContent = '�?取消添加';
        addMarkerBtn.classList.remove('btn-primary');
        addMarkerBtn.classList.add('btn-secondary');
        addMarkerHint.style.display = 'inline';
        editorMapWrapper.classList.add('adding-marker');

        // 禁用地图拖动
        editorMapWrapper.removeEventListener('mousedown', startEditorDrag);

        // 在地图中心创建一个可拖动的临时标�?
        createTemporaryMarker();
    } else {
        addMarkerBtn.textContent = '�?添加标记';
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

    // 转换为图片坐�?
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
    confirmMarkerBtn.innerHTML = '�?确认位置';
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

    // 屏幕像素坐标 (�?editorMarkers 同一图层), 矢量清晰
    const screenX = editorTranslateX + tempMarkerX * editorScale;
    const screenY = editorTranslateY + tempMarkerY * editorScale;
    tempMarker.style.left = screenX + 'px';
    tempMarker.style.top = screenY + 'px';

    // 目标屏幕像素尺寸 (与其他标记一�?
    const sizeMul = globalMarkerSizeMultiplier || 1.0;
    const bs = editorBaseScale || 1;
    const targetSize = EDITOR_MARKER_BASE * sizeMul * (editorScale / bs);
    // temp marker �?icon part 尺寸
    const iconPart = tempMarker.querySelector('.marker-icon-part');
    if (iconPart) {
        iconPart.style.width = targetSize + 'px';
        iconPart.style.height = targetSize + 'px';
    }
    tempMarker.style.transform = `translate(-50%, -100%)`;
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

    // 转换为图片坐�?
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
    // 不再使用点击添加，改为拖动添�?
    return;
}

// Render editor markers
function renderEditorMarkers() {
    editorMarkersContainer.innerHTML = '';

    markers.forEach((marker) => {
        const markerEl = document.createElement('div');

        // 不在这里�?left/top/width/height, 全部�?updateEditorMarkerScales
        // 在屏幕像素坐标下重新计算, 保证 SVG/文字按最终屏幕像素栅格化, 矢量清晰

        markerEl.dataset.id = marker.id;
        markerEl.style.transform = 'translate(-50%, -50%)';
        // 层级 (Z-Order): 大数字覆盖在上面, 解决大标记挡住小标记的问�?
        markerEl.style.zIndex = parseInt(marker.zIndex, 10) || 0;

        // 判断标记类型
        const markerType = marker.type || 'icon';

        if (markerType === 'text') {
            // 文字标记
            markerEl.className = 'marker marker-text-only';
            // 关键: text-label 必须显式 width/height: 100% + flex 居中, 不然 text-label
            // 收缩到内容固有大�? �?marker 不同�?-> 标记�?offsetWidth/Height 反映的是
            // text-label 的实际渲染尺�? 选择框就跑偏�?
            const textStyle = `
                color: ${marker.textColor || '#333333'};
                background: ${marker.bgColor || '#ffffff'};
                border: ${marker.borderWidth || 1}px solid ${marker.borderColor || '#cccccc'};
                padding: 8px 12px;
                border-radius: 4px;
                white-space: nowrap;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
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
                    cursor: pointer;
                    white-space: nowrap;
                ">
                    ${showIcon ? `
                    <div class="marker-icon-part" style="
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
                            font-weight: 600;
                            color: ${textColor};
                            text-shadow: none;
                        ">
                            ${escapeHtml(marker.label)}
                        </div>
                    ` : ''}
                </div>
            `;

            // 如果都不显示，显示占�?
            if (!showIcon && !showLabel && !marker.label) {
                markerEl.innerHTML = `<div class="marker-icon"><div class="marker-icon-inner">📍</div></div>`;
            }
        }

        // 添加点击事件，用于选中标记
        markerEl.addEventListener('mousedown', (e) => {
            // 如果点击的是标记本身（不是调整手柄），选中�?
            if (!e.target.classList.contains('resize-handle')) {
                e.stopPropagation();
                selectMarker(marker.id, e);
            }
        });

        editorMarkersContainer.appendChild(markerEl);
    });

    updateEditorMarkerScales();

    // 如果当前有选中的标记，恢复其列表中的选中状�?
    if (selectedMarkerId) {
        const item = document.querySelector(`.marker-item[data-id="${selectedMarkerId}"]`);
        if (item) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Render markers list
function renderMarkersList() {
    if (markers.length === 0) {
        markersList.innerHTML = '<div class="empty-preview"><p>暂无标记</p></div>';
        return;
    }

    markersList.innerHTML = markers.map(marker => {
        // 文字标记�?content, 图标标记�?label, 都为空时退到一个占位符, 避免显示 "undefined"
        const displayName = (marker.type === 'text')
            ? (marker.content || marker.label || '(未命名文�?')
            : (marker.label || '(未命�?');
        return `
    <div class="marker-item${selectedMarkerId === marker.id ? ' active' : ''}"
         data-id="${marker.id}"
         tabindex="0"
         onclick="selectMarkerFromList('${marker.id}')"
         onkeydown="handleMarkerListKeydown(event, '${marker.id}')">
      <div class="marker-item-header">
        <div class="marker-item-title">
          <span class="marker-item-icon">${getMarkerIcon(marker.category)}</span>
          <span>${escapeHtml(displayName)}</span>
        </div>
        <div class="marker-item-actions">
          <button class="icon-btn" onclick="event.stopPropagation(); copyMarker('${marker.id}')" title="复制">📋</button>
          <button class="icon-btn" onclick="event.stopPropagation(); editMarker('${marker.id}')" title="编辑">✏️</button>
          <button class="icon-btn delete" onclick="event.stopPropagation(); deleteMarker('${marker.id}')" title="删除">🗑�?/button>
        </div>
      </div>
      ${marker.description ? `<div class="marker-item-info">${escapeHtml(marker.description)}</div>` : ''}
    </div>
  `;
    }).join('');
}

// 从列表选中标记
function selectMarkerFromList(markerId) {
    // 已经在地图上选中了，这里只需要调�?selectMarker
    const markerEl = document.querySelector(`.marker[data-id="${markerId}"]`);
    if (markerEl) {
        selectMarker(markerId, null);
    }
}

// 处理列表项键盘事�?
function handleMarkerListKeydown(event, markerId) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        event.stopPropagation();
        deleteMarker(markerId);
    } else if (event.key === 'Enter') {
        event.preventDefault();
        editMarker(markerId);
    }
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

// 颜色辅助: 数据里用 8 �?hex (#RRGGBBAA) 同时�?RGB �?alpha,
// 浏览�?CSS 原生支持 8 �?hex, 渲染时不用再�?rgba. 表单的原�?color picker
// 只支�?6 �?hex, 所以拆�?"6 �?hex + 0-100 alpha 滑块" 两部�? 用这两个函数互转.

// �?8 �?hex 拆成 6 �?hex + 0-100 �?alpha (整数百分�?. 兼容 6/7 位历史数�?
function splitHexAlpha(hex) {
    if (!hex || typeof hex !== 'string') return { hex: '#000000', alpha: 100 };
    if (hex.length === 9) {
        const a = parseInt(hex.slice(7, 9), 16);
        return { hex: hex.slice(0, 7), alpha: Math.round((a / 255) * 100) };
    }
    return { hex: hex, alpha: 100 };
}

// �?6 �?hex + 0-100 alpha 合成 8 �?hex (#RRGGBBAA). alpha=100 时直接返�?6 �?+ ff.
function combineHexAlpha(hex, alphaPct) {
    if (!hex || typeof hex !== 'string') return '#000000ff';
    const h6 = (hex.length === 9) ? hex.slice(0, 7) : hex;
    if (h6.length !== 7) return h6 + 'ff';
    const a = Math.max(0, Math.min(100, Math.round(alphaPct || 100)));
    if (a === 100) return h6 + 'ff';
    const aHex = Math.round((a / 100) * 255).toString(16).padStart(2, '0');
    return h6 + aHex;
}

// 把表单里�?alpha 滑块和百分比标签绑在一�? 滑块拖动时标签跟着更新.
function setupColorPicker(colorId, alphaId, labelId) {
    const alphaEl = document.getElementById(alphaId);
    const labelEl = document.getElementById(labelId);
    if (!alphaEl) return;

    const updateLabel = () => {
        if (labelEl) labelEl.textContent = alphaEl.value;
    };
    alphaEl.addEventListener('input', updateLabel);
    updateLabel();
}

// �?marker �?8 �?hex 写入表单 (6 �?-> 原生 picker, alpha -> 滑块 + 标签).
function setColorPickerValue(colorId, alphaId, labelId, hex) {
    const { hex: h6, alpha } = splitHexAlpha(hex);
    const colorEl = document.getElementById(colorId);
    const alphaEl = document.getElementById(alphaId);
    const labelEl = document.getElementById(labelId);
    if (colorEl) colorEl.value = h6;
    if (alphaEl) alphaEl.value = alpha;
    if (labelEl) labelEl.textContent = alpha;
}

// 从表单读�?8 �?hex.
function getColorPickerValue(colorId, alphaId) {
    const colorEl = document.getElementById(colorId);
    const alphaEl = document.getElementById(alphaId);
    if (!colorEl || !alphaEl) return '#000000ff';
    return combineHexAlpha(colorEl.value, parseInt(alphaEl.value, 10));
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

        // 设置类型单选按�?
        document.querySelector(`input[name="markerType"][value="${markerType}"]`).checked = true;

        if (markerType === 'text') {
            // 文字标记
            document.getElementById('textContent').value = marker.content || marker.label || '';
            document.getElementById('fontSize').value = marker.fontSize || 14;
            setColorPickerValue('textColor', 'textColorAlpha', 'textColorAlphaLabel', marker.textColor || '#333333');
            setColorPickerValue('bgColor', 'bgColorAlpha', 'bgColorAlphaLabel', marker.bgColor || '#ffffff');
            setColorPickerValue('borderColor', 'borderColorAlpha', 'borderColorAlphaLabel', marker.borderColor || '#cccccc');
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
            // 详情(富文�?在图�?文字两种类型下共�?#textDetails 编辑�? 都需要回�?
            document.getElementById('textDetails').innerHTML = marker.details || '';
        }

        // 通用字段
        document.getElementById('showDetails').checked = marker.showDetails === true;
        document.getElementById('markerRotation').value = Math.round(marker.rotation || 0);
        document.getElementById('markerZIndex').value = parseInt(marker.zIndex, 10) || 0;

        // 触发类型切换以显示正确的表单部分
        handleMarkerTypeChange({ target: { value: markerType } });
    } else {
        // 添加新标�?
        markerFormTitle.textContent = '添加标记';
        markerForm.reset();
        // 显式清空富文本编辑器, markerForm.reset() 不会�?contenteditable 元素,
        // 否则上一个标记的详情会被带入新标�?
        document.getElementById('textDetails').innerHTML = '';
        document.getElementById('markerId').value = '';
        document.getElementById('markerX').value = x;
        document.getElementById('markerY').value = y;
        document.getElementById('markerScale').value = 1.0;
        document.getElementById('markerRotation').value = 0;
        document.getElementById('markerZIndex').value = 0;

        // 设置默认类型
        document.querySelector(`input[name="markerType"][value="${defaultType}"]`).checked = true;

        // 设置默认�?
        document.getElementById('fontSize').value = 14;
        setColorPickerValue('textColor', 'textColorAlpha', 'textColorAlphaLabel', '#333333');
        setColorPickerValue('bgColor', 'bgColorAlpha', 'bgColorAlphaLabel', '#ffffff');
        setColorPickerValue('borderColor', 'borderColorAlpha', 'borderColorAlphaLabel', '#cccccc');
        document.getElementById('borderWidth').value = 1;
        document.getElementById('showIcon').checked = true;
        document.getElementById('showIconLabel').checked = true;
        document.getElementById('showDetails').checked = false;

        // 触发类型切换
        handleMarkerTypeChange({ target: { value: defaultType } });
        updateMarkerIconPreview();
    }

    markerFormModal.classList.add('active');

    // Update paste button visibility
    updatePasteButtonVisibility();
}

// Close marker form modal
function closeMarkerFormModal() {
    markerFormModal.classList.remove('active');
    markerForm.reset();
    // 清空富文本编辑器, 防止关闭后残留内容影响下次打开
    const textDetails = document.getElementById('textDetails');
    if (textDetails) textDetails.innerHTML = '';
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
        rotation: parseFloat(document.getElementById('markerRotation').value) || 0,
        zIndex: parseInt(document.getElementById('markerZIndex').value, 10) || 0,
        showDetails: document.getElementById('showDetails').checked
    };

    let markerData;

    if (markerType === 'text') {
        // 文字标记数据
        markerData = {
            ...baseData,
            content: document.getElementById('textContent').value,
            fontSize: parseInt(document.getElementById('fontSize').value),
            // 6 �?hex + alpha 滑块 -> 8 �?hex (CSS 原生支持), 渲染不用再转 rgba
            textColor: getColorPickerValue('textColor', 'textColorAlpha'),
            bgColor: getColorPickerValue('bgColor', 'bgColorAlpha'),
            borderColor: getColorPickerValue('borderColor', 'borderColorAlpha'),
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
            email: document.getElementById('markerEmail').value,
            // 详情(富文�?与文字标记共�?#textDetails 编辑�? 必须一起保�?
            details: document.getElementById('textDetails').innerHTML
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
            const newMarker = await response.json();
            selectedMarkerId = newMarker.id; // 选中新创建的标记
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
            if (markerId === selectedMarkerId) {
                deselectMarker();
            }
            await loadMarkers();
        } else {
            alert('删除失败，请重试');
        }
    } catch (error) {
        console.error('Failed to delete marker:', error);
        alert('删除失败: ' + error.message);
    }
};

// Copy marker (global function for onclick)
window.copyMarker = function (markerId) {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) {
        showToast('标记不存在', 'error');
        return;
    }

    // Deep copy marker data, excluding unique fields (id, x, y)
    // 保留所有视�?样式属�? 包括 rotation (旋转角度)
    copiedMarkerData = {
        type: marker.type,
        category: marker.category,
        label: marker.label,
        content: marker.content,
        fontSize: marker.fontSize,
        textColor: marker.textColor,
        bgColor: marker.bgColor,
        borderColor: marker.borderColor,
        borderWidth: marker.borderWidth,
        showIcon: marker.showIcon,
        showLabel: marker.showLabel,
        showDetails: marker.showDetails,
        description: marker.description,
        department: marker.department,
        phone: marker.phone,
        email: marker.email,
        details: marker.details,
        scale: marker.scale || 1.0,
        rotation: marker.rotation || 0
    };

    hasCopiedData = true;
    showToast('📋 标记已复制');

    // Update paste button visibility if form is open
    updatePasteButtonVisibility();
};

// Paste marker data到表�?(global function for onclick)
window.pasteMarkerData = function () {
    if (!copiedMarkerData) {
        showToast('没有可粘贴的数据', 'error');
        return;
    }

    const markerType = copiedMarkerData.type || 'icon';

    // Set marker type radio
    const typeRadio = document.querySelector(`input[name="markerType"][value="${markerType}"]`);
    if (typeRadio) {
        typeRadio.checked = true;
        handleMarkerTypeChange({ target: { value: markerType } });
    }

    if (markerType === 'text') {
        // Paste text marker data
        if (copiedMarkerData.content) document.getElementById('textContent').value = copiedMarkerData.content;
        if (copiedMarkerData.fontSize) document.getElementById('fontSize').value = copiedMarkerData.fontSize;
        if (copiedMarkerData.textColor) setColorPickerValue('textColor', 'textColorAlpha', 'textColorAlphaLabel', copiedMarkerData.textColor);
        if (copiedMarkerData.bgColor) setColorPickerValue('bgColor', 'bgColorAlpha', 'bgColorAlphaLabel', copiedMarkerData.bgColor);
        if (copiedMarkerData.borderColor) setColorPickerValue('borderColor', 'borderColorAlpha', 'borderColorAlphaLabel', copiedMarkerData.borderColor);
        if (copiedMarkerData.borderWidth) document.getElementById('borderWidth').value = copiedMarkerData.borderWidth;
        if (copiedMarkerData.details) document.getElementById('textDetails').innerHTML = copiedMarkerData.details;
    } else {
        // Paste icon marker data
        if (copiedMarkerData.category) {
            document.getElementById('iconCategory').value = copiedMarkerData.category;
            updateMarkerIconPreview();
        }
        if (copiedMarkerData.label) document.getElementById('iconLabel').value = copiedMarkerData.label;
        if (copiedMarkerData.showIcon !== undefined) document.getElementById('showIcon').checked = copiedMarkerData.showIcon;
        if (copiedMarkerData.showLabel !== undefined) document.getElementById('showIconLabel').checked = copiedMarkerData.showLabel;
        if (copiedMarkerData.description) document.getElementById('markerDescription').value = copiedMarkerData.description;
        if (copiedMarkerData.department) document.getElementById('markerDepartment').value = copiedMarkerData.department;
        if (copiedMarkerData.phone) document.getElementById('markerPhone').value = copiedMarkerData.phone;
        if (copiedMarkerData.email) document.getElementById('markerEmail').value = copiedMarkerData.email;
        // 粘贴详情(富文�?, 与文字标记共用编辑器
        if (copiedMarkerData.details) document.getElementById('textDetails').innerHTML = copiedMarkerData.details;
    }

    // Paste common fields
    if (copiedMarkerData.showDetails !== undefined) document.getElementById('showDetails').checked = copiedMarkerData.showDetails;
    if (copiedMarkerData.scale) document.getElementById('markerScale').value = copiedMarkerData.scale;
    // 旋转角度: 不管 0 还是其他值都�? 否则新标记的旋转属性丢�?
    document.getElementById('markerRotation').value = Math.round(copiedMarkerData.rotation || 0);
    // 层级: 同上, 0 也得�?
    document.getElementById('markerZIndex').value = parseInt(copiedMarkerData.zIndex, 10) || 0;

    showToast('📋 数据已粘贴');
};

// Paste marker directly to map at specified coordinates
async function pasteMarkerToMap(x, y) {
    if (!copiedMarkerData) {
        showToast('没有可粘贴的数据', 'error');
        return;
    }

    // Create new marker with copied data at new coordinates
    const newMarkerData = {
        ...copiedMarkerData,
        x: x,
        y: y
    };

    try {
        const response = await fetch('/api/markers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMarkerData)
        });

        if (response.ok) {
            const newMarker = await response.json();
            selectedMarkerId = newMarker.id; // 选中新粘贴的标记
            await loadMarkers();
            showToast('📋 标记已粘贴到地图');
        } else {
            const errData = await response.json();
            showToast(`粘贴失败: ${errData.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        console.error('Failed to paste marker:', error);
        showToast('粘贴失败: ' + error.message, 'error');
    }
}

// Update paste button visibility
function updatePasteButtonVisibility() {
    const pasteBtn = document.getElementById('pasteMarkerBtn');
    if (pasteBtn) {
        pasteBtn.style.display = hasCopiedData ? 'inline-flex' : 'none';
    }
}

// Show toast notification
function showToast(message, type = 'success') {
    // Remove existing toast
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Show toast
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

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

    // 转换为地图坐�?
    contextMenuX = (clientX - editorTranslateX) / editorScale;
    contextMenuY = (clientY - editorTranslateY) / editorScale;

    // 检查是否点击在标记�?
    const clickedElement = e.target;
    const markerElement = clickedElement.closest('.marker');

    const copyMenuItem = document.getElementById('copyMarkerMenuItem');
    const editMenuItem = document.getElementById('editMarkerMenuItem');
    const deleteMenuItem = document.getElementById('deleteMarkerMenuItem');
    const editDivider = document.getElementById('editMarkerDivider');
    const pasteMenuItem = document.getElementById('pasteMarkerMenuItem');
    const pasteDivider = document.getElementById('pasteMarkerDivider');

    if (markerElement && markerElement.dataset.id) {
        // 点击在标记上，显示复制、编辑和删除选项
        contextMenuTargetMarkerId = markerElement.dataset.id;

        // 自动选中标记，以便Ctrl+C可以工作
        selectedMarkerId = markerElement.dataset.id;

        copyMenuItem.style.display = 'flex';
        editMenuItem.style.display = 'flex';
        if (deleteMenuItem) deleteMenuItem.style.display = 'flex';
        editDivider.style.display = 'block';

        // 隐藏粘贴选项
        pasteMenuItem.style.display = 'none';
        pasteDivider.style.display = 'none';
    } else {
        // 点击在空白处，隐藏复制、编辑和删除选项
        contextMenuTargetMarkerId = null;
        copyMenuItem.style.display = 'none';
        editMenuItem.style.display = 'none';
        if (deleteMenuItem) deleteMenuItem.style.display = 'none';
        editDivider.style.display = 'none';

        // 如果有复制的数据，显示粘贴选项
        if (hasCopiedData) {
            pasteMenuItem.style.display = 'flex';
            pasteDivider.style.display = 'block';
        } else {
            pasteMenuItem.style.display = 'none';
            pasteDivider.style.display = 'none';
        }
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
        case 'copy-marker':
            if (contextMenuTargetMarkerId) {
                copyMarker(contextMenuTargetMarkerId);
            }
            break;
        case 'paste-marker':
            if (hasCopiedData) {
                pasteMarkerToMap(contextMenuX, contextMenuY);
            }
            break;
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
        // 文字标记的必填字�?
        document.getElementById('textContent').required = true;
        document.getElementById('iconCategory').required = false;
        document.getElementById('iconLabel').required = false;
    } else {
        textSettings.style.display = 'none';
        iconSettings.style.display = 'block';
        iconExtraInfo.style.display = 'block';
        // 图标标记的必填字�?
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

    // 移除之前的地图选中状�?
    document.querySelectorAll('.marker.selected').forEach(el => el.classList.remove('selected'));

    // 添加地图选中状�?
    const markerEl = document.querySelector(`.marker[data-id="${markerId}"]`);
    if (markerEl) {
        markerEl.classList.add('selected');
    }

    // 更新列表中的 active 状态并滚动
    document.querySelectorAll('.marker-item').forEach(item => {
        if (item.dataset.id === markerId) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });

    // 创建或更新选择�?
    createSelectionBox(marker, markerEl);

    // 开始拖动标�?
    if (event && event.clientX !== undefined) {
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
    // 移除旧的选择�?
    if (selectionBox) {
        selectionBox.remove();
    }

    // 创建选择�?
    selectionBox = document.createElement('div');
    selectionBox.className = 'marker-selection-box active';
    selectionBox.style.position = 'absolute';
    selectionBox.style.pointerEvents = 'none';

    // 直接获取标记元素的屏幕位置和尺寸 (markers-layer �?editorMarkers 同一屏幕像素坐标�?
    // 位置�?AABB 中心, 尺寸�?offsetWidth/Height (未旋�?, �?syncSelectionBoxToSelected 一�?
    const markerRect = markerEl.getBoundingClientRect();
    const containerRect = editorMarkersContainer.getBoundingClientRect();

    const centerX = markerRect.left + markerRect.width / 2 - containerRect.left;
    const centerY = markerRect.top + markerRect.height / 2 - containerRect.top;
    const width = markerEl.offsetWidth;
    const height = markerEl.offsetHeight;
    const left = centerX - width / 2;
    const top = centerY - height / 2;

    // 用函数参�?marker (createSelectionBox 接收的就�?markers[] 里的对象),
    // 不要�?markerId - 这个函数签名里没�?markerId, 之前引用导致 find 返回 undefined,
    // rotation 默认 0, 选择框第一次创建时没旋�? 调整过一次后才修�?
    const rotation = (marker && marker.rotation) || 0;

    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.transform = `rotate(${rotation}deg)`;
    selectionBox.style.transformOrigin = 'center center';

    // 创建8个调整手柄（四角+四边�?
    // 手柄大小根据标记大小动态调整，但有最小最大限�?
    const baseHandleSize = Math.max(12, Math.min(24, Math.min(width, height) * 0.3));

    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${position}`;
        handle.dataset.position = position;
        handle.style.pointerEvents = 'all';

        // 动态手柄大�?
        handle.style.width = baseHandleSize + 'px';
        handle.style.height = baseHandleSize + 'px';

        // 添加鼠标按下事件
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startResize(position, e);
        });

        selectionBox.appendChild(handle);
    });

    // 旋转手柄: 绿色圆形, 位于选择框正上方
    const rotateLine = document.createElement('div');
    rotateLine.className = 'rotate-line';
    rotateLine.style.height = Math.max(20, baseHandleSize * 0.8) + 'px';
    selectionBox.appendChild(rotateLine);

    const rotateHandle = document.createElement('div');
    rotateHandle.className = 'rotate-handle';
    rotateHandle.dataset.role = 'rotate';
    rotateHandle.style.pointerEvents = 'all';
    rotateHandle.style.width = Math.max(20, baseHandleSize) + 'px';
    rotateHandle.style.height = Math.max(20, baseHandleSize) + 'px';
    rotateHandle.style.fontSize = Math.max(12, baseHandleSize * 0.6) + 'px';
    rotateHandle.textContent = '🔄';
    rotateHandle.title = '拖动旋转标记';
    rotateHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startRotate(e);
    });
    selectionBox.appendChild(rotateHandle);

    editorMarkersContainer.appendChild(selectionBox);

    // 更新手柄位置
    updateHandlePositions(baseHandleSize);
}

// 更新手柄位置
function updateHandlePositions(handleSize) {
    if (!selectionBox) return;

    const offset = -handleSize / 2;
    const handles = selectionBox.querySelectorAll('.resize-handle');

    handles.forEach(handle => {
        const pos = handle.dataset.position;
        handle.style.position = 'absolute';

        // 角落手柄
        if (pos === 'nw') {
            handle.style.top = offset + 'px';
            handle.style.left = offset + 'px';
        } else if (pos === 'ne') {
            handle.style.top = offset + 'px';
            handle.style.right = offset + 'px';
            handle.style.left = 'auto';
        } else if (pos === 'sw') {
            handle.style.bottom = offset + 'px';
            handle.style.left = offset + 'px';
            handle.style.top = 'auto';
        } else if (pos === 'se') {
            handle.style.bottom = offset + 'px';
            handle.style.right = offset + 'px';
            handle.style.top = 'auto';
            handle.style.left = 'auto';
        }
        // 边缘手柄
        else if (pos === 'n') {
            handle.style.top = offset + 'px';
            handle.style.left = '50%';
            handle.style.transform = 'translateX(-50%)';
        } else if (pos === 's') {
            handle.style.bottom = offset + 'px';
            handle.style.left = '50%';
            handle.style.top = 'auto';
            handle.style.transform = 'translateX(-50%)';
        } else if (pos === 'w') {
            handle.style.top = '50%';
            handle.style.left = offset + 'px';
            handle.style.transform = 'translateY(-50%)';
        } else if (pos === 'e') {
            handle.style.top = '50%';
            handle.style.right = offset + 'px';
            handle.style.left = 'auto';
            handle.style.transform = 'translateY(-50%)';
        }
    });

    // 旋转手柄位置: 在选择框正上方, 距离 = 连线高度 + 手柄半径
    const rotateHandle = selectionBox.querySelector('.rotate-handle');
    const rotateLine = selectionBox.querySelector('.rotate-line');
    if (rotateHandle) {
        const lineHeight = rotateLine ? parseFloat(rotateLine.style.height) || 20 : 20;
        const handleOffset = -(lineHeight + handleSize / 2);
        rotateHandle.style.position = 'absolute';
        rotateHandle.style.top = handleOffset + 'px';
        rotateHandle.style.left = '50%';
        rotateHandle.style.right = 'auto';
        rotateHandle.style.bottom = 'auto';
        rotateHandle.style.transform = 'translateX(-50%)';
    }
}


// --- NEW LOGIC: Resize Logic Global State ---
let resizeStartBounds = null;

// Start rotating
function startRotate(event) {
    const marker = markers.find(m => m.id === selectedMarkerId);
    if (!marker) return;

    const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
    if (!markerEl) return;

    // 标记视觉中心 (考虑 editorScale �?translate 偏移)
    const markerRect = markerEl.getBoundingClientRect();
    const containerRect = editorMapWrapper.getBoundingClientRect();
    const centerX = (markerRect.left + markerRect.width / 2 - containerRect.left) / editorScale;
    const centerY = (markerRect.top + markerRect.height / 2 - containerRect.top) / editorScale;
    const mouseX = (event.clientX - containerRect.left) / editorScale;
    const mouseY = (event.clientY - containerRect.top) / editorScale;

    rotateStartAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    markerStartRotation = marker.rotation || 0;
    isRotating = true;

    event.preventDefault();
}

// Start resizing - 记录初始状�?(屏幕像素, 改为记录 mousedown 时的鼠标位置,
// 后续�?鼠标相对位移"算新尺寸, 解决绝对位置算法�?缩到最小就被锁�?的问�?
function startResize(handlePosition, event) {
    isResizing = true;
    resizeHandle = handlePosition;

    const marker = markers.find(m => m.id === selectedMarkerId);
    const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
    if (!marker || !markerEl) return;

    const markerRect = markerEl.getBoundingClientRect();
    const containerRect = editorMarkersContainer.getBoundingClientRect();

    // 锚点: 标记�?style.left/top 就是锚点屏幕坐标 (icon 底中�? 文字中心)
    const anchorScreenX = parseFloat(markerEl.style.left) || (markerRect.left - containerRect.left);
    const anchorScreenY = parseFloat(markerEl.style.top) || (markerRect.top - containerRect.top);

    // 拖动开始时鼠标的屏幕坐�?(作为"原点", 后续�?delta �?
    const startMouseX = event.clientX - containerRect.left;
    const startMouseY = event.clientY - containerRect.top;

    // 拖动开始时标记的当前屏幕像素尺�?
    // �?offsetWidth/offsetHeight (未旋�?, 跟选中�?/ 拖动公式保持一�? 不受旋转 AABB 影响
    const currentWidth = markerEl.offsetWidth;
    const currentHeight = markerEl.offsetHeight;

    markerStartScale = marker.scale || 1.0;

    resizeStartBounds = {
        anchorScreenX,
        anchorScreenY,
        currentWidth,
        currentHeight,
        startMouseX,
        startMouseY,
        isText: marker.type === 'text'
    };
}

// Handle mouse move for dragging and resizing
document.addEventListener('mousemove', handleEditorMouseMove); // Ensure listener is here if not already

function handleEditorMouseMove(e) {
    if (isRotating && selectedMarkerId) {
        // 旋转标记: 计算鼠标相对标记中心的角�? 减去起始角度得到增量
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (!marker) return;

        const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
        if (!markerEl) return;

        const markerRect = markerEl.getBoundingClientRect();
        const containerRect = editorMapWrapper.getBoundingClientRect();
        const centerX = (markerRect.left + markerRect.width / 2 - containerRect.left) / editorScale;
        const centerY = (markerRect.top + markerRect.height / 2 - containerRect.top) / editorScale;
        const mouseX = (e.clientX - containerRect.left) / editorScale;
        const mouseY = (e.clientY - containerRect.top) / editorScale;

        const currentAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
        const delta = currentAngle - rotateStartAngle;
        let newRotation = (markerStartRotation + delta) % 360;
        if (newRotation > 180) newRotation -= 360;
        if (newRotation < -180) newRotation += 360;

        marker.rotation = newRotation;
        updateEditorMarkerScales();

        // 同步表单旋转字段 (仅当该标记的编辑表单已打开)
        const rotField = document.getElementById('markerRotation');
        const idField = document.getElementById('markerId');
        if (rotField && idField && idField.value === selectedMarkerId) {
            rotField.value = Math.round(newRotation);
        }
        return;
    }

    if (isDraggingMarker && selectedMarkerId) {
        // 拖动标记: markers-layer 屏幕像素坐标, �?updateEditorMarkerScales 保持一�?
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (!marker) return;

        const deltaX = (e.clientX - dragStartX) / editorScale;
        const deltaY = (e.clientY - dragStartY) / editorScale;

        marker.x = markerStartX + deltaX;
        marker.y = markerStartY + deltaY;

        const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
        if (markerEl) {
            // 源坐�?-> 屏幕像素: editorMapImage.transform = translate(tx, ty) scale(s)
            // 标记�?(markers-layer) �?mapWrapper 同坐�? 直接用编辑器 transform
            const screenX = editorTranslateX + marker.x * editorScale;
            const screenY = editorTranslateY + marker.y * editorScale;
            markerEl.style.left = screenX + 'px';
            markerEl.style.top = screenY + 'px';

            // 选中框跟�?- �?syncSelectionBoxToSelected 一�? AABB 中心定位
            // containerRect 在外面算一�? 拖动期间 markers-layer 不动
            if (selectionBox) {
                const containerRect = editorMarkersContainer.getBoundingClientRect();
                const markerRect = markerEl.getBoundingClientRect();
                const centerX = markerRect.left + markerRect.width / 2 - containerRect.left;
                const centerY = markerRect.top + markerRect.height / 2 - containerRect.top;
                const boxW = markerEl.offsetWidth;
                const boxH = markerEl.offsetHeight;
                selectionBox.style.left = (centerX - boxW / 2) + 'px';
                selectionBox.style.top = (centerY - boxH / 2) + 'px';
            }
        }
    } else if (isResizing && selectedMarkerId && resizeStartBounds) {
        // 完全重写�?跟随鼠标"resize:
        // 用户拖动把手, 标记对应边缘/角点要落在鼠标位�? 对侧锚点不动; 整体按比例缩�?
        // 全部用屏幕像素算, 不再绕道源坐�? 公式直观且与 mark.scale 数据解�?

        const marker = markers.find(m => m.id === selectedMarkerId);
        if (!marker) return;

        const containerRect = editorMarkersContainer.getBoundingClientRect();
        const mouseScreenX = e.clientX - containerRect.left;
        const mouseScreenY = e.clientY - containerRect.top;

        const {
            anchorScreenX, anchorScreenY,
            currentWidth, currentHeight,
            startMouseX, startMouseY,
            isText
        } = resizeStartBounds;

        // 鼠标相对 mousedown 位置的位�?
        const deltaX = mouseScreenX - startMouseX;
        const deltaY = mouseScreenY - startMouseY;

        // 1. 根据被拖动的手柄算出"跟随鼠标"的新尺寸 (用相对位�? 不是绝对位置)
        // 之前用绝对位�?(newWidth = 2 * (mouseX - anchorX)) 出现:
        //   1. 文字标记选框半宽本身就窄, 鼠标靠近锚点就算出负数被钳到 10px, 看起�?完全无法缩放"
        //   2. 缩小�?10px �? 鼠标要在很特定位置才能算�?> 10 �?newWidth, 看起�?锁死"
        // 改为相对位移: 鼠标�?mousedown 位置�?deltaX/deltaY, 直接�?delta 增减尺寸.
        let newWidth = currentWidth;
        let newHeight = currentHeight;

        // 'e' (右把�?: 把手初始�?anchorX + currentWidth/2, �?deltaX 后位置是原位�?+ deltaX
        //   新右边缘 = 原右边缘 + deltaX
        //   右边�?= anchorX + newWidth/2
        //   newWidth = currentWidth + 2 * deltaX
        if (resizeHandle.includes('e')) {
            newWidth = currentWidth + 2 * deltaX;
        }
        // 'w' (左把�?: 把手初始�?anchorX - currentWidth/2, �?deltaX 后是原位�?+ deltaX
        //   新左边缘 = 原左边缘 + deltaX
        //   左边�?= anchorX - newWidth/2
        //   -newWidth/2 = -currentWidth/2 + deltaX  =>  newWidth = currentWidth - 2 * deltaX
        if (resizeHandle.includes('w')) {
            newWidth = currentWidth - 2 * deltaX;
        }
        // 'n' (上把�?: 把手初始在标记上边缘, �?deltaY 后新上边�?= 原上边缘 + deltaY
        if (resizeHandle.includes('n')) {
            if (isText) {
                // 文字锚点中心: 原上边缘 = anchorY - currentHeight/2
                //   newTop = anchorY - currentHeight/2 + deltaY
                //   newTop = anchorY - newHeight/2
                //   newHeight = currentHeight - 2 * deltaY  (向上�? deltaY �? newHeight 增大)
                newHeight = currentHeight - 2 * deltaY;
            } else {
                // icon 锚点底中�? 原上边缘 = anchorY - currentHeight
                //   newTop = anchorY - currentHeight + deltaY
                //   newTop = anchorY - newHeight
                //   newHeight = currentHeight - deltaY
                newHeight = currentHeight - deltaY;
            }
        }
        // 's' (下把�?: 把手初始在标记下边缘, �?deltaY 后新下边�?= 原下边缘 + deltaY
        if (resizeHandle.includes('s')) {
            if (isText) {
                // 文字: 原下边缘 = anchorY + currentHeight/2
                //   newBottom = anchorY + currentHeight/2 + deltaY
                //   newBottom = anchorY + newHeight/2
                //   newHeight = currentHeight + 2 * deltaY
                newHeight = currentHeight + 2 * deltaY;
            } else {
                // icon: 下边缘就是锚�?(固定�?anchorY), �?'s' 改不�?Y
                newHeight = currentHeight;
            }
        }

        // 2. 下限钳到 4px (防拖到锚点另一侧算出负�?0, 标记彻底消失).
        //    上限不设, 让用户能继续缩放; 失控�?(e.g. 鼠标飞出几万像素) 信任用户能拖�?
        newWidth = Math.max(4, newWidth);
        newHeight = Math.max(4, newHeight);

        // 3. 由新尺寸反推 scale
        //    ratioX/Y = newSize / currentSize
        //    max 保证拖动方向"撑到"鼠标, 另一轴等�?(圆角/icon 不变�?
        //    单轴把手 (e/w/n/s) 只有一�?ratio 有意�? 另一个是 1
        //    角点把手两个 ratio 都有, max 决定缩放比例
        const ratioX = newWidth / currentWidth;
        const ratioY = newHeight / currentHeight;
        const newScale = markerStartScale * Math.max(ratioX, ratioY);

        // 4. 应用到标�?
        marker.scale = newScale;

        // 5. box �?font 全部交给 updateEditorMarkerScales �?(�?targetSize 派生),
        //    不要�?resize handler 里手动写 style.width/height, 那样 box �?font 会脱�?
        //    之前 icon/text 两套逻辑互相对不�? 现在统一�?targetSize 公式.
        const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
        updateEditorMarkerScales();

        // 6. 选择框跟�?- �?syncSelectionBoxToSelected 保持一�? AABB 中心定位 +
        //    offsetWidth/Height 尺寸 + 一起旋�?
        if (markerEl && selectionBox) {
            const markerRect = markerEl.getBoundingClientRect();
            const centerX = markerRect.left + markerRect.width / 2 - containerRect.left;
            const centerY = markerRect.top + markerRect.height / 2 - containerRect.top;
            const width = markerEl.offsetWidth;
            const height = markerEl.offsetHeight;
            const left = centerX - width / 2;
            const top = centerY - height / 2;

            const marker = markers.find(m => m.id === selectedMarkerId);
            const rotation = (marker && marker.rotation) || 0;

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
            selectionBox.style.transform = `rotate(${rotation}deg)`;
            selectionBox.style.transformOrigin = 'center center';

            const baseHandleSize = Math.max(12, Math.min(24, Math.min(width, height) * 0.3));
            const handles = selectionBox.querySelectorAll('.resize-handle');
            handles.forEach(handle => {
                handle.style.width = baseHandleSize + 'px';
                handle.style.height = baseHandleSize + 'px';
            });
            updateHandlePositions(baseHandleSize);
        }

        updateScaleIndicator(marker.scale);
    }
}

// 显示缩放比例指示�?
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
    } else if (isRotating && selectedMarkerId) {
        // 保存标记旋转
        const marker = markers.find(m => m.id === selectedMarkerId);
        if (marker) {
            try {
                await fetch(`/api/markers/${marker.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(marker)
                });
            } catch (error) {
                console.error('Failed to update marker rotation:', error);
            }
        }
    }

    isDraggingMarker = false;
    isResizing = false;
    isRotating = false;
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

        const multiplier = (settings.markerSizeMultiplier !== undefined && settings.markerSizeMultiplier !== null)
            ? settings.markerSizeMultiplier : 1.0;
        globalMarkerSizeMultiplier = multiplier;
        const slider = document.getElementById('markerSizeMultiplier');
        const valueLabel = document.getElementById('markerSizeValue');
        if (slider) {
            slider.value = multiplier;
            if (valueLabel) valueLabel.textContent = parseFloat(multiplier).toFixed(2) + '×';
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

// 重置当前编辑中标记的旋转角度�?0
window.resetMarkerRotation = function () {
    const rotField = document.getElementById('markerRotation');
    if (rotField) {
        rotField.value = 0;
        // 同步到当前选中的标�?(如果�? 并实时刷新预�?
        if (selectedMarkerId) {
            const marker = markers.find(m => m.id === selectedMarkerId);
            if (marker) {
                marker.rotation = 0;
                updateEditorMarkerScales();
            }
        }
    }
};

// 旋转角度输入框实时同步到选中标记
function setupRotationFieldListener() {
    const rotField = document.getElementById('markerRotation');
    if (!rotField) return;
    rotField.addEventListener('input', () => {
        if (selectedMarkerId) {
            const marker = markers.find(m => m.id === selectedMarkerId);
            if (marker) {
                const idField = document.getElementById('markerId');
                if (idField && idField.value === selectedMarkerId) {
                    marker.rotation = parseFloat(rotField.value) || 0;
                    updateEditorMarkerScales();
                }
            }
        }
    });
}

// 层级 (Z-Order) 输入框实时同�?+ 顶层/底层快捷按钮
// 大数字覆盖在上面, 解决大标记挡住小标记的问�?
function setupZIndexButtons() {
    const zField = document.getElementById('markerZIndex');
    const frontBtn = document.getElementById('bringToFrontBtn');
    const backBtn = document.getElementById('sendToBackBtn');
    if (!zField) return;

    // 输入框实时同�?(编辑当前选中标记�?zIndex, 立刻反映到地图上)
    zField.addEventListener('input', () => {
        if (selectedMarkerId) {
            const marker = markers.find(m => m.id === selectedMarkerId);
            const idField = document.getElementById('markerId');
            if (marker && idField && idField.value === selectedMarkerId) {
                const v = parseInt(zField.value, 10) || 0;
                marker.zIndex = v;
                // 立刻更新 DOM �?z-index, 不用等保�?
                const markerEl = document.querySelector(`.marker[data-id="${selectedMarkerId}"]`);
                if (markerEl) markerEl.style.zIndex = v;
            }
        }
    });

    // 顶层按钮: 当前 zIndex = 所有标�?zIndex 最大�?+ 1
    if (frontBtn) {
        frontBtn.addEventListener('click', () => {
            if (markers.length === 0) return;
            const maxZ = markers.reduce((m, mk) => Math.max(m, parseInt(mk.zIndex, 10) || 0), 0);
            zField.value = maxZ + 1;
            zField.dispatchEvent(new Event('input'));
        });
    }

    // 底层按钮: 当前 zIndex = 所有标�?zIndex 最小�?- 1
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (markers.length === 0) return;
            const minZ = markers.reduce((m, mk) => Math.min(m, parseInt(mk.zIndex, 10) || 0), 0);
            zField.value = minZ - 1;
            zField.dispatchEvent(new Event('input'));
        });
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
        const multiplierSlider = document.getElementById('markerSizeMultiplier');
        const markerSizeMultiplier = multiplierSlider
            ? parseFloat(multiplierSlider.value)
            : 1.0;

        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title,
                logoUrl,
                markerSizeMultiplier
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

    // 标记尺寸 slider 实时更新显示和编辑器预览
    const sizeSlider = document.getElementById('markerSizeMultiplier');
    const sizeValueLabel = document.getElementById('markerSizeValue');
    if (sizeSlider && sizeValueLabel) {
        sizeSlider.addEventListener('input', () => {
            const v = parseFloat(sizeSlider.value);
            sizeValueLabel.textContent = v.toFixed(2) + '×';
            // 实时预览: 仅在编辑器存在时刷新标记缩放
            globalMarkerSizeMultiplier = v;
            if (typeof updateEditorMarkerScales === 'function') {
                updateEditorMarkerScales();
            }
            if (typeof updateTempMarkerPosition === 'function') {
                updateTempMarkerPosition();
            }
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
        statusDiv.textContent = '⚠️ 请填写所有字段';
        statusDiv.className = 'status-message error';
        return;
    }

    if (newPassword.length < 4) {
        statusDiv.textContent = '⚠️ 新密码至少需要4位';
        statusDiv.className = 'status-message error';
        return;
    }

    if (newPassword !== confirmPassword) {
        statusDiv.textContent = '⚠️ 两次输入的新密码不一致';
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


