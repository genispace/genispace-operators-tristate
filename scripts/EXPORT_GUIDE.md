# 通天晓 WMS 数据导出指南

本项目用于从通天晓 WMS 系统导出各类报表数据，支持入库单头部、入库单明细、B2C 出库单、B2B 出库单、B2C 拣货明细、入库单扩展报表（receipt_header_ex）等，并可同步至 Genespace 数据源。

> 项目结构、模块说明、数据同步步骤等请参阅 [README.md](./README.md)。

## 目录

- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [Docker 部署](#docker-部署)
- [使用说明](#使用说明)
- [报表类型](#报表类型)
- [字段映射](#字段映射)
- [数据脱敏](#数据脱敏)
- [API 配置](#api-配置)
- [常见问题](#常见问题)

## 快速开始

```bash
cd scripts
npm install puppeteer-core dotenv xlsx

# 配置环境变量（.env 位于项目根目录）
cp ../.env.example ../.env
# 编辑 ../.env 文件，填写 TTX_USERNAME、TTX_PASSWORD、GENISPCE_API_TOKEN 等

# 运行导出
node ttx_export.js
```

## 环境配置

`.env` 文件位于**项目根目录**（scripts 的上级目录），脚本通过 `../.env` 加载。复制 `.env.example` 为 `.env` 后编辑：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TTX_BASE_URL` | `https://ttx.56xyy.com` | 通天晓系统地址 |
| `TTX_CUSTOMER` | `xyy-wms-prod` | 租户标识 |
| `TTX_USERNAME` | - | 用户名（必填） |
| `TTX_PASSWORD` | - | 密码（必填） |
| `TTX_WAREHOUSE` | `HF` | 仓库代码 |
| `TTX_START_DATE` | - | 开始日期（YYYY-MM-DD HH:mm:ss，不设置则由数据源动态计算） |
| `TTX_END_DATE` | - | 结束日期 |
| `REPORT_TYPE` | `all` | 报表类型 |
| `OUTPUT_FORMAT` | `dataSource` | 输出格式：csv/json/dataSource/both |
| `OUTPUT_DIR` | `./output` | 输出目录 |
| `PAGE_SIZE` | `500` | 每页数量 |
| `HEADLESS` | `true` | 无头模式 |
| `TTX_NAVIGATION_TIMEOUT` | `60000` | 页面导航超时（毫秒） |
| `TTX_SYNC_STEP` | `all` | 数据同步步骤：1-5 或 all，示例 `1,2`、`1,3,4` |
| `TTX_DOWNLOAD_TID` | `EXPORT_TABLES` | 任务中心筛选（ttx_download_center.js） |
| `TTX_DOWNLOAD_OID` | `receipt_header_ex` | 任务中心筛选 |
| `BATCH_INSERT_SIZE` | `500` | 批量插入条数 |
| `GENISPCE_API_TOKEN` | - | Genespace API Token（必填，用于 dataSource 输出） |
| `GENISPCE_BASE_URL` | `https://api.genispace.cn` | Genespace API 地址 |

## Docker 部署

### 构建镜像

在**项目根目录**执行（Dockerfile 需要访问 `src/` 和 `scripts/`）：

```bash
docker build -f scripts/Dockerfile -t script-tristate-ttx-export:latest .
```

### 使用 docker-compose

```bash
cd scripts
# 确保项目根目录存在 .env（可从 .env.example 复制）
docker-compose up --build
```

`docker-compose.yml` 会从 `../.env` 加载环境变量，并将 `./output` 挂载到容器内 `/app/output`。

### 直接运行容器

```bash
docker run --rm \
  -e TTX_USERNAME=HFLS17 \
  -e TTX_PASSWORD=xxx \
  -e GENISPCE_API_TOKEN=xxx \
  -v $(pwd)/output:/app/output \
  script-tristate-ttx-export:latest
```

## 使用说明

### 选择报表类型

```bash
# 导出入库单头部
export REPORT_TYPE='receipt_header'

# 导出入库单明细
export REPORT_TYPE='receipt_details'

# 导出 B2C 出库单
export REPORT_TYPE='b2c_shipment'

# 导出 B2B 出库单
export REPORT_TYPE='b2b_shipment'

# 导出 B2C 拣货明细
export REPORT_TYPE='paking_details'

# 导出全部报表
export REPORT_TYPE='all'
```

### 选择输出格式

```bash
# 仅导出到 CSV
export OUTPUT_FORMAT='csv'

# 仅导出到 JSON
export OUTPUT_FORMAT='json'

# 仅同步到 API（dataSource）
export OUTPUT_FORMAT='dataSource'

# 同时导出到文件和 API
export OUTPUT_FORMAT='both'
```

### 组合使用

```bash
# 导出 B2C 出库单到 API
export REPORT_TYPE='b2c_shipment'
export OUTPUT_FORMAT='dataSource'
node ttx_export.js
```

## 报表类型

### 入库单头部（receipt_header）

导出通天晓系统的入库单主信息，包括单据状态、货主、仓库等核心字段。

**查询参数：**
- `warehouseCode`: 仓库代码（默认 HF）
- `companyCode`: 货主代码
- `startDate`: 创建开始日期
- `endDate`: 创建结束日期
- `checkinStartDate`: 签收开始日期
- `checkinEndDate`: 签收结束日期
- `pageSize`: 每页数量（默认 500）

**输出文件：**
- `receipt_header_report.csv`
- `receipt_header_report.json`

### 入库单明细（receipt_details）

导出详细的入库单明细信息，包含货品信息、数量信息等。

**查询参数：**
- `warehouseCode`: 仓库代码（默认 HF）
- `companyCode`: 货主代码
- `receiptTypes`: 入库单类型列表
  - `CGRK`: 采购入库
  - `DBRK`: 调拨入库
  - `THRK`: 退货入库
  - `QTRK`: 其他入库
  - `B2BRK`: B2B 入库
  - `HHRK`: 货转入库
- `startDate`: 创建开始日期
- `endDate`: 创建结束日期
- `pageSize`: 每页数量（默认 500）

**输出文件：**
- `receipt_details_report.csv`
- `receipt_details_report.json`

### B2C 出库单（b2c_shipment）

导出电商出库单信息，包含订单信息、物流信息、收件人信息等。

**查询参数：**
- `warehouseCode`: 仓库代码（默认 HF）
- `companyCode`: 货主代码
- `processType`: 处理类型（默认 NORMAL）
- `leadingStsBegin`: 首状态起始值
- `leadingStsEnd`: 首状态结束值
- `startDate`: 创建开始日期
- `endDate`: 创建结束日期
- `pageSize`: 每页数量（默认 500）

**输出文件：**
- `b2c_shipment_report.csv`
- `b2c_shipment_report.json`

### B2B 出库单（b2b_shipment）

导出 B2B 业务出库单信息，包含订单信息、物流信息、客户信息等。

**查询参数：**
- `warehouseCode`: 仓库代码（默认 HF）
- `companyCode`: 货主代码
- `processType`: 处理类型（默认 NORMAL）
- `leadingStsBegin`: 首状态起始值
- `leadingStsEnd`: 首状态结束值
- `startDate`: 创建开始日期
- `endDate`: 创建结束日期
- `pageSize`: 每页数量（默认 500）

**输出文件：**
- `b2b_shipment_report.csv`
- `b2b_shipment_report.json`

### B2C拣货明细（paking_details）

导出B2C拣货明细报表，包含拣货任务、SKU信息、拣货员等详细数据。

**查询参数：**
- `startDate`: 创建开始日期
- `endDate`: 创建结束日期
- `pageSize`: 每页数量（默认 100）

**输出文件：**
- `b2c_paking_details_report.csv`
- `b2c_paking_details_report.json`

## 字段映射

### 入库单头部字段映射

| 原始字段 | 目标字段 |
|----------|----------|
| `id` | `id` |
| `code` | `inbound_order_no` |
| `erpOrderCode` | `source_order_no` |
| `userDef3` | `jit_return_no` |
| `receiptType` | `inbound_type` |
| `companyCode` | `owner` |
| `qtyRatio` | `qty_ratio` |
| `totalQty` | `total_qty` |
| `totalLines` | `total_lines` |
| `leadingSts` | `first_status` |
| `trailingSts` | `last_status` |
| `returnWaybillCode` | `express_no` |
| `shipFromAttentionTo` | `store_name` |
| `uploadBatch` | `upload_batch` |
| `created` | `create_time` |
| `userDef5` | `user_def5` |
| `userDef6` | `user_def6` |
| `receiptNote` | `remark` |
| `endCheckinDatetime` | `callback_time` |
| `scheduledArriveDate` | `expected_arrival_date` |
| `userDef1` | `user_def1` |
| `shipFromName` | `supplier_name` |
| `auditStatus` | `audit_status` |
| `iqcStatus` | `iqc_status` |
| `iqcPoint` | `iqc_point` |
| `crossDockMode` | `cross_dock_mode` |
| `returnException` | `return_exception` |
| `consolidateCode` | `consolidate_code` |
| `purchaseOrderCode` | `purchase_order_code` |
| `warehouseTransferCode` | `warehouse_transfer_code` |
| `warehouseCode` | `warehouse` |

### 入库单明细字段映射

| 原始字段 | 目标字段 |
|----------|----------|
| `货主` | `owner` |
| `入库单号` | `inbound_order_no` |
| `来源单号` | `source_order_no` |
| `入库单类型` | `inbound_type` |
| `货品编码` | `sku` |
| `库存状态` | `inventory_status` |
| `计划数量` | `planned_qty` |
| `已收货数` | `received_qty` |
| `已上架数` | `shelved_qty` |
| `货号` | `style_number` |
| `商品名称` | `product_name` |
| `颜色` | `color_number` |
| `规格` | `product_size` |
| `创建时间` | `create_time` |
| `收货日期` | `received_time` |
| `首状态` | `first_status` |
| `尾状态` | `last_status` |
| `整单完成时间` | `completion_time` |
| `客退快递单号` | `express_tracking_no` |
| `备注` | `remark` |
| `仓库` | `warehouse` |

### B2C 出库单字段映射

| 原始字段 | 目标字段 |
|----------|----------|
| `id` | `order_id` |
| `created` | `create_time` |
| `frontTime` | `order_time` |
| `payTime` | `payment_time` |
| `code` | `order_no` |
| `shipmentType` | `outbound_type` |
| `companyCode` | `owner` |
| `carrierCode` | `carrier` |
| `processType` | `process_type` |
| `sourceOrderCode` | `platform_order_no` |
| `primaryWaybillCode` | `express_no` |
| `waveId` | `wave` |
| `storeName` | `store` |
| `shipToState` | `province` |
| `shipToCity` | `city` |
| `qtyRatio` | `amount` |
| `totalQty` | `total_qty` |
| `totalLines` | `total_lines` |
| `shipToAttentionTo` | `receiver` |
| `consolidated` | `consolidated` |
| `warehouseTransferCode` | `warehouse_transfer_code` |
| `leadingSts` | `first_status` |
| `trailingSts` | `last_status` |
| `uploadByAt` | `upload_time` |
| `uploadByUser` | `upload_user` |
| `rejectionNote` | `failure_reason` |
| `actualShipDateTime` | `outbound_time` |
| `uploadBatch` | `upload_batch` |
| `deliveryNote` | `order_remark` |
| `warehouseCode` | `warehouse` |
| `isPresale` | `is_presale` |
| `sourcePlatform` | `source_platform` |
| `plannedQty` | `review_qty` |
| `pickedQty` | `picking_qty` |
| `packedQty` | `outbound_qty` |

### B2B 出库单字段映射

| 原始字段 | 目标字段 |
|----------|----------|
| `id` | `order_id` |
| `created` | `create_time` |
| `code` | `order_no` |
| `shipmentType` | `outbound_type` |
| `companyCode` | `owner` |
| `carrierCode` | `carrier` |
| `processType` | `process_type` |
| `userDef1` | `customer` |
| `primaryWaybillCode` | `express_no` |
| `waveId` | `wave` |
| `shipToName` | `customer_name` |
| `shipTo` | `vip_order_no` |
| `shipToAttentionTo` | `receiver` |
| `shipToState` | `province` |
| `shipToCity` | `city` |
| `qtyRatio` | `amount` |
| `totalQty` | `total_qty` |
| `totalLines` | `total_lines` |
| `totalContainers` | `total_boxes` |
| `consolidated` | `consolidated` |
| `leadingSts` | `first_status` |
| `trailingSts` | `last_status` |
| `uploadBatch` | `upload_batch` |
| `deliveryNote` | `order_remark` |
| `rejectionNote` | `failure_reason` |
| `sourcePlatform` | `source_platform` |
| `userDef8` | `callback_time` |
| `packageCenterName` | `store` |
| `warehouseCode` | `warehouse` |

### B2C拣货明细字段映射

| 原始字段 | 目标字段 |
|----------|----------|
| `qty` | `qty` |
| `sku` | `sku` |
| `owner` | `owner` |
| `picker` | `picker` |
| `task_no` | `task_no` |
| `wave_no` | `wave_no` |
| `source_type` | `source_type` |
| `process_type` | `process_type` |
| `product_name` | `product_name` |
| `product_size` | `product_size` |
| `style_number` | `style_number` |
| `business_type` | `business_type` |
| `source_order_no` | `source_order_no` |
| `picking_end_time` | `picking_end_time` |
| `picking_location` | `picking_location` |
| `task_create_time` | `task_create_time` |
| `picking_start_time` | `picking_start_time` |

## 数据脱敏

### 功能概述

在导出 B2C 出库单数据时，部分记录的收件人信息（`receiver` 字段）会以加密字符串形式存储。这些字符串通常以 `##` 开头，长度超过 100 个字符。

在导出 B2B 出库单数据时，敏感信息字段（`receiver`、`shipToAddress1`）也可能以加密字符串形式存储。

为保护敏感信息，系统在通过 API 导入数据时会自动对这些字段进行脱敏处理。

### 脱敏规则

系统会检测以下条件自动替换为 `******`：

- 字段值以 `##` 开头
- 字段值长度超过 20 个字符

### 示例

| 原始值 | 脱敏后 |
|--------|--------|
| `##Wdir4LnZa3G4CdOiNBDpR9C04r...` | `******` |
| `李世辉` | `李世辉` |
| `小**` | `小**` |

### 代码实现

脱敏功能在 `ttx_b2c_shipment.js` 和 `ttx_b2b_shipment.js` 中实现：

```javascript
// 检测是否需要脱敏
shouldMask(value) {
    if (typeof value !== 'string') return false;
    return value.startsWith('##') && value.length > 20;
}

// 对敏感数据进行脱敏处理
maskSensitiveData(records) {
    return records.map(record => {
        const maskedRecord = { ...record };
        // B2C: 对 receiver 字段进行脱敏
        if (this.shouldMask(maskedRecord.receiver)) {
            maskedRecord.receiver = '******';
        }
        // B2B: 对 receiver 和 shipToAddress1 字段进行脱敏
        if (this.shouldMask(maskedRecord.receiver)) {
            maskedRecord.receiver = '******';
        }
        if (this.shouldMask(maskedRecord.shipToAddress1)) {
            maskedRecord.shipToAddress1 = '******';
        }
        return maskedRecord;
    });
}
```

## API 配置

数据源 API 的 Base URL 和 Token 通过 `.env` 中的 `GENISPCE_BASE_URL`、`GENISPCE_API_TOKEN` 配置，各报表对应的数据源 ID 在脚本中已内置。

### 数据源 ID 一览

| 报表类型 | 数据源 ID |
|----------|-----------|
| 入库单头部 | `ace5c767-4bce-4da0-b46b-e36e9af365a1` |
| 入库单明细 | `c2306183-f7c2-4a56-bc8f-59c37882afca` |
| B2C 出库单 | `e7fbe6d1-060a-4fd8-9c32-77cf960bf5c7` |
| B2B 出库单 | `809a7e42-6f79-4a82-b776-2734a7076f25` |
| B2C 拣货明细 | `da65089e-0772-465c-b034-06956304c373` |

API 地址格式：`${GENISPCE_BASE_URL}/datasources/${datasourceId}/data`

## 常见问题

### 找不到 Chrome/Chromium

- **本地运行**：安装 Chrome 或 Chromium，或设置 `PUPPETEER_EXECUTABLE_PATH`
- **Docker**：镜像已内置 Chromium，无需额外配置

### 获取不到数据

检查 `TTX_START_DATE`、`TTX_END_DATE` 及仓库、货主等筛选条件是否合理，建议先用较宽的时间范围测试。

### API 插入失败

确认 `.env` 中 `GENISPCE_API_TOKEN`、`GENISPCE_BASE_URL` 正确，并检查网络连通性。

### .env 未生效

`.env` 位于**项目根目录**，路径为 `../.env`（相对于 `scripts/`）。若从其他目录运行，需保证该路径下存在 `.env`。

## 文件结构

```
scripts/
├── ttx_export.js               # 主导出脚本（入口，支持 TTX_SYNC_STEP 分步）
├── ttx_data_sync.js            # 数据同步模块（镜像表→临时表→职能表）
├── ttx_download_center.js      # 任务中心导出文件下载
├── ttx_receipt_header.js       # 入库单头部
├── ttx_receipt_header_ex.js    # 入库单扩展（Excel 任务中心）
├── ttx_receipt_details.js      # 入库单明细
├── ttx_b2c_shipment.js         # B2C 出库单
├── ttx_b2b_shipment.js         # B2B 出库单
├── ttx_b2c_paking_details.js   # B2C 拣货明细
├── test_last_run_date.js       # 测试最后运行日期
├── Dockerfile                  # Docker 镜像构建
├── docker-compose.yml          # Docker Compose 配置
└── output/                     # 输出目录（可挂载）
```

## 更新日志

| 日期 | 版本 | 变更说明 |
|------|------|----------|
| 2026-02-10 | 1.0 | 初始版本，支持入库单头部和 B2C 出库单导出 |
| 2026-02-10 | 1.1 | 新增入库单明细导出功能；优化字段映射 |
| 2026-02-10 | 1.2 | 新增 dataSource 输出格式；支持直接同步到 API |
| 2026-02-10 | 1.3 | 新增 receiver 字段脱敏功能 |
| 2026-02-11 | 1.4 | 新增 B2B 出库单导出功能；支持 B2B 敏感字段脱敏 |
| 2026-02-11 | 1.5 | 新增 B2C 拣货明细导出功能 |
| 2026-02-28 | 1.6 | 完善 Docker 部署说明；补充 .env 变量；修复表格格式 |
