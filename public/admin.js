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

// [perf] Marker DOM cache: id -> element, avoids querySelector on every mousemove
const markerElementsById = new Map();
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
let fillDrawState = null;

// [perf] rAF coalescing: collapse multiple mousemove events into one paint per frame
let moveRafId = 0;
let pendingMoveEvent = null;
let isRotating = false;
let rotateStartAngle = 0;
let markerStartRotation = 0;
let isDraggingMarker = false;
let pendingDrag = false;  // [优化] mousedown 后等待阈值, 超过后才真正进入 drag
let dragStartX = 0;
let dragStartY = 0;
let markerStartX = 0;
let markerStartY = 0;
let markerStartScale = 1.0;

// [优化] 拖拽阈值: 鼠标移动超过这个像素才认为是 drag, 否则仅仅是点选
//   zoom 后标记很大, 这个阈值可以避免误碰就跳
const DRAG_THRESHOLD = 4;
// [优化] 拖动/缩放/旋转期间禁止滚轮缩放, 避免误操作
let inputLockZoom = false;

// Icon Types Management
let iconTypes = {};
let editingIconTypeId = null;

// Admin marker list grouping state
let adminCollapsedCategories = new Set();
let adminHiddenCategories = new Set();
let adminMarkerSearchQuery = '';

// Copy-Paste State Management
let copiedMarkerData = null;
let hasCopiedData = false;

// ============================================================
//   Undo / Redo history (Ctrl+Z / Ctrl+Shift+Z)
// ============================================================
// 快照式历史栈 - 在每次会改变 markers 数组的操作前调用 pushHistory(label).
//   拖拽/缩放/旋转: 在 mousedown 捕获快照, 避免每次 mousemove 都入栈.
//   undo/redo 通过对比新旧 markers, 计算 diff, 增量同步给服务器.
const HISTORY_MAX = 50;
const undoStack = [];   // 元素: { markers: deepCopy, label }
const redoStack = [];
let historySuspended = false;  // applyHistoryState 期间禁止 push (避免回环)

function snapshotMarkers() {
    return JSON.parse(JSON.stringify(markers));
}

function pushHistory(label) {
    if (historySuspended) return;
    if (markers == null) return;
    undoStack.push({ markers: snapshotMarkers(), label: label || 'edit' });
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    redoStack.length = 0;  // 新操作清空 redo 栈
    refreshHistoryButtons();
}

async function undoLastChange() {
    if (undoStack.length === 0) {
        showToast('没有可撤销的操作', 'info');
        return;
    }
    const currentSnap = { markers: snapshotMarkers() };
    const prev = undoStack.pop();
    redoStack.push(currentSnap);
    if (redoStack.length > HISTORY_MAX) redoStack.shift();
    await applyHistoryState(prev.markers, prev.label);
    refreshHistoryButtons();
}

async function redoLastChange() {
    if (redoStack.length === 0) {
        showToast('没有可重做的操作', 'info');
        return;
    }
    const currentSnap = { markers: snapshotMarkers() };
    const next = redoStack.shift();
    undoStack.push(currentSnap);
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    await applyHistoryState(next.markers, '重做');
    refreshHistoryButtons();
}

function refreshHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = (undoStack.length === 0);
    if (redoBtn) redoBtn.disabled = (redoStack.length === 0);
}

