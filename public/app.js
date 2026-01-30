// Map state
let mapData = null;
let markers = [];
let scale = 1;
let translateX = 0;
let translateY = 0;

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
let selectedCategory = null;
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
    other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`
};

let iconTypes = {};

// Initialize
async function init() {
    await loadSettings();
    await loadIconTypes();
    await loadMap();
    await loadMarkers();
    setupEventListeners();
    renderCategories(); // Call after all data is loaded
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
        markers = await response.json();
        renderMarkers();
        renderCategories(); // Update categories after markers are loaded
    } catch (error) {
        console.error('Failed to load markers:', error);
    }
}

// Center map (unchanged)
function centerMap() {
    const containerWidth = mapWrapper.offsetWidth;
    const containerHeight = mapWrapper.offsetHeight;
    const imgWidth = mapImg.naturalWidth;
    const imgHeight = mapImg.naturalHeight;

    // Calculate scale to fit
    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    scale = Math.min(scaleX, scaleY) * 0.9;

    // Center the image
    translateX = (containerWidth - imgWidth * scale) / 2;
    translateY = (containerHeight - imgHeight * scale) / 2;

    updateTransform();
}

// Update transform (unchanged)
function updateTransform() {
    mapImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    document.getElementById('zoomLevel').textContent = Math.round(scale * 100) + '%';
    updateMarkerScales();
}

// Update marker scales (位置由CSS百分比自动处理)
function updateMarkerScales() {
    const markerElements = markersContainer.querySelectorAll('.marker');
    markerElements.forEach((markerEl, index) => {
        const marker = markers[index];
        if (!marker) return;

        const markerScale = marker.scale || 1.0;

        // 文字标记：使用固定scale
        if (markerEl.classList.contains('marker-text-only')) {
            markerEl.style.transform = `translate(-50%, -50%) scale(${markerScale})`;
        } else {
            // 图标标记：由于Anchor设定在底部中心，使用-100% Y轴偏移
            markerEl.style.transform = `translate(-50%, -100%) scale(${markerScale})`;
        }
    });
}

// 保留旧函数名以兼容
function updateMarkerPositions() {
    updateMarkerScales();
}

// Render markers
function renderMarkers() {
    markersContainer.innerHTML = '';

    markers.forEach((marker, index) => {
        if (selectedCategory && marker.category !== selectedCategory) {
            return;
        }

        const markerEl = document.createElement('div');

        // 计算百分比位置
        const imgWidth = mapImg.naturalWidth || 1;
        const imgHeight = mapImg.naturalHeight || 1;
        const leftPercent = (marker.x / imgWidth) * 100;
        const topPercent = (marker.y / imgHeight) * 100;

        // 判断是否是文字标记
        if (marker.type === 'text') {
            markerEl.className = `marker marker-text-only ${marker.category || ''}${!showMarkers ? ' hidden' : ''}`;
            markerEl.style.left = leftPercent + '%';
            markerEl.style.top = topPercent + '%';
            const content = escapeHtml(marker.content || marker.label);
            markerEl.innerHTML = `<div class="text-label">${content}</div>`;
        } else {
            // 图标标记
            markerEl.className = `marker ${marker.category}${!showMarkers ? ' hidden' : ''}`;
            markerEl.style.left = leftPercent + '%';
            markerEl.style.top = topPercent + '%';

            let iconContent;
            const type = iconTypes[marker.category] || iconTypes.other;

            if (type && type.imageUrl) {
                // Custom Image
                iconContent = `<img src="${type.imageUrl}" style="width: 32px; height: 32px; object-fit: contain;">`;
            } else {
                // SVG Icon
                const svg = (type && SVG_ICONS[type.icon]) ? SVG_ICONS[type.icon] : SVG_ICONS.other;
                const color = (type && type.color) ? type.color : '#9e9e9e';
                iconContent = `<div style="color: ${color}; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">${svg}</div>`;
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
                        width: 32px; 
                        height: 32px; 
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
        }

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
        const isActive = selectedCategory === key;
        let iconHtml;
        if (cat.imageUrl) {
            iconHtml = `<img src="${cat.imageUrl}" style="width: 20px; height: 20px; object-fit: contain;">`;
        } else {
            const svg = SVG_ICONS[cat.icon] || SVG_ICONS.other;
            iconHtml = `<div style="width: 20px; height: 20px; color: ${cat.color};">${svg}</div>`;
        }

        return `
        <div class="category">
          <div class="category-header ${isActive ? 'active' : ''}" onclick="toggleCategory('${key}')" data-category="${key}">
            <div class="category-title">
              <span class="category-icon-wrapper">
                <span class="category-icon" style="display: flex; align-items: center; justify-content: center;">${iconHtml}</span>
                <span class="category-badge">${count}</span>
              </span>
              <span class="category-name">${cat.name}</span>
              <span class="category-count-text">${count}</span>
            </div>
          </div>
          <div class="category-items" id="category-${key}">
            ${markers.filter(m => m.category === key).map(m => `
              <div class="category-item" onclick="focusMarker('${m.id}')">
                ${m.label}
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
}

// Toggle category
function toggleCategory(category) {
    selectedCategory = selectedCategory === category ? null : category;
    renderMarkers();

    // Update visual state of all category headers
    const allHeaders = document.querySelectorAll('.category-header');
    allHeaders.forEach(header => {
        const headerCategory = header.getAttribute('data-category');
        if (headerCategory === selectedCategory) {
            header.classList.add('active');
        } else {
            header.classList.remove('active');
        }
    });
}

// Toggle markers visibility
window.toggleMarkers = function () {
    showMarkers = !showMarkers;
    renderMarkers();
    return showMarkers;
};

// Focus marker
function focusMarker(markerId) {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    // Center on marker
    const containerWidth = mapWrapper.offsetWidth;
    const containerHeight = mapWrapper.offsetHeight;

    translateX = containerWidth / 2 - marker.x * scale;
    translateY = containerHeight / 2 - marker.y * scale;

    updateTransform();

    // Show detail
    // setTimeout(() => {
    //     showMarkerDetail(marker);
    // }, 300);

    // Highlight the marker purely
    highlightMarker(marker.id);
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
    const results = markers.filter(marker => {
        return (
            marker.label?.toLowerCase().includes(query) ||
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

// Select search result
window.selectSearchResult = function (markerId) {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    // Close search results
    searchResults.classList.remove('active');
    searchInput.value = '';

    // Center on marker with适当的缩放
    const containerWidth = mapWrapper.offsetWidth;
    const containerHeight = mapWrapper.offsetHeight;

    // 如果当前缩放太小，放大到合适的比例
    if (scale < 0.8) {
        scale = 0.8;
    }

    translateX = containerWidth / 2 - marker.x * scale;
    translateY = containerHeight / 2 - marker.y * scale;

    updateTransform();

    // Highlight the marker
    highlightMarker(markerId);
};

// Highlight marker with animation
function highlightMarker(markerId) {
    const markerIndex = markers.findIndex(m => m.id === markerId);
    if (markerIndex === -1) return;

    const markerElements = markersContainer.querySelectorAll('.marker');
    const markerEl = markerElements[markerIndex];

    if (markerEl) {
        // Remove previous highlights
        markerElements.forEach(el => el.classList.remove('highlighted'));

        // Add highlight
        markerEl.classList.add('highlighted');

        // Remove highlight after animation
        setTimeout(() => {
            markerEl.classList.remove('highlighted');
        }, 4500);
    }
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

// Initialize app
init();
