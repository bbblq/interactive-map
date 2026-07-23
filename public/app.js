// Map state
let mapData = null;
let markers = [];
let scale = 1;
let translateX = 0;
let translateY = 0;
// 初始 fit-to-screen 时的缩放比例, 用作标记"屏幕尺寸"基准.
// 标记使用反向缩放 (1/scale 倍), 在任意缩放下都保持稳定的屏幕像素尺寸,
// 避免高分辨率地图下默认显示过小、缩放后又过大的问题.
let baseScale = 1;
// 全局前台标记尺寸倍数 (来自 settings.markerSizeMultiplier)
let globalMarkerSizeMultiplier = 1.0;

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
let isDragging = false;
let startX = 0;
let startY = 0;
let hiddenCategories = new Set(); // categories that are hidden
let expandedCategories = new Set(); // categories with expanded marker lists
let showMarkers = true; // 标记显示开关

// DOM elements
const mapWrapper = document.getElementById('mapWrapper');
const mapImage = document.getElementById('mapImage');
const mapImg = document.getElementById('mapImg');
const markersContainer = document.getElementById('markers');
const emptyState = document.getElementById('emptyState');
const zoomControls = document.getElementById('zoomControls');
const categoriesContainer = document.getElementById('categories');
const markerModal = document.getElementById('markerModal');
const modalTitle = document.getElementById('modalTitle');
const modalBody = document.getElementById('modalBody');
const closeModal = document.getElementById('closeModal');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');


// SVG Icons Library (Synced with Admin)
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
    wifi: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M8.5 8.5a5 5 0 0 0 0 7"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M5.5 5.5a10 10 0 0 0 0 13"/><path d="M18.5 5.5a10 10 0 0 1 0 13"/></svg>`,
    camera: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
};

const ARROW_PRESETS = {
    solid: '0,15 70,15 70,0 100,50 70,100 70,85 0,85',
    thin: '0,40 70,40 70,15 100,50 70,85 70,60 0,60',
    double: '0,50 15,15 35,15 35,0 65,0 65,15 85,15 100,50 85,85 65,85 65,100 35,100 35,85 15,85'
};

function computePolygonBBox(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    points.forEach(point => {
        if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) return;
        const x = Number(point.x);
        const y = Number(point.y);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    });
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

function getFillTextLayout(bbox, position) {
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
    return { x, y, textAnchor, dominantBaseline };
}

function buildShapeSvg(marker) {
    const shape = marker.shape || 'rect';
    const fill = marker.fillColor || '#4a90e2ff';
    const stroke = marker.strokeColor || '#222222ff';
    const strokeWidth = (marker.strokeWidth != null) ? marker.strokeWidth : 2;
    if (shape === 'circle') {
        return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="50" ry="50" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke"></ellipse></svg>`;
    }
    if (shape === 'arrow') {
        const points = ARROW_PRESETS[marker.arrowStyle || 'solid'] || ARROW_PRESETS.solid;
        const anchor = marker.anchor || 'tip';
        const transform = anchor === 'tip' ? 'translate(-50,0)' : anchor === 'tail' ? 'translate(50,0)' : '';
        return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow:visible"><g transform="${transform}"><polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polygon></g></svg>`;
    }
    return `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="0" y="0" width="100" height="100" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke"></rect></svg>`;
}

function buildFillMarkerSvg(marker) {
    const points = sanitizeFillPoints(marker.points);
    const bbox = computePolygonBBox(points);
    if (!bbox || points.length < 3) return '';
    const pointString = points.map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join(' ');
    const fill = marker.fillColor || '#4a90e280';
    const stroke = marker.strokeColor || '#222222ff';
    const strokeWidth = (marker.strokeWidth != null) ? marker.strokeWidth : 2;
    const content = marker.textContent || marker.label || '';
    const fontSize = marker.fontSize || 16;
    const textColor = marker.textColor || '#222222ff';
    const layout = getFillTextLayout(bbox, marker.textPosition);
    const viewBox = `${bbox.minX} ${bbox.minY} ${bbox.width} ${bbox.height}`;
    const text = content
        ? `<text x="${layout.x}" y="${layout.y}" text-anchor="${layout.textAnchor}" dominant-baseline="${layout.dominantBaseline}" fill="${textColor}" font-size="${fontSize}" font-weight="600" style="paint-order:stroke;stroke:#fff;stroke-opacity:.85;stroke-width:3px;stroke-linejoin:round;pointer-events:none;user-select:none">${escapeHtml(content)}</text>`
        : '';
    return `<svg class="fill-svg" viewBox="${viewBox}" preserveAspectRatio="none" style="overflow:visible"><polygon points="${pointString}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"></polygon>${text}</svg>`;
}

let iconTypes = {};
let currentView = null; // Global view state for Multi-View feature

// Initialize
async function init() {
    await loadViewConfig();
    await loadSettings();
    await loadIconTypes();
    await loadMap();
    await loadMarkers();
    setupEventListeners();
    renderCategories(); // Call after all data is loaded
}