// 把 newMarkers 同步到服务器 (增量: 只 PUT/POST/DELETE 变化的部分), 然后 reload.
async function applyHistoryState(newMarkers, label) {
    const oldById = new Map(markers.map(m => [String(m.id), m]));
    const newById = new Map(newMarkers.map(m => [String(m.id), m]));
    historySuspended = true;
    try {
        // 1) 删除: new 中不存在的
        const toDelete = [];
        for (const oldM of markers) {
            if (!newById.has(String(oldM.id))) toDelete.push(oldM.id);
        }
        for (const id of toDelete) {
            try { await fetch(`/api/markers/${id}`, { method: 'DELETE' }); } catch (e) {}
        }
        // 2) 新建: old 中不存在的
        for (const newM of newMarkers) {
            if (!oldById.has(String(newM.id))) {
                try {
                    await fetch('/api/markers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newM)
                    });
                } catch (e) {}
            }
        }
        // 3) 更新: 内容发生变化的
        for (const newM of newMarkers) {
            const oldM = oldById.get(String(newM.id));
            if (!oldM) continue;
            if (JSON.stringify(oldM) !== JSON.stringify(newM)) {
                try {
                    await fetch(`/api/markers/${newM.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(newM)
                    });
                } catch (e) {}
            }
        }
    } finally {
        historySuspended = false;
    }
    await loadMarkers();
    deselectMarker();
    showToast((label ? label + ': ' : '') + '已应用', 'success');
}

window.undoLastChange = undoLastChange;
window.redoLastChange = redoLastChange;


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
    area: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 18L6 6l11-2 4 8-7 8z"/><path d="M8 15l4-6 5 4"/></svg>`,
    other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    // 无线 AP: 中心点 + 左右 2 道信号弧 (经典 AP 图标)
    wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M5.5 5.5a10 10 0 0 0 0 13"/><path d="M18.5 5.5a10 10 0 0 1 0 13"/></svg>`,
    // 摄像头: 方形机身 + 右侧镜头 (Feather video)
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
};

// 形状标记: 生成 SVG 几何形状 (rect / circle / arrow)
// 跟 app.js buildShapeSvg 保持一致, 字段: shape, fillColor, strokeColor, strokeWidth
// 箭头额外字段: arrowStyle, anchor
function computePolygonBBox(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const point of points) {
        if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) continue;
        const x = Number(point.x);
        const y = Number(point.y);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    if (minX === Infinity) return null;
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

function sanitizeFillPoints(points) {
    if (!Array.isArray(points)) return [];
    return points
        .map(point => ({ x: Number(point && point.x), y: Number(point && point.y) }))
        .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function getFillTextLayout(bbox, position, fontSize) {
    const parts = String(position || 'center').split('-');
    const vertical = parts[0] || 'center';
    const horizontal = parts[1] || 'center';
    let x = bbox.centerX;
    let y = bbox.centerY;
    let textAnchor = 'middle';
    let dominantBaseline = 'middle';

    if (vertical === 'top') {
        y = bbox.minY - 6;
        dominantBaseline = 'auto';
    } else if (vertical === 'bottom') {
        y = bbox.maxY + 6;
        dominantBaseline = 'hanging';
    }

    if (horizontal === 'left') {
        x = bbox.minX;
        textAnchor = 'start';
    } else if (horizontal === 'right') {
        x = bbox.maxX;
        textAnchor = 'end';
    }

    return { x, y, textAnchor, dominantBaseline, fontSize };
}

function buildEditorFillSvg(marker) {
    const points = sanitizeFillPoints(marker.points);
    if (points.length < 3) return '';
    const bbox = computePolygonBBox(points);
    if (!bbox) return '';

    const polyPoints = points.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).join(' ');
    const fillColor = marker.fillColor || '#4a90e280';
    const strokeColor = marker.strokeColor || '#222222ff';
    const strokeWidth = (marker.strokeWidth != null) ? marker.strokeWidth : 2;
    const textContent = marker.textContent || marker.label || '';
    const fontSize = marker.fontSize || 16;
    const textColor = marker.textColor || '#222222ff';
    const textLayout = getFillTextLayout(bbox, marker.textPosition, fontSize);
    const vb = bbox.minX + ' ' + bbox.minY + ' ' + bbox.width + ' ' + bbox.height;
    const escText = escapeHtml(textContent);
    return '<svg class="fill-svg" viewBox="' + vb + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible;">' +
        '<polygon points="' + polyPoints + '"' +
        ' fill="' + fillColor + '"' +
        ' stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '"' +
        ' vector-effect="non-scaling-stroke" stroke-linejoin="round" />' +
        (textContent ? ('<text x="' + textLayout.x + '" y="' + textLayout.y + '"' +
            ' text-anchor="' + textLayout.textAnchor + '"' +
            ' dominant-baseline="' + textLayout.dominantBaseline + '"' +
            ' fill="' + textColor + '" font-size="' + fontSize + '" font-weight="600"' +
            ' style="user-select:none;paint-order:stroke;stroke:#fff;stroke-opacity:.85;stroke-width:3px;stroke-linejoin:round;pointer-events:none;">' + escText + '</text>') : '') +
        '</svg>';
}
// vector-effect="non-scaling-stroke" 让描边宽度不被等比缩放撑大
const ARROW_PRESETS_EDITOR = {
    solid: '0,15 70,15 70,0 100,50 70,100 70,85 0,85',
    thin: '0,40 70,40 70,15 100,50 70,85 70,60 0,60',
    double: '0,50 15,15 35,15 35,0 65,0 65,15 85,15 100,50 85,85 65,85 65,100 35,100 35,85 15,85'
};

function buildEditorShapeSvg(marker) {
    const shape = marker.shape || 'rect';
    const fill = marker.fillColor || '#4a90e2';
    const stroke = marker.strokeColor || '#222222';
    const sw = (marker.strokeWidth != null) ? marker.strokeWidth : 2;

    if (shape === 'circle') {
        return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">
            <ellipse cx="50" cy="50" rx="50" ry="50" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke" />
        </svg>`;
    }
    if (shape === 'arrow') {
        const arrowStyle = marker.arrowStyle || 'solid';
        const points = ARROW_PRESETS_EDITOR[arrowStyle] || ARROW_PRESETS_EDITOR.solid;
        const anchor = marker.anchor || 'tip';
        let gTransform = '';
        if (anchor === 'tip') gTransform = 'translate(-50, 0)';
        else if (anchor === 'tail') gTransform = 'translate(50, 0)';
        return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible;">
            <g transform="${gTransform}">
                <polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
            </g>
        </svg>`;
    }
    return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">
        <rect x="0" y="0" width="100" height="100" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" vector-effect="non-scaling-stroke" />
    </svg>`;
}

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
    area: { name: '区域标记', icon: 'area', color: '#4a90e2', showInSidebar: true, order: 15 },
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
        const key = e.key ? e.key.toLowerCase() : '';
        // Check if Ctrl+C (Windows/Linux) or Cmd+C (Mac)
        if ((e.ctrlKey || e.metaKey) && key === 'c') {
            if (isInputFocused()) {
                return;
            }
            if (!selectedMarkerId) {
                showToast('请先在地图上或列表中选中一个标记再复制', 'error');
                return;
            }
            e.preventDefault();
            copyMarker(selectedMarkerId);
        }

        // Check if Ctrl+V (Windows/Linux) or Cmd+V (Mac)
        if ((e.ctrlKey || e.metaKey) && key === 'v') {
            if (isInputFocused()) {
                return;
            }
            if (!hasCopiedData) {
                showToast('没有可粘贴的标记数据，请先复制', 'error');
                return;
            }
            e.preventDefault();
            // Use last mouse position, or map center if no mouse position recorded
            const x = lastMouseX || (editorMapImg.naturalWidth / 2);
            const y = lastMouseY || (editorMapImg.naturalHeight / 2);
            pasteMarkerToMap(x, y);
        }

        // Check if Delete or Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // Only trigger if there's a selected marker and not in an input field
            if (selectedMarkerId && !isInputFocused()) {
                e.preventDefault();
                deleteMarker(selectedMarkerId);
            }
        }

        // Undo / Redo
        //   Ctrl+Z            -> undo
        //   Ctrl+Shift+Z / Ctrl+Y -> redo
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            if (isInputFocused()) return;  // 输入框里不要劫持
            if (key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redoLastChange();
                else undoLastChange();
                return;
            }
            if (key === 'y') {
                e.preventDefault();
                redoLastChange();
                return;
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
    // [优化] 全局拦截 dragstart, 防止拖动时选中文字触发原生 drag 出现卡顿瞬移
    document.addEventListener('dragstart', (e) => { e.preventDefault(); });
    document.addEventListener('mousedown', (e) => {
        if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
        try { const sel = window.getSelection && window.getSelection(); if (sel && sel.rangeCount > 0) sel.removeAllRanges(); } catch (_) {}
    }, true);
    editorMapWrapper.addEventListener('wheel', (e) => {
        // [优化] 拖动/缩放/旋转期间禁止滚轮缩放, 避免“拖着拖着就被放大几倍”
        if (inputLockZoom || isDraggingMarker || isResizing || isRotating || pendingDrag) return;
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
    setupColorPicker('fillColor', 'fillColorAlpha', 'fillColorAlphaLabel');
    setupColorPicker('strokeColor', 'strokeColorAlpha', 'strokeColorAlphaLabel');
    setupColorPicker('fillTextColor', 'fillTextColorAlpha', 'fillTextColorAlphaLabel');
    setupColorPicker('fillMarkerFillColor', 'fillMarkerFillColorAlpha', 'fillMarkerFillColorAlphaLabel');
    setupColorPicker('fillMarkerStrokeColor', 'fillMarkerStrokeColorAlpha', 'fillMarkerStrokeColorAlphaLabel');

    const redrawFillPolygonBtn = document.getElementById('redrawFillPolygonBtn');
    if (redrawFillPolygonBtn) redrawFillPolygonBtn.addEventListener('click', editFillPolygonFromForm);

    // 形状类型切换: 箭头时显示箭头专属设置
    const shapeTypeEl = document.getElementById('shapeType');
    if (shapeTypeEl) shapeTypeEl.addEventListener('change', updateArrowOnlyVisibility);

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
            const markerEl = markerElementsById.get(selectedMarkerId);
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
        const selectedMarker = markers.find(marker => marker.id === selectedMarkerId);
        fastSyncSelectionBoxTransform(selectedMarker);
    });
}

// 同步选中�?(�?8 个调整手�?+ 1 个旋转把�? 到当前选中标记的屏幕位�?
// 位置�?AABB 中心 (旋转也是绕中�? AABB 中心 = 标记几何中心, �?text/icon 都对):
//   - 文字标记 transform=translate(-50%,-50%)    锚点=中心  -> AABB 中心 = 锚点 = 标记中心
//   - 图标标记 transform=translate(-50%,-100%)   锚点=底中  -> AABB 中心 �?锚点, 必须在中�?
// 尺寸�?offsetWidth/Height (未旋�?, 不用 AABB 尺寸, 否则旋转�?AABB 比标记大一�?
function syncSelectionBoxToSelected() {
    if (!selectionBox || !selectedMarkerId) return;
    const markerEl = markerElementsById.get(selectedMarkerId);
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

    selectionBox.style.left = centerX + 'px';
    selectionBox.style.top = centerY + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${editorScale})`;
    selectionBox.style.transformOrigin = 'center center';

    // 调整手柄尺寸也按新尺寸重�?
    const markerScreenMin = Math.min(width, height) * editorScale;
    const screenHandleSize = getSelectionHandleScreenSize(markerScreenMin);
    selectionBox.dataset.markerScreenMin = String(markerScreenMin);
    updateSelectionHandleSizes(screenHandleSize);
}

function updateSelectionHandleSizes(screenHandleSize) {
    if (!selectionBox) return;
    const markerScreenMin = Number(selectionBox.dataset.markerScreenMin) || screenHandleSize;
    const sizeKey = `${screenHandleSize.toFixed(2)}:${markerScreenMin.toFixed(2)}:${editorScale.toFixed(5)}`;
    if (selectionBox.dataset.handleSizeKey === sizeKey) return;

    const minimumHitSize = markerScreenMin < 28
        ? Math.max(10, markerScreenMin * 0.55)
        : Math.max(14, markerScreenMin * 0.78);
    const hitScreenSize = Math.max(
        screenHandleSize,
        Math.min(38, screenHandleSize + 12, minimumHitSize)
    );
    const baseHandleSize = hitScreenSize / editorScale;
    const baseVisualSize = screenHandleSize / editorScale;
    const baseBorderWidth = 3 / editorScale;
    selectionBox.dataset.handleScreenSize = String(screenHandleSize);
    selectionBox.dataset.handleSizeKey = sizeKey;
    selectionBox.querySelectorAll('.resize-handle').forEach(handle => {
        handle.style.width = baseHandleSize + 'px';
        handle.style.height = baseHandleSize + 'px';
        handle.style.border = '0';
        handle.style.setProperty('--handle-visual-size', baseVisualSize + 'px');
        handle.style.setProperty('--handle-visual-border', baseBorderWidth + 'px');
    });

    const rotateScreenSize = Math.max(markerScreenMin < 28 ? 16 : 22, screenHandleSize);
    const rotateHandle = selectionBox.querySelector('.rotate-handle');
    if (rotateHandle) {
        rotateHandle.style.width = (rotateScreenSize / editorScale) + 'px';
        rotateHandle.style.height = (rotateScreenSize / editorScale) + 'px';
        rotateHandle.style.fontSize = (12 / editorScale) + 'px';
        rotateHandle.style.borderWidth = baseBorderWidth + 'px';
    }
    const rotateLine = selectionBox.querySelector('.rotate-line');
    if (rotateLine) {
        rotateLine.style.height = (24 / editorScale) + 'px';
        rotateLine.style.width = (2 / editorScale) + 'px';
    }
    updateHandlePositions(baseHandleSize);
}

function getSelectionHandleScreenSize(markerScreenMin) {
    if (markerScreenMin < 28) {
        return Math.max(10, Math.min(18, markerScreenMin * 0.55));
    }
    return Math.max(18, Math.min(26, markerScreenMin * 0.35));
}

// Layout-free selection sync for map pan/zoom. Marker layout size does not
// change with editorScale, so only position and transform need updating.
function fastSyncSelectionBoxTransform(marker) {
    if (!selectionBox || !marker) return;
    selectionBox.style.left = (editorTranslateX + marker.x * editorScale) + 'px';
    selectionBox.style.top = (editorTranslateY + marker.y * editorScale) + 'px';
    selectionBox.style.transform = `translate(-50%, -50%) rotate(${marker.rotation || 0}deg) scale(${editorScale})`;
    updateSelectionHandleSizes(Number(selectionBox.dataset.handleScreenSize) || 22);
}

// [perf] Per-frame sync during resize: compute from marker data, no getBoundingClientRect.
//       selection box uses same transform scale as marker, so wrapping math is straightforward.
function fastSyncSelectionBoxFromMarker(marker) {
    if (!selectionBox) return;
    const sizeMul = globalMarkerSizeMultiplier || 1.0;
    const isText = marker.type === 'text';
    const isShape = marker.type === 'shape';
    let baseW, baseH;
    if (isText || isShape) {
        if (isText && !marker.width) {
            if (resizeContextMarkerEl) {
                baseW = resizeContextMarkerEl.offsetWidth / sizeMul;
            } else { baseW = 0; }
        } else {
            baseW = marker.width || (48 * (marker.scale || 1.0));
        }
        if (isText && !marker.height) {
            if (resizeContextMarkerEl) {
                baseH = resizeContextMarkerEl.offsetHeight / sizeMul;
            } else { baseH = 0; }
        } else {
            baseH = marker.height || (32 * (marker.scale || 1.0));
        }
    } else if (resizeStartBounds) {
        const scaleRatio = (marker.scale || 1.0) / (resizeStartBounds.markerScale || 1.0);
        baseW = resizeStartBounds.startLayoutWidth * scaleRatio / sizeMul;
        baseH = resizeStartBounds.startLayoutHeight * scaleRatio / sizeMul;
    } else {
        baseW = EDITOR_MARKER_BASE * (marker.scale || 1.0);
        baseH = EDITOR_MARKER_BASE * (marker.scale || 1.0);
    }
    selectionBox.style.width = (baseW * sizeMul) + 'px';
    selectionBox.style.height = (baseH * sizeMul) + 'px';
    selectionBox.style.left = (editorTranslateX + marker.x * editorScale) + 'px';
    selectionBox.style.top = (editorTranslateY + marker.y * editorScale) + 'px';
}

function updateEditorTransform() {
    editorTransformDirty = true;
    scheduleEditorTransform();
}

// 标记按目标屏幕像素尺寸直接栅格化 (不走 transform: scale), 保证矢量清晰.
//   editorScale >= 阈�?            -> �?marker 自身 scale, 目标像素 = BASE * markerScale * editorScale
const EDITOR_MARKER_BASE = 32;
const EDITOR_MARKER_FONT = 13;

function applyFillMarkerSize(marker, markerEl, sizeMul) {
    const markerScale = marker.scale || 1.0;
    let bbox = markerEl.__fillBbox;
    if (!bbox || markerEl.__fillPointsRef !== marker.points) {
        bbox = computePolygonBBox(sanitizeFillPoints(marker.points));
        markerEl.__fillBbox = bbox;
        markerEl.__fillPointsRef = marker.points;
    }
    markerEl.style.width = ((bbox ? bbox.width : 100) * markerScale * sizeMul) + 'px';
    markerEl.style.height = ((bbox ? bbox.height : 100) * markerScale * sizeMul) + 'px';
}

function updateEditorMarkerScales() {
    if (!editorMapImg.naturalWidth) return;
    const sizeMul = globalMarkerSizeMultiplier || 1.0;
    const markerDataById = new Map(markers.map(marker => [String(marker.id), marker]));
    const markerElements = editorMarkersContainer.querySelectorAll('.marker');
    for (let i = 0; i < markerElements.length; i++) {
        const markerEl = markerElements[i];
        const markerId = markerEl.dataset.id;
        const marker = markerDataById.get(markerId);
        if (!marker) continue;

        const markerScale = marker.scale || 1.0;
        const rotation = marker.rotation || 0;
        const isText = marker.type === 'text';
        const isShape = marker.type === 'shape';
        const isFill = marker.type === 'fill';

        // 屏幕像素位置
        const screenX = editorTranslateX + marker.x * editorScale;
        const screenY = editorTranslateY + marker.y * editorScale;
        markerEl.style.left = screenX + 'px';
        markerEl.style.top = screenY + 'px';

        if (isText || isShape || isFill) {
            // 文字 / 形状标记: 自由尺寸, 不再在此处乘以缩放系数，改用 transform scale 缩放
            if (isFill) {
                applyFillMarkerSize(marker, markerEl, sizeMul);
            } else {
                if (isText && !marker.width) {
                    markerEl.style.width = 'max-content';
                } else {
                    const baseW = marker.width || (48 * markerScale);
                    markerEl.style.width = (baseW * sizeMul) + 'px';
                }

                if (isText && !marker.height) {
                    markerEl.style.height = 'max-content';
                } else {
                    const baseH = marker.height || (32 * markerScale);
                    markerEl.style.height = (baseH * sizeMul) + 'px';
                }
            }

            if (isText) {
                const label = markerEl.querySelector('.text-label');
                if (label) {
                    const fontPx = (marker.fontSize || 14) * sizeMul;
                    label.style.fontSize = fontPx + 'px';
                }
            }
            markerEl.style.transformOrigin = 'center center';
            markerEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${editorScale})`;
        } else {
            // 图标标记: 使用 100% 尺寸，通过 transform scale 整体进行等比缩放
            const targetSize = EDITOR_MARKER_BASE * markerScale * sizeMul;
            
            const iconPart = markerEl.querySelector('.marker-icon-part');
            if (iconPart) {
                iconPart.style.width = targetSize + 'px';
                iconPart.style.height = targetSize + 'px';
            }
            const labelPart = markerEl.querySelector('.marker-label-part');
            if (labelPart) {
                const fontPx = EDITOR_MARKER_FONT * (targetSize / EDITOR_MARKER_BASE);
                labelPart.style.fontSize = fontPx + 'px';
                const hasIcon = !!iconPart;
                labelPart.style.paddingLeft = (hasIcon ? 4 : 8) + 'px';
                labelPart.style.paddingRight = '10px';
            }
            const capsule = markerEl.querySelector('.marker-capsule');
            if (capsule) {
                capsule.style.padding = '4px';
                capsule.style.borderRadius = '30px';
            }
            markerEl.style.transformOrigin = 'center center';
            markerEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${editorScale})`;
        }
    }
    if (fillDrawState) renderFillDrawOverlay();
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

let adminAnimationFrameId = null;
function animateToAdminMarker(marker, onComplete) {
    if (adminAnimationFrameId) {
        cancelAnimationFrame(adminAnimationFrameId);
        adminAnimationFrameId = null;
    }

    const containerWidth = editorMapWrapper.offsetWidth;
    const containerHeight = editorMapWrapper.offsetHeight;

    const fromScale = editorScale;
    const targetScale = editorScale;

    const targetTranslateX = containerWidth / 2 - marker.x * targetScale;
    const targetTranslateY = containerHeight / 2 - marker.y * targetScale;

    const fromTranslateX = editorTranslateX;
    const fromTranslateY = editorTranslateY;

    const duration = 600;
    const startTime = performance.now();

    function ease(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const t = ease(progress);

        editorScale = fromScale + (targetScale - fromScale) * t;
        editorTranslateX = fromTranslateX + (targetTranslateX - fromTranslateX) * t;
        editorTranslateY = fromTranslateY + (targetTranslateY - fromTranslateY) * t;

        editorMapImage.style.transform = `translate(${editorTranslateX}px, ${editorTranslateY}px) scale(${editorScale})`;
        const zoomLabel = document.getElementById('editorZoomLevel');
        if (zoomLabel) zoomLabel.textContent = Math.round(editorScale * 100) + '%';
        editorMapWrapper.style.setProperty('--editor-scale', editorScale);
        updateEditorMarkerScales();
        const selectedMarker = markers.find(item => item.id === selectedMarkerId);
        fastSyncSelectionBoxTransform(selectedMarker);

        if (progress < 1) {
            adminAnimationFrameId = requestAnimationFrame(step);
        } else {
            adminAnimationFrameId = null;
            if (onComplete) onComplete();
        }
    }

    adminAnimationFrameId = requestAnimationFrame(step);
}

function focusAdminMarker(markerId) {
    const marker = markers.find(m => String(m.id) === String(markerId));
    if (!marker) return;

    if (!isMarkerLocked(marker)) {
        selectMarker(markerId, null);
    }
    animateToAdminMarker(marker);
}
window.focusAdminMarker = focusAdminMarker;

// Editor drag
function startEditorDrag(e) {
    if (isAddingMarker || fillDrawState) return;
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

    // 屏幕像素坐标 (与 editorMarkers 同一图层), 矢量清晰
    const screenX = editorTranslateX + tempMarkerX * editorScale;
    const screenY = editorTranslateY + tempMarkerY * editorScale;
    tempMarker.style.left = screenX + 'px';
    tempMarker.style.top = screenY + 'px';

    // 目标屏幕像素尺寸
    const sizeMul = globalMarkerSizeMultiplier || 1.0;
    const targetSize = EDITOR_MARKER_BASE * sizeMul * editorScale;
    // temp marker 的 icon part 尺寸
    const iconPart = tempMarker.querySelector('.marker-icon-part');
    if (iconPart) {
        iconPart.style.width = targetSize + 'px';
        iconPart.style.height = targetSize + 'px';
    }
    tempMarker.style.transformOrigin = 'center center';
    tempMarker.style.transform = 'translate(-50%, -50%)';
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

// Build the inner DOM for a marker element (shared by full and incremental renders).
//   Returns the innerHTML string for the .marker element based on the marker's
//   current data. Used by renderEditorMarkers() (full) and renderSingleMarker()
//   (incremental re-sync after edit).
function buildMarkerInnerHTML(marker) {
    const markerType = marker.type || 'icon';
    if (markerType === 'text') {
        // text-label must be width/height: 100% + flex centered, otherwise the
        // selection box jumps when text reflows the marker offsetWidth/Height.
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
                pointer-events: none;
                user-select: none;
            `;
        return `<div class="text-label" style="${textStyle}">${escapeHtml(marker.content || marker.label || '')}</div>`;
    }
    if (markerType === 'shape') {
        return buildEditorShapeSvg(marker);
    }
    if (markerType === 'fill') {
        return buildEditorFillSvg(marker);
    }
    // icon marker
    const showIcon = marker.showIcon !== false;
    const showLabel = marker.showLabel !== false;
    const type = iconTypes[marker.category] || iconTypes.other || DEFAULT_ICON_TYPES.other;
    const bgColor = type.bgColor || '#f8f9fa';
    const isTransparent = bgColor === 'transparent';
    const shadowStyle = isTransparent ? '' : 'box-shadow: 0 4px 12px rgba(0,0,0,0.15); border: 1px solid rgba(0,0,0,0.05);';
    const bgStyle = `background: ${bgColor};`;
    const textColor = type.textColor || '#333';

    if (!showIcon && !showLabel && !marker.label) {
        return `<div class="marker-icon"><div class="marker-icon-inner">📍</div></div>`;
    }

    return `
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
                pointer-events: none;
                user-select: none;
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
}
// Render editor markers
function renderEditorMarkers() {
    editorMarkersContainer.innerHTML = '';
    markerElementsById.clear(); // [perf] reset DOM cache

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
            markerEl.className = 'marker marker-text-only';
        } else if (markerType === 'shape') {
            markerEl.className = 'marker marker-shape';
        } else if (markerType === 'fill') {
            markerEl.className = 'marker marker-fill';
        } else {
            markerEl.className = `marker ${marker.category || 'other'}`;
        }
        markerEl.innerHTML = buildMarkerInnerHTML(marker);

        // 添加点击事件，用于选中标记
        markerEl.addEventListener('mousedown', (e) => {
            // 如果点击的是标记本身（不是调整手柄），选中�?
            if (!e.target.classList.contains('resize-handle')) {
                e.stopPropagation();
                selectMarker(marker.id, e);
            }
        });

        // 双击定位/居中/编辑
        markerEl.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            focusAdminMarker(marker.id);
        });

        if (isMarkerLocked(marker)) {
            markerEl.classList.add('marker-locked');
        }
        editorMarkersContainer.appendChild(markerEl);
        markerElementsById.set(marker.id, markerEl);
    });

    updateEditorMarkerScales();
    updateEditorMarkerVisibility();

    // 如果当前有选中的标记，恢复其列表中的选中状�?
    if (selectedMarkerId) {
        const item = document.querySelector(`.marker-item[data-id="${selectedMarkerId}"]`);
        if (item) {
            item.classList.add('active');
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
}

// Eye icon SVGs for visibility toggle
const ADMIN_EYE_ON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const ADMIN_EYE_OFF_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// Get display name for a marker
function getMarkerDisplayName(marker) {
    const shapeNames = { rect: '矩形', circle: '圆形', arrow: '箭头' };
    if (marker.type === 'text') return marker.content || marker.label || '(未命名文字)';
    if (marker.type === 'shape') return marker.label || `(${shapeNames[marker.shape] || '形状'})`;
    if (marker.type === 'fill') return marker.textContent || marker.label || '(未命名填色区域)';
    return marker.label || '(未命名)';
}

function getMarkerListIcon(marker) {
    if (marker.type === 'fill') {
        const fill = marker.fillColor || '#4a90e280';
        const stroke = marker.strokeColor || '#222222ff';
        return `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="3,18 6,5 17,3 22,11 15,21" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"></polygon></svg>`;
    }
    return getMarkerIcon(marker.category);
}

// Render markers list — grouped by category with collapse/expand and visibility
function renderMarkersList() {
    // 刷新标题旁的数量徽章
    const badge = document.getElementById('markersCountBadge');
    if (badge) badge.textContent = String(markers.length);

    if (markers.length === 0) {
        markersList.innerHTML = '<div class="empty-preview"><p>暂无标记</p></div>';
        return;
    }

    // Filter by search query
    const query = adminMarkerSearchQuery.toLowerCase().trim();
    const filteredMarkers = query
        ? markers.filter(m => {
            const name = getMarkerDisplayName(m).toLowerCase();
            const cat = (iconTypes[m.category] && iconTypes[m.category].name) || m.category || '其他';
            return name.includes(query) || cat.toLowerCase().includes(query);
        })
        : markers;

    if (filteredMarkers.length === 0) {
        markersList.innerHTML = '<div class="empty-preview"><p>无匹配标记</p></div>';
        return;
    }

    // Group markers by category
    const grouped = {};
    filteredMarkers.forEach(m => {
        const cat = m.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(m);
    });

    // Sort categories by iconTypes order
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const orderA = (iconTypes[a] && iconTypes[a].order) || 999;
        const orderB = (iconTypes[b] && iconTypes[b].order) || 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b);
    });

    // Build HTML
    let html = '';
    sortedCategories.forEach(catKey => {
        const catMarkers = grouped[catKey];
        const catInfo = iconTypes[catKey] || {};
        const catName = catInfo.name || catKey;
        const catColor = catInfo.color || '#888';
        const isCollapsed = adminCollapsedCategories.has(catKey);
        const isHidden = adminHiddenCategories.has(catKey);
        const count = catMarkers.length;

        // Sort markers within group alphabetically
        catMarkers.sort((a, b) => {
            const nameA = getMarkerDisplayName(a);
            const nameB = getMarkerDisplayName(b);
            return nameA.localeCompare(nameB, 'zh-CN', { numeric: true });
        });

        html += `<div class="admin-marker-group" data-category="${catKey}">`;
        html += `<div class="admin-group-header${isHidden ? ' cat-hidden' : ''}" onclick="toggleAdminCategory('${catKey}')">`;
        html += `<div class="admin-group-left">`;
        html += `<span class="admin-collapse-icon${isCollapsed ? '' : ' expanded'}">${isCollapsed ? '▶' : '▼'}</span>`;
        html += `<span class="admin-group-color" style="background: ${catColor}"></span>`;
        html += `<span class="admin-group-icon">${getMarkerIcon(catKey)}</span>`;
        html += `<span class="admin-group-title">${escapeHtml(catName)}</span>`;
        html += `<span class="admin-group-count">${count}</span>`;
        html += `</div>`;
        html += `<button class="admin-visibility-btn${isHidden ? ' is-hidden' : ''}" onclick="event.stopPropagation(); toggleAdminCategoryVisibility('${catKey}')" title="${isHidden ? '显示该分组' : '隐藏该分组'}">`;
        html += isHidden ? ADMIN_EYE_OFF_SVG : ADMIN_EYE_ON_SVG;
        html += `</button>`;
        html += `</div>`;

        if (!isCollapsed) {
            html += `<div class="admin-group-items">`;
            catMarkers.forEach(marker => {
                const displayName = getMarkerDisplayName(marker);
                const markerHidden = adminHiddenCategories.has(marker.category || 'other');
                const markerLocked = isMarkerLocked(marker);
                html += `
                <div class="marker-item${selectedMarkerId === marker.id ? ' active' : ''}${markerHidden ? ' marker-cat-hidden' : ''}${markerLocked ? ' locked' : ''}"
                     data-id="${marker.id}"
                     tabindex="0"
                     onclick="selectMarkerFromList('${marker.id}')"
                     ondblclick="focusAdminMarker('${marker.id}')"
                     onkeydown="handleMarkerListKeydown(event, '${marker.id}')">
                  <div class="marker-item-header">
                    <div class="marker-item-title">
                      <span class="marker-item-icon">${getMarkerListIcon(marker)}</span>
                      <span class="marker-item-name">${escapeHtml(displayName)}</span>
                      ${markerLocked ? '<span class="marker-locked-badge" title="已锁定（防误触）">🔒</span>' : ''}
                    </div>
                    <div class="marker-item-actions">
                      <button class="icon-btn${markerLocked ? ' lock-active' : ''}" onclick="event.stopPropagation(); toggleMarkerLock('${marker.id}')" title="${markerLocked ? '解锁标记' : '锁定标记（防误触）'}">${markerLocked ? '🔓' : '🔒'}</button>
                      ${markerLocked ? '' : `
                      <button class="icon-btn" onclick="event.stopPropagation(); copyMarker('${marker.id}')" title="复制">📋</button>
                      <button class="icon-btn" onclick="event.stopPropagation(); editMarker('${marker.id}')" title="编辑">✏️</button>
                      <button class="icon-btn delete" onclick="event.stopPropagation(); deleteMarker('${marker.id}')" title="删除">🗑️</button>`}
                    </div>
                  </div>
                  ${marker.description ? `<div class="marker-item-info">${escapeHtml(marker.description)}</div>` : ''}
                </div>`;
            });
            html += `</div>`;
        }

        html += `</div>`;
    });

    markersList.innerHTML = html;
}

