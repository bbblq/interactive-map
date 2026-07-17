# 互动地图系统 (Interactive Map)

一个基于 Node.js + Express 的通用互动地图系统，支持高精度标记编辑、矢量级缩放、分类筛选、富文本详情、一键导出 (PNG/JPG) 与 Docker 一键部署。适用于办公室地图、校园导览、展会布局等多种场景。

**版本**: v1.6.2 | **Node.js**: ≥18.0.0 | **许可证**: MIT | **Docker Hub**: `bbblq/interactive-map`

---

## ✨ 功能特点

### 🗺️ 交互式地图与高精度缩放
- **零延迟缩放体验**: 移除地图缩放和平移的 CSS 过渡延迟，实现"手随心动"的即时交互感。
- **标记与地图严格等比缩放 (v1.3.0)**: 文字 / 图标标记 100% 按几何等比缩放，源图上不重叠的标记视觉上永远不会重叠。前台 / 后台 / 导出三处使用同一套缩放公式，保证视觉一致。
- **矢量级清晰度**: 标记层独立屏幕像素坐标系，不参与地图的 `transform: scale()` 链，SVG 图标和文字按目标屏幕像素尺寸栅格化，任意缩放级别下都保持矢量清晰。
- **锚点固定缩放**: 调整标记大小时，文字标记中心 (Center Anchor) 或图标标记底部中心 (Bottom-Center Anchor) 位置绝对固定。
- **触摸支持**: 双指捏合缩放、单指拖动平移、移动端自适应。
- **缩放级别显示**: 右下角实时显示当前缩放百分比 (10% – 500%)。

### 📍 标记管理与自由调整
- **两种标记类型**:
  - **胶囊样式 (图标 + 文字)**: 左侧 SVG 图标，右侧文字标签，圆角 30px，支持自定义不透明度、背景色、边框。
  - **纯文字标记**: 类似设计软件中的"文本图层"，背景 / 文字颜色 / 边框 / 不透明度完全可调。
- **8 位 hex 颜色 (v1.3.0)**: 颜色值存为 `#RRGGBBAA` (CSS 原生支持)，alpha 信息不丢，无需 `rgba()` 转换。
- **拖拽与精确调整**:
  - 在地图上直接拖拽调整标记位置。
  - **1:1 鼠标绝对位置缩放**: 文字标记外框支持长、宽独立非等比拉伸，拖拽点完美跟随鼠标光标移动 (1:1 追踪)，彻底解决相对位移缩放时的"漂移"与"死锁"问题。
  - **无字号大小限制**: 文字标记字号自由设定。
  - **无尺寸上限**: 标记宽高可任意大。
- **旋转 (v1.3.0)**: 标记支持 0–360° 任意旋转，旋转手柄实时预览。
- **层级 / Z-Order (v1.3.0+)**: 标记可设 zIndex，数字大者覆盖在上。后台支持表单快捷按钮（顶层 / 底层）和右键菜单 4 项（置于顶层 / 上移一层 / 下移一层 / 置于底层），已到边界时按钮自动禁用。
- **复制 / 粘贴标记 (v1.3.0)**: 后台选中标记后按 `Ctrl+C` / `Ctrl+V` 复制，rotation 和 zIndex 一起复制。
- **撤销 / 重做 (v1.6.0)**: 最多 50 步操作历史，`Ctrl+Z` 撤销 / `Ctrl+Shift+Z`（或 `Ctrl+Y`）重做，覆盖移动 / 缩放 / 旋转 / 层级 / 复制 / 粘贴 / 删除 / 编辑等所有改动。
- **拖拽防卡顿 (v1.6.0)**: 后台拖动标记时拦截浏览器原生文字选区与 dragstart，避免出现"瞬移"或选中文本触发的卡顿。
- **缩放锚点居中 (v1.6.0)**: 标记缩放锚点统一改为 `center`，不再出现底部居中导致的"视觉跳变"。
- **富文本详情**: 标记详情支持粗体、斜体、下划线及超链接（新标签页打开，`rel="noopener noreferrer"`）。
- **批量操作**: 复制粘贴、键盘快捷键、Undo 支持。
- **双向高亮高光**: 选中标记时，地图与后台列表双向同步高亮，自动滚动定位。

### 🎨 后台 UI 优化 (v1.6.1)
- 标记列表头部重新设计：圆角工具栏 + 图标化按钮（撤销 / 重做 / 显示 / 隐藏）、数量徽章、内嵌搜索图标的搜索框。