async function loadViewConfig() {
    const route = window.location.pathname.replace(/^\/|\/$/g, '');
    if (route && route !== 'admin') {
        // Custom view path (e.g. /cctv)
        try {
            const response = await fetch('/api/view/' + route);
            if (response.ok) {
                currentView = await response.json();
            } else {
                console.warn('View not found, falling back to default map');
            }
        } catch (e) {
            console.error('Failed to load view config:', e);
        }
    } else if (!route) {
        // Root path — check if a main view is configured
        try {
            const response = await fetch('/api/view/__main__');
            if (response.ok) {
                currentView = await response.json();
            }
            // If 404, currentView stays null — show all markers
        } catch (e) {
            // Network error — show all markers
        }
    }
}

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const settings = await response.json();

        if (settings.title) {
            document.getElementById('headerTitle').textContent = settings.title;
            document.title = settings.title;
        }

        // 全局标记尺寸倍数, 默认 1.0
        if (settings.markerSizeMultiplier !== undefined && settings.markerSizeMultiplier !== null) {
            globalMarkerSizeMultiplier = settings.markerSizeMultiplier;
        }

        if (settings.logoUrl) {
            const logoImg = document.getElementById('headerLogo');
            const defaultIcon = document.getElementById('defaultLogoIcon');
            logoImg.src = settings.logoUrl;
            logoImg.style.display = 'block';
            defaultIcon.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Load icon types
async function loadIconTypes() {
    try {
        const response = await fetch('/api/icon-types');
        if (response.ok) {
            iconTypes = await response.json();
        }
    } catch (error) {
        console.error('Failed to load icon types:', error);
    }
}

// Load map (unchanged)
async function loadMap() {
    try {
        const response = await fetch('/api/map');
        mapData = await response.json();

        if (mapData.imageUrl) {
            mapImg.src = mapData.imageUrl;
            mapImg.style.display = 'block';
            emptyState.style.display = 'none';
            zoomControls.style.display = 'flex';

            mapImg.onload = () => {
                centerMap();
                renderMarkers(); // Re-render markers once image dimensions are known
            };
        } else {
            emptyState.style.display = 'flex';
            zoomControls.style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load map:', error);
    }
}



// Show marker detail
function showMarkerDetail(marker) {
    // Helper function to convert line breaks to <br> tags
    const nl2br = (str) => {
        if (!str) return '';
        return str.replace(/\n/g, '<br>');
    };

    if (marker.type === 'text') {
        // 文字标记
        modalTitle.textContent = marker.content || marker.label || '文字标记';

        if (marker.details) {
            // Render HTML content directly (from rich text editor)
            modalBody.innerHTML = `<div style="line-height: 1.6;">${marker.details}</div>`;
        } else {
            modalBody.innerHTML = '<p style="color: var(--text-secondary);">暂无详细信息</p>';
        }
    } else {
        // 图标标记
        const category = iconTypes[marker.category] || iconTypes.other;

        let iconDisplay;
        if (category.imageUrl) {
            iconDisplay = `<img src="${category.imageUrl}" style="width: 20px; height: 20px; vertical-align: middle;">`; // imageUrl is trusted for now

        } else {
            const svg = SVG_ICONS[category.icon] || SVG_ICONS.other;
            iconDisplay = `<span style="color: ${category.color}; display: inline-flex; width: 20px; height: 20px; vertical-align: middle;">${svg}</span>`;
        }

        modalTitle.textContent = marker.label;

        // 只显示已填写的字段
        let fields = [];
        fields.push(`<p><strong>类型</strong> ${iconDisplay} ${category.name}</p>`);

        // 详情(富文本) - 后台用所见即所得编辑器维护, 包含链接/加粗等格式.
        // HTML 由登录管理员写入, 视为可信; 与文字标记共用同一字段语义.
        if (marker.details && String(marker.details).trim()) {
            fields.push(`<div class="marker-rich-details" style="line-height: 1.6; margin: 12px 0; padding: 12px 14px; background: var(--bg-light); border-radius: 8px; border-left: 3px solid var(--primary-color);">${marker.details}</div>`);
        }

        if (marker.description) {
            fields.push(`<p><strong>描述</strong><br><span style="white-space: pre-wrap; line-height: 1.6;">${nl2br(escapeHtml(marker.description))}</span></p>`);
        }
        if (marker.department) {
            fields.push(`<p><strong>部门</strong> ${escapeHtml(marker.department)}</p>`);
        }
        if (marker.phone) {
            fields.push(`<p><strong>电话</strong> ${escapeHtml(marker.phone)}</p>`);
        }
        if (marker.email) {
            fields.push(`<p><strong>邮箱</strong> ${escapeHtml(marker.email)}</p>`);
        }

        modalBody.innerHTML = fields.join('');
    }

    // 所有详情中的超链接都在新标签页打开, 避免覆盖地图主页面
    modalBody.querySelectorAll('a').forEach(a => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
    });

    markerModal.classList.add('active');
}



// Display search results
function displaySearchResults(results, query) {
    if (results.length === 0) {
        searchResults.innerHTML = '<div class="search-no-results">未找到匹配的标记</div>';
        searchResults.classList.add('active');
        return;
    }

    searchResults.innerHTML = results.map(marker => {
        const category = iconTypes[marker.category] || iconTypes.other;
        const metaParts = [];
        if (marker.department) metaParts.push(marker.department);
        if (marker.phone) metaParts.push(marker.phone);

        let iconHtml;
        if (category.imageUrl) {
            iconHtml = `<img src="${category.imageUrl}" style="width: 20px; height: 20px; object-fit: contain;">`;
        } else {
            const svg = (category && SVG_ICONS[category.icon]) ? SVG_ICONS[category.icon] : SVG_ICONS.other;
            const color = (category && category.color) ? category.color : '#9e9e9e';
            iconHtml = `<div style="color: ${color}; width: 20px; height: 20px;">${svg}</div>`;
        }

        return `
            <div class="search-result-item" onclick="selectSearchResult('${marker.id}')">
                <div class="search-result-icon">${iconHtml}</div>
                <div class="search-result-content">
                    <div class="search-result-title">${highlightText(marker.label, query)}</div>
                    ${metaParts.length > 0 ? `<div class="search-result-meta">${metaParts.join(' · ')}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');

    searchResults.classList.add('active');
}

// Load markers (unchanged)
async function loadMarkers() {
    try {
        const response = await fetch('/api/markers');
        let allMarkers = await response.json();
        
        // Filter markers if a custom view is active
        if (currentView && currentView.categories && currentView.categories.length > 0) {
            allMarkers = allMarkers.filter(m => currentView.categories.includes(m.category || 'other'));
        }
        
        markers = allMarkers;
        renderMarkers();
        renderCategories(); // Update categories after markers are loaded
    } catch (error) {
        console.error('Failed to load markers:', error);
    }
}

// Center map
function centerMap() {
    const containerWidth = mapWrapper.offsetWidth;
    const containerHeight = mapWrapper.offsetHeight;
    const imgWidth = mapImg.naturalWidth;
    const imgHeight = mapImg.naturalHeight;

    // Calculate scale to fit
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    scale = Math.min(scaleX, scaleY) * 0.9;
    baseScale = scale;

    // Center the image
    translateX = (containerWidth - imgWidth * scale) / 2;
    translateY = (containerHeight - imgHeight * scale) / 2;

    updateTransform();
}

// requestAnimationFrame 节流: 拖拽/滚轮事件高频触发时,
// 把多次 transform 更新合并到下一帧, 避免布局抖动
let transformRafId = null;
let transformDirty = false;
function scheduleTransform() {
    if (transformRafId !== null) return;
    transformRafId = requestAnimationFrame(() => {
        transformRafId = null;
        if (!transformDirty) return;
        transformDirty = false;
        mapImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        const zoomLabel = document.getElementById('zoomLevel');
        if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
        updateMarkerScales();
    });
}

function updateTransform() {
    transformDirty = true;
    scheduleTransform();
}

// 标记与地图等比缩放 (跟前台 / 后台 / 导出三处完全一致).
// 公式: targetSize = BASE * markerScale * sizeMul * scale
// 标记屏幕位置 = translateX/Y + marker.x/y * scale
// 源图上不重叠的标记, 视觉上也不重叠 (因为是等比缩放).
// 跟后台编辑器用同一套公式, 保证前/后/导出三方一致.
const MARKER_BASE_SIZE = 32; // 与 CSS 中 .marker-icon-part 原始宽高一致
const MARKER_FONT_BASE = 13; // 与 CSS 中 .marker-label-part 原始 font-size 一致
// 不锁死最小像素, 标记严格按几何等比缩放. 之前锁死 MIN_VIS_PX=8 时,
// 缩小地图会导致两个源图上分开但屏幕距离很小的 marker 互相入侵重叠.
// 源图不重叠 → 屏幕也绝不重叠 (等比缩放).

function updateMarkerTransforms() {
    if (!mapImg.naturalWidth) return;
    const sizeMul = globalMarkerSizeMultiplier || 1.0;

    for (let i = 0; i < markers.length; i++) {
        const marker = markers[i];
        const markerEl = markersContainer.querySelector(`.marker[data-marker-id="${CSS.escape(marker.id)}"]`);
        if (!marker || !markerEl) continue;

        const markerScale = marker.scale || 1.0;
        const rotation = marker.rotation || 0;
        const isText = marker.type === 'text';
        const isShape = marker.type === 'shape';
        const isFill = marker.type === 'fill';

        // 屏幕像素位置
        const screenX = translateX + marker.x * scale;
        const screenY = translateY + marker.y * scale;
        markerEl.style.left = screenX + 'px';
        markerEl.style.top = screenY + 'px';

        if (isText || isShape || isFill) {
            // 文字标记: 使用 100% 尺寸，通过 transform scale 整体进行等比缩放
            if (isFill) {
                const bbox = computePolygonBBox(sanitizeFillPoints(marker.points));
                markerEl.style.width = ((bbox ? bbox.width : 100) * markerScale * sizeMul) + 'px';
                markerEl.style.height = ((bbox ? bbox.height : 100) * markerScale * sizeMul) + 'px';
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
                    const baseFontPx = (marker.fontSize || 14) * sizeMul;
                    label.style.fontSize = baseFontPx + 'px';
                }
            }
            markerEl.style.transformOrigin = 'center center';
            markerEl.style.transform = `translate(-50%, -50%) rotate(${rotation}deg) scale(${scale})`;
        } else {
            // 图标标记: 使用 100% 尺寸，通过 transform scale 整体进行等比缩放
            const targetSize = MARKER_BASE_SIZE * markerScale * sizeMul;

            const iconPart = markerEl.querySelector('.marker-icon-part');
            if (iconPart) {
                iconPart.style.width = targetSize + 'px';
                iconPart.style.height = targetSize + 'px';
            }
            const labelPart = markerEl.querySelector('.marker-label-part');
            if (labelPart) {
                const fontPx = MARKER_FONT_BASE * (targetSize / MARKER_BASE_SIZE);
                labelPart.style.fontSize = fontPx + 'px';
                labelPart.style.paddingLeft = '4px';
                labelPart.style.paddingRight = '10px';
            }
            const capsule = markerEl.querySelector('.marker-capsule');
            if (capsule) {
                capsule.style.padding = '4px';
                capsule.style.borderRadius = '30px';
            }
            markerEl.style.transformOrigin = '50% 100%';
            markerEl.style.transform = `translate(-50%, -100%) rotate(${rotation}deg) scale(${scale})`;
        }
    }
}

// 保留旧函数名以兼容其他调用
function updateMarkerScales() {
    updateMarkerTransforms();
}

// 保留旧函数名以兼容
function updateMarkerPositions() {
    updateMarkerScales();
}

// Render markers
function renderMarkers() {
    markersContainer.innerHTML = '';

    markers.forEach((marker, index) => {
        const markerEl = document.createElement('div');

        // 不在这里设 left/top/width/height, 全部由 updateMarkerTransforms
        // 在屏幕像素坐标下重新计算, 保证 SVG/文字按最终屏幕像素栅格化, 矢量清晰

        // 判断是否是文字标记
        if (marker.type === 'text') {
            const textCat = marker.category || 'other';
            markerEl.className = `marker marker-text-only ${textCat}${!showMarkers ? ' hidden' : ''}${hiddenCategories.has(textCat) ? ' category-hidden' : ''}`;
            const content = escapeHtml(marker.content || marker.label);
            // 同步编辑器里设的颜色 (8 位 hex 含 alpha, CSS 原生支持)
            const textColor = marker.textColor || '';
            const bgColor = marker.bgColor || '';
            const borderColor = marker.borderColor || '';
            const borderWidth = (marker.borderWidth != null) ? marker.borderWidth : 1;
            const colorStyle = [
                'width:100%',
                'height:100%',
                'box-sizing:border-box',
                'display:flex',
                'align-items:center',
                'justify-content:center',
                textColor ? `color:${textColor}` : '',
                bgColor ? `background:${bgColor}` : '',
                (borderColor || borderWidth) ? `border:${borderWidth}px solid ${borderColor || '#cccccc'}` : ''
            ].filter(Boolean).join(';');
            markerEl.innerHTML = `<div class="text-label" style="${colorStyle}">${content}</div>`;
        } else if (marker.type === 'shape') {
            const shapeCat = marker.category || 'other';
            markerEl.className = `marker marker-shape ${shapeCat}${!showMarkers ? ' hidden' : ''}${hiddenCategories.has(shapeCat) ? ' category-hidden' : ''}`;
            markerEl.innerHTML = buildShapeSvg(marker);
        } else if (marker.type === 'fill') {
            const fillCat = marker.category || 'other';
            markerEl.className = `marker marker-fill ${fillCat}${!showMarkers ? ' hidden' : ''}${hiddenCategories.has(fillCat) ? ' category-hidden' : ''}`;
            markerEl.innerHTML = buildFillMarkerSvg(marker);
        } else {
            // 图标标记
            const iconCat = marker.category || 'other';
            markerEl.className = `marker ${iconCat}${!showMarkers ? ' hidden' : ''}${hiddenCategories.has(iconCat) ? ' category-hidden' : ''}`;

            let iconContent;
            const type = iconTypes[marker.category] || iconTypes.other;

            if (type && type.imageUrl) {
                // Custom Image - 用 100% 填充父容器, 父容器尺寸由 updateMarkerTransforms 控制
                iconContent = `<img src="${type.imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">`;
            } else {
                // SVG Icon
                const svg = (type && SVG_ICONS[type.icon]) ? SVG_ICONS[type.icon] : SVG_ICONS.other;
                const color = (type && type.color) ? type.color : '#9e9e9e';
                iconContent = `<div style="color: ${color}; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">${svg}</div>`;
            }

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
                    <div class="marker-icon-part" style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    ">
                        ${iconContent}
                    </div>
                    ${marker.showLabel !== false ? `
                        <div class="marker-label-part" style="
                            padding-left: 4px;
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

        markerEl.dataset.markerId = marker.id;
        // 层级 (Z-Order): 大数字覆盖在上面
        markerEl.style.zIndex = parseInt(marker.zIndex, 10) || 0;

        markerEl.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('Marker clicked:', {
                type: marker.type,
                label: marker.label || marker.content,
                showDetails: marker.showDetails,
                hasDetails: !!marker.details
            });
            // Only show details if showDetails is true
            if (marker.showDetails === true) {
                console.log('Showing marker detail');
                showMarkerDetail(marker);
            } else {
                console.log('Not showing detail - showDetails is not enabled');
            }
        });

        markersContainer.appendChild(markerEl);
    });

    updateMarkerScales();
}

const EYE_ON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// Render categories
function renderCategories() {
    const categoryCounts = {};
    if (Object.keys(iconTypes).length === 0) return;

    // Count markers
    markers.forEach(m => {
        const cat = m.category || 'other';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Filter categories: only show those with markers AND showInSidebar = true
    const categoriesWithMarkers = Object.entries(iconTypes)
        .filter(([key, cat]) => {
            const hasMarkers = (categoryCounts[key] || 0) > 0;
            const showInSidebar = cat.showInSidebar !== false; // Default to true if not specified
            return hasMarkers && showInSidebar;
        })
        // Sort by order field
        .sort((a, b) => {
            const orderA = a[1].order || 999;
            const orderB = b[1].order || 999;
            return orderA - orderB;
        });

    categoriesContainer.innerHTML = categoriesWithMarkers.map(([key, cat]) => {
        const count = categoryCounts[key] || 0;
        const isHidden = hiddenCategories.has(key);
        const isExpanded = expandedCategories.has(key);
        let iconHtml;
        if (cat.imageUrl) {
            iconHtml = `<img src="${cat.imageUrl}" style="width: 20px; height: 20px; object-fit: contain;">`;
        } else {
            const svg = SVG_ICONS[cat.icon] || SVG_ICONS.other;
            iconHtml = `<div style="width: 20px; height: 20px; color: ${cat.color};">${svg}</div>`;
        }

        return `
        <div class="category">
          <div class="category-header ${isHidden ? 'cat-hidden' : ''}" data-category="${key}">
            <div class="category-left" onclick="toggleCategoryExpand('${key}')">
              <span class="category-expand-arrow ${isExpanded ? 'expanded' : ''}">▶</span>
              <span class="category-icon-wrapper">
                <span class="category-icon" style="display: flex; align-items: center; justify-content: center; cursor: pointer;">${iconHtml}</span>
                <span class="category-badge">${count}</span>
              </span>
              <span class="category-name" style="cursor: pointer;">${cat.name}</span>
              <span class="category-count-text">${count}</span>
            </div>
            <button class="category-visibility-btn" onclick="event.stopPropagation(); toggleCategoryVisibility('${key}')" title="${isHidden ? '显示分类' : '隐藏分类'}">
              ${isHidden ? EYE_OFF_SVG : EYE_ON_SVG}
            </button>
          </div>
          <div class="category-items ${isExpanded ? 'expanded' : ''}" id="category-${key}">
            ${markers.filter(m => (m.category || 'other') === key).sort((a, b) => {
                const nameA = (a.label || a.content || '').toLowerCase();
                const nameB = (b.label || b.content || '').toLowerCase();
                return nameA.localeCompare(nameB, 'zh-CN', { numeric: true });
            }).map(m => {
                let displayName = m.label;
                if (m.type === 'text') {
                    displayName = m.content || m.label || '(未命名文字)';
                } else if (m.type === 'shape') {
                    const shapeNames = { rect: '矩形', circle: '圆形', arrow: '箭头' };
                    displayName = m.label || `(${shapeNames[m.shape] || '形状'})`;
                } else {
                    displayName = m.label || '(未命名)';
                }
                return `
              <div class="category-item" onclick="focusMarker('${m.id}')">
                ${escapeHtml(displayName)}
              </div>
            `}).join('')}
          </div>
        </div>
      `;
    }).join('');
}

// Toggle category visibility (show/hide markers of this category)
function toggleCategoryVisibility(category) {
    if (hiddenCategories.has(category)) {
        hiddenCategories.delete(category);
    } else {
        hiddenCategories.add(category);
    }
    updateCategoryVisuals();
    updateMarkerVisibility();
}
window.toggleCategoryVisibility = toggleCategoryVisibility;

// Toggle expand/collapse of category's marker list
function toggleCategoryExpand(category) {
    if (expandedCategories.has(category)) {
        expandedCategories.delete(category);
    } else {
        expandedCategories.add(category);
    }
    updateCategoryVisuals();
}
window.toggleCategoryExpand = toggleCategoryExpand;

function showAllCategories() {
    hiddenCategories.clear();
    updateCategoryVisuals();
    updateMarkerVisibility();
}
window.showAllCategories = showAllCategories;

function hideAllCategories() {
    Object.keys(iconTypes).forEach(key => hiddenCategories.add(key));
    updateCategoryVisuals();
    updateMarkerVisibility();
}
window.hideAllCategories = hideAllCategories;

// Update visual state of category headers without full re-render
function updateCategoryVisuals() {
    document.querySelectorAll('.category').forEach(catEl => {
        const header = catEl.querySelector('.category-header');
        const key = header?.getAttribute('data-category');
        if (!key) return;

        const isHidden = hiddenCategories.has(key);
        const isExpanded = expandedCategories.has(key);

        header.classList.toggle('cat-hidden', isHidden);

        const arrow = header.querySelector('.category-expand-arrow');
        if (arrow) {
            arrow.classList.toggle('expanded', isExpanded);
        }

        const items = catEl.querySelector('.category-items');
        if (items) {
            items.classList.toggle('expanded', isExpanded);
        }

        const eyeBtn = header.querySelector('.category-visibility-btn');
        if (eyeBtn) {
            eyeBtn.innerHTML = isHidden ? EYE_OFF_SVG : EYE_ON_SVG;
            eyeBtn.title = isHidden ? '显示分类' : '隐藏分类';
        }
    });
}

// Update marker visibility without full re-render (just toggle class)
// 关键: 文字标记可能没设 category, 但被 renderCategories() 归到 'other' 显示.
// 这里用同一个 fallback ('其他' -> 'other') 跟 sidebar 状态对得上, 眼睛按钮才有效.
function updateMarkerVisibility() {
    markers.forEach(marker => {
        const markerEl = markersContainer.querySelector(`.marker[data-marker-id="${CSS.escape(marker.id)}"]`);
        if (!markerEl) return;
        const cat = marker.category || 'other';
        markerEl.classList.toggle('category-hidden', hiddenCategories.has(cat));
    });
}

// Toggle markers visibility
window.toggleMarkers = function () {
    showMarkers = !showMarkers;
    renderMarkers();
    return showMarkers;
};

// Focus marker - 带动画聚焦放大
function focusMarker(markerId) {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    animateToMarker(marker, () => {
        highlightMarker(marker.id);
    });
}



// Setup event listeners
function setupEventListeners() {
    // Sidebar toggle
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('expanded');
        sidebarToggle.textContent = sidebar.classList.contains('expanded') ? '←' : '→';

        // Update badge visibility based on sidebar state
        const badge = document.querySelector('.sidebar-badge');
        if (badge) {
            if (sidebar.classList.contains('expanded')) {
                badge.style.display = 'none';
            } else {
                badge.style.display = 'flex';
            }
        }
    });

    // Search functionality
    searchInput.addEventListener('input', handleSearch);
    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim()) {
            searchResults.classList.add('active');
        }
    });

    // Close search results when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });

    // Zoom controls
    document.getElementById('zoomIn').addEventListener('click', () => {
        zoom(1.1);
    });

    document.getElementById('zoomOut').addEventListener('click', () => {
        zoom(0.9);
    });

    document.getElementById('resetZoom').addEventListener('click', () => {
        centerMap();
    });

    // Mouse wheel zoom
    mapWrapper.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.85 : 1.15;
        zoom(delta, e.clientX, e.clientY);
    });

    // Drag to pan
    mapWrapper.addEventListener('mousedown', startDrag);
    mapWrapper.addEventListener('mousemove', drag);
    mapWrapper.addEventListener('mouseup', endDrag);
    mapWrapper.addEventListener('mouseleave', endDrag);

    // Touch support
    mapWrapper.addEventListener('touchstart', handleTouchStart);
    mapWrapper.addEventListener('touchmove', handleTouchMove);
    mapWrapper.addEventListener('touchend', endDrag);

    // Modal
    closeModal.addEventListener('click', () => {
        markerModal.classList.remove('active');
    });

    markerModal.addEventListener('click', (e) => {
        if (e.target === markerModal) {
            markerModal.classList.remove('active');
        }
    });
}

// Search handler
function handleSearch(e) {
    const query = e.target.value.trim().toLowerCase();

    if (!query) {
        searchResults.classList.remove('active');
        return;
    }

    // Filter markers based on search query
    // 同时匹配标签名/描述/部门/电话/邮箱, 以及标记的分类中文名/英文 icon 名
    const results = markers.filter(marker => {
        const cat = iconTypes[marker.category];
        const categoryName = (cat && cat.name) || '';
        const categoryIcon = (cat && cat.icon) || '';
        return (
            marker.label?.toLowerCase().includes(query) ||
            categoryName.toLowerCase().includes(query) ||
            categoryIcon.toLowerCase().includes(query) ||
            marker.description?.toLowerCase().includes(query) ||
            marker.department?.toLowerCase().includes(query) ||
            marker.phone?.includes(query) ||
            marker.email?.toLowerCase().includes(query)
        );
    });

    displaySearchResults(results, query);
}



// Highlight matching text
function highlightText(text, query) {
    if (!text) return '';
    const escapedText = escapeHtml(text);
    if (!query) return escapedText;
    const regex = new RegExp(`(${query})`, 'gi');
    return escapedText.replace(regex, '<strong style="color: var(--primary-color);">$1</strong>');
}

// Select search result - 带动画聚焦放大
window.selectSearchResult = function (markerId) {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    // Close search results
    searchResults.classList.remove('active');
    searchInput.value = '';

    animateToMarker(marker, () => {
        highlightMarker(markerId);
    });
};

// Highlight marker with animation
// 用 data-marker-id 精确查找, 不要用 DOM 索引:
// 筛选/搜索会让 renderMarkers 清空后只重渲染可见标记, DOM 顺序和 markers 数组不一致.
function highlightMarker(markerId) {
    const allMarkerEls = markersContainer.querySelectorAll('.marker');
    // 先移除所有高亮, 再给目标加
    allMarkerEls.forEach(el => {
        if (el.classList.contains('highlighted')) {
            el.classList.remove('highlighted');
        }
    });

    // 用 [data-marker-id="..."] 精确匹配, 不依赖 DOM 顺序
    const markerEl = markersContainer.querySelector(`.marker[data-marker-id="${CSS.escape(markerId)}"]`);
    if (markerEl) {
        markerEl.classList.add('highlighted');
        setTimeout(() => {
            markerEl.classList.remove('highlighted');
        }, 4500);
    }
}

// 聚焦动画: 平滑地缩放并平移到目标标记位置
let animationFrameId = null;
function animateToMarker(marker, onComplete) {
    // 取消之前的动画
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    const containerWidth = mapWrapper.offsetWidth;
    const containerHeight = mapWrapper.offsetHeight;

    // 目标缩放: 固定放大到 baseScale * 3, 保证每次聚焦效果一致, 不会越点越大
    const fromScale = scale;
    const targetScale = Math.min(5, Math.max(baseScale * 3, 0.8));

    // 目标平移: 将标记居中
    const targetTranslateX = containerWidth / 2 - marker.x * targetScale;
    const targetTranslateY = containerHeight / 2 - marker.y * targetScale;

    const fromTranslateX = translateX;
    const fromTranslateY = translateY;

    const duration = 600; // ms
    const startTime = performance.now();

    // easeInOutCubic
    function ease(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const t = ease(progress);

        scale = fromScale + (targetScale - fromScale) * t;
        translateX = fromTranslateX + (targetTranslateX - fromTranslateX) * t;
        translateY = fromTranslateY + (targetTranslateY - fromTranslateY) * t;

        // 直接更新 (不走 scheduleTransform 的 dirty 机制, 保证每帧刷新)
        mapImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
        const zoomLabel = document.getElementById('zoomLevel');
        if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
        updateMarkerScales();

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(step);
        } else {
            animationFrameId = null;
            if (onComplete) onComplete();
        }
    }

    animationFrameId = requestAnimationFrame(step);
}

// Zoom function
function zoom(factor, centerX, centerY) {
    const oldScale = scale;
    scale *= factor;
    scale = Math.max(0.1, Math.min(scale, 5));

    if (centerX !== undefined && centerY !== undefined) {
        const rect = mapWrapper.getBoundingClientRect();
        const x = centerX - rect.left;
        const y = centerY - rect.top;

        translateX = x - (x - translateX) * (scale / oldScale);
        translateY = y - (y - translateY) * (scale / oldScale);
    }

    updateTransform();
}

// Drag functions
function startDrag(e) {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    mapWrapper.classList.add('grabbing');
}

function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
}

function endDrag() {
    isDragging = false;
    mapWrapper.classList.remove('grabbing');
}

// Touch support
let touchStartX = 0;
let touchStartY = 0;
let initialPinchDistance = 0;
let initialScale = 1;

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        // Single finger drag
        const touch = e.touches[0];
        isDragging = true;
        touchStartX = touch.clientX - translateX;
        touchStartY = touch.clientY - translateY;
    } else if (e.touches.length === 2) {
        // Two fingers pinch
        isDragging = false;
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialPinchDistance = getDistance(touch1, touch2);
        initialScale = scale;
    }
}

function handleTouchMove(e) {
    e.preventDefault(); // Default prevented for the map wrapper interaction

    if (e.touches.length === 1 && isDragging) {
        // Single finger drag
        const touch = e.touches[0];
        translateX = touch.clientX - touchStartX;
        translateY = touch.clientY - touchStartY;
        updateTransform();
    } else if (e.touches.length === 2) {
        // Two fingers pinch
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = getDistance(touch1, touch2);

        if (initialPinchDistance > 0) {
            const center = getCenter(touch1, touch2);
            // Calculate new scale based on pinch ratio
            const scaleFactor = currentDistance / initialPinchDistance;
            
            // Calculate zoom relative to the center of the pinch
            // Current viewport position relative to map origin
            const rect = mapWrapper.getBoundingClientRect();
            const pinchCenterX = center.x - rect.left;
            const pinchCenterY = center.y - rect.top;

            // Apply new scale
            const newScale = Math.max(0.1, Math.min(initialScale * scaleFactor, 5));
            
            // Adjust translation to keep pinch center fixed
            if (newScale !== scale) {
                translateX = pinchCenterX - (pinchCenterX - translateX) * (newScale / scale);
                translateY = pinchCenterY - (pinchCenterY - translateY) * (newScale / scale);
                scale = newScale;
                updateTransform();
            }
        }
    }
}

// Helper to calculate distance between two points
function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper to calculate center between two points
function getCenter(touch1, touch2) {
    return {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2
    };
}


// ============================================
// 导出功能 (Export Map as JPG)
// ============================================
//
// 设计要点:
//   1. 范围 (range): viewport = 当前屏幕视野; full = 原图全幅
//   2. 筛选: 只导出前台"可见"的标记 - 即 showMarkers=true 且类别不在 hiddenCategories
//   3. 标记信息: 文字标记导出"content" 字段, 图标标记导出"label" 字段
//   4. 坐标系转换: 屏幕坐标 (translateX + marker.x * scale) 映射到源坐标
//   5. JPG: 用 canvas 把地图背景 + 标记一起画成位图, toBlob 导出
//
// 注意事项:
//   - 导出过程不阻塞 UI (用 setTimeout 让进度可见)
//   - 高分辨率原图 (e.g. 4000x3000) 画到 canvas 可能 OOM, 需要降采样

let exportRange = 'viewport';
let exportFormat = 'jpg';

function openExportModal() {
    document.getElementById('exportModal').classList.add('active');
    setExportStatus('', '');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.remove('active');
}

function setExportStatus(text, kind) {
    const el = document.getElementById('exportStatus');
    el.textContent = text || '';
    el.className = 'export-status' + (kind ? ' ' + kind : '');
}

// 筛选"前台可见"的标记
// 隐藏规则 (跟 updateMarkerVisibility 保持一致):
//   - showMarkers = false => 全部隐藏
//   - hiddenCategories.has(marker.category || 'other') => 该类别隐藏
//     文字标记可能没设 category, 跟 sidebar 一致归到 'other'
function getVisibleMarkers() {
    if (!showMarkers) return [];
    return markers.filter(m => !hiddenCategories.has(m.category || 'other'));
}

// 准备导出: 直接用 html2canvas 拍前台 DOM (mapWrapper 当前显示状态)
// 返回 { canvas, visibleMarkers, outW, outH }
//   - canvas: 拍下来的位图 (跟用户在前台看到的一致)
//   - visibleMarkers: 前台"可见"的标记列表
//   - outW, outH: 输出尺寸
//
// 原理: 不用 canvas API 重新画 (必然跟 DOM 不一致), 直接用 html2canvas 序列化 DOM 节点.
// 跟用户"截图前台"行为完全一致.
async function renderExportCanvas(range) {
    if (!mapImg.naturalWidth) throw new Error('地图未加载');
    if (typeof html2canvas !== 'function') throw new Error('html2canvas 未加载');

    const wrapperW = mapWrapper.offsetWidth;
    const wrapperH = mapWrapper.offsetHeight;

    // 提前附加 .is-exporting 类以清空阴影，并确保在 html2canvas 运行前浏览器已完成 Layout / 样式计算
    mapWrapper.classList.add('is-exporting');

    // "完整地图" 模式: 临时把整个源图缩放到 viewport 大小, 拍完恢复
    // 否则拍出来的只是当前视野 (跟 viewport 模式一样)
    let savedState = null;
    let exportScale = 2;
    if (range === 'full') {
        const srcW = mapImg.naturalWidth;
        const srcH = mapImg.naturalHeight;
        // 临时把地图缩放到 fit wrapper, 居中显示
        const tmpScale = Math.min(wrapperW / srcW, wrapperH / srcH);
        const tmpTx = (wrapperW - srcW * tmpScale) / 2;
        const tmpTy = (wrapperH - srcH * tmpScale) / 2;
        savedState = {
            scale,
            translateX,
            translateY,
            mapImageTransform: mapImage.style.transform
        };
        // 直接改全局 scale/translate, 让 updateTransform 同步 mapImage.transform + markers 位置
        scale = tmpScale;
        translateX = tmpTx;
        translateY = tmpTy;
        updateTransform();
        // 等 transform 跟 markers 都更新完 (两个 raf: 一个 scheduleTransform 的, 一个浏览器 layout)
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        exportScale = Math.max(2, 1 / tmpScale);
    } else {
        // 即使是可见视野模式，也需要等待一帧以确保 .is-exporting 的 CSS 样式在浏览器中渲染生效
        await new Promise(r => requestAnimationFrame(r));
    }

    let canvas;
    try {
        canvas = await html2canvas(mapWrapper, {
            backgroundColor: '#ffffff',
            // scale: 让导出位图更清晰 (满图时还原到真实分辨率，可见区域为2倍)
            scale: exportScale,
            // 不要截到 markersContainer 之外的东西 (如搜索栏 overlay), 但 mapWrapper 本身已经只装地图
            logging: false,
            useCORS: true,
            allowTaint: false
        });
    } finally {
        mapWrapper.classList.remove('is-exporting');
        // 恢复 scale/translate/transform
        if (savedState) {
            scale = savedState.scale;
            translateX = savedState.translateX;
            translateY = savedState.translateY;
            updateTransform();
        }
    }

    const visibleMarkers = getVisibleMarkers();

    return {
        canvas,
        visibleMarkers,
        outW: canvas.width,
        outH: canvas.height,
        range
    };
}

// ============ JPG 导出 ============
// 把 canvas 编码为 JPEG 并触发下载
function exportAsJpg(exportData) {
    return new Promise((resolve, reject) => {
        exportData.canvas.toBlob(blob => {
            if (!blob) return reject(new Error('canvas 编码失败'));
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `office-map-${ts}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            resolve();
        }, 'image/jpeg', 0.92);
    });
}

// ============ PDF 导出 ============
// 三层结构: 地图底图(位图) + SVG图标(矢量) / 上传图标(位图) + 文字标签(可搜索文字层)

let pdfFontBase64 = null;
let pdfFontName = 'Helvetica';

function arrayBufferToBase64(buffer) {
    const uint8 = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < uint8.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

async function loadPdfFont() {
    if (pdfFontBase64) return;
    const resp = await fetch('/fonts/NotoSansSC-Regular.ttf', { cache: 'force-cache' });
    if (!resp.ok) {
        throw new Error('PDF 中文字体缺失，无法安全导出（HTTP ' + resp.status + '）');
    }
    const ab = await resp.arrayBuffer();
    const signature = Array.from(new Uint8Array(ab, 0, 4))
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
    if (ab.byteLength < 1024 || !['00010000', '4f54544f', '74727565'].includes(signature)) {
        throw new Error('PDF 中文字体文件无效，已停止导出');
    }
    pdfFontBase64 = arrayBufferToBase64(ab);
}

function registerPdfFont(doc) {
    if (!pdfFontBase64) throw new Error('PDF 中文字体尚未加载');
    try {
        doc.addFileToVFS('NotoSansSC-Regular.ttf', pdfFontBase64);
        doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal');
        doc.setFont('NotoSansSC');
        pdfFontName = 'NotoSansSC';
    } catch (error) {
        throw new Error('PDF 中文字体注册失败: ' + error.message);
    }
}

// 防御性 PDF 字体恢复: svg2pdf.js 的 doc.svg() 会污染 jsPDF 内部字体状态,
// 每次绘制文字前强制重新注册字体 (VFS + addFont + setFont), 确保中文不乱码.
function ensurePdfFont(doc) {
    if (!pdfFontBase64) throw new Error('PDF 中文字体尚未加载');
    try {
        doc.addFileToVFS('NotoSansSC-Regular.ttf', pdfFontBase64);
        doc.addFont('NotoSansSC-Regular.ttf', 'NotoSansSC', 'normal');
        doc.setFont('NotoSansSC');
    } catch (error) {
        throw new Error('PDF 中文字体恢复失败: ' + error.message);
    }
}

function loadImageAsync(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('图片加载失败'));
        img.src = url;
    });
}