// Toggle admin category collapse/expand
function toggleAdminCategory(category) {
    if (adminCollapsedCategories.has(category)) {
        adminCollapsedCategories.delete(category);
    } else {
        adminCollapsedCategories.add(category);
    }
    renderMarkersList();
}
window.toggleAdminCategory = toggleAdminCategory;

// Toggle admin category visibility
function toggleAdminCategoryVisibility(category) {
    if (adminHiddenCategories.has(category)) {
        adminHiddenCategories.delete(category);
    } else {
        adminHiddenCategories.add(category);
    }
    renderMarkersList();
    updateEditorMarkerVisibility();
}
window.toggleAdminCategoryVisibility = toggleAdminCategoryVisibility;

// Show all categories in admin
function showAllAdminCategories() {
    adminHiddenCategories.clear();
    renderMarkersList();
    updateEditorMarkerVisibility();
}
window.showAllAdminCategories = showAllAdminCategories;

// Hide all categories in admin
function hideAllAdminCategories() {
    markers.forEach(m => {
        adminHiddenCategories.add(m.category || 'other');
    });
    renderMarkersList();
    updateEditorMarkerVisibility();
}
window.hideAllAdminCategories = hideAllAdminCategories;

// Update editor marker visibility based on adminHiddenCategories
function updateEditorMarkerVisibility() {
    const markerEls = editorMarkersContainer.querySelectorAll('.marker');
    markerEls.forEach(el => {
        const markerId = el.dataset.id;
        const marker = markers.find(m => m.id === markerId);
        if (marker) {
            const cat = marker.category || 'other';
            if (adminHiddenCategories.has(cat)) {
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            } else {
                el.style.opacity = '';
                el.style.pointerEvents = '';
            }
        }
    });
}

// Handle admin marker search
function handleAdminMarkerSearch(e) {
    adminMarkerSearchQuery = e.target.value;
    renderMarkersList();
}
window.handleAdminMarkerSearch = handleAdminMarkerSearch;

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
    if (event.target !== event.currentTarget) return;

    const marker = markers.find(m => String(m.id) === String(markerId));
    if (isMarkerLocked(marker) && (event.key === 'Delete' || event.key === 'Backspace' || event.key === 'Enter')) {
        event.preventDefault();
        event.stopPropagation();
        showToast('标记已锁定，请先解锁', 'info');
        return;
    }

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
        return `<div style="width: 100%; height: 100%; display: flex; align-items: center;
                justify-content: center;
                pointer-events: none;
                user-select: none;">
             <img src="${type.imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">
         </div>`;
    }

    const svg = (type && SVG_ICONS[type.icon]) ? SVG_ICONS[type.icon] : SVG_ICONS.other;
    const color = (type && type.color) ? type.color : '#9e9e9e';

    return `<div style="color: ${color}; width: 100%; height: 100%; display: flex; align-items: center;
                justify-content: center;
                pointer-events: none;
                user-select: none;">${svg}</div>`;
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

function setFillPointsField(points) {
    const safePoints = sanitizeFillPoints(points);
    const pointsField = document.getElementById('fillMarkerPoints');
    const pointsInfo = document.getElementById('fillMarkerPointsInfo');
    if (pointsField) pointsField.value = safePoints.length ? JSON.stringify(safePoints) : '';
    if (pointsInfo) {
        pointsInfo.textContent = safePoints.length >= 3
            ? `多边形：${safePoints.length} 个顶点，可编辑或重绘`
            : '尚未绘制多边形，请点击“绘制多边形”';
    }
}

function getFillPointsField() {
    const pointsField = document.getElementById('fillMarkerPoints');
    if (!pointsField || !pointsField.value) return [];
    try {
        return sanitizeFillPoints(JSON.parse(pointsField.value));
    } catch (_) {
        return [];
    }
}

function rotateFillPoint(point, rotation) {
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        x: point.x * cos - point.y * sin,
        y: point.x * sin + point.y * cos
    };
}

function fillLocalPointsToWorld(points, x, y, scale, rotation) {
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return sanitizeFillPoints(points).map(point => {
        const rotated = rotateFillPoint({ x: point.x * safeScale, y: point.y * safeScale }, rotation || 0);
        return { x: x + rotated.x, y: y + rotated.y };
    });
}

function normalizeFillWorldPoints(worldPoints, x = 0, y = 0, scale = 1, rotation = 0) {
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const radians = (rotation || 0) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localPoints = sanitizeFillPoints(worldPoints).map(point => {
        const dx = point.x - x;
        const dy = point.y - y;
        return {
            x: (dx * cos + dy * sin) / safeScale,
            y: (-dx * sin + dy * cos) / safeScale
        };
    });
    const bbox = computePolygonBBox(localPoints);
    if (!bbox) return null;

    const centerOffset = rotateFillPoint({
        x: bbox.centerX * safeScale,
        y: bbox.centerY * safeScale
    }, rotation || 0);

    return {
        x: x + centerOffset.x,
        y: y + centerOffset.y,
        points: localPoints.map(point => ({
            x: Number((point.x - bbox.centerX).toFixed(3)),
            y: Number((point.y - bbox.centerY).toFixed(3))
        }))
    };
}

function fillWorldPointToScreen(point) {
    return {
        x: editorTranslateX + point.x * editorScale,
        y: editorTranslateY + point.y * editorScale
    };
}

function fillEventToWorldPoint(event) {
    const rect = editorMapWrapper.getBoundingClientRect();
    const point = {
        x: (event.clientX - rect.left - editorTranslateX) / editorScale,
        y: (event.clientY - rect.top - editorTranslateY) / editorScale
    };
    if (!editorMapImg.naturalWidth || !editorMapImg.naturalHeight) return null;
    if (point.x < 0 || point.y < 0 || point.x > editorMapImg.naturalWidth || point.y > editorMapImg.naturalHeight) return null;
    return point;
}

function renderFillDrawOverlay() {
    const state = fillDrawState;
    if (!state || !state.svg) return;
    const width = editorMapWrapper.clientWidth;
    const height = editorMapWrapper.clientHeight;
    state.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const screenPoints = state.points.map(fillWorldPointToScreen);
    const pointString = screenPoints.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const fillColor = getColorPickerValue('fillMarkerFillColor', 'fillMarkerFillColorAlpha') || '#4a90e280';
    const strokeColor = getColorPickerValue('fillMarkerStrokeColor', 'fillMarkerStrokeColorAlpha') || '#222222ff';
    const shape = state.closed
        ? `<polygon points="${pointString}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2.5" stroke-linejoin="round"></polygon>`
        : `<polyline points="${pointString}" fill="${screenPoints.length >= 3 ? fillColor : 'none'}" stroke="${strokeColor}" stroke-width="2.5" stroke-linejoin="round"></polyline>`;
    const preview = !state.closed && state.previewPoint && screenPoints.length
        ? (() => {
            const lastPoint = screenPoints[screenPoints.length - 1];
            const nextPoint = fillWorldPointToScreen(state.previewPoint);
            return `<line x1="${lastPoint.x}" y1="${lastPoint.y}" x2="${nextPoint.x}" y2="${nextPoint.y}" class="fill-draw-preview-line"></line>`;
        })()
        : '';
    const vertices = screenPoints.map((point, index) => {
        const canClose = !state.closed && index === 0 && state.points.length >= 3;
        return `<circle class="fill-draw-vertex${canClose ? ' can-close' : ''}" data-index="${index}" cx="${point.x}" cy="${point.y}" r="9"></circle>`;
    }).join('');

    state.svg.innerHTML = shape + preview + vertices;
    state.finishButton.disabled = !state.closed || state.points.length < 3;
    state.status.textContent = state.closed
        ? `已闭合，共 ${state.points.length} 个顶点。拖动圆点调整，右键圆点删除。`
        : `已添加 ${state.points.length} 个顶点。点击起点、双击或按 Enter 闭合，Ctrl+Z 删除上一个点。`;
}

