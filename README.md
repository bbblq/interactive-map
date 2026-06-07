# 互动地图系统 (Interactive Map)

一个基于 Node.js 和 Express 的通用互动地图系统，支持标记管理、分类筛选、搜索功能和完整的备份导出/导入机制。适用于办公室地图、校园导览、展会布局等多种场景。

**版本**: v1.3.0 | **Node.js**: ≥18.0.0 | **许可证**: MIT

---

## ✨ 功能特点

### 🗺️ 交互式地图与高精度缩放
- **零延迟缩放体验**: 移除了地图缩放和平移的 CSS 过渡延迟，实现“手随心动”的即时交互感。
- **高精度标记缩放 (v1.3.0)**: 
  - **文字标记**: 字体大小、高宽随地图缩放实时、无延迟同步缩放。消除了过渡动画导致的延迟滞后，保证在拖动缩放时文字大小与地图缩放帧完美同步。
  - **图标标记**: 保持矢量级别的清晰度，支持跟随地图进行等比动态缩放。
- **锚点固定缩放**: 调整标记大小时，文字标记中心（Center Anchor）或图标标记底部中心（Bottom-Center Anchor）位置绝对固定，防止在缩放或修改尺寸时产生位置偏移漂移。
- **双向高亮高光**: 选中标记时，地图上的标记与后台列表双向同步高亮，自动滚动定位，提供清晰的视觉呼吸指示。

### 📍 标记管理与自由调整
- **丰富的标记样式**:
  - **胶囊样式**: 左侧为精美图标，右侧为文字标签，一体化胶囊设计，支持自定义不透明度、背景色和边框颜色。
  - **纯文字标记**: 类似设计软件中的“文本图层”，背景、文字颜色、边框、不透明度完全可调。
  - **自定义图标**: 支持预设 SVG 矢量图标或上传自定义图片/Logo。
- **拖拽与高精度调整**: 
  - 支持在地图上直接拖拽调整标记位置。
  - **1:1 鼠标绝对位置缩放 (v1.3.0)**: 重写了标记的拖拽手柄缩放数学模型，拖拽点完美跟随鼠标光标移动（1:1 追踪），彻底解决以往基于相对位移百分比缩放时的“漂移”与“缩放死锁”问题。
  - **自由长宽拉伸**: 文字标记外框支持非等比（长、宽独立）自由拉伸，帮助您更精准地标注办公室特定形状的会议室或走廊区域。
  - **无字号大小限制 (v1.3.0)**: 取消了文字标记字号的上限限制，支持自由设定任意大小的字体字号。
- **富文本内容**: 标记详情支持粗体、斜体、下划线及超链接。

### 🎨 侧边栏与分类筛选
- **智能分类筛选**: 自动计算分类下的标记数，支持单类点击筛选、全部显示、全部隐藏。
- **实时搜索定位**: 支持针对标记名称和描述的模糊搜索，并自带搜索聚焦放大动画。
- **拖拽排序与状态管理**: 后台支持通过拖拽调整分类的显示顺序，并配置是否在侧边栏显示。
- **极致视觉体验 (v1.3.0)**: 移动端和折叠状态自适应。优化了折叠状态下侧边栏图标的水平居中对齐，提升界面整体质感。

### 💾 备份和恢复
- **一键导出**: 导出完整系统配置为 JSON 文件。
- **安全导入**: 导入前自动备份当前配置，保障系统安全。
- **版本兼容**: 支持未来版本的数据平滑迁移。
- **完整备份**: 包含标记、设置、分类、图标和地图图片。
- **可视化管理**: 优化的备份管理界面，支持导出/导入并排操作。

### 🔒 安全认证
- **后端验证**: 真正的服务器端密码验证与 Session 会话管理。
- **密码安全**: 管理员密码支持后台直接修改，并使用 bcrypt 进行高安全性加密存储。
- **请求限流**: 严格的后端请求频次限流，防止暴力破解和滥用。
- **XSS 与数据防护**: 对所有接口和用户输入进行后端校验与严格过滤，彻底消除跨站脚本攻击漏洞。

---

## 🚀 快速开始

### 方式一:Docker 部署 (推荐)

#### 从 Docker Hub 拉取 (最简单)

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

#### 使用 Docker Compose (推荐)

1. **创建 docker-compose.yml**
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
      # 可选：如果在HTTPS生产环境部署，设为true
      # - COOKIE_SECURE=true 
    restart: unless-stopped

volumes:
  interactive-map-data:
    driver: local
  interactive-map-uploads:
    driver: local
