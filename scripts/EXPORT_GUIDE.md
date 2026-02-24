# 通天晓 WMS 数据导出指南

本项目用于从通天晓 WMS 系统导出各类报表数据，支持入库单头部、入库单明细、B2C 出库单、B2B 出库单四种报表类型。

## 目录

- [快速开始](#快速开始)
- [环境配置](#环境配置)
- [使用说明](#使用说明)
- [报表类型](#报表类型)
- [字段映射](#字段映射)
- [数据脱敏](#数据脱敏)
- [API 配置](#api-配置)
- [常见问题](#常见问题)

## 快速开始

```bash
# 安装依赖
npm install puppeteer-core dotenv

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 运行导出
node ttx_export.js
```

## 环境配置

通过 `.env` 文件配置以下参数：

|| 变量名 | 默认值 | 说明 |
||--------|--------|------|
|| `TTX_BASE_URL` | `https://ttx.56xyy.com` | 系统地址 |
|| `TTX_CUSTOMER` | `xyy-wms-prod` | 租户标识 |
|| `TTX_USERNAME` | `HFLS17` | 用户名 |
|| `TTX_PASSWORD` | `Xyy1234567` | 密码 |
|| `TTX_WAREHOUSE` | `HF` | 仓库代码 |
|| `TTX_COMPANY` | `HF-SPD` | 货主代码 |
|| `TTX_START_DATE` | `2026-02-05 00:00:00` | 开始日期 |
|| `TTX_END_DATE` | `2026-02-06 23:59:59` | 结束日期 |
|| `REPORT_TYPE` | `receipt_header` | 报表类型 |
|| `OUTPUT_FORMAT` | `dataSource` | 输出格式 |
|| `OUTPUT_DIR` | `.` | 输出目录 |
|| `PAGE_SIZE` | `500` | 每页数量 |
|| `HEADLESS` | `true` | 无头模式 |

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
- `endDate`: 创建结束pageSize`: 每日期
- `页数量（默认 500）

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

|| 原始字段 | 目标字段 |
||----------|----------|
|| `id` | `id` |
|| `code` | `inbound_order_no` |
|| `erpOrderCode` | `source_order_no` |
|| `userDef3` | `jit_return_no` |
|| `receiptType` | `inbound_type` |
|| `companyCode` | `owner` |
|| `qtyRatio` | `qty_ratio` |
|| `totalQty` | `total_qty` |
|| `totalLines` | `total_lines` |
|| `leadingSts` | `first_status` |
|| `trailingSts` | `last_status` |
|| `returnWaybillCode` | `express_no` |
|| `shipFromAttentionTo` | `store_name` |
|| `uploadBatch` | `upload_batch` |
|| `created` | `create_time` |
|| `userDef5` | `user_def5` |
|| `userDef6` | `user_def6` |
|| `receiptNote` | `remark` |
|| `endCheckinDatetime` | `callback_time` |
|| `scheduledArriveDate` | `expected_arrival_date` |
|| `userDef1` | `user_def1` |
|| `shipFromName` | `supplier_name` |
|| `auditStatus` | `audit_status` |
|| `iqcStatus` | `iqc_status` |
|| `iqcPoint` | `iqc_point` |
|| `crossDockMode` | `cross_dock_mode` |
|| `returnException` | `return_exception` |
|| `consolidateCode` | `consolidate_code` |
|| `purchaseOrderCode` | `purchase_order_code` |
|| `warehouseTransferCode` | `warehouse_transfer_code` |
|| `warehouseCode` | `warehouse` |

### 入库单明细字段映射

|| 原始字段 | 目标字段 |
||----------|----------|
|| `货主` | `owner` |
|| `入库单号` | `inbound_order_no` |
|| `来源单号` | `source_order_no` |
|| `入库单类型` | `inbound_type` |
|| `货品编码` | `sku` |
|| `库存状态` | `inventory_status` |
|| `计划数量` | `planned_qty` |
|| `已收货数` | `received_qty` |
|| `已上架数` | `shelved_qty` |
|| `货号` | `style_number` |
|| `商品名称` | `product_name` |
|| `颜色` | `color_number` |
|| `规格` | `product_size` |
|| `创建时间` | `create_time` |
|| `收货日期` | `received_time` |
|| `首状态` | `first_status` |
|| `尾状态` | `last_status` |
|| `整单完成时间` | `completion_time` |
|| `客退快递单号` | `express_tracking_no` |
|| `备注` | `remark` |
|| `仓库` | `warehouse` |

### B2C 出库单字段映射

|| 原始字段 | 目标字段 |
||----------|----------|
|| `id` | `order_id` |
|| `created` | `create_time` |
|| `frontTime` | `order_time` |
|| `payTime` | `payment_time` |
|| `code` | `order_no` |
|| `shipmentType` | `outbound_type` |
|| `companyCode` | `owner` |
|| `carrierCode` | `carrier` |
|| `processType` | `process_type` |
|| `sourceOrderCode` | `platform_order_no` |
|| `primaryWaybillCode` | `express_no` |
|| `waveId` | `wave` |
|| `storeName` | `store` |
|| `shipToState` | `province` |
|| `shipToCity` | `city` |
|| `qtyRatio` | `amount` |
|| `totalQty` | `total_qty` |
|| `totalLines` | `total_lines` |
|| `shipToAttentionTo` | `receiver` |
|| `consolidated` | `consolidated` |
|| `warehouseTransferCode` | `warehouse_transfer_code` |
|| `leadingSts` | `first_status` |
|| `trailingSts` | `last_status` |
|| `uploadByAt` | `upload_time` |
|| `uploadByUser` | `upload_user` |
|| `rejectionNote` | `failure_reason` |
|| `actualShipDateTime` | `outbound_time` |
|| `uploadBatch` | `upload_batch` |
|| `deliveryNote` | `order_remark` |
|| `warehouseCode` | `warehouse` |
|| `isPresale` | `is_presale` |
|| `sourcePlatform` | `source_platform` |
|| `plannedQty` | `review_qty` |
|| `pickedQty` | `picking_qty` |
|| `packedQty` | `outbound_qty` |

### B2B 出库单字段映射

|| 原始字段 | 目标字段 |
||----------|----------|
|| `id` | `order_id` |
|| `created` | `create_time` |
|| `code` | `order_no` |
|| `shipmentType` | `outbound_type` |
|| `companyCode` | `owner` |
|| `carrierCode` | `carrier` |
|| `processType` | `process_type` |
|| `userDef1` | `customer` |
|| `primaryWaybillCode` | `express_no` |
|| `waveId` | `wave` |
|| `shipToName` | `customer_name` |
|| `shipTo` | `vip_order_no` |
|| `shipToAttentionTo` | `receiver` |
|| `shipToState` | `province` |
|| `shipToCity` | `city` |
|| `qtyRatio` | `amount` |
|| `totalQty` | `total_qty` |
|| `totalLines` | `total_lines` |
|| `totalContainers` | `total_boxes` |
|| `consolidated` | `consolidated` |
|| `leadingSts` | `first_status` |
|| `trailingSts` | `last_status` |
|| `uploadBatch` | `upload_batch` |
|| `deliveryNote` | `order_remark` |
|| `rejectionNote` | `failure_reason` |
|| `sourcePlatform` | `source_platform` |
|| `userDef8` | `callback_time` |
|| `packageCenterName` | `store` |
|| `warehouseCode` | `warehouse` |

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

|| 原始值 | 脱敏后 |
||--------|--------|
|| `##Wdir4LnZa3G4CdOiNBDpR9C04r...` | `******` |
|| `李世辉` | `李世辉` |
|| `小**` | `小**` |

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

### 入库单头部 API

- **URL**: `https://api.genispace.cn/datasources/ace5c767-4bce-4da0-b46b-e36e9af365a1/data`
- **Token**: `q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx`

### 入库单明细 API

- **URL**: `https://api.genispace.cn/datasources/c2306183-f7c2-4a56-bc8f-59c37882afca/data`
- **Token**: `q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx`

### B2C 出库单 API

- **URL**: `https://api.genispace.cn/datasources/e7fbe6d1-060a-4fd8-9c32-77cf960bf5c7/data`
- **Token**: `q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx`

### B2B 出库单 API

- **URL**: `https://api.genispace.cn/datasources/809a7e42-6f79-4a82-b776-2734a7076f25/data`
- **Token**: `q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx`

### B2C 拣货明细 API

- **URL**: `https://api.genispace.cn/datasources/da65089e-0772-465c-b034-06956304c373/data`
- **Token**: `q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx`

## 常见问题

### 登录失败

如果提示找不到 Chrome/Chromium 浏览器，请检查系统是否已安装 Chrome 浏览器，或者设置 `CHROME_PATH` 环境变量。

### 获取不到数据

检查筛选条件是否过于严格，建议先使用较宽的时间范围测试。

### API 插入失败

检查 API URL 和 Token 是否正确，以及网络连接是否正常。

## 文件结构

```
scripts/
├── ttx_export.js              # 主导出脚本（入口）
├── ttx_receipt_header.js      # 入库单头部导出模块
├── ttx_receipt_details.js     # 入库单明细导出模块
├── ttx_b2c_shipment.js        # B2C 出库单导出模块
├── ttx_b2b_shipment.js        # B2B 出库单导出模块
├── ttx_b2c_paking_details.js # B2C 拣货明细导出模块
├── .env.example               # 环境变量示例
└── output/                    # 输出目录
    ├── b2c_shipment_report.json
    ├── b2b_shipment_report.json
    ├── b2c_paking_details_report.json
    └── inbound_report.json
```

## 更新日志

|| 日期 | 版本 | 变更说明 |
||------|------|----------|
|| 2026-02-10 | 1.0 | 初始版本，支持入库单头部和 B2C 出库单导出 |
|| 2026-02-10 | 1.1 | 新增入库单明细导出功能；优化字段映射 |
|| 2026-02-10 | 1.2 | 新增 dataSource 输出格式；支持直接同步到 API |
|| 2026-02-10 | 1.3 | 新增 receiver 字段脱敏功能 |
|| 2026-02-11 | 1.4 | 新增 B2B 出库单导出功能；支持 B2B 敏感字段脱敏 |
| 1.5 | 新增 B2C 拣货明细导出功能 |