function exitFillMarkerDrawMode() {
    if (!fillDrawState) return;
    document.removeEventListener('keydown', handleFillDrawKeydown, true);
    if (fillDrawState.overlay) fillDrawState.overlay.remove();
    fillDrawState = null;
    editorMapWrapper.classList.remove('drawing-fill-marker');
}

function finishFillMarkerDrawMode() {
    const state = fillDrawState;
    if (!state || !state.closed || state.points.length < 3) {
        showToast('至少需要 3 个顶点并闭合多边形', 'error');
        return;
    }
    const points = state.points.map(point => ({ ...point }));
    const onComplete = state.onComplete;
    exitFillMarkerDrawMode();
    if (onComplete) onComplete(points);
}

function cancelFillMarkerDrawMode() {
    const state = fillDrawState;
    if (!state) return;
    const onCancel = state.onCancel;
    exitFillMarkerDrawMode();
    if (onCancel) onCancel();
}

function closeFillDrawPolygon() {
    const state = fillDrawState;
    if (!state || state.points.length < 3) {
        showToast('至少需要 3 个顶点才能闭合', 'error');
        return;
    }
    state.closed = true;
    state.previewPoint = null;
    renderFillDrawOverlay();
    if (state.autoFinishOnClose) setTimeout(finishFillMarkerDrawMode, 0);
}

function restartFillDrawPolygon() {
    if (!fillDrawState) return;
    fillDrawState.points = [];
    fillDrawState.closed = false;
    fillDrawState.previewPoint = null;
    fillDrawState.autoFinishOnClose = true;
    renderFillDrawOverlay();
}

function handleFillDrawClick(event) {
    const state = fillDrawState;
    if (!state) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.suppressClick) {
        state.suppressClick = false;
        return;
    }

    const vertex = event.target.closest && event.target.closest('.fill-draw-vertex');
    if (vertex) {
        const index = Number(vertex.dataset.index);
        if (!state.closed && index === 0 && state.points.length >= 3) closeFillDrawPolygon();
        return;
    }
    if (state.closed) return;
    if (event.detail >= 2) {
        closeFillDrawPolygon();
        return;
    }

    const point = fillEventToWorldPoint(event);
    if (!point) {
        showToast('请在地图图片范围内添加顶点', 'info');
        return;
    }
    state.points.push(point);
    state.previewPoint = point;
    renderFillDrawOverlay();
}

function handleFillDrawPointerDown(event) {
    const state = fillDrawState;
    if (!state) return;
    event.stopPropagation();
    const vertex = event.target.closest && event.target.closest('.fill-draw-vertex');
    if (!vertex || event.button !== 0 || !state.closed) return;
    event.preventDefault();
    state.dragIndex = Number(vertex.dataset.index);
    state.dragStartClientX = event.clientX;
    state.dragStartClientY = event.clientY;
    state.dragMoved = false;
    state.svg.setPointerCapture(event.pointerId);
}

function handleFillDrawPointerMove(event) {
    const state = fillDrawState;
    if (!state) return;
    const point = fillEventToWorldPoint(event);
    if (state.dragIndex != null) {
        event.preventDefault();
        event.stopPropagation();
        if (!point) return;
        if (Math.abs(event.clientX - state.dragStartClientX) > 2 || Math.abs(event.clientY - state.dragStartClientY) > 2) {
            state.dragMoved = true;
        }
        state.points[state.dragIndex] = point;
        renderFillDrawOverlay();
        return;
    }
    if (!state.closed) {
        state.previewPoint = point;
        renderFillDrawOverlay();
    }
}

function handleFillDrawPointerUp(event) {
    const state = fillDrawState;
    if (!state || state.dragIndex == null) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.svg.hasPointerCapture(event.pointerId)) state.svg.releasePointerCapture(event.pointerId);
    state.suppressClick = state.dragMoved;
    state.dragIndex = null;
    state.dragMoved = false;
    renderFillDrawOverlay();
}

function handleFillDrawContextMenu(event) {
    const state = fillDrawState;
    if (!state) return;
    event.preventDefault();
    event.stopPropagation();
    const vertex = event.target.closest && event.target.closest('.fill-draw-vertex');
    if (!vertex) return;
    if (state.points.length <= 3) {
        showToast('多边形至少保留 3 个顶点', 'info');
        return;
    }
    state.points.splice(Number(vertex.dataset.index), 1);
    renderFillDrawOverlay();
}

function handleFillDrawKeydown(event) {
    const state = fillDrawState;
    if (!state) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancelFillMarkerDrawMode();
    } else if (event.key === 'Enter' && !state.closed) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeFillDrawPolygon();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (state.closed) state.closed = false;
        state.points.pop();
        state.previewPoint = state.points[state.points.length - 1] || null;
        renderFillDrawOverlay();
    }
}

function enterFillMarkerDrawMode(options = {}) {
    if (!editorMapImg.naturalWidth) {
        showToast('请先上传并加载地图', 'error');
        return;
    }
    exitFillMarkerDrawMode();
    deselectMarker();

    const overlay = document.createElement('div');
    overlay.className = 'fill-draw-overlay';
    overlay.innerHTML = `
        <svg class="fill-draw-canvas" aria-label="填色标记多边形绘制区域"></svg>
        <div class="fill-draw-toolbar">
            <div class="fill-draw-title"><strong>🖌️ 绘制填色标记</strong><span class="fill-draw-status"></span></div>
            <div class="fill-draw-actions">
                <button type="button" class="btn btn-secondary fill-draw-restart">重新绘制</button>
                <button type="button" class="btn btn-secondary fill-draw-cancel">取消</button>
                <button type="button" class="btn btn-primary fill-draw-finish">完成</button>
            </div>
        </div>`;
    editorMapWrapper.appendChild(overlay);

    fillDrawState = {
        overlay,
        svg: overlay.querySelector('.fill-draw-canvas'),
        status: overlay.querySelector('.fill-draw-status'),
        finishButton: overlay.querySelector('.fill-draw-finish'),
        points: sanitizeFillPoints(options.points),
        previewPoint: null,
        closed: options.closed === true && sanitizeFillPoints(options.points).length >= 3,
        autoFinishOnClose: options.autoFinishOnClose === true,
        onComplete: options.onComplete,
        onCancel: options.onCancel,
        dragIndex: null,
        dragMoved: false,
        suppressClick: false
    };

    const svg = fillDrawState.svg;
    overlay.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
    });
    svg.addEventListener('click', handleFillDrawClick);
    svg.addEventListener('dblclick', event => {
        event.preventDefault();
        event.stopPropagation();
    });
    svg.addEventListener('pointerdown', handleFillDrawPointerDown);
    svg.addEventListener('pointermove', handleFillDrawPointerMove);
    svg.addEventListener('pointerup', handleFillDrawPointerUp);
    svg.addEventListener('pointercancel', handleFillDrawPointerUp);
    svg.addEventListener('contextmenu', handleFillDrawContextMenu);
    overlay.querySelector('.fill-draw-restart').addEventListener('click', event => {
        event.stopPropagation();
        restartFillDrawPolygon();
    });
    overlay.querySelector('.fill-draw-cancel').addEventListener('click', event => {
        event.stopPropagation();
        cancelFillMarkerDrawMode();
    });
    fillDrawState.finishButton.addEventListener('click', event => {
        event.stopPropagation();
        finishFillMarkerDrawMode();
    });
    document.addEventListener('keydown', handleFillDrawKeydown, true);
    editorMapWrapper.classList.add('drawing-fill-marker');
    renderFillDrawOverlay();
}

function startNewFillMarkerDrawing(x, y) {
    const firstPoint = Number.isFinite(x) && Number.isFinite(y)
        && x >= 0 && y >= 0 && x <= editorMapImg.naturalWidth && y <= editorMapImg.naturalHeight
        ? [{ x, y }]
        : [];
    enterFillMarkerDrawMode({
        points: firstPoint,
        closed: false,
        autoFinishOnClose: true,
        onComplete: worldPoints => {
            const normalized = normalizeFillWorldPoints(worldPoints);
            if (!normalized) return;
            openMarkerForm(null, normalized.x, normalized.y, 'fill');
            setFillPointsField(normalized.points);
        }
    });
}