```

2. **启动服务**
```bash
docker-compose up -d
```

3. **访问应用**
- 前端: http://localhost:3000
- 管理后台: http://localhost:3000/admin

> 💡 **首次安装提示**: 系统会自动加载一个示例办公室地图和8个标记点,帮助您快速了解功能。您可以在管理后台删除这些示例数据并上传自己的地图。

#### 从源码构建

1. **克隆项目**
```bash
git clone https://github.com/bbblq/interactive-map.git
cd interactive-map
```

2. **配置环境变量** (可选)
```bash
# 创建 .env 文件
echo "ADMIN_PASSWORD=your_secure_password" > .env
echo "SESSION_SECRET=your_random_secret_key" >> .env
```

3. **启动服务**
```bash
docker-compose up -d --build
```

### 方式二:本地开发

1. **安装依赖**
```bash
npm install
```

2. **配置环境变量**
```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env 文件
# PORT=3000
# ADMIN_PASSWORD=admin
# SESSION_SECRET=your-secret-key
# NODE_ENV=development
# MAX_FILE_SIZE=10485760
```

3. **启动服务**
```bash
npm start
```

---

## 📦 数据持久化

### Docker Volume 说明

系统使用两个 Docker Volume 来持久化数据:

1. **`interactive-map-data`** - 存储所有配置数据
   - `markers.json` - 标记数据
   - `categories.json` - 分类数据
   - `icon-types.json` - 图标类型
   - `settings.json` - 系统设置
   - `map.json` - 地图信息
   - `auto-backup-*.json` - 自动备份文件

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
| `COOKIE_SECURE` | 强制Cookie Secure (HTTPS) | `false` | 否 |
| `MAX_FILE_SIZE` | 最大文件大小(字节) | `10485760` (10MB) | 否 |

> ⚠️ **安全提示**: 生产环境中务必修改 `ADMIN_PASSWORD` 和 `SESSION_SECRET`!

---

## 🔄 更新和维护

### 更新 Docker 容器

**重要**: 使用 Docker Volume 后,更新容器不会丢失数据!

```bash
# 1. 停止并删除旧容器
docker-compose down

# 2. 拉取最新代码
git pull

# 3. 重新拉取/构建镜像并运行
docker-compose up -d --build
```

### 查看日志

```bash
# 查看实时日志
docker-compose logs -f

# 查看最近100行日志
docker-compose logs --tail=100
```

### 重启服务

```bash
docker-compose restart
```

---

## 📖 使用指南

### 管理后台

1. **登录**
   - 访问 `http://localhost:3000/admin`
   - 输入管理员密码(默认: `admin`)

2. **上传地图**
   - 进入"地图管理"标签页
   - 选择并上传平面图

3. **添加标记**
   - 进入"标记管理"标签页
   - 在地图上右键点击，选择“添加标记”
   - 选择标记类型，填写名称和描述
   - 标记支持拖拽调整位置

4. **自定义图标与样式**
   - 进入"图标类型"标签页
   - 点击“添加图标类型”或编辑现有类型
   - **设置图标**: 选择预设 SVG 或上传图片
   - **设置颜色**: 选择图标颜色
   - **设置背景**: 选择背景颜色或设为透明（胶囊样式）
   - 保存后，所有该类型的标记会自动更新样式

5. **系统设置**
   - 进入"基本设置"标签页
   - 修改网站名称和 Logo
   - **修改密码**: 在此处直接修改管理员登录密码

### 备份管理

1. **导出配置**
   - 进入"备份管理"标签页
   - 点击"导出配置文件"按钮
   - 浏览器会下载包含所有数据的 JSON 文件

2. **导入配置**
   - 点击"导入配置"区域
   - 选择之前导出的 JSON 文件
   - 系统会自动备份当前配置后再导入

---

## 🏗️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 JavaScript + HTML5 + CSS3 (Flexbox/Grid)
- **数据存储**: JSON 文件
- **会话管理**: express-session
- **安全**: bcrypt, express-validator, express-rate-limit
- **容器化**: Docker + Docker Compose

---

## 📁 项目结构

```
interactive-map/
├── server.js              # Express 服务器主文件
├── config.js              # 配置管理模块
├── backup-utils.js        # 备份工具模块
├── package.json           # 项目依赖
├── Dockerfile             # Docker 镜像配置
├── docker-compose.yml     # Docker Compose 配置
├── .dockerignore          # Docker 忽略文件
├── .env                   # 环境变量配置
├── public/                # 前端静态文件
│   ├── index.html         # 前端主页
│   ├── admin.html         # 管理后台页面
│   ├── app.js             # 前端逻辑
│   ├── admin.js           # 管理后台逻辑
│   ├── style.css          # 前端样式
│   └── admin.css          # 管理后台样式
├── data/                  # 数据文件 (持久化)
│   ├── markers.json       # 标记数据
│   ├── categories.json    # 分类数据
│   ├── icon-types.json    # 图标类型
│   ├── settings.json      # 系统设置
│   └── map.json           # 地图信息
└── uploads/               # 上传文件 (持久化)
    ├── map-*.jpg          # 地图图片
    └── icon-*.png         # 自定义图标
```

---

## ❓ 常见问题

### 1. 登录时无法保存状态（401错误）?
如果在本地环境（HTTP）下无法登录或保存标记，请检查是否在 .env 或环境变量中设置了 `COOKIE_SECURE=true`。对于 localhost，该值必须为 `false`（默认已优化此行为）。

### 2. 如何修改管理员密码?
**推荐方式**: 登录后台 -> 基本设置 -> 修改密码。
**备用方式**: 停止容器，修改环境变量 `ADMIN_PASSWORD`，然后重启。

### 3. 更新 Docker 容器后数据会丢失吗?
不会! 只要使用了 Docker Volume 挂载 `/app/data` 和 `/app/uploads`,所有数据都会保留。

### 4. 如何备份所有数据?
可以通过 Docker 命令直接备份 Volume，或使用后台的 JSON 导出功能（仅包含配置数据，不含大图）。

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!
