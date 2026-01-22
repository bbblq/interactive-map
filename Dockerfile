# 使用Node.js 18 Alpine版本作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package文件
COPY package*.json ./

# 安装生产依赖
RUN npm install --production

# 复制应用代码
COPY server.js ./
COPY config.js ./
COPY backup-utils.js ./
COPY public ./public
COPY data ./data

# 创建上传目录（data目录已通过COPY创建）
RUN mkdir -p /app/uploads

# 暴露端口
EXPOSE 3000

# 定义持久化卷
VOLUME ["/app/data", "/app/uploads"]

# 设置环境变量默认值
ENV NODE_ENV=production \
    PORT=3000 \
    ADMIN_PASSWORD=admin \
    SESSION_SECRET=change-this-secret-in-production \
    MAX_FILE_SIZE=10485760

# 启动应用
CMD ["node", "server.js"]
