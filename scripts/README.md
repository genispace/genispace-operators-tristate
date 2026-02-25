# 通天晓WMS数据导出系统

## 项目概述

本项目是一个基于 Puppeteer 的浏览器自动化脚本，用于从通天晓 WMS 系统导出各类报表数据。项目采用模块化设计，将不同报表类型的导出功能分离到独立文件中，便于维护和扩展。

同时支持将导出数据同步到 Genespace 数据源。

## 快速开始

### 1. 安装依赖

```bash
npm install puppeteer-core dotenv
```

### 2. 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置
vim .env
```

### 3. 运行导出

```bash
# 运行报表导出
node ttx_export.js

# 或者单独执行数据同步（无需登录通天晓系统）
node ttx_data_sync.js

# 分步调试（TTX_SYNC_STEP=1 仅删除镜像表，=2 仅导出入库等）
TTX_SYNC_STEP=1 node ttx_data_sync.js
TTX_SYNC_STEP=1,3,4 node ttx_data_sync.js
```

## 项目结构

```
scripts/
├── ttx_export.js           # 主入口文件，负责浏览器初始化和协调调度
├── ttx_data_sync.js       # 数据同步模块，负责将数据同步到Genespace
├── ttx_receipt_header.js   # 入库单头部导出模块
├── ttx_receipt_details.js  # 入库单明细导出模块
├── ttx_b2c_shipment.js     # B2C出库单导出模块
├── ttx_b2b_shipment.js     # B2B出库单导出模块
├── ttx_b2c_paking_details.js # B2C拣货明细导出模块
├── .env.example            # 配置模板
├── .env                    # 配置文件（需手动创建）
└── output/                 # 输出目录
```

## 配置文件说明

### .env 文件

复制 `.env.example` 为 `.env` 后，编辑以下配置：

```bash
# ====================
# 连接配置
# ====================
TTX_BASE_URL=https://ttx.56xyy.com    # 系统地址
TTX_CUSTOMER=xyy-wms-prod             # 租户标识
TTX_USERNAME=HFLS17                   # 用户名
TTX_PASSWORD=Xyy1234567               # 密码

# ====================
# 查询条件
# ====================
TTX_WAREHOUSE=HF                       # 仓库代码
TTX_COMPANY=HF-SPD                    # 货主代码
TTX_START_DATE=2026-02-05 00:00:00    # 开始日期
TTX_END_DATE=2026-02-06 23:59:59      # 结束日期

# ====================
# 报表类型
# ====================
# receipt_header: 入库单头部
# receipt_details: 入库单明细
# b2c_shipment: B2C出库单
# b2b_shipment: B2B出库单
# paking_details: B2C拣货明细
# data_sync: 数据同步到Genespace
# all: 全部报表
REPORT_TYPE=receipt_header

# ====================
# 输出配置
# ====================
# csv: 导出CSV文件
# json: 导出JSON文件
# dataSource: 直接插入到API
# both: 同时输出CSV和JSON
OUTPUT_FORMAT=dataSource
OUTPUT_DIR=./output

# ====================
# 运行配置
# ====================
PAGE_SIZE=500                         # 每页数量
HEADLESS=true                         # 无头模式

# ====================
# API Token
# ====================
# 数据源API Token（报表导出需要）
DATASOURCE_API_TOKEN=

