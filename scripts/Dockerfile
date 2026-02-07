# 使用官方 Node.js 镜像，包含 Chromium 支持
FROM node:20-slim

# 安装 Chromium 及其依赖
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 设置 Puppeteer 跳过 Chromium 下载（使用系统安装的）
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 创建工作目录
WORKDIR /app

# 复制 package.json
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci --only=production

# 复制脚本
COPY ttx_export.js ./

# 创建输出目录
RUN mkdir -p /app/output

# 设置默认输出目录
ENV OUTPUT_DIR=/app/output

# 运行脚本
CMD ["node", "ttx_export.js"]