function editFillPolygonFromForm() {
    const xField = document.getElementById('markerX');
    const yField = document.getElementById('markerY');
    const scaleField = document.getElementById('markerScale');
    const rotationField = document.getElementById('markerRotation');
    const x = parseFloat(xField.value) || 0;
    const y = parseFloat(yField.value) || 0;
    const markerScale = Math.max(0.01, parseFloat(scaleField.value) || 1);
    const rotation = parseFloat(rotationField.value) || 0;
    const localPoints = getFillPointsField();
    const worldPoints = fillLocalPointsToWorld(localPoints, x, y, markerScale, rotation);

    markerFormModal.classList.remove('active');
    enterFillMarkerDrawMode({
        points: worldPoints,
        closed: worldPoints.length >= 3,
        autoFinishOnClose: worldPoints.length < 3,
        onComplete: editedWorldPoints => {
            const normalized = normalizeFillWorldPoints(editedWorldPoints, x, y, markerScale, rotation);
            if (normalized) {
                xField.value = Number(normalized.x.toFixed(3));
                yField.value = Number(normalized.y.toFixed(3));
                setFillPointsField(normalized.points);
            }
            markerFormModal.classList.add('active');
        },
        onCancel: () => markerFormModal.classList.add('active')
    });
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
        } else if (markerType === 'shape') {
            // 形状标记
            document.getElementById('shapeCategory').value = marker.category || 'other';
            document.getElementById('shapeType').value = marker.shape || 'rect';
            document.getElementById('arrowStyle').value = marker.arrowStyle || 'solid';
            document.getElementById('arrowAnchor').value = marker.anchor || 'tip';
            setColorPickerValue('fillColor', 'fillColorAlpha', 'fillColorAlphaLabel', marker.fillColor || '#4a90e2');
            setColorPickerValue('strokeColor', 'strokeColorAlpha', 'strokeColorAlphaLabel', marker.strokeColor || '#222222ff');
            document.getElementById('strokeWidth').value = (marker.strokeWidth != null) ? marker.strokeWidth : 2;
            document.getElementById('shapeLabel').value = marker.label || '';
            document.getElementById('shapeDescription').value = marker.description || '';
            document.getElementById('textDetails').innerHTML = marker.details || '';
            updateArrowOnlyVisibility();
        } else if (markerType === 'fill') {
            setFillPointsField(marker.points);
            document.getElementById('fillTextContent').value = marker.textContent || marker.label || '';
            document.getElementById('fillTextPosition').value = marker.textPosition || 'center';
            document.getElementById('fillFontSize').value = marker.fontSize || 16;
            setColorPickerValue('fillTextColor', 'fillTextColorAlpha', 'fillTextColorAlphaLabel', marker.textColor || '#222222ff');
            setColorPickerValue('fillMarkerFillColor', 'fillMarkerFillColorAlpha', 'fillMarkerFillColorAlphaLabel', marker.fillColor || '#4a90e280');
            setColorPickerValue('fillMarkerStrokeColor', 'fillMarkerStrokeColorAlpha', 'fillMarkerStrokeColorAlphaLabel', marker.strokeColor || '#222222ff');
            document.getElementById('fillMarkerStrokeWidth').value = (marker.strokeWidth != null) ? marker.strokeWidth : 2;
            document.getElementById('fillLabel').value = marker.label || '';
            document.getElementById('fillDescription').value = marker.description || '';
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
        setFillPointsField([]);
        document.getElementById('fillTextContent').value = '';
        document.getElementById('fillTextPosition').value = 'center';
        document.getElementById('fillFontSize').value = 16;
        setColorPickerValue('fillTextColor', 'fillTextColorAlpha', 'fillTextColorAlphaLabel', '#222222ff');
        setColorPickerValue('fillMarkerFillColor', 'fillMarkerFillColorAlpha', 'fillMarkerFillColorAlphaLabel', '#4a90e280');
        setColorPickerValue('fillMarkerStrokeColor', 'fillMarkerStrokeColorAlpha', 'fillMarkerStrokeColorAlphaLabel', '#222222ff');
        document.getElementById('fillMarkerStrokeWidth').value = 2;
        document.getElementById('fillLabel').value = '';
        document.getElementById('fillDescription').value = '';

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
// [优化] 增量更新单个标记: 更新数据 + 重绘那个标记的 DOM + 同步侧边栏列表
//   避免调用 loadMarkers() 重建全部 DOM, 提高保存后的响应速度
async function upsertMarkerLocal(newMarker) {
    const idx = markers.findIndex(m => String(m.id) === String(newMarker.id));
    if (idx >= 0) {
        markers[idx] = newMarker;
    } else {
        markers.push(newMarker);
    }
    renderSingleMarker(newMarker);
    renderMarkersList();
    // Apply category-level hide state (eye-icon on the side-panel group header)
    // to the newly inserted marker so paste/create respects adminHiddenCategories.
    // Without this, a marker pasted into a hidden category still shows on the map,
    // while the side-panel list correctly hides its sibling (visually inconsistent).
    if (typeof updateEditorMarkerVisibility === 'function') {
        updateEditorMarkerVisibility();
    }
    // 保持选中状态
    const markerEl = document.querySelector(`.marker[data-id="${newMarker.id}"]`);
    if (markerEl) {
        markerEl.classList.add('selected');
        // [perf] Boost z-index so selection box stays above the selected marker.
        markerEl.dataset.originalZIndex = markerEl.style.zIndex;
        markerEl.style.zIndex = '999998';
        if (typeof createSelectionBox === 'function') {
            createSelectionBox(newMarker, markerEl);
        }
    }
}

// [优化] 重绘单个标记元素
function renderSingleMarker(marker) {
    const container = editorMarkersContainer;
    const existing = container.querySelector(`.marker[data-id="${marker.id}"]`);
    if (existing) {
        // Re-sync inner DOM content (text content, color/bg/border, shape SVG,
        // icon label/visibility). applyMarkerTransform only handles
        // position/scale/rotation, so without this the visible text/style will
        // not refresh after editing the marker's form fields.
        const wasSelected = existing.classList.contains('selected');
        const markerType = marker.type || 'icon';
        existing.className = markerType === 'text'
            ? 'marker marker-text-only'
            : markerType === 'shape'
                ? 'marker marker-shape'
                : markerType === 'fill'
                    ? 'marker marker-fill'
                    : `marker ${marker.category || 'other'}`;
        if (wasSelected) existing.classList.add('selected');
        if (isMarkerLocked(marker)) existing.classList.add('marker-locked');
        existing.innerHTML = buildMarkerInnerHTML(marker);
        applyMarkerTransform(marker, existing);
        existing.style.zIndex = parseInt(marker.zIndex, 10) || 0;
    } else {
        // new marker: full re-render (this branch only fires on first insert)
        renderEditorMarkers();
    }
}

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

    const originalMarker = markerId ? markers.find(m => m.id === markerId) : null;
    if (markerType === 'text') {
        // 文字标记数据
        markerData = {
            ...baseData,
            content: document.getElementById('textContent').value,
            fontSize: parseInt(document.getElementById('fontSize').value),
            textColor: getColorPickerValue('textColor', 'textColorAlpha'),
            bgColor: getColorPickerValue('bgColor', 'bgColorAlpha'),
            borderColor: getColorPickerValue('borderColor', 'borderColorAlpha'),
            borderWidth: parseInt(document.getElementById('borderWidth').value),
            details: document.getElementById('textDetails').innerHTML,
            width: originalMarker ? originalMarker.width : undefined,
            height: originalMarker ? originalMarker.height : undefined
        };
    } else if (markerType === 'shape') {
        // 形状标记数据
        const shapeTypeVal = document.getElementById('shapeType').value;
        markerData = {
            ...baseData,
            category: document.getElementById('shapeCategory').value,
            shape: shapeTypeVal,
            label: document.getElementById('shapeLabel').value,
            fillColor: getColorPickerValue('fillColor', 'fillColorAlpha'),
            strokeColor: getColorPickerValue('strokeColor', 'strokeColorAlpha'),
            strokeWidth: parseFloat(document.getElementById('strokeWidth').value) || 0,
            description: document.getElementById('shapeDescription').value,
            details: document.getElementById('textDetails').innerHTML,
            width: originalMarker ? originalMarker.width : undefined,
            height: originalMarker ? originalMarker.height : undefined
        };
        // 箭头专属字段
        if (shapeTypeVal === 'arrow') {
            markerData.arrowStyle = document.getElementById('arrowStyle').value;
            markerData.anchor = document.getElementById('arrowAnchor').value;
        }
    } else if (markerType === 'fill') {
        const points = getFillPointsField();
        if (points.length < 3) {
            alert('请先绘制并闭合多边形，至少需要 3 个顶点。');
            return;
        }
        markerData = {
            ...baseData,
            category: 'area',
            label: document.getElementById('fillLabel').value,
            textContent: document.getElementById('fillTextContent').value,
            textPosition: document.getElementById('fillTextPosition').value,
            fontSize: parseInt(document.getElementById('fillFontSize').value, 10) || 16,
            textColor: getColorPickerValue('fillTextColor', 'fillTextColorAlpha'),
            fillColor: getColorPickerValue('fillMarkerFillColor', 'fillMarkerFillColorAlpha'),
            strokeColor: getColorPickerValue('fillMarkerStrokeColor', 'fillMarkerStrokeColorAlpha'),
            strokeWidth: Math.max(0, parseFloat(document.getElementById('fillMarkerStrokeWidth').value) || 0),
            description: document.getElementById('fillDescription').value,
            details: document.getElementById('textDetails').innerHTML,
            points,
            pointsSpace: 'local'
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
            selectedMarkerId = newMarker.id;
            // [优化] 推入历史, 允许 undo 修改
            pushHistory(markerId ? '编辑标记' : '新建标记');
            // [优化] 避免调用 loadMarkers() 重建全部 DOM, 只更新本个标记
            await upsertMarkerLocal(newMarker);
            closeMarkerFormModal();
            showToast(markerId ? '标记已更新' : '标记已创建', 'success');
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
        // [优化] 推入历史 (在 DELETE 之前)
        pushHistory('删除标记');

        const response = await fetch(`/api/markers/${markerId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // [优化] 本地增量删除, 不重调 loadMarkers()
            const idx = markers.findIndex(m => String(m.id) === String(markerId));
            if (idx >= 0) markers.splice(idx, 1);
            const el = editorMarkersContainer.querySelector(`.marker[data-id="${markerId}"]`);
            if (el) el.remove();
            if (String(markerId) === String(selectedMarkerId)) {
                deselectMarker();
            }
            renderMarkersList();
            showToast('标记已删除', 'success');
        } else {
            alert('删除失败，请重试');
            if (undoStack.length > 0) undoStack.pop();
            refreshHistoryButtons();
        }
    } catch (error) {
        console.error('Failed to delete marker:', error);
        alert('删除失败: ' + error.message);
        if (undoStack.length > 0) undoStack.pop();
        refreshHistoryButtons();
    }
};

// Copy marker (global function for onclick)
window.copyMarker = function (markerId) {
    const marker = markers.find(m => String(m.id) === String(markerId));
    if (!marker) {
        showToast('标记不存在', 'error');
        return;
    }

    copiedMarkerData = JSON.parse(JSON.stringify(marker));
    copiedMarkerData.type = copiedMarkerData.type || 'icon';
    delete copiedMarkerData.id;
    delete copiedMarkerData.x;
    delete copiedMarkerData.y;
    delete copiedMarkerData.locked;

    // Filter out null or undefined values to avoid validation rejections on optional fields
    for (const key in copiedMarkerData) {
        if (copiedMarkerData[key] === null || copiedMarkerData[key] === undefined) {
            delete copiedMarkerData[key];
        }
    }

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
    } else if (markerType === 'shape') {
        document.getElementById('shapeCategory').value = copiedMarkerData.category || 'other';
        document.getElementById('shapeType').value = copiedMarkerData.shape || 'rect';
        document.getElementById('arrowStyle').value = copiedMarkerData.arrowStyle || 'solid';
        document.getElementById('arrowAnchor').value = copiedMarkerData.anchor || 'tip';
        setColorPickerValue('fillColor', 'fillColorAlpha', 'fillColorAlphaLabel', copiedMarkerData.fillColor || '#4a90e2ff');
        setColorPickerValue('strokeColor', 'strokeColorAlpha', 'strokeColorAlphaLabel', copiedMarkerData.strokeColor || '#222222ff');
        document.getElementById('strokeWidth').value = (copiedMarkerData.strokeWidth != null) ? copiedMarkerData.strokeWidth : 2;
        document.getElementById('shapeLabel').value = copiedMarkerData.label || '';
        document.getElementById('shapeDescription').value = copiedMarkerData.description || '';
        document.getElementById('textDetails').innerHTML = copiedMarkerData.details || '';
        updateArrowOnlyVisibility();
    } else if (markerType === 'fill') {
        setFillPointsField(copiedMarkerData.points);
        document.getElementById('fillTextContent').value = copiedMarkerData.textContent || copiedMarkerData.label || '';
        document.getElementById('fillTextPosition').value = copiedMarkerData.textPosition || 'center';
        document.getElementById('fillFontSize').value = copiedMarkerData.fontSize || 16;
        setColorPickerValue('fillTextColor', 'fillTextColorAlpha', 'fillTextColorAlphaLabel', copiedMarkerData.textColor || '#222222ff');
        setColorPickerValue('fillMarkerFillColor', 'fillMarkerFillColorAlpha', 'fillMarkerFillColorAlphaLabel', copiedMarkerData.fillColor || '#4a90e280');
        setColorPickerValue('fillMarkerStrokeColor', 'fillMarkerStrokeColorAlpha', 'fillMarkerStrokeColorAlphaLabel', copiedMarkerData.strokeColor || '#222222ff');
        document.getElementById('fillMarkerStrokeWidth').value = (copiedMarkerData.strokeWidth != null) ? copiedMarkerData.strokeWidth : 2;
        document.getElementById('fillLabel').value = copiedMarkerData.label || '';
        document.getElementById('fillDescription').value = copiedMarkerData.description || '';
        document.getElementById('textDetails').innerHTML = copiedMarkerData.details || '';
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
        document.getElementById('textDetails').innerHTML = copiedMarkerData.details || '';
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

    const newMarkerData = {
        ...copiedMarkerData,
        x: x,
        y: y
    };

    try {
        pushHistory('粘贴标记');

        const response = await fetch('/api/markers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newMarkerData)
        });

        if (response.ok) {
            const newMarker = await response.json();
            selectedMarkerId = newMarker.id;
            await upsertMarkerLocal(newMarker);
            showToast('标记已粘贴到地图');
        } else {
            const errData = await response.json();
            showToast(`粘贴失败: ${errData.error || '未知错误'}`, 'error');
            if (undoStack.length > 0) undoStack.pop();
            refreshHistoryButtons();
        }
    } catch (error) {
        console.error('Failed to paste marker:', error);
        showToast('粘贴失败: ' + error.message, 'error');
        if (undoStack.length > 0) undoStack.pop();
        refreshHistoryButtons();
    }
}

function isMarkerLocked(marker) {
    return !!(marker && marker.locked);
}

function updateMarkerLockVisual(marker) {
    const markerEl = document.querySelector(`.marker[data-id="${CSS.escape(String(marker.id))}"]`);
    if (!markerEl) return;

    const locked = isMarkerLocked(marker);
    markerEl.classList.toggle('marker-locked', locked);
}

async function toggleMarkerLock(markerId) {
    const marker = markers.find(m => String(m.id) === String(markerId));
    if (!marker) { showToast('标记不存在', 'error'); return; }

    const wasLocked = isMarkerLocked(marker);
    const wasSelected = String(selectedMarkerId) === String(markerId);

    try {
        pushHistory(wasLocked ? '解锁标记' : '锁定标记');
        marker.locked = !wasLocked;
        renderMarkersList();
        updateMarkerLockVisual(marker);
        // 刷新选中态视觉: 锁定后立即清掉选择框与 .selected
        if (marker.locked && wasSelected) deselectMarker();

        const response = await fetch(`/api/markers/${markerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(marker)
        });
        if (!response.ok) {
            throw new Error('服务器未保存锁定状态');
        }
        showToast(marker.locked ? '已锁定，侧边栏可解锁' : '已解锁', 'success');
    } catch (error) {
        console.error('Failed to toggle lock:', error);
        marker.locked = wasLocked;
        if (undoStack.length > 0) undoStack.pop();
        refreshHistoryButtons();
        renderMarkersList();
        updateMarkerLockVisual(marker);
        if (wasSelected && !wasLocked) selectMarker(markerId, null);
        showToast('锁定失败: ' + error.message, 'error');
    }
}
window.toggleMarkerLock = toggleMarkerLock;

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
    const markerElement = clickedElement.closest('.marker') || (
        selectionBox && selectionBox.contains(clickedElement)
            ? markerElementsById.get(String(selectedMarkerId))
            : null
    );

    const copyMenuItem = document.getElementById('copyMarkerMenuItem');
    const editMenuItem = document.getElementById('editMarkerMenuItem');
    const deleteMenuItem = document.getElementById('deleteMarkerMenuItem');
    const editDivider = document.getElementById('editMarkerDivider');
    const pasteMenuItem = document.getElementById('pasteMarkerMenuItem');
    const pasteDivider = document.getElementById('pasteMarkerDivider');
    const bringToFrontMenuItem = document.getElementById('bringToFrontMenuItem');
    const bringForwardMenuItem = document.getElementById('bringForwardMenuItem');
    const sendBackwardMenuItem = document.getElementById('sendBackwardMenuItem');
    const sendToBackMenuItem = document.getElementById('sendToBackMenuItem');
    const zOrderDivider = document.getElementById('zOrderDivider');
    const toggleLockMenuItem = document.getElementById('toggleLockMenuItem');
    const toggleLockIcon = document.getElementById('toggleLockIcon');
    const toggleLockLabel = document.getElementById('toggleLockLabel');

    if (markerElement && markerElement.dataset.id) {
        // 点击在标记上，显示复制、编辑和删除选项
        contextMenuTargetMarkerId = markerElement.dataset.id;

        copyMenuItem.style.display = 'flex';
        editMenuItem.style.display = 'flex';
        if (deleteMenuItem) deleteMenuItem.style.display = 'flex';
        editDivider.style.display = 'block';

        // 显示层级菜单, 并根据当前标记是否已在顶层/底层禁用对应按钮
        const targetMarker = markers.find(m => String(m.id) === String(contextMenuTargetMarkerId));
        if (targetMarker) {
            const myZ = parseInt(targetMarker.zIndex, 10) || 0;
            let maxZ = myZ, minZ = myZ;
            for (const mk of markers) {
                const z = parseInt(mk.zIndex, 10) || 0;
                if (z > maxZ) maxZ = z;
                if (z < minZ) minZ = z;
            }
            // 已在顶层: 置顶/上移 都禁用
            const atTop = (myZ >= maxZ);
            // 已在底层: 置底/下移 都禁用
            const atBottom = (myZ <= minZ);
            setZMenuEnabled(bringToFrontMenuItem, !atTop);
            setZMenuEnabled(bringForwardMenuItem, !atTop);
            setZMenuEnabled(sendBackwardMenuItem, !atBottom);
            setZMenuEnabled(sendToBackMenuItem, !atBottom);
            bringToFrontMenuItem.style.display = 'flex';
            bringForwardMenuItem.style.display = 'flex';
            sendBackwardMenuItem.style.display = 'flex';
            sendToBackMenuItem.style.display = 'flex';
            zOrderDivider.style.display = 'block';
            // 锁定状态: 切换菜单图标 + 文案, 未锁定时正常显示所有项
            const targetLocked = isMarkerLocked(targetMarker);
            if (!targetLocked) {
                // 未锁定标记右键时自动选中，便于 Ctrl+C；锁定标记不能进入编辑态
                selectedMarkerId = markerElement.dataset.id;
            }
            if (toggleLockMenuItem) {
                toggleLockMenuItem.style.display = 'flex';
                if (toggleLockIcon) toggleLockIcon.textContent = targetLocked ? '🔓' : '🔒';
                if (toggleLockLabel) toggleLockLabel.textContent = targetLocked ? '解锁当前标记' : '锁定当前标记';
            }
            // 锁定时: 隐藏复制/编辑/删除/层级, 仅留 解锁/粘贴/新增
            if (targetLocked) {
                copyMenuItem.style.display = 'none';
                editMenuItem.style.display = 'none';
                if (deleteMenuItem) deleteMenuItem.style.display = 'none';
                bringToFrontMenuItem.style.display = 'none';
                bringForwardMenuItem.style.display = 'none';
                sendBackwardMenuItem.style.display = 'none';
                sendToBackMenuItem.style.display = 'none';
                zOrderDivider.style.display = 'none';
            }
        } else {
            bringToFrontMenuItem.style.display = 'none';
            bringForwardMenuItem.style.display = 'none';
            sendBackwardMenuItem.style.display = 'none';
            sendToBackMenuItem.style.display = 'none';
            zOrderDivider.style.display = 'none';
        }

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
        bringToFrontMenuItem.style.display = 'none';
        bringForwardMenuItem.style.display = 'none';
        sendBackwardMenuItem.style.display = 'none';
        sendToBackMenuItem.style.display = 'none';
        zOrderDivider.style.display = 'none';
        if (toggleLockMenuItem) toggleLockMenuItem.style.display = 'none';

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


function setZMenuEnabled(menuItem, enabled) {
    if (!menuItem) return;
    if (enabled) {
        menuItem.classList.remove('disabled');
    } else {
        menuItem.classList.add('disabled');
    }
}

// Compute new z-index based on action. Returns null when no-op (already at top/bottom).
function computeNextZ(action, marker) {
    const myZ = parseInt(marker.zIndex, 10) || 0;
    if (action === 'bring-to-front') {
        let maxZ = myZ;
        for (const mk of markers) { const z = parseInt(mk.zIndex, 10) || 0; if (z > maxZ) maxZ = z; }
        if (myZ >= maxZ) return null;
        return maxZ + 1;
    }
    if (action === 'send-to-back') {
        let minZ = myZ;
        for (const mk of markers) { const z = parseInt(mk.zIndex, 10) || 0; if (z < minZ) minZ = z; }
        if (myZ <= minZ) return null;
        return minZ - 1;
    }
    // bring-forward / send-backward: swap with sorted neighbour
    const sorted = markers.slice().sort((a, b) => (parseInt(a.zIndex, 10) || 0) - (parseInt(b.zIndex, 10) || 0));
    const myId = String(marker.id);
    const idx = sorted.findIndex(m => String(m.id) === myId);
    if (idx === -1) return null;
    if (action === 'bring-forward') {
        if (idx === sorted.length - 1) return null;
        const nextZ = parseInt(sorted[idx + 1].zIndex, 10) || 0;
        return Math.max(myZ, nextZ) + 1;
    }
    if (action === 'send-backward') {
        if (idx === 0) return null;
        const prevZ = parseInt(sorted[idx - 1].zIndex, 10) || 0;
        return Math.min(myZ, prevZ) - 1;
    }
    return null;
}

// Right-click menu z-order action handler. Push history first, then PUT to persist.
async function adjustMarkerZOrder(markerId, action) {
    const marker = markers.find(m => String(m.id) === String(markerId));
    if (!marker) { showToast('标记不存在', 'error'); return; }
    const newZ = computeNextZ(action, marker);
    if (newZ === null) {
        const labelMap = {
            'bring-to-front': '已在顶层',
            'bring-forward': '已在顶层',
            'send-backward': '已在底层',
            'send-to-back': '已在底层',
        };
        showToast(labelMap[action] || '无需调整', 'info');
        return;
    }
    const actionLabelMap = {
        'bring-to-front': '置于顶层',
        'bring-forward': '上移一层',
        'send-backward': '下移一层',
        'send-to-back': '置于底层',
    };
    const label = actionLabelMap[action] || '调整层级';

    try {
        pushHistory(label);
        // Update memory + DOM immediately for instant feedback
        marker.zIndex = newZ;
        const markerEl = document.querySelector(`.marker[data-id="${markerId}"]`);
        if (markerEl) markerEl.style.zIndex = newZ;

        const response = await fetch(`/api/markers/${markerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(marker)
        });
        if (!response.ok) {
            if (undoStack.length > 0) undoStack.pop();
            refreshHistoryButtons();
            showToast('层级保存失败', 'error');
            return;
        }
        renderMarkersList();
        showToast(label + '成功', 'success');
    } catch (error) {
        console.error('Failed to adjust z-order:', error);
        showToast('层级调整失败: ' + error.message, 'error');
        if (undoStack.length > 0) undoStack.pop();
        refreshHistoryButtons();
    }
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
        case 'add-shape':
            openMarkerForm(null, contextMenuX, contextMenuY, 'shape');
            break;
        case 'add-fill':
            startNewFillMarkerDrawing(contextMenuX, contextMenuY);
            break;
        case 'edit-marker':
            if (contextMenuTargetMarkerId) {
                openMarkerForm(contextMenuTargetMarkerId);
            }
            break;
        case 'toggle-lock':
            if (contextMenuTargetMarkerId) toggleMarkerLock(contextMenuTargetMarkerId);
            break;
        case 'delete-marker':
            if (contextMenuTargetMarkerId) {
                deleteMarker(contextMenuTargetMarkerId);
            }
            break;
        case 'bring-to-front':
            if (contextMenuTargetMarkerId) adjustMarkerZOrder(contextMenuTargetMarkerId, 'bring-to-front');
            break;
        case 'bring-forward':
            if (contextMenuTargetMarkerId) adjustMarkerZOrder(contextMenuTargetMarkerId, 'bring-forward');
            break;
        case 'send-backward':
            if (contextMenuTargetMarkerId) adjustMarkerZOrder(contextMenuTargetMarkerId, 'send-backward');
            break;
        case 'send-to-back':
            if (contextMenuTargetMarkerId) adjustMarkerZOrder(contextMenuTargetMarkerId, 'send-to-back');
            break;
    }
}

// Handle marker type change
function handleMarkerTypeChange(e) {
    const markerType = e.target.value;
    const textSettings = document.getElementById('textMarkerSettings');
    const iconSettings = document.getElementById('iconMarkerSettings');
    const shapeSettings = document.getElementById('shapeMarkerSettings');
    const fillSettings = document.getElementById('fillMarkerSettings');
    const iconExtraInfo = document.getElementById('iconExtraInfo');

    if (markerType === 'text') {
        textSettings.style.display = 'block';
        iconSettings.style.display = 'none';
        shapeSettings.style.display = 'none';
        if (fillSettings) fillSettings.style.display = 'none';
        iconExtraInfo.style.display = 'none';
        // 文字标记的必填字�?
        document.getElementById('textContent').required = true;
        document.getElementById('iconCategory').required = false;
        document.getElementById('iconLabel').required = false;
    } else if (markerType === 'shape') {
        textSettings.style.display = 'none';
        iconSettings.style.display = 'none';
        shapeSettings.style.display = 'block';
        if (fillSettings) fillSettings.style.display = 'none';
        document.getElementById('textContent').required = false;
        document.getElementById('iconCategory').required = false;
        document.getElementById('iconLabel').required = false;
        updateArrowOnlyVisibility();
    } else if (markerType === 'fill') {
        textSettings.style.display = 'none';
        iconSettings.style.display = 'none';
        shapeSettings.style.display = 'none';
        if (fillSettings) fillSettings.style.display = 'block';
        iconExtraInfo.style.display = 'none';
        document.getElementById('textContent').required = false;
        document.getElementById('iconCategory').required = false;
        document.getElementById('iconLabel').required = false;

    } else {
        textSettings.style.display = 'none';
        iconSettings.style.display = 'block';
        shapeSettings.style.display = 'none';
        if (fillSettings) fillSettings.style.display = 'none';
        iconExtraInfo.style.display = 'block';
        // 图标标记的必填字�?
        document.getElementById('textContent').required = false;
        document.getElementById('iconCategory').required = true;
        document.getElementById('iconLabel').required = true;
    }
}

// 箭头专属设置: 只在 shapeType=arrow 时显示
function updateArrowOnlyVisibility() {
    const arrowOnly = document.getElementById('arrowOnlySettings');
    if (!arrowOnly) return;
    const shapeType = document.getElementById('shapeType').value;
    arrowOnly.style.display = (shapeType === 'arrow') ? 'block' : 'none';
}

// Update marker icon preview in form
function updateMarkerIconPreview() {
    const select = document.getElementById('iconCategory');
    const category = select ? select.value : '';
    const preview = document.getElementById('markerIconPreview');
    if (preview) {
        preview.innerHTML = getMarkerIconSVG(category);
    }
    // 同步网格选中态 (编辑/粘贴/新建时都同步)
    if (typeof syncGridSelection === 'function') syncGridSelection(category);
}

// ========== Marker Selection and Resizing ==========

// Select a marker
function selectMarker(markerId, event) {
    // 如果已经在拖动或调整大小，不处理
    if (isDraggingMarker || isResizing) return;

    const marker = markers.find(m => String(m.id) === String(markerId));
    if (!marker) return;
    if (isMarkerLocked(marker)) {
        showToast('标记已锁定，请在侧边栏解锁', 'info');
        return;
    }
    selectedMarkerId = markerId;

    // 移除之前的地图选中状�?
    document.querySelectorAll('.marker.selected').forEach(el => el.classList.remove('selected'));

    // 添加地图选中状�?
    const markerEl = markerElementsById.get(String(markerId));
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
    armMarkerDrag(marker, event);

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
    }
    document.body.focus();
}

function armMarkerDrag(marker, event) {
    if (!marker || !event || event.clientX === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    markerStartX = marker.x;
    markerStartY = marker.y;
    pendingDrag = true;
    isDraggingMarker = false;
    try { window.getSelection && window.getSelection().removeAllRanges(); } catch (_) {}
}

// Deselect marker
function deselectMarker() {
    selectedMarkerId = null;
    document.querySelectorAll('.marker.selected').forEach(el => {
        el.classList.remove('selected');
        // [perf] Restore original z-index that was saved when marker was selected
        if (el.dataset.originalZIndex !== undefined) {
            el.style.zIndex = el.dataset.originalZIndex;
            delete el.dataset.originalZIndex;
        }
    });
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
    selectionBox.style.pointerEvents = 'auto';
    selectionBox.addEventListener('mousedown', (event) => {
        if (event.target.closest('.resize-handle, .rotate-handle')) return;
        const selectedMarker = markers.find(item => item.id === selectedMarkerId);
        if (selectedMarker && !isMarkerLocked(selectedMarker)) {
            armMarkerDrag(selectedMarker, event);
        }
    });
    selectionBox.addEventListener('dblclick', (event) => {
        if (event.target.closest('.resize-handle, .rotate-handle')) return;
        event.preventDefault();
        event.stopPropagation();
        if (selectedMarkerId) focusAdminMarker(selectedMarkerId);
    });

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

    selectionBox.style.left = centerX + 'px';
    selectionBox.style.top = centerY + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
    selectionBox.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${editorScale})`;
    selectionBox.style.transformOrigin = 'center center';

    // 创建8个调整手柄（四角+四边�?
    // 手柄大小根据标记大小动态调整，但有最小最大限�?
    const markerScreenMin = Math.min(width, height) * editorScale;
    const screenHandleSize = getSelectionHandleScreenSize(markerScreenMin);
    selectionBox.dataset.markerScreenMin = String(markerScreenMin);
    const baseHandleSize = screenHandleSize / editorScale;

    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(position => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${position}`;
        handle.dataset.position = position;
        handle.style.pointerEvents = 'auto';

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
    rotateHandle.style.pointerEvents = 'auto';
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

    // Keep handle hit targets at a stable screen size across all zoom levels.
    updateSelectionHandleSizes(screenHandleSize);
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

// [perf] Cached rect of editorMapWrapper at drag/resize/rotate start, avoids getBoundingClientRect in mousemove
let rotateContextMapCenterX = 0;
let rotateContextMapCenterY = 0;
let rotateContextWrapLeft = 0;
let rotateContextWrapTop = 0;
let resizeContextWrapLeft = 0;
let resizeContextWrapTop = 0;
let rotateContextMarkerEl = null;
let rotateContextMarker = null;
let resizeContextMarkerEl = null;
let resizeContextMarker = null;
let dragContextMarkerEl = null;
let dragContextMarker = null;

// Start rotating
function startRotate(event) {
    event.preventDefault();
    const marker = markers.find(m => m.id === selectedMarkerId);
    if (!marker) return;

    const markerEl = markerElementsById.get(selectedMarkerId);
    if (!markerEl) return;

    inputLockZoom = true;
    pushHistory('旋转标记');
    markerEl.classList.add('no-transition');
    if (selectionBox) selectionBox.classList.add('no-transition', 'dragging');

    // [perf] Cache wrapper rect + marker center, used in mousemove without getBoundingClientRect
    const containerRect = editorMapWrapper.getBoundingClientRect();
    const markerRect = markerEl.getBoundingClientRect();
    rotateContextMapCenterX = (markerRect.left + markerRect.width / 2 - containerRect.left) / editorScale;
    rotateContextMapCenterY = (markerRect.top + markerRect.height / 2 - containerRect.top) / editorScale;
    rotateContextWrapLeft = containerRect.left;
    rotateContextWrapTop = containerRect.top;
    rotateContextMarkerEl = markerEl;
    rotateContextMarker = marker;
    const centerX = rotateContextMapCenterX;
    const centerY = rotateContextMapCenterY;
    const mouseX = (event.clientX - containerRect.left) / editorScale;
    const mouseY = (event.clientY - containerRect.top) / editorScale;

    rotateStartAngle = Math.atan2(mouseY - centerY, mouseX - centerX) * 180 / Math.PI;
    markerStartRotation = marker.rotation || 0;
    isRotating = true;
}

// Start resizing - 记录初始状�?(屏幕像素, 改为记录 mousedown 时的鼠标位置,
// 后续�?鼠标相对位移"算新尺寸, 解决绝对位置算法�?缩到最小就被锁�?的问�?
function startResize(handlePosition, event) {
    event.preventDefault();
    const marker = markers.find(m => m.id === selectedMarkerId);
    const markerEl = markerElementsById.get(selectedMarkerId);
    if (!marker || !markerEl) return;

    isResizing = true;
    resizeHandle = handlePosition;
    inputLockZoom = true;
    pushHistory('缩放标记');
    resizeContextMarker = marker;
    resizeContextMarkerEl = markerEl;
    markerEl.classList.add('no-transition');
    if (selectionBox) selectionBox.classList.add('no-transition', 'dragging');

    // [perf] Cache wrapper rect once (was re-read every frame -> forced layout flush)
    const containerRect = editorMapWrapper.getBoundingClientRect();
    resizeContextWrapLeft = containerRect.left;
    resizeContextWrapTop = containerRect.top;
    const rect = containerRect;
    
    // Get initial mouse position in map coordinates
    const startMouseX = (event.clientX - rect.left - editorTranslateX) / editorScale;
    const startMouseY = (event.clientY - rect.top - editorTranslateY) / editorScale;

    // Get initial marker size in map coordinates
    const isText = marker.type === 'text';
    const isShape = marker.type === 'shape';
    let startWidth, startHeight;
    if (isText || isShape) {
        // 文字 / 形状标记: 自由 width/height, 跟地图独立缩放
        startWidth = marker.width || (48 * (marker.scale || 1.0));
        startHeight = marker.height || (32 * (marker.scale || 1.0));
    } else {
        startWidth = markerEl.offsetWidth;
        startHeight = markerEl.offsetHeight;
    }

    const startX = marker.x;
    const startY = marker.y;
    const rotation = marker.rotation || 0;
    const theta = rotation * Math.PI / 180;

    // Calculate mouse position relative to marker center in map coordinates
    const dx = startMouseX - startX;
    const dy = startMouseY - startY;

    // Project mouse to local coordinate system of the marker
    const startLocalX = dx * Math.cos(theta) + dy * Math.sin(theta);
    const startLocalY = -dx * Math.sin(theta) + dy * Math.cos(theta);

    resizeStartBounds = {
        startX,
        startY,
        startWidth,
        startHeight,
        startLocalX,
        startLocalY,
        rotation,
        theta,
        markerScale: marker.scale || 1.0,
        startLayoutWidth: markerEl.offsetWidth,
        startLayoutHeight: markerEl.offsetHeight,
        isText,
        isShape
    };
}

// (handleEditorMouseMove is registered once below; do not register again here)

// [优化] 只更新单个标记的尺寸 + 旋转 + 内部 icon 部分尺寸
//   用于拖动/缩放/旋转 mousemove 中, 避免调用 updateEditorMarkerScales 重绘全部
function applyMarkerTransform(marker, markerEl) {
    const sizeMul = globalMarkerSizeMultiplier || 1.0;
    const markerScale = marker.scale || 1.0;
    const rotation = marker.rotation || 0;
    const isText = marker.type === 'text';
    const isShape = marker.type === 'shape';
    const isFill = marker.type === 'fill';

    if (isText || isShape || isFill) {
        if (isFill) {
            applyFillMarkerSize(marker, markerEl, sizeMul);
        } else {
            if (isText && !marker.width) {
                markerEl.style.width = 'max-content';
            } else {
                const baseW = marker.width || (48 * markerScale);
                markerEl.style.width = (baseW * sizeMul) + 'px';
            }
            if (isText && !marker.height) {
                markerEl.style.height = 'max-content';
            } else {
                const baseH = marker.height || (32 * markerScale);
                markerEl.style.height = (baseH * sizeMul) + 'px';
            }
        }
        if (isText) {
            const label = markerEl.querySelector('.text-label');
            if (label) {
                const fontPx = (marker.fontSize || 14) * sizeMul;
                label.style.fontSize = fontPx + 'px';
            }
        }
        markerEl.style.transformOrigin = 'center center';
        markerEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${editorScale})`;
    } else {
        const targetSize = EDITOR_MARKER_BASE * markerScale * sizeMul;
        const iconPart = markerEl.querySelector('.marker-icon-part');
        if (iconPart) {
            iconPart.style.width = targetSize + 'px';
            iconPart.style.height = targetSize + 'px';
        }
        const labelPart = markerEl.querySelector('.marker-label-part');
        if (labelPart) {
            const fontPx = EDITOR_MARKER_FONT * (targetSize / EDITOR_MARKER_BASE);
            labelPart.style.fontSize = fontPx + 'px';
        }
        markerEl.style.transformOrigin = 'center center';
        markerEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${editorScale})`;
    }
}

function handleEditorMouseMove(e) {
    // [优化] 优先处理 pendingDrag: mousedown 后未超过阈值, 这里检测是否需要正式进入 drag
    if (pendingDrag && !isDraggingMarker && !isResizing && !isRotating && selectedMarkerId) {
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
            const marker = markers.find(item => item.id === selectedMarkerId);
            const markerEl = markerElementsById.get(selectedMarkerId);
            if (!marker || !markerEl) {
                pendingDrag = false;
                return;
            }
            isDraggingMarker = true;
            pendingDrag = false;
            markerEl.classList.add('dragging', 'no-transition');
            if (selectionBox) selectionBox.classList.add('no-transition', 'dragging');
            dragContextMarker = marker;
            dragContextMarkerEl = markerEl;
            markerStartX = markerStartX + (dx / editorScale);
            markerStartY = markerStartY + (dy / editorScale);
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            // 拖拽起始: 在这里推入历史, 后续操作可以 undo
            pushHistory('拖动标记');
        } else {
            return;
        }
    }

    if (isRotating && selectedMarkerId && rotateContextMarker && rotateContextMarkerEl) {
        // [perf] Use cached center + wrapper rect (captured at startRotate); skip mark.
        const marker = rotateContextMarker;
        const markerEl = rotateContextMarkerEl;
        const mouseX = (e.clientX - rotateContextWrapLeft) / editorScale;
        const mouseY = (e.clientY - rotateContextWrapTop) / editorScale;
        const currentAngle = Math.atan2(mouseY - rotateContextMapCenterY, mouseX - rotateContextMapCenterX) * 180 / Math.PI;
        const delta = currentAngle - rotateStartAngle;
        let newRotation = (markerStartRotation + delta) % 360;
        if (newRotation > 180) newRotation -= 360;
        if (newRotation < -180) newRotation += 360;
        marker.rotation = newRotation;
        applyMarkerTransform(marker, markerEl);
        fastSyncSelectionBoxTransform(marker);
        // [perf] Throttle DOM field update: skip if not visible to user
        const rotField = document.getElementById('markerRotation');
        const idField = document.getElementById('markerId');
        if (rotField && idField && idField.value === selectedMarkerId) {
            rotField.value = Math.round(newRotation);
        }
        return;
    }

    if (isDraggingMarker && selectedMarkerId) {
        // [perf] Use cached marker (captured at drag start) instead of markers.find
        const marker = dragContextMarker || (dragContextMarker = markers.find(m => m.id === selectedMarkerId));
        if (!marker) return;

        const deltaX = (e.clientX - dragStartX) / editorScale;
        const deltaY = (e.clientY - dragStartY) / editorScale;
        marker.x = markerStartX + deltaX;
        marker.y = markerStartY + deltaY;

        const markerEl = dragContextMarkerEl || (dragContextMarkerEl = markerElementsById.get(selectedMarkerId));
        if (markerEl) {
            // [perf] screenX/screenY is the marker center, used for both marker and selection box (no getBoundingClientRect needed)
            const screenX = editorTranslateX + marker.x * editorScale;
            const screenY = editorTranslateY + marker.y * editorScale;
            markerEl.style.left = screenX + 'px';
            markerEl.style.top = screenY + 'px';

            if (selectionBox) {
                // [perf] Was: getBoundingClientRect twice per frame -> forced layout flush.
                //       Now: reuse screenX/screenY; selection box shares the same center anchor.
                selectionBox.style.left = screenX + 'px';
                selectionBox.style.top = screenY + 'px';
            }
        }
        return;
    }

    if (isResizing && selectedMarkerId && resizeStartBounds && resizeContextMarker) {
        // [perf] Use cached marker + wrapper rect (captured at startResize); no getBoundingClientRect here.
        const marker = resizeContextMarker;
        const mouseX = (e.clientX - resizeContextWrapLeft - editorTranslateX) / editorScale;
        const mouseY = (e.clientY - resizeContextWrapTop - editorTranslateY) / editorScale;

        const {
            startX, startY, startWidth, startHeight,
            startLocalX, startLocalY,
            theta, markerScale, isText, isShape
        } = resizeStartBounds;

        const dx = mouseX - startX;
        const dy = mouseY - startY;
        const currentLocalX = dx * Math.cos(theta) + dy * Math.sin(theta);
        const currentLocalY = -dx * Math.sin(theta) + dy * Math.cos(theta);
        const diffLocalX = currentLocalX - startLocalX;
        const diffLocalY = currentLocalY - startLocalY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLocalCenterX = 0;
        let newLocalCenterY = 0;

        if (resizeHandle.includes('e')) {
            newWidth = startWidth + diffLocalX;
            newWidth = Math.max(10, newWidth);
            newLocalCenterX = -startWidth / 2 + newWidth / 2;
        } else if (resizeHandle.includes('w')) {
            newWidth = startWidth - diffLocalX;
            newWidth = Math.max(10, newWidth);
            newLocalCenterX = startWidth / 2 - newWidth / 2;
        }
        if (resizeHandle.includes('s')) {
            newHeight = startHeight + diffLocalY;
            newHeight = Math.max(10, newHeight);
            newLocalCenterY = -startHeight / 2 + newHeight / 2;
        } else if (resizeHandle.includes('n')) {
            newHeight = startHeight - diffLocalY;
            newHeight = Math.max(10, newHeight);
            newLocalCenterY = startHeight / 2 - newHeight / 2;
        }

        if (isText || isShape) {
            marker.width = newWidth;
            marker.height = newHeight;
            marker.x = startX + newLocalCenterX * Math.cos(theta) - newLocalCenterY * Math.sin(theta);
            marker.y = startY + newLocalCenterX * Math.sin(theta) + newLocalCenterY * Math.cos(theta);
            const xField = document.getElementById('markerX');
            const yField = document.getElementById('markerY');
            const idField = document.getElementById('markerId');
            if (xField && yField && idField && idField.value === selectedMarkerId) {
                xField.value = Math.round(marker.x);
                yField.value = Math.round(marker.y);
            }
        } else {
            let ratio = 1.0;
            let targetWidth = startWidth;
            let targetHeight = startHeight;
            if (resizeHandle.includes('e')) targetWidth = startWidth + 2 * diffLocalX;
            else if (resizeHandle.includes('w')) targetWidth = startWidth - 2 * diffLocalX;
            if (resizeHandle.includes('n')) targetHeight = startHeight - 2 * diffLocalY;
            else if (resizeHandle.includes('s')) targetHeight = startHeight + 2 * diffLocalY;
            if (resizeHandle.includes('e') || resizeHandle.includes('w')) {
                if (resizeHandle.includes('n') || resizeHandle.includes('s')) {
                    ratio = Math.max(targetWidth / startWidth, targetHeight / startHeight);
                } else {
                    ratio = targetWidth / startWidth;
                }
            } else {
                ratio = targetHeight / startHeight;
            }
            marker.scale = Math.max(0.1, markerScale * ratio);
            const scaleField = document.getElementById('markerScale');
            const idField = document.getElementById('markerId');
            if (scaleField && idField && idField.value === selectedMarkerId) {
                scaleField.value = marker.scale.toFixed(2);
            }
        }

        const markerEl = markerElementsById.get(selectedMarkerId);
        if (markerEl) {
            const screenX = editorTranslateX + marker.x * editorScale;
            const screenY = editorTranslateY + marker.y * editorScale;
            markerEl.style.left = screenX + 'px';
            markerEl.style.top = screenY + 'px';
            applyMarkerTransform(marker, markerEl);
            // [perf] Use layout-free variant during resize
            fastSyncSelectionBoxFromMarker(marker);
        }
        updateScaleIndicator((isText || isShape) ? 1.0 : marker.scale);
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

    const nextText = `${Math.round(scale * 100)}%`;
    if (indicator.textContent !== nextText) indicator.textContent = nextText;
    indicator.style.opacity = '1';
    if (indicator.hideTimeout) {
        clearTimeout(indicator.hideTimeout);
        indicator.hideTimeout = null;
    }
}

function hideScaleIndicator() {
    const indicator = document.getElementById('scaleIndicator');
    if (!indicator) return;
    if (indicator.hideTimeout) clearTimeout(indicator.hideTimeout);
    indicator.hideTimeout = setTimeout(() => {
        indicator.style.opacity = '0';
        indicator.hideTimeout = null;
    }, 350);
}

function hasActiveMarkerInteraction() {
    return pendingDrag || isDraggingMarker || isResizing || isRotating;
}

function processPendingEditorMouseMove() {
    const event = pendingMoveEvent;
    pendingMoveEvent = null;
    if (event) handleEditorMouseMove(event);
}

function flushPendingEditorMouseMove() {
    if (moveRafId) {
        cancelAnimationFrame(moveRafId);
        moveRafId = 0;
    }
    processPendingEditorMouseMove();
}

const markerUpdateQueues = new Map();

function queueMarkerUpdate(marker) {
    const markerId = String(marker.id);
    const body = JSON.stringify(marker);
    const previousUpdate = markerUpdateQueues.get(markerId) || Promise.resolve();
    const updatePromise = previousUpdate.catch(() => {}).then(async () => {
        const response = await fetch(`/api/markers/${marker.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    });
    markerUpdateQueues.set(markerId, updatePromise);
    void updatePromise.catch(error => {
        console.error('Failed to update marker:', error);
        showToast('标记保存失败，请重试', 'error');
    }).finally(() => {
        if (markerUpdateQueues.get(markerId) === updatePromise) {
            markerUpdateQueues.delete(markerId);
        }
    });
}

function resetMarkerInteractionState() {
    const markerEl = selectedMarkerId ? markerElementsById.get(selectedMarkerId) : null;
    if (markerEl) markerEl.classList.remove('dragging', 'no-transition');
    if (selectionBox) selectionBox.classList.remove('dragging', 'no-transition');
    resizeContextMarker = null;
    resizeContextMarkerEl = null;
    rotateContextMarker = null;
    rotateContextMarkerEl = null;
    dragContextMarker = null;
    dragContextMarkerEl = null;
    resizeStartBounds = null;
    isDraggingMarker = false;
    isResizing = false;
    isRotating = false;
    resizeHandle = null;
    pendingDrag = false;
    inputLockZoom = false;
}

// Release interaction state before database I/O so the marker cannot keep
// following the pointer while a slow PUT request is still pending.
function handleEditorMouseUp(event) {
    if (!hasActiveMarkerInteraction() && !pendingMoveEvent) return;

    flushPendingEditorMouseMove();
    if (hasActiveMarkerInteraction() && event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        handleEditorMouseMove({ clientX: event.clientX, clientY: event.clientY });
    }

    const shouldPersist = isDraggingMarker || isResizing || isRotating;
    const marker = shouldPersist && selectedMarkerId
        ? markers.find(item => item.id === selectedMarkerId)
        : null;

    resetMarkerInteractionState();
    if (selectionBox) syncSelectionBoxToSelected();
    hideScaleIndicator();
    if (marker) queueMarkerUpdate(marker);
}

// Add global mouse event listeners
// [perf] rAF-coalesced mousemove: collapses many events per frame into one paint
function _rafHandleEditorMouseMove(e) {
    if (!hasActiveMarkerInteraction()) return;
    pendingMoveEvent = { clientX: e.clientX, clientY: e.clientY };
    if (moveRafId) return;
    moveRafId = requestAnimationFrame(() => {
        moveRafId = 0;
        processPendingEditorMouseMove();
    });
}
document.addEventListener('mousemove', _rafHandleEditorMouseMove);
document.addEventListener('mouseup', handleEditorMouseUp);

// Click on map background to deselect and blur inputs
if (editorMapWrapper) {
    editorMapWrapper.addEventListener('mousedown', (e) => {
        if (e.target === editorMapWrapper || e.target === editorMapImage || e.target === editorMapImg) {
            deselectMarker();
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
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
    document.getElementById('iconTypeTextColor').value = '#333333';
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
    const textColorEl = document.getElementById('iconTypeTextColor');
    const textColor = textColorEl ? textColorEl.value : '#333333';
    const isTransparent = document.getElementById('iconTypeTransparent').checked;

    if (preview) {
        // 预览同时展示图标 + 文字胶囊, 让用户能直观看到图标颜色 + 文字颜色 + 背景
        let iconInner;
        if (imageUrl) {
            iconInner = `<img src="${imageUrl}" style="width: 24px; height: 24px; object-fit: contain;">`;
        } else if (shape) {
            iconInner = `<div style="color: ${color}; width: 24px; height: 24px; display: flex; align-items: center;
                justify-content: center;
                pointer-events: none;
                user-select: none;">${SVG_ICONS[shape] || SVG_ICONS.other}</div>`;
        } else {
            iconInner = '';
        }
        // 跟前台胶囊样式一致: 图标 (色) + 文字 (textColor) + 背景 (bgColor/transparent)
        const typeName = (document.getElementById('iconTypeName') && document.getElementById('iconTypeName').value) || '预览';
        const shadowStyle = isTransparent ? '' : 'box-shadow: 0 2px 6px rgba(0,0,0,0.1);';
        preview.innerHTML = `
            <div style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px 4px 4px; border-radius: 30px; ${shadowStyle}">
                ${iconInner}
                <span style="color: ${textColor}; font-weight: 600; font-size: 13px; padding-left: 4px;">${escapeHtml(typeName)}</span>
            </div>
        `;
        preview.style.background = isTransparent ? 'transparent' : bgColor;
        // 透明/白色背景加边框
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
    document.getElementById('iconTypeTextColor').value = type.textColor || '#333333';

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
    const textColor = document.getElementById('iconTypeTextColor').value;
    const bgColor = document.getElementById('iconTypeBgColor').value;
    const isTransparent = document.getElementById('iconTypeTransparent').checked;
    const iconSource = document.querySelector('input[name="iconSource"]:checked').value;

    let typeData = {
        name: name,
        color: color,
        textColor: textColor,
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
// 同步渲染隐藏的 <select> (兼容 required 验证) + 网格选择器 (所见即所得, 不用先点开下拉)
function updateIconCategorySelect() {
    const select = document.getElementById('iconCategory');
    const grid = document.getElementById('iconCategoryGrid');
    if (select) {
        select.innerHTML = '';
        Object.keys(iconTypes).forEach(typeId => {
            const type = iconTypes[typeId];
            const option = document.createElement('option');
            option.value = typeId;
            option.textContent = type.name;
            select.appendChild(option);
        });
    }
    if (grid) {
        grid.innerHTML = '';
        // 按 order 字段排序
        const sorted = Object.keys(iconTypes)
            .map(id => ({ id, type: iconTypes[id] }))
            .sort((a, b) => (a.type.order || 999) - (b.type.order || 999));

        sorted.forEach(({ id, type }) => {
            const color = type.color || '#9e9e9e';
            const iconHtml = getMarkerIconSVG(id); // 跟右侧图标类型列表保持视觉一致 (SVG / image)
            const card = document.createElement('div');
            card.className = 'icon-category-card';
            card.dataset.value = id;
            card.setAttribute('role', 'button');
            card.setAttribute('tabindex', '0');
            card.title = type.name;
            card.innerHTML = `
                <div class="icon-category-icon" style="background: ${color}1a; color: ${color};">${iconHtml}</div>
                <div class="icon-category-name">${escapeHtml(type.name)}</div>
            `;
            card.addEventListener('click', () => selectIconCategory(id));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectIconCategory(id);
                }
            });
            grid.appendChild(card);
        });
        // 同步当前 select 选中态到 grid
        if (select) syncGridSelection(select.value);
    }
}

// 选中某个图标类型: 同步更新 select + grid 高亮 + 触发 preview 更新
function selectIconCategory(typeId) {
    const select = document.getElementById('iconCategory');
    if (select) select.value = typeId;
    syncGridSelection(typeId);
    // 跟旧 select change 行为一致: 触发图标预览
    if (typeof updateMarkerIconPreview === 'function') updateMarkerIconPreview();

    // 自动填充标签名称: 用 iconTypes 的 name (去掉 emoji, 让用户直接修改)
    // 行为: 当前输入框为空, 或 跟之前 type 的默认名一致 (避免改 type 时清空用户已输入的自定义名)
    const labelEl = document.getElementById('iconLabel');
    if (labelEl && iconTypes[typeId]) {
        const typeName = (iconTypes[typeId].name || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
        const prev = labelEl.value.trim();
        // 只在 (空) 或 (跟之前 type 名字一致) 时覆盖, 避免覆盖用户已输入的自定义名
        const prevType = select ? select.dataset.prevType : null;
        const prevTypeName = prevType && iconTypes[prevType] ? (iconTypes[prevType].name || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim() : '';
        if (!prev || prev === prevTypeName) {
            labelEl.value = typeName;
        }
        if (select) select.dataset.prevType = typeId;
    }
}

function syncGridSelection(typeId) {
    const grid = document.getElementById('iconCategoryGrid');
    if (!grid) return;
    grid.querySelectorAll('.icon-category-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.value === typeId);
    });
}

// Get marker icon (updated to use SVG or Custom Image)
function getMarkerIconSVG(category) {
    const type = iconTypes[category] || iconTypes.other;

    if (type && type.imageUrl) {
        // Use custom image
        return `<div style="width: 100%; height: 100%; display: flex; align-items: center;
                justify-content: center;
                pointer-events: none;
                user-select: none;">
            <img src="${type.imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">
        </div>`;
    }

    const svg = (type && SVG_ICONS[type.icon]) ? SVG_ICONS[type.icon] : SVG_ICONS.other;
    const color = (type && type.color) ? type.color : '#9e9e9e';

    return `<div style="color: ${color}; width: 100%; height: 100%; display: flex; align-items: center;
                justify-content: center;
                pointer-events: none;
                user-select: none;">${svg}</div>`;
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

    const iconTypeTextColor = document.getElementById('iconTypeTextColor');
    if (iconTypeTextColor) {
        iconTypeTextColor.addEventListener('input', updateCurrentIconPreview);
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
                const markerEl = markerElementsById.get(selectedMarkerId);
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

// Helper function to get icon SVG for sidebar config
// 直接用 SVG_ICONS 里的真实 SVG, 跟前台/侧边栏显示保持一致
// 用 inline `<svg style="width:100%;height:100%">` 让 24×24 容器内显示
function getIconSvg(iconName) {
    const svg = SVG_ICONS[iconName] || SVG_ICONS.other;
    // SVG_ICONS 内部已经是 `<svg viewBox="0 0 24 24" ...>`, 强制设 100% 大小
    return svg.replace('<svg ', '<svg style="width:100%;height:100%" ');
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



// ============================================
// Views Management
// ============================================

let viewsData = [];

// Load Views
async function loadViews() {
    try {
        const response = await fetch('/api/views');
        if (response.ok) {
            viewsData = await response.json();
            renderViewsList();
        }
    } catch (error) {
        console.error('Failed to load views:', error);
        showToast('加载视图列表失败', 'error');
    }
}

function renderViewsList() {
    const container = document.getElementById('views-list-container');
    if (!container) return;

    if (viewsData.length === 0) {
        container.innerHTML = '<div class="empty-preview"><p>暂无视图，请点击“新增视图”创建</p></div>';
        return;
    }

    container.innerHTML = viewsData.map(view => {
        const cats = (view.categories || []).map(c => {
            const type = iconTypes[c];
            return type ? type.name : c;
        }).join(', ');

        const isMain = view.isMain === true;
        const mainBadge = isMain
            ? '<span style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; font-size: 12px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: 600;">★ 主视图</span>'
            : '';
        const mainBtn = isMain
            ? `<button class="btn btn-secondary btn-sm" onclick="clearMainView()" style="color: #d97706; border-color: #d97706;" title="取消主视图">☆ 取消主视图</button>`
            : `<button class="btn btn-secondary btn-sm" onclick="setMainView('${view.id}')" title="设为主视图，根路径将使用此视图">★ 设为主视图</button>`;

        return `
            <div class="view-item" style="border: 1px solid ${isMain ? '#f59e0b' : 'var(--border-color)'}; border-radius: 6px; padding: 15px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; background: ${isMain ? '#fffbeb' : 'white'};">
                <div>
                    <h3 style="margin: 0 0 5px 0;">${escapeHtml(view.name)}${mainBadge}</h3>
                    <p style="margin: 0 0 5px 0; color: var(--text-secondary); font-size: 13px;">
                        <strong>路由:</strong> <a href="/${escapeHtml(view.route)}" target="_blank">/${escapeHtml(view.route)}</a>${isMain ? ' <span style="color: #d97706; font-size: 12px;">(同时作为根路径 / 的默认视图)</span>' : ''}
                    </p>
                    <p style="margin: 0; color: var(--text-secondary); font-size: 13px;">
                        <strong>显示分类:</strong> ${escapeHtml(cats) || '无'}
                    </p>
                </div>
                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    ${mainBtn}
                    <button class="btn btn-secondary btn-sm" onclick="editView('${view.id}')">✏️ 编辑</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteView('${view.id}')">🗑️ 删除</button>
                </div>
            </div>
        `;
    }).join('');
}

async function setMainView(id) {
    try {
        const response = await fetch('/api/views/' + id + '/set-main', { method: 'PUT' });
        if (response.ok) {
            showToast('已设为主视图', 'success');
            loadViews();
        } else {
            const error = await response.json();
            showToast(error.error || '设置失败', 'error');
        }
    } catch (error) {
        showToast('设置失败', 'error');
    }
}

async function clearMainView() {
    try {
        const response = await fetch('/api/views/clear-main', { method: 'DELETE' });
        if (response.ok) {
            showToast('已取消主视图，根路径将显示所有标记', 'success');
            loadViews();
        } else {
            showToast('操作失败', 'error');
        }
    } catch (error) {
        showToast('操作失败', 'error');
    }
}

function openViewForm(viewId = null) {
    const modal = document.getElementById('viewFormModal');
    const form = document.getElementById('viewForm');
    const title = document.getElementById('viewFormTitle');
    const container = document.getElementById('viewCategoriesContainer');

    form.reset();
    document.getElementById('viewId').value = viewId || '';

    // Render checkboxes based on iconTypes using grid cards
    container.innerHTML = Object.entries(iconTypes)
        .sort((a, b) => (a[1].order || 999) - (b[1].order || 999))
        .map(([key, type]) => {
            const color = type.color || '#9e9e9e';
            const iconHtml = getMarkerIconSVG(key);
            return `
                <div class="icon-category-card" data-value="${key}" onclick="this.classList.toggle('selected'); const cb = this.querySelector('input'); cb.checked = !cb.checked;">
                    <input type="checkbox" name="viewCategories" value="${key}" style="display: none;">
                    <div class="icon-category-icon" style="background: ${color}1a; color: ${color};">${iconHtml}</div>
                    <div class="icon-category-name" style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; text-align: center;">${escapeHtml(type.name)}</div>
                </div>
            `;
        }).join('');

    if (viewId) {
        title.textContent = '编辑视图';
        const view = viewsData.find(v => v.id === viewId);
        if (view) {
            document.getElementById('viewName').value = view.name || '';
            document.getElementById('viewRoute').value = view.route || '';
            const checkboxes = form.querySelectorAll('input[name="viewCategories"]');
            checkboxes.forEach(cb => {
                if ((view.categories || []).includes(cb.value)) {
                    cb.checked = true;
                    if(cb.parentElement.classList.contains('icon-category-card')) {
                        cb.parentElement.classList.add('selected');
                    }
                }
            });
        }
    } else {
        title.textContent = '新增视图';
    }

    modal.style.display = 'flex';
}

async function saveView(e) {
    e.preventDefault();
    const id = document.getElementById('viewId').value;
    const name = document.getElementById('viewName').value.trim();
    const route = document.getElementById('viewRoute').value.trim();
    const checkboxes = document.querySelectorAll('input[name="viewCategories"]:checked');
    const categories = Array.from(checkboxes).map(cb => cb.value);

    // Validate route (letters, numbers, hyphens)
    if (!/^[a-zA-Z0-9-]+$/.test(route)) {
        showToast('路由格式无效，只能包含字母、数字和连字符', 'error');
        return;
    }
    
    // Prevent reserved routes
    const reserved = ['api', 'admin', 'uploads', 'data', 'public'];
    if (reserved.includes(route.toLowerCase())) {
        showToast('路由与系统保留关键字冲突，请换一个', 'error');
        return;
    }

    const data = { name, route, categories };

    try {
        const url = id ? '/api/views/' + id : '/api/views';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            showToast(id ? '视图已更新' : '视图已创建', 'success');
            document.getElementById('viewFormModal').style.display = 'none';
            loadViews();
        } else {
            const error = await response.json();
            showToast(error.error || '保存失败', 'error');
        }
    } catch (error) {
        showToast('保存失败', 'error');
    }
}

async function deleteView(id) {
    if (!confirm('确定要删除这个视图吗？这个操作不可恢复。')) return;

    try {
        const response = await fetch('/api/views/' + id, { method: 'DELETE' });
        if (response.ok) {
            showToast('视图已删除', 'success');
            loadViews();
        } else {
            showToast('删除失败', 'error');
        }
    } catch (error) {
        showToast('删除失败', 'error');
    }
}

window.editView = openViewForm;
window.deleteView = deleteView;
window.setMainView = setMainView;
window.clearMainView = clearMainView;

document.addEventListener('DOMContentLoaded', () => {
    const addViewBtn = document.getElementById('add-view-btn');
    if (addViewBtn) addViewBtn.addEventListener('click', () => openViewForm());

    const closeViewBtn = document.getElementById('closeViewForm');
    if (closeViewBtn) {
        closeViewBtn.addEventListener('click', () => {
            document.getElementById('viewFormModal').style.display = 'none';
        });
    }

    const viewForm = document.getElementById('viewForm');
    if (viewForm) viewForm.addEventListener('submit', saveView);

    const viewsMenuItem = document.querySelector('[data-tab="views"]');
    if (viewsMenuItem) {
        viewsMenuItem.addEventListener('click', () => {
            loadViews();
        });
    }
});

window.toggleAdminSidebar = function() {
    const sidebar = document.querySelector('.admin-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        const toggleBtn = document.getElementById('adminSidebarToggle');
        if (toggleBtn) {
            toggleBtn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
        }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    }
};