# Genespace数据同步API Token
GENISPCE_API_TOKEN=q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx
```

## 模块说明

### ttx_export.js（主入口）

负责：
- 浏览器初始化和登录
- 加载 `.env` 配置
- 根据报表类型调用对应的导出模块
- 处理 CSV/JSON/dataSource 输出格式

### ttx_data_sync.js（数据同步模块）

实现《通天晓数据同步步骤》5 个步骤，支持分步执行：

| 步骤 | 说明 | 方法 |
|-----|------|------|
| 1 | 删除镜像表（清空当次数据） | syncDataSourceData |
| 2 | 通天晓导出 → 镜像表 | 调用 ttx_export.js |
| 3 | 镜像表 → 临时表 (UPSERT) | syncDataSourceData |
| 4 | 临时表 → 职能表 | syncDataSourceData |
| 5 | 临时表清理 | 占位，待配置数据源ID |

**分步执行**：通过 `TTX_SYNC_STEP=1` 或 `1,3,4` 指定要执行的步骤。

提供：
- `syncTempToData()` - 同步临时表到职能表（步骤4）
- `syncDataSource()` - 同步单个职能表数据源

职能表数据源：
| 键名 | 名称 | 数据源ID |
|------|------|----------|
| purchase_inbound_in_transit | 采购入库在途 | 9c13a06a-2f2f-40d6-b258-ea5a360af918 |
| store_return_in_transit | 门店退货在途 | 700fa8c0-2a46-4c5a-ac7e-408d79ec7f17 |
| customer_return_in_transit | 客户退货在途 | 40c28871-7ab9-4c95-97b1-244bb4a9d6a6 |
| b2b_orders | B2B订单 | b44bc57c-83c2-4df1-adbb-02cdebceeba3 |
| outbound_orders | 出库订单 | eae8c6af-70b4-4522-a0e0-35c1b9ab7281 |
| abnormal_pickup_orders | 异常提货订单 | e6400f85-4c94-4dd5-92bb-e746dcf35a93 |

返回数据格式：
```json
{
    "success": true,
    "data": {
        "operationType": "CREATE",
        "affectedRows": 0,
        "executionTime": 17
    }
}
```

### ttx_receipt_header.js（入库单头部）

提供：
- `getFieldMap()` - 字段映射配置
- `getReport()` - 查询入库单头部数据
- `insertData()` - 插入数据到 API
- `exportToDataSource()` - 导出到数据源

API 地址：`https://api.genispace.cn/datasources/ace5c767-4bce-4da0-b46b-e36e9af365a1/data`

### ttx_receipt_details.js（入库单明细）

提供：
- `getFieldMap()` - 字段映射配置
- `getReport()` - 查询入库单明细数据
- `insertData()` - 插入数据到 API
- `exportToDataSource()` - 导出到数据源

API 地址：`https://api.genispace.cn/datasources/c2306183-f7c2-4a56-bc8f-59c37882afca/data`

### ttx_b2c_shipment.js（B2C出库单）

提供：
- `getFieldMap()` - 字段映射配置
- `getReport()` - 查询 B2C 出库单数据
- `insertData()` - 插入数据到 API
- `exportToDataSource()` - 导出到数据源

API 地址：`https://api.genispace.cn/datasources/e7fbe6d1-060a-4fd8-9c32-77cf960bf5c7/data`

### ttx_b2b_shipment.js（B2B出库单）

提供：
- `getFieldMap()` - 字段映射配置
- `getReport()` - 查询 B2B 出库单数据
- `insertData()` - 插入数据到 API
- `exportToDataSource()` - 导出到数据源

### ttx_b2c_paking_details.js（B2C拣货明细）

提供：
- `getFieldMap()` - 字段映射配置
- `getReport()` - 查询 B2C 拣货明细数据
- `insertData()` - 插入数据到 API
- `exportToDataSource()` - 导出到数据源

## 使用示例

### 导出入库单头部

```bash
# 方式1: 修改 .env 文件
# REPORT_TYPE=receipt_header
# OUTPUT_FORMAT=dataSource
node ttx_export.js
```

### 导出入库单明细

```bash
# 方式1: 修改 .env 文件
# REPORT_TYPE=receipt_details
# OUTPUT_FORMAT=csv,json
node ttx_export.js
```

### 导出B2C出库单

```bash
# 方式1: 修改 .env 文件
# REPORT_TYPE=b2c_shipment
# DATASOURCE_API_TOKEN=your_token_here
node ttx_export.js
```

### 导出全部报表

```bash
# 修改 .env 文件
# REPORT_TYPE=all
node ttx_export.js
```

### 数据同步到Genespace

```bash
# 方式1: 通过主入口执行（无需登录通天晓系统）
# REPORT_TYPE=data_sync
node ttx_export.js

# 方式2: 直接运行数据同步模块
node ttx_data_sync.js

# 同步完成后会显示每个数据源的结果：
# ✓ 采购入库在途 同步成功
#   操作类型: CREATE
#   影响行数: 0
#   执行时间: 17ms
```

### 在代码中调用数据同步