### 🎨 侧边栏与多视图分类筛选
- **多视图管理与专属路由 (v1.4.0)**: 支持在后台配置多个独立的地图视图（如 `/cctv`），每个视图可单独绑定允许展示的标记分类，通过专属链接访问时地图与侧边栏自动实现精准过滤。
- **智能分类筛选**: 自动计算分类下的标记数，支持单类点击筛选、全部显示、全部隐藏、多选可见性切换。
- **实时搜索定位**: 支持针对标记名称和描述的模糊搜索，匹配项自动聚焦放大动画。
- **拖拽排序**: 后台支持通过拖拽调整分类的显示顺序。
- **极致视觉体验**: 移动端和折叠状态自适应。

### 📤 导出功能
- **导出为图片与 PDF (v1.4.0)**: 一键导出当前可见视野 / 完整地图为高分辨率 PNG / JPG 位图，以及带有原生可搜索文字层和高质量矢量的 PDF 文档。
- **所见即所得 (v1.3.0)**: 图片使用 `html2canvas` 序列化前台 DOM 节点导出，视觉与前台 100% 一致 (SVG 图标、box-shadow、边框、字体全部保留)。
- **原生 PDF 渲染 (v1.4.0)**: 导出 PDF 时内嵌字体与矢量 SVG，完美还原带透明度的颜色与边框样式，文字在 PDF 中可直接选中与搜索。
- **完整地图导出**: 自动临时缩放到 fit-to-screen，拍完恢复原视图。

### 💾 备份和恢复
- **一键导出**: 导出完整系统配置为 JSON 文件。
- **安全导入**: 导入前自动备份当前配置。
- **完整备份**: 包含标记、设置、分类、图标和地图图片。

### 🔒 安全认证
- **后端验证**: 真正的服务器端密码验证与 Session 会话管理。
- **密码安全**: bcrypt 加密存储，管理员密码支持后台直接修改。
- **请求限流**: 后端请求频次限流，防止暴力破解和滥用。
- **XSS 与数据防护**: 对所有接口和用户输入进行后端校验与严格过滤。

---

## 🚀 快速开始

### 方式一: Docker 部署 (推荐)

#### 从 Docker Hub 拉取

```bash
# 拉取最新镜像
docker pull bbblq/interactive-map:latest

# 运行容器
docker run -d \
  -p 3000:3000 \
  -v interactive-map-data:/app/data \
  -v interactive-map-uploads:/app/uploads \
  -e ADMIN_PASSWORD=admin \
  -e SESSION_SECRET=your_secret_key \
  --name interactive-map \
  bbblq/interactive-map:latest
```

#### 使用 Docker Compose

1. **创建 `docker-compose.yml`**:
```yaml
version: '3.8'

services:
  interactive-map:
    image: bbblq/interactive-map:latest
    container_name: interactive-map
    ports:
      - "3000:3000"
    volumes:
      - interactive-map-data:/app/data
      - interactive-map-uploads:/app/uploads
    environment:
      - NODE_ENV=production
      - PORT=3000
      - ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin}
      - SESSION_SECRET=${SESSION_SECRET:-change-this-secret-in-production}
    restart: unless-stopped

volumes:
  interactive-map-data:
    driver: local
  interactive-map-uploads:
    driver: local
```

2. **启动服务**:
```bash
docker-compose up -d
```

3. **访问应用**:
- 前端: <http://localhost:3000>
- 管理后台: <http://localhost:3000/admin>

> 💡 **首次安装提示**: 系统会自动加载一个示例办公室地图和示例标记点,帮助您快速了解功能。您可以在管理后台删除示例数据并上传自己的地图。

#### 从源码构建

```bash
git clone https://github.com/bbblq/interactive-map.git
cd interactive-map
docker-compose up -d --build
```

### 方式二: 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env，至少修改 ADMIN_PASSWORD 和 SESSION_SECRET

