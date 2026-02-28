# 通天晓WMS数据导出 - Docker 镜像
# 构建: 在项目根目录执行 docker build -f scripts/Dockerfile .
# 或使用 docker-compose: context 需为项目根，dockerfile: scripts/Dockerfile

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

# Puppeteer 使用系统 Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 创建工作目录：/app 为项目根，scripts 在 /app/scripts，src 在 /app/src
WORKDIR /app

# 复制 scripts 的依赖配置与脚本
COPY scripts/package.json scripts/package-lock.json scripts/
COPY scripts/ttx_*.js scripts/
COPY scripts/test_last_run_date.js scripts/

# 复制数据源服务（scripts 依赖 ../src/services/datasource-service）
COPY src/services/ src/services/

# 安装依赖
WORKDIR /app/scripts
RUN npm ci --only=production

# 创建输出目录
RUN mkdir -p /app/output

# ====================
# 环境变量（对应 .env 配置，敏感信息请通过 docker run -e 或 env_file 注入）
# ====================

# 通天晓连接配置
ENV TTX_BASE_URL=https://ttx.56xyy.com
ENV TTX_CUSTOMER=xyy-wms-prod
ENV TTX_USERNAME=HFLS17
ENV TTX_PASSWORD=Xyy1234567

# 查询条件
ENV TTX_WAREHOUSE=HF

# 报表类型: receipt_header, receipt_details, b2c_shipment, b2b_shipment, paking_details, all
ENV REPORT_TYPE=all

# 输出配置: csv | json | dataSource | both
ENV OUTPUT_FORMAT=dataSource
ENV OUTPUT_DIR=/app/output

# 运行配置
ENV PAGE_SIZE=500
ENV HEADLESS=true
ENV TTX_NAVIGATION_TIMEOUT=60000

# 数据同步步骤: 1-5 或 all
ENV TTX_SYNC_STEP=all

# 批量插入条数
ENV BATCH_INSERT_SIZE=500

# Genespace API（敏感，务必通过运行时注入）
ENV GENISPCE_API_TOKEN=q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx
ENV GENISPCE_BASE_URL=https://api.genispace.cn

WORKDIR /app/scripts

# 默认运行主导出脚本
CMD ["node", "ttx_export.js"]