function applyPdfColor(doc, colorStr, type) {
    if (!colorStr || colorStr === 'transparent') {
        doc.setGState(new doc.GState({opacity: 0}));
        return;
    }
    let r = 0, g = 0, b = 0, a = 1.0;
    if (colorStr.startsWith('#')) {
        let hex = colorStr.substring(1);
        if (hex.length === 3 || hex.length === 4) hex = hex.split('').map(c => c + c).join('');
        if (hex.length >= 6) {
            r = parseInt(hex.substring(0, 2), 16);
            g = parseInt(hex.substring(2, 4), 16);
            b = parseInt(hex.substring(4, 6), 16);
            if (hex.length === 8) a = parseInt(hex.substring(6, 8), 16) / 255;
        }
    } else if (colorStr.startsWith('rgba') || colorStr.startsWith('rgb')) {
        const parts = colorStr.match(/[\d.]+/g);
        if (parts && parts.length >= 3) {
            r = parseInt(parts[0], 10);
            g = parseInt(parts[1], 10);
            b = parseInt(parts[2], 10);
            if (parts.length >= 4) a = parseFloat(parts[3]);
        }
    } else {
        if (type === 'fill') doc.setFillColor(colorStr);
        else if (type === 'draw') doc.setDrawColor(colorStr);
        else doc.setTextColor(colorStr);
        doc.setGState(new doc.GState({opacity: 1}));
        return;
    }
    
    if (type === 'fill') doc.setFillColor(r, g, b);
    else if (type === 'draw') doc.setDrawColor(r, g, b);
    else doc.setTextColor(r, g, b);
    
    doc.setGState(new doc.GState({opacity: a}));
}

