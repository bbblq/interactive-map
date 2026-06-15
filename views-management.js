
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
        container.innerHTML = '<div class="empty-preview"><p>暂无视图，请点击"新增视图"创建</p></div>';
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