```javascript
const { DataSyncExporter, syncTempToData } = require('./ttx_data_sync');

// 方式1: 使用类实例
const exporter = new DataSyncExporter();
const result = await exporter.syncTempToData();
console.log(`成功: ${result.success}, 失败: ${result.failed}`);

// 方式2: 使用便捷函数
const result = await syncTempToData(['purchase_inbound_in_transit', 'b2b_orders']);
// 只同步指定的数据源
```

## 添加新报表类型

### 步骤一：创建新的导出模块

创建文件 `ttx_new_report.js`：

```javascript
#!/usr/bin/env node
/**
 * 通天晓WMS - 新报表导出模块
 */

class NewReportExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.TTX_BASE_URL || 'https://ttx.56xyy.com';
        this.page = options.page || null;
    }

    getFieldMap() {
        return {
            // 字段映射配置
            'sourceField': 'targetField',
            // ...
        };
    }

    async getReport(options = {}) {
        // 查询数据逻辑
    }

    async insertData(records) {
        const apiUrl = process.env.NEW_REPORT_API_URL;
        const apiToken = process.env.DATASOURCE_API_TOKEN;
        // 插入数据到 API 逻辑
    }

    async exportToDataSource(data) {
        // 字段转换 + 调用 insertData
    }

    setPage(page) {
        this.page = page;
    }
}

module.exports = { NewReportExporter };
```

### 步骤二：在主入口注册

编辑 `ttx_export.js`，添加导入和调用逻辑：

```javascript
// 导入新模块
const { NewReportExporter } = require('./ttx_new_report');

// 在 main 函数中添加
if (reportType === 'new_report' || reportType === 'all') {
    console.log('\n========== 新报表 ==========\n');

    const exporter = new NewReportExporter({ page });

    const data = await exporter.getReport({
        warehouseCode: config.warehouseCode,
        companyCode: config.companyCode,
        startDate: startDate,
        endDate: config.endDate,
        pageSize: config.pageSize
    });

    if (data.length > 0) {
        const csvPath = path.join(config.outputDir, 'new_report.csv');
        const jsonPath = path.join(config.outputDir, 'new_report.json');

        if (config.outputFormat === 'csv' || config.outputFormat === 'both') {
            exportToCsv(data, csvPath);
        }
        if (config.outputFormat === 'json' || config.outputFormat === 'both') {
            exportToJson(data, jsonPath);
        }
        if (config.outputFormat === 'dataSource' || config.outputFormat === 'both') {
            await exporter.exportToDataSource(data);
        }

        printSampleData(data);
    } else {
        console.log('未获取到新报表数据');
    }
}
```

### 步骤三：更新 .env.example

添加新报表类型的配置：

```bash
# ====================
# 新报表配置
# ====================
NEW_REPORT_API_URL=https://api.example.com/data
```

## 字段映射格式

### 入库单头部/明细

使用中文字段名映射：

```javascript
getFieldMap() {
    return {
        '入库单号': 'inbound_order_no',
        '来源单号': 'source_order_no',
        // ...
    };
}
```

### B2C出库单

使用驼峰命名字段映射：

```javascript
getFieldMap() {
    return {
        'code': 'order_no',
        'carrierCode': 'carrier',
        'totalQty': 'total_qty',
        // ...
    };
}
```

## 输出格式

| 格式 | 说明 |
|------|------|
| csv | 导出为 CSV 文件，适合 Excel 打开 |
| json | 导出为 JSON 文件 |
| dataSource | 直接插入到远程 API |
| both | 同时输出 CSV 和 JSON |

## 注意事项

1. **敏感信息**：`.env` 文件包含敏感信息，请勿提交到版本控制系统
2. **模板文件**：`.env.example` 是配置模板，不包含敏感信息，可以提交
3. **模块独立**：每种报表类型独立运行，互不影响
4. **添加类型**：添加新类型只需创建新文件，无需修改现有代码
5. **数据同步**：`data_sync` 模式无需启动浏览器，直接调用 API 即可

## Git 忽略配置

确保 `.gitignore` 包含以下内容：

```gitignore
# 环境配置文件
.env
.env.local
.env.*.local
```

## 更新日志

| 日期 | 版本 | 变更说明 |
|------|------|----------|
| 2026-02-10 | 2.0 | 重构为模块化架构，支持 .env 配置 |
| 2026-02-11 | 2.1 | 添加数据同步模块 ttx_data_sync.js |