async function drawSvgToPdf(doc, svgString, x, y, width, height, color) {
    if (!doc.svg) { console.warn('PDF: svg2pdf.js 未加载'); return; }
    let svg = svgString;
    if (color) svg = svg.replace(/currentColor/g, color);
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
    if (svgDoc.querySelector('parsererror')) { console.warn('PDF: SVG 解析失败'); return; }
    const svgEl = svgDoc.documentElement;
    svgEl.setAttribute('width', String(width));
    svgEl.setAttribute('height', String(height));
    // 用 saveGraphicsState/restoreGraphicsState 包裹 SVG 渲染,
    // 隔离 svg2pdf.js 对 jsPDF 字体/颜色状态的破坏.
    try {
        doc.saveGraphicsState();
        await doc.svg(svgEl, { x, y, width, height });
        doc.restoreGraphicsState();
    } catch (e) {
        try { doc.restoreGraphicsState(); } catch (_) {}
        console.warn('PDF: SVG 渲染失败', e);
    }
}

async function drawIconMarkerPdf(doc, marker, mx, my, sizeMul, pdfH) {
    const markerScale = marker.scale || 1.0;
    const type = iconTypes[marker.category] || iconTypes.other || {};
    const baseUnit = markerScale * sizeMul;
    const iconSize = MARKER_BASE_SIZE * baseUnit;
    const fontSize = Math.max(6, MARKER_FONT_BASE * baseUnit);
    const padding = 4 * baseUnit;
    const hasLabel = marker.showLabel !== false && marker.label;
    const bgColor = type.bgColor || '#f8f9fa';
    const isTransparent = bgColor === 'transparent';
    const iconColor = (type && type.color) ? type.color : '#9e9e9e';
    const textColor = type.textColor || '#333333';

    ensurePdfFont(doc);
    doc.setFontSize(fontSize);
    const labelText = marker.label || '';
    const labelWidth = hasLabel ? doc.getTextWidth(labelText) : 0;
    const labelPadLeft = hasLabel ? 4 * baseUnit : 0;
    const labelPadRight = hasLabel ? 10 * baseUnit : 0;

    const capsuleW = padding + iconSize + (hasLabel ? labelPadLeft + labelWidth + labelPadRight : padding);
    const capsuleH = iconSize + 2 * padding;
    const borderRadius = Math.min(capsuleH / 2, 30 * baseUnit);
    const capsuleX = mx - capsuleW / 2;
    const capsuleY = my - capsuleH;

    const rotation = marker.rotation || 0;
    if (rotation !== 0) {
        doc.saveGraphicsState();
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const cx = mx;
        const cy = my - capsuleH / 2;
        const cy_pdf = pdfH - cy;
        const m = doc.Matrix(cos, -sin, sin, cos, cx - cx * cos - cy_pdf * sin, cy_pdf + cx * sin - cy_pdf * cos);
        doc.setCurrentTransformationMatrix(m);
    }

    if (!isTransparent) {
        applyPdfColor(doc, bgColor, 'fill');
        doc.roundedRect(capsuleX, capsuleY, capsuleW, capsuleH, borderRadius, borderRadius, 'F');
        doc.setGState(new doc.GState({opacity: 1}));
        
        applyPdfColor(doc, 'rgba(200,200,200,0.5)', 'draw');
        doc.setLineWidth(0.5);
        doc.roundedRect(capsuleX, capsuleY, capsuleW, capsuleH, borderRadius, borderRadius, 'S');
        doc.setGState(new doc.GState({opacity: 1}));
    }

    const iconX = capsuleX + padding;
    const iconY = capsuleY + padding;

    if (type.imageUrl) {
        try {
            const img = await loadImageAsync(type.imageUrl);
            doc.addImage(img, 'PNG', iconX, iconY, iconSize, iconSize);
        } catch (e) { console.warn('PDF: 自定义图标加载失败:', type.imageUrl); }
    } else {
        const svgKey = (type && type.icon) ? type.icon : 'other';
        const svgStr = SVG_ICONS[svgKey] || SVG_ICONS.other;
        if (svgStr) await drawSvgToPdf(doc, svgStr, iconX, iconY, iconSize, iconSize, iconColor);
    }

    if (hasLabel) {
        ensurePdfFont(doc);
        doc.setFontSize(fontSize);
        applyPdfColor(doc, textColor, 'text');
        const textX = iconX + iconSize + labelPadLeft;
        const textY = capsuleY + capsuleH / 2;
        doc.text(labelText, textX, textY, { baseline: 'middle' });
        doc.setGState(new doc.GState({opacity: 1}));
    }

    if (rotation !== 0) {
        doc.restoreGraphicsState();
    }
}