# 3. 启动服务
npm start
```

---

## 📦 数据持久化

### Docker Volume 说明

系统使用两个 Docker Volume 持久化数据:

1. **`interactive-map-data`** - 存储配置数据 (SQLite 数据库)
   - `map.db` - 主数据库 (markers / categories / icon-types / settings / map 全部存于此)
   - `default-*.json` - 首次启动时的种子数据 (只读)

2. **`interactive-map-uploads`** - 存储上传文件
   - 地图图片
   - Logo 图片
   - 自定义图标

### 数据备份

```bash
# 备份数据卷
docker run --rm -v interactive-map-data:/data -v $(pwd):/backup alpine tar czf /backup/data-backup.tar.gz -C /data .
docker run --rm -v interactive-map-uploads:/uploads -v $(pwd):/backup alpine tar czf /backup/uploads-backup.tar.gz -C /uploads .

# 恢复数据卷
docker run --rm -v interactive-map-data:/data -v $(pwd):/backup alpine tar xzf /backup/data-backup.tar.gz -C /data
docker run --rm -v interactive-map-uploads:/uploads -v $(pwd):/backup alpine tar xzf /backup/uploads-backup.tar.gz -C /uploads
```

---

## 🔧 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `PORT` | 服务器端口 | `3000` | 否 |
| `ADMIN_PASSWORD` | 管理员密码 | `admin` | **是** |
| `SESSION_SECRET` | 会话密钥 | `change-this-secret-in-production` | **是** |
| `NODE_ENV` | 运行环境 | `production` | 否 |
| `COOKIE_SECURE` | 强制 Cookie Secure (HTTPS) | `false` | 否 |
| `MAX_FILE_SIZE` | 最大文件大小 (字节) | `10485760` (10MB) | 否 |

> ⚠️ **安全提示**: 生产环境中务必修改 `ADMIN_PASSWORD` 和 `SESSION_SECRET`！

---

## 🔄 更新和维护

### 更新 Docker 容器

使用 Docker Volume 后，更新容器不会丢失数据。

```bash
# 1. 停止并删除旧容器
docker-compose down

# 2. 拉取最新镜像
docker-compose pull

# 3. 重新运行
docker-compose up -d
```

### 查看日志

```bash
docker-compose logs -f              # 实时日志
docker-compose logs --tail=100     # 最近 100 行
```

### 重启服务

```bash
docker-compose restart
```

---

## 📖 使用指南

### 管理后台

1. **登录**: 访问 `http://localhost:3000/admin`，输入管理员密码 (默认: `admin`)
2. **上传地图**: 进入"地图管理"标签页，选择并上传平面图
3. **添加标记**: 进入"标记管理"标签页，在地图上右键 → 添加标记
4. **自定义图标与样式**: 进入"图标类型"标签页，添加 / 编辑图标类型 (SVG 或上传图片)
5. **系统设置**: 进入"基本设置"标签页，修改网站名称、Logo、密码

### 标记编辑 (v1.3.0)

- **拖拽**: 直接拖动标记调整位置
- **缩放**: 选中标记后拖动边框手柄
- **旋转**: 选中标记后使用旋转手柄 (绿色把手) 或在右侧表单直接输入角度
- **层级**: 在右侧表单调整 zIndex 字段，或用"⤒︎ 顶层" / "⤓︎ 底层"按钮
- **颜色**: 颜色选择器支持 6 位 hex 原生 picker + 0–100 alpha 滑块
- **复制粘贴**: 选中标记按 `Ctrl+C`，再按 `Ctrl+V` 粘贴

### 备份管理

1. 进入"备份管理"标签页
2. 点击"导出配置文件"按钮下载 JSON 备份
3. 拖拽 JSON 文件到"导入配置"区域

---

## 🏗️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 JavaScript + HTML5 + CSS3 (Flexbox/Grid)
- **数据存储**: SQLite (better-sqlite3)，单文件 `data/map.db`，启动时自动迁移 default-* JSON
- **会话管理**: express-session
- **安全**: bcrypt, express-validator, express-rate-limit
- **导出**: html2canvas (DOM 序列化导出)
- **容器化**: Docker + Docker Compose

---

## 📁 项目结构

```
interactive-map/
├── server.js              # Express 服务器主文件
├── config.js              # 配置管理模块
├── db.js                  # SQLite 数据访问层 (better-sqlite3)
├── backup-utils.js        # 备份工具模块
├── views-management.js    # 多视图管理模块
├── package.json           # 项目依赖
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
├── .dockerignore          # Docker 忽略文件
├── .env.example           # 环境变量示例
├── public/                # 前端静态文件
│   ├── index.html             # 前端主页
│   ├── admin.html             # 管理后台页面
│   ├── app.js                 # 前端逻辑
│   ├── admin.js               # 管理后台逻辑
│   ├── icons.js               # 内置 SVG 图标库
│   ├── rich-text-editor.css   # 富文本编辑器样式
│   ├── style.css              # 前端样式
│   └── admin.css              # 管理后台样式
├── data/                  # 数据文件 (持久化, SQLite)
│   ├── map.db              # 主数据库 (markers / categories / icon-types / settings / map)
│   └── default-*.json      # 首次启动时的种子数据 (只读)
└── uploads/               # 上传文件 (持久化)
    ├── map-*.jpg          # 地图图片
    └── icon-*.png         # 自定义图标
```