async function drawTextMarkerPdf(doc, marker, mx, my, sizeMul, pdfH) {
    const markerScale = marker.scale || 1.0;
    const baseW = (marker.width || (48 * markerScale)) * sizeMul;
    const baseH = (marker.height || (32 * markerScale)) * sizeMul;
    const fontSize = Math.max(6, (marker.fontSize || 14) * sizeMul);
    const rectX = mx - baseW / 2;
    const rectY = my - baseH / 2;

    const rotation = marker.rotation || 0;
    if (rotation !== 0) {
        doc.saveGraphicsState();
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const cy_pdf = pdfH - my;
        const m = doc.Matrix(cos, -sin, sin, cos, mx - mx * cos - cy_pdf * sin, cy_pdf + mx * sin - cy_pdf * cos);
        doc.setCurrentTransformationMatrix(m);
    }

    const bgColor = marker.bgColor || '';
    if (bgColor && bgColor !== 'transparent') {
        applyPdfColor(doc, bgColor, 'fill');
        doc.rect(rectX, rectY, baseW, baseH, 'F');
        doc.setGState(new doc.GState({opacity: 1}));
    }
    const borderColor = marker.borderColor || '';
    const borderWidth = (marker.borderWidth != null) ? marker.borderWidth * sizeMul : sizeMul;
    if (borderColor && borderColor !== 'transparent' && borderWidth > 0) {
        applyPdfColor(doc, borderColor, 'draw');
        doc.setLineWidth(borderWidth);
        doc.rect(rectX, rectY, baseW, baseH, 'S');
        doc.setGState(new doc.GState({opacity: 1}));
    }
    const content = marker.content || marker.label || '';
    const textColor = marker.textColor || '#333333';
    if (content) {
        ensurePdfFont(doc);
        doc.setFontSize(fontSize);
        applyPdfColor(doc, textColor, 'text');
        doc.text(content, mx, my, { align: 'center', baseline: 'middle' });
        doc.setGState(new doc.GState({opacity: 1}));
    }

    if (rotation !== 0) {
        doc.restoreGraphicsState();
    }
}

async function drawShapeMarkerPdf(doc, marker, mx, my, sizeMul, pdfH) {
    const markerScale = marker.scale || 1.0;
    const baseW = (marker.width || (48 * markerScale)) * sizeMul;
    const baseH = (marker.height || (32 * markerScale)) * sizeMul;
    const shapeX = mx - baseW / 2;
    const shapeY = my - baseH / 2;

    const rotation = marker.rotation || 0;
    if (rotation !== 0) {
        doc.saveGraphicsState();
        const rad = rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const cy_pdf = pdfH - my;
        const m = doc.Matrix(cos, -sin, sin, cos, mx - mx * cos - cy_pdf * sin, cy_pdf + mx * sin - cy_pdf * cos);
        doc.setCurrentTransformationMatrix(m);
    }

    const svgString = buildShapeSvg(marker);
    if (svgString) await drawSvgToPdf(doc, svgString, shapeX, shapeY, baseW, baseH, null);

    if (rotation !== 0) {
        doc.restoreGraphicsState();
    }
}

async function drawFillMarkerPdf(doc, marker, mx, my, sizeMul, pdfH) {
    const points = sanitizeFillPoints(marker.points);
    const bbox = computePolygonBBox(points);
    if (!bbox || points.length < 3) return;

    const markerScale = marker.scale || 1.0;
    const factor = markerScale * sizeMul;
    const scaledPoints = points.map(point => ({
        x: mx + point.x * factor,
        y: my + point.y * factor
    }));
    const firstPoint = scaledPoints[0];
    const vectors = [];
    for (let index = 1; index < scaledPoints.length; index++) {
        vectors.push([
            scaledPoints[index].x - scaledPoints[index - 1].x,
            scaledPoints[index].y - scaledPoints[index - 1].y
        ]);
    }

    const rotation = marker.rotation || 0;
    if (rotation !== 0) {
        doc.saveGraphicsState();
        const radians = rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const pdfCenterY = pdfH - my;
        const matrix = doc.Matrix(
            cos,
            -sin,
            sin,
            cos,
            mx - mx * cos - pdfCenterY * sin,
            pdfCenterY + mx * sin - pdfCenterY * cos
        );
        doc.setCurrentTransformationMatrix(matrix);
    }

    const fillColor = marker.fillColor || '#4a90e280';
    if (fillColor !== 'transparent') {
        applyPdfColor(doc, fillColor, 'fill');
        doc.lines(vectors, firstPoint.x, firstPoint.y, [1, 1], 'F', true);
        doc.setGState(new doc.GState({ opacity: 1 }));
    }

    const strokeColor = marker.strokeColor || '#222222ff';
    const strokeWidth = (marker.strokeWidth != null) ? marker.strokeWidth : 2;
    if (strokeColor !== 'transparent' && strokeWidth > 0) {
        applyPdfColor(doc, strokeColor, 'draw');
        doc.setLineWidth(Math.max(0.25, strokeWidth * sizeMul));
        doc.setLineJoin('round');
        doc.lines(vectors, firstPoint.x, firstPoint.y, [1, 1], 'S', true);
        doc.setGState(new doc.GState({ opacity: 1 }));
    }

    const content = marker.textContent || marker.label || '';
    if (content) {
        const layout = getFillTextLayout(bbox, marker.textPosition);
        const align = layout.textAnchor === 'start' ? 'left' : layout.textAnchor === 'end' ? 'right' : 'center';
        const baseline = layout.dominantBaseline === 'hanging' ? 'top' : layout.dominantBaseline === 'auto' ? 'bottom' : 'middle';
        ensurePdfFont(doc);
        doc.setFontSize(Math.max(6, (marker.fontSize || 16) * factor));
        applyPdfColor(doc, marker.textColor || '#222222ff', 'text');
        doc.text(content, mx + layout.x * factor, my + layout.y * factor, { align, baseline });
        doc.setGState(new doc.GState({ opacity: 1 }));
    }

    if (rotation !== 0) doc.restoreGraphicsState();
}