---

## ❓ 常见问题

### 1. 登录时无法保存状态 (401 错误)?
如果在本地环境 (HTTP) 下无法登录或保存标记，请检查 `.env` 或环境变量是否设置了 `COOKIE_SECURE=true`。对于 localhost，该值必须为 `false` (默认已优化此行为)。

### 2. 如何修改管理员密码?
**推荐方式**: 登录后台 → 基本设置 → 修改密码
**备用方式**: 停止容器，修改环境变量 `ADMIN_PASSWORD`，然后重启

### 3. 更新 Docker 容器后数据会丢失吗?
不会！只要使用了 Docker Volume 挂载 `/app/data` 和 `/app/uploads`，所有数据都会保留。

### 4. 导出的图为什么看起来跟我看到的不一样?
v1.3.0 之前使用 canvas 手动重绘，可能与 DOM 略有差异。v1.3.0 起改用 `html2canvas` 直接序列化 DOM，所见即所得；v1.4.0 起新增 PDF 导出，文字层可搜索、SVG 矢量保留。

---

## 📜 更新日志

### v1.6.1 (2026-07)
- ✨ 后台右键菜单新增"层级"功能：置于顶层 / 上移一层 / 下移一层 / 置于底层，已在边界时按钮自动禁用
- ✨ 标记列表头部 UI 重新设计：渐变图标徽章 + 数量徽章 + 图标化工具栏 + 内嵌搜索图标
- 🐛 修复后台拖拽时文本被选中导致的卡顿瞬移（拖拽前清选区 + 拦截 dragstart）
- 🐛 修复标记缩放锚点非中心导致的视觉跳变（统一改为 `center`）
- 🐛 修复保存标记时偶发的 500 错误（`saveMarker` else 分支补全）

### v1.6.0 (2026-06)
- ✨ 撤销 / 重做（Undo / Redo）：50 步操作历史，`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y` 全场景覆盖
- ✨ 性能优化：拖拽 / 缩放 / 旋转期间不再调用 `loadMarkers()` 全量重绘，改为增量更新
- 🗄️ 数据存储迁移到 SQLite（better-sqlite3），单文件 `data/map.db`，启动自动迁移 default-* JSON
- 🐛 修复后台文字标记拖拽时的位置漂移

### v1.5.x (2026-06)
- 🗄️ 数据层重构：引入 better-sqlite3，为后续多用户 / 高并发场景做准备
- 🧹 备份 / 恢复流程优化

### v1.4.0 (2026-06)
- ✨ 新增多视图管理功能：后台可自由配置多个专属路由（如 `/cctv`），单独向访客展示指定的标记分类，并支持精美的平铺式卡片勾选界面
- ✨ 新增高保真 PDF 导出功能，支持内嵌字体、可搜索文字层和原生 SVG 矢量渲染
- ✨ 全面支持 rgba 和 8 位 hex 带透明度的颜色正确渲染到 PDF

### v1.3.0 (2026-06)
- ✨ 标记 rotation / zIndex 字段
- ✨ 后台旋转手柄 + ⤒︎ 顶层 / ⤓︎ 底层 按钮
- ✨ 8 位 hex 颜色选择器 (#RRGGBBAA)
- ✨ 复制 / 粘贴标记 (含 rotation + zIndex)
- ✨ 标记与地图严格等比缩放，前 / 后 / 导出三处一致
- ✨ 导出改用 html2canvas，所见即所得
- ✨ 富文本详情链接新标签页打开 (安全)
- 🐛 修复 SVG 栅格化模糊
- 🐛 修复侧边栏 marker 列表显示 "undefined"
- 🐛 修复文字标记居中漂移

### v1.2.x
- 拖拽 / 缩放 / 触摸支持
- 备份恢复
- 后端安全 (bcrypt, rate-limit, XSS 防护)
- Docker 部署

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