async function exportAsPdf(range) {
    if (!mapImg.naturalWidth) throw new Error('地图未加载');
    if (!window.jspdf) throw new Error('jsPDF 库未加载, 请检查网络连接');
    const { jsPDF } = window.jspdf;
    const srcW = mapImg.naturalWidth;
    const srcH = mapImg.naturalHeight;
    const sizeMul = globalMarkerSizeMultiplier || 1.0;

    let pdfW, pdfH, offsetX = 0, offsetY = 0;
    if (range === 'full') {
        pdfW = srcW; pdfH = srcH;
    } else {
        const wrapperW = mapWrapper.offsetWidth;
        const wrapperH = mapWrapper.offsetHeight;
        const vx = Math.max(0, -translateX / scale);
        const vy = Math.max(0, -translateY / scale);
        const vx2 = Math.min(srcW, (-translateX + wrapperW) / scale);
        const vy2 = Math.min(srcH, (-translateY + wrapperH) / scale);
        pdfW = vx2 - vx; pdfH = vy2 - vy;
        offsetX = vx; offsetY = vy;
    }
    if (pdfW <= 0 || pdfH <= 0) throw new Error('可见区域为空');

    const doc = new jsPDF({
        orientation: pdfW > pdfH ? 'landscape' : 'portrait',
        unit: 'pt', format: [pdfW, pdfH], compress: true
    });
    registerPdfFont(doc);

    // Layer 1: background
    setExportStatus('正在绘制地图底图...');
    await new Promise(r => setTimeout(r, 30));
    try {
        const bgCanvas = document.createElement('canvas');
        if (range === 'full') {
            bgCanvas.width = srcW; bgCanvas.height = srcH;
            bgCanvas.getContext('2d').drawImage(mapImg, 0, 0, srcW, srcH);
        } else {
            bgCanvas.width = Math.round(pdfW); bgCanvas.height = Math.round(pdfH);
            bgCanvas.getContext('2d').drawImage(mapImg, offsetX, offsetY, pdfW, pdfH, 0, 0, Math.round(pdfW), Math.round(pdfH));
        }
        doc.addImage(bgCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pdfW, pdfH);
    } catch (e) { console.warn('PDF: 地图底图绘制失败', e); }

    // Layer 2+3: markers
    const visibleMarkers = getVisibleMarkers().slice();
    visibleMarkers.sort((a, b) => {
        const zA = parseInt(a.zIndex, 10) || 0;
        const zB = parseInt(b.zIndex, 10) || 0;
        return zA - zB;
    });
    const total = visibleMarkers.length;
    let drawn = 0;
    for (const marker of visibleMarkers) {
        const mx = marker.x - offsetX;
        const my = marker.y - offsetY;
        if (mx < -300 || mx > pdfW + 300 || my < -300 || my > pdfH + 300) continue;
        try {
            if (marker.type === 'text') await drawTextMarkerPdf(doc, marker, mx, my, sizeMul, pdfH);
            else if (marker.type === 'shape') await drawShapeMarkerPdf(doc, marker, mx, my, sizeMul, pdfH);
            else if (marker.type === 'fill') await drawFillMarkerPdf(doc, marker, mx, my, sizeMul, pdfH);
            else await drawIconMarkerPdf(doc, marker, mx, my, sizeMul, pdfH);
            drawn++;
            if (drawn % 10 === 0) {
                setExportStatus(`正在绘制标记 (${drawn}/${total})...`);
                await new Promise(r => setTimeout(r, 10));
            }
        } catch (e) { console.warn('PDF: 标记绘制失败:', marker.id, e); }
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    doc.save(`office-map-${ts}.pdf`);
    return { visibleMarkers, outW: Math.round(pdfW), outH: Math.round(pdfH) };
}

// ============ 主入口 ============
async function performExport() {
    const range = exportRange;
    const format = exportFormat;
    const confirmBtn = document.getElementById('exportConfirmBtn');
    const cancelBtn = document.getElementById('exportCancelBtn');
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    setExportStatus('正在准备...');

    try {
        await new Promise(r => setTimeout(r, 50));
        if (format === 'pdf') {
            setExportStatus('正在加载字体...');
            await loadPdfFont();
            await new Promise(r => setTimeout(r, 50));
            setExportStatus('正在生成 PDF...');
            await new Promise(r => setTimeout(r, 50));
            const result = await exportAsPdf(range);
            const mc = result.visibleMarkers.length;
            setExportStatus(`✓ PDF 导出完成 (${result.outW}×${result.outH}, ${mc} 个标记)`, 'success');
        } else {
            setExportStatus('正在加载图标...');
            await new Promise(r => setTimeout(r, 50));
            const exportData = await renderExportCanvas(range);
            const mc = exportData.visibleMarkers.length;
            setExportStatus(`正在生成 JPG (${exportData.outW}×${exportData.outH}, ${mc} 个标记)...`);
            await new Promise(r => setTimeout(r, 50));
            await exportAsJpg(exportData);
            setExportStatus(`✓ 导出完成 (${mc} 个标记)`, 'success');
        }
        setTimeout(() => closeExportModal(), 1500);
    } catch (err) {
        console.error('Export failed:', err);
        setExportStatus(`✗ 导出失败: ${err.message}`, 'error');
    } finally {
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
    }
}

// 绑定导出按钮事件
function setupExportButton() {
    const btn = document.getElementById('exportBtn');
    const modal = document.getElementById('exportModal');
    const cancelBtn = document.getElementById('exportCancelBtn');
    const confirmBtn = document.getElementById('exportConfirmBtn');
    const rangeGrid = document.getElementById('exportRangeGrid');
    const formatGrid = document.getElementById('exportFormatGrid');

    btn.addEventListener('click', openExportModal);
    cancelBtn.addEventListener('click', closeExportModal);
    confirmBtn.addEventListener('click', performExport);

    // 点击 backdrop 关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeExportModal();
    });

    // 格式选择 (JPG / PDF)
    if (formatGrid) {
        formatGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.export-format-card');
            if (!card) return;
            exportFormat = card.dataset.format;
            formatGrid.querySelectorAll('.export-format-card').forEach(c => c.classList.toggle('selected', c === card));
        });
    }

    // 范围选择
    rangeGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.export-range-card');
        if (!card) return;
        exportRange = card.dataset.range;
        rangeGrid.querySelectorAll('.export-range-card').forEach(c => c.classList.toggle('selected', c === card));
    });
}

// Initialize app
init();
setupExportButton();

