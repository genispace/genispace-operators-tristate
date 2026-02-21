# 通天晓WMS数据导出工具

用于从通天晓WMS系统（Cybertrans）导出报表数据。

## 实现方案

本工具采用 **浏览器自动化** 方案（Puppeteer + Headless Chromium），原因如下：

### 为什么选择浏览器自动化而非纯API调用？

| 方面 | 浏览器自动化 | 纯API调用 |
|------|-------------|----------|
| **稳定性** | ✅ 高 - 复用官方认证逻辑 | ❌ 低 - 需自己实现签名，可能被更新破坏 |
| **维护成本** | ✅ 低 - 签名算法变更不影响 | ❌ 高 - 签名算法变更需重新逆向 |
| **登录处理** | ✅ 自动处理 | ❌ 需手动处理验证码、MFA等 |
| **Session管理** | ✅ 自动刷新 | ❌ 需处理过期和刷新 |
| **执行速度** | ⚡ ~20秒/3000条 | ⚡ 稍快 |
| **资源占用** | ⚠️ 需Chromium进程（~200MB） | ✅ 轻量 |

### 核心技术原理

通过 Puppeteer 控制 Chromium 浏览器：
1. 访问登录页面并自动填写凭据
2. 等待登录完成，获取 `window.app.session`
3. 在浏览器上下文中调用 `window.app.dataManager.get()` 方法
4. 该方法自动处理所有认证头部和签名生成
5. 返回数据并导出为 CSV/JSON

---

## 快速开始

### 方式一：本地运行

```bash
cd operators-tristate/scripts

# 安装依赖（只需执行一次）
npm install

# 运行导出
node ttx_export.js
```

**要求**：本地需安装 Chrome/Chromium 浏览器

### 方式二：Docker 容器运行（推荐）

```bash
cd operators-tristate/scripts

# 构建镜像
docker build -t magecommerce-docker.pkg.coding.net/genispace/images/script-tristate-ttx-export:latest .

# 运行（使用环境变量配置）
docker run --rm \
  -e TTX_USERNAME=HFLS17 \
  -e TTX_PASSWORD=Xyy1234567 \
  -e TTX_WAREHOUSE=HF \
  -e TTX_COMPANY=HF-SPD \
  -v $(pwd)/output:/app/output \
  magecommerce-docker.pkg.coding.net/genispace/images/script-tristate-ttx-export:latest

# 或者使用 docker-compose
docker-compose up --build
```

**优点**：
- 无需本地安装 Chrome
- 可在无图形界面的服务器上运行
- 适合 CI/CD 和 Kubernetes CronJob

导出完成后会生成（根据 `REPORT_TYPE` 设置）：
- `output/inbound_report.csv` / `.json` - 入库明细报表
- `output/b2c_shipment_report.csv` / `.json` - B2C出库单

---

## Docker 部署

### 镜像构建

```bash
# 构建镜像
docker build -t magecommerce-docker.pkg.coding.net/genispace/images/script-tristate-ttx-export:latest .

# 推送到私有仓库
docker push magecommerce-docker.pkg.coding.net/genispace/images/script-tristate-ttx-export:latest
```

### 环境变量

#### 连接配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TTX_BASE_URL` | 服务地址 | `https://ttx.56xyy.com` |
| `TTX_CUSTOMER` | 租户ID | `xyy-wms-prod` |
| `TTX_USERNAME` | 用户名 | - |
| `TTX_PASSWORD` | 密码 | - |

#### 报表选择

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REPORT_TYPE` | 报表类型 | `all` |

可选值：
- `inbound` - 仅导出入库明细报表
- `b2c_shipment` - 仅导出B2C出库单
- `all` - 导出全部报表

#### 通用查询条件

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TTX_WAREHOUSE` | 仓库代码 | `HF` |
| `TTX_COMPANY` | 货主代码 | `HF-SPD` |
| `TTX_START_DATE` | 开始日期（格式：YYYY-MM-DD HH:mm:ss） | 本月1日 |
| `TTX_END_DATE` | 结束日期 | - |

#### 入库报表特有条件

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TTX_RECEIPT_TYPES` | 入库类型（逗号分隔） | `CGRK,DBRK,THRK,QTRK,B2BRK,HHRK` |

#### B2C出库单特有条件

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `TTX_PROCESS_TYPE` | 处理类型 | `NORMAL` |
| `TTX_LEADING_STS_BEGIN` | 首状态起始值 | - |
| `TTX_LEADING_STS_END` | 首状态结束值 | - |

**首状态值说明**：
| 值 | 含义 |
|-----|------|
| 100 | 待处理 |
| 200 | 已分配 |
| 300 | 已拣货 |
| 400 | 已复核 |
| 500 | 已打包 |
| 900 | 已发货 |

#### 输出配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OUTPUT_DIR` | 输出目录 | `/app/output` |
| `OUTPUT_FORMAT` | 输出格式 | `both` (csv/json/both) |
| `HEADLESS` | 无头模式 | `true` |
| `PAGE_SIZE` | 每批数量 | `500` |

### Kubernetes CronJob 示例

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ttx-inbound-report
spec:
  schedule: "0 6 * * *"  # 每天早上6点执行
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: script-tristate-ttx-export
            image: magecommerce-docker.pkg.coding.net/genispace/images/script-tristate-ttx-export:latest
            env:
            - name: TTX_USERNAME
              valueFrom:
                secretKeyRef:
                  name: ttx-credentials
                  key: username
            - name: TTX_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: ttx-credentials
                  key: password
            - name: TTX_WAREHOUSE
              value: "HF"
            - name: TTX_COMPANY
              value: "HF-SPD"
            - name: OUTPUT_DIR
              value: "/app/output"
            volumeMounts:
            - name: output
              mountPath: /app/output
          volumes:
          - name: output
            persistentVolumeClaim:
              claimName: ttx-output-pvc
          restartPolicy: OnFailure
```

### Docker Compose 生产配置

```yaml
version: '3.8'
services:
  script-tristate-ttx-export:
    image: magecommerce-docker.pkg.coding.net/genispace/images/script-tristate-ttx-export:latest
    environment:
      - TTX_USERNAME=${TTX_USERNAME}
      - TTX_PASSWORD=${TTX_PASSWORD}
      - TTX_WAREHOUSE=HF
      - TTX_COMPANY=HF-SPD
    volumes:
      - ./output:/app/output
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

### 镜像技术细节

| 组件 | 说明 |
|------|------|
| 基础镜像 | `node:20-slim` |
| 浏览器 | Chromium（通过 apt 安装） |
| 中文字体 | `fonts-wqy-zenhei` |
| Puppeteer | `puppeteer-core`（使用系统 Chromium） |
| 启动参数 | `--no-sandbox --disable-setuid-sandbox` |

---

## 通天晓WMS系统技术原理

### 系统架构

通天晓WMS是基于 **Dojo** 框架构建的单页应用（SPA），使用自定义的认证和API签名机制。

- **前端框架**: Dojo Toolkit
- **UI组件**: dijit, gridx, cbtree
- **版本号**: 2.9.8.17（可通过 `window.app.CybertransVersion` 获取）

### 认证机制

系统使用多层认证机制：

1. **Session认证**: 登录后服务端返回 token 和 client ID
2. **请求签名**: 每个API请求都需要动态签名（`x-v` 头部）
3. **时间戳验证**: 签名与时间戳绑定，防止重放攻击

#### Session信息结构

登录成功后，session信息存储在 `window.app.session` 中：

```javascript
{
  "user": "HFLS17",           // 用户代码
  "userName": "徐斌",          // 用户名称
  "token": "fb810c9706d2...", // 认证Token（32位UUID）
  "client": "cf802cc37d8b...", // 客户端ID（32位UUID）
  "db": "xyy-wms-prod",       // 数据库/租户ID
  "locale": "zh",             // 语言
  "portal": "biz",            // 门户类型
  "params": {                 // 用户参数
    "warehouse": "HF",        // 默认仓库
    "user": "HFLS17",
    "orgCode": "XYY"          // 组织代码
  },
  "orgCode": "XYY",
  "orgName": "新亦源供应链"
}
```

### API签名算法

每个API请求都需要在头部携带签名信息：

#### 签名头部

| 头部 | 说明 | 示例 |
|------|------|------|
| `X-Token` | 认证Token | `fb810c9706d24e00928eb5d3f4c184f7` |
| `X-Client` | 客户端ID | `cf802cc37d8b4f5398adb5c08315e880` |
| `X-DB` | 数据库/租户 | `xyy-wms-prod` |
| `X-User` | 用户代码 | `HFLS17` |
| `X-Locale` | 语言 | `zh` |
| `X-Portal` | 门户类型 | `biz` |
| `x-params` | 用户参数JSON | `{"warehouse":"HF","user":"HFLS17","orgCode":"XYY"}` |
| `x-t` | 时间戳（毫秒） | `1770483334758` |
| `x-v` | 请求签名 | `zYkAUHhFqG9I6A%2FHqaV4bemUihfU%2FVPkFX4VY8g350I%3D` |

#### 签名算法

签名通过 `window.app.dataManager.fab(path, timestamp)` 函数生成：

```javascript
// 签名算法步骤：
function generateSignature(path, timestamp) {
    // Step 1: 处理URL路径
    // 模拟 new URL("http://x" + path).pathname
    // 这会对非ASCII字符（如中文）进行URL编码
    let pathname = path;
    if (!pathname.startsWith("/")) pathname = "/" + pathname;
    pathname = new URL("http://x" + pathname).pathname;
    // 例如: "/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表"
    // 变成: "/rest/sqlTemplate/grid/_XLS_reciept1/%E5%85%A5%E5%BA%93%E6%98%8E%E7%BB%86%E6%8A%A5%E8%A1%A8"
    
    // Step 2: encodeURIComponent（双重编码）
    let encoded = encodeURIComponent(pathname);
    // 例如: "%2Frest%2FsqlTemplate%2Fgrid%2F_XLS_reciept1%2F%25E5%2585%25A5..."
    
    // Step 3: 构造输入字符串
    let input = "cyber" + timestamp + encoded + timestamp + encoded + "trans";
    
    // Step 4: Base64编码
    let base64Input = btoa(input);
    
    // Step 5: SHA256哈希并转为Base64
    let hash = CryptoJS.SHA256(base64Input);
    let signature = hash.toString(CryptoJS.enc.Base64);
    
    // Step 6: URL编码签名
    return encodeURIComponent(signature);
}
```

#### Python实现

```python
import hashlib
import base64
from urllib.parse import quote

def generate_signature(path: str, timestamp: int) -> str:
    """生成API请求签名"""
    # Step 1: 对中文进行URL编码，保留 / 和 :
    pathname = quote(path, safe='/:')
    
    # Step 2: encodeURIComponent（双重编码）
    encoded = quote(pathname, safe='')
    
    # Step 3: 构造输入字符串
    input_str = f"cyber{timestamp}{encoded}{timestamp}{encoded}trans"
    
    # Step 4: Base64编码
    base64_input = base64.b64encode(input_str.encode()).decode()
    
    # Step 5: SHA256哈希并转为Base64
    sha256_hash = hashlib.sha256(base64_input.encode()).digest()
    signature = base64.b64encode(sha256_hash).decode()
    
    return signature
```

### API端点结构

#### 基础URL
```
https://ttx.56xyy.com
```

#### 主要API端点

| 端点 | 说明 | 方法 |
|------|------|------|
| `/rest/auth/login` | 用户登录 | POST |
| `/rest/auth/logout` | 用户登出 | GET |
| `/rest/auth/checkLogin` | 检查登录状态 | GET |
| `/rest/auth/loginPageConfig` | 获取登录页配置 | GET |
| `/rest/cbt/nav/get` | 获取导航菜单 | GET |
| `/rest/cbt/filteringSelect/{field}` | 获取下拉选项 | GET |
| `/rest/sqlTemplate/grid/{templateId}/{reportName}` | 获取报表数据 | GET |

#### 报表API示例

入库明细报表：
```
GET /rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表
```

请求头（除签名头部外）：
```
Range: items=0-99
X-Range: items=0-99
filter: <URL编码的JSON筛选条件>
Accept: application/javascript, application/json
```

### 筛选条件格式

筛选条件使用JSON格式，通过 `filter` 头部传递（需URL编码）：

```json
{
  "and": [
    {
      "field": "rh.warehouseCode",
      "value": "HF",
      "operator": "in"
    },
    {
      "field": "rd.companyCode",
      "value": "HF-SPD",
      "operator": "in"
    },
    {
      "field": "rh.receiptType",
      "value": "CGRK,DBRK,THRK",
      "operator": "in"
    },
    {
      "field": "rh.created:begin",
      "value": "2026-02-01 00:00:00",
      "operator": ">="
    },
    {
      "field": "rh.created:end",
      "value": "2026-02-28 23:59:59",
      "operator": "<="
    }
  ]
}
```

#### 操作符

| 操作符 | 说明 |
|--------|------|
| `=` | 等于 |
| `!=` | 不等于 |
| `>` | 大于 |
| `>=` | 大于等于 |
| `<` | 小于 |
| `<=` | 小于等于 |
| `in` | 包含（多值用逗号分隔） |
| `like` | 模糊匹配 |

### 分页机制

使用 HTTP Range 头部进行分页：

```
Range: items=0-99      // 获取第0-99条记录（共100条）
Range: items=100-199   // 获取第100-199条记录
```

响应会在 `Content-Range` 头部返回总记录数：
```
Content-Range: items 0-99/3014
```

---

## 数据获取方法

### 方法1：浏览器自动化（当前实现，推荐）

由于签名机制复杂且与 session 绑定，使用 Puppeteer 进行浏览器自动化：

**工作流程**：
1. 启动 Headless Chromium 访问登录页
2. 自动填写用户名密码并登录
3. 等待 `window.app.session` 初始化完成
4. 通过 `page.evaluate()` 在浏览器上下文中调用 `window.app.dataManager.get()` 
5. 该方法自动处理所有认证头部和签名生成

**核心代码**：
```javascript
// 在浏览器上下文中执行（page.evaluate）
const result = await window.app.dataManager.get(path, {
    headers: {
        'Range': 'items=0-99',
        'X-Range': 'items=0-99',
        'filter': encodeURIComponent(filterJson),
        'Accept': 'application/javascript, application/json'
    }
});
```

**优点**：
- 完全复用官方认证逻辑，稳定性高
- 签名算法更新不影响脚本
- 自动处理 session 刷新

**缺点**：
- 需要启动浏览器进程（资源占用约 200MB）
- 首次启动稍慢（约 5 秒）

### 方法2：纯API调用（不推荐，仅供参考）

理论上可以直接调用 API，但存在以下问题：

1. **签名算法复杂**：需要正确实现双重 URL 编码 + Base64 + SHA256
2. **Session 绑定**：服务端会验证 session 与请求的关联性
3. **快速过期**：Token 可能在几分钟内过期
4. **算法可能变更**：通天晓系统更新可能修改签名算法

如需尝试，需要：
1. 先通过浏览器登录获取 session 信息
2. 实现签名算法（参见"API签名算法"章节）
3. 处理 session 过期和刷新

### 方法3：导出其他报表

要导出其他报表，需要：

1. **获取 API 路径**：
   - 在浏览器中打开目标报表
   - 打开开发者工具 → Network 标签
   - 筛选 `sqlTemplate` 关键字
   - 记录请求路径（如 `/rest/sqlTemplate/grid/_XLS_xxx/报表名称`）

2. **分析筛选条件**：
   - 查看请求的 `filter` 头部
   - URL 解码后分析 JSON 结构
   - 记录可用的字段名和操作符

3. **修改脚本**：
   - 复制 `getInboundReport` 方法
   - 修改 API 路径和筛选条件构建逻辑

**示例**：
```javascript
async getOutboundReport(options = {}) {
    const filters = { and: [] };
    // 添加筛选条件...
    
    const path = '/rest/sqlTemplate/grid/_XLS_shipment1/出库明细报表';
    // 调用 dataManager.get()...
}
```

---

## 脚本配置说明

### 修改登录信息

编辑 `ttx_export.js` 文件末尾的 `main()` 函数：

```javascript
const exporter = new TTXExporter({
    baseUrl: 'https://ttx.56xyy.com',
    customer: 'xyy-wms-prod',    // 租户ID
    username: 'HFLS17',          // 用户名
    password: 'Xyy1234567',      // 密码
    headless: true               // false 可查看浏览器操作
});
```

### 修改查询条件

```javascript
const data = await exporter.getInboundReport({
    warehouseCode: 'HF',                              // 仓库代码
    companyCode: 'HF-SPD',                            // 货主代码（可选）
    receiptTypes: ['CGRK', 'DBRK', 'THRK', 'QTRK'],   // 入库类型（可选）
    startDate: '2026-02-01 00:00:00',                 // 开始日期（可选）
    endDate: '2026-02-28 23:59:59',                   // 结束日期（可选）
    pageSize: 500                                     // 每批获取数量
});
```

### 添加新的报表导出

在 `TTXExporter` 类中添加新方法：

```javascript
async getOtherReport(options = {}) {
    // 构建筛选条件
    const filters = { and: [] };
    // ... 添加筛选条件
    
    const filterJson = JSON.stringify(filters);
    
    // 调用API
    const result = await this.page.evaluate(async (args) => {
        const { filterJson, pageStart, pageSize } = args;
        
        // 修改为新报表的路径
        const path = '/rest/sqlTemplate/grid/_XLS_xxx/新报表名称';
        
        return new Promise((resolve) => {
            const options = {
                headers: {
                    'Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                    'X-Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                    'filter': encodeURIComponent(filterJson),
                    'Accept': 'application/javascript, application/json'
                }
            };
            
            window.app.dataManager.get(path, options).then(
                (data) => resolve({ success: true, data: data }),
                (error) => resolve({ success: false, error: error.message })
            );
        });
    }, { filterJson, pageStart: 0, pageSize: options.pageSize || 500 });
    
    return result.data || [];
}
```

---

## 数据字段说明（入库明细报表）

| 字段 | 说明 |
|------|------|
| 货主 | 货主名称 |
| 入库单号 | 入库单编号 |
| 来源单号 | 原始订单号 |
| 入库单类型 | 如：采购入库、调拨入库、退货入库等 |
| 货品编码 | 商品条码 |
| 计划数量 | 计划入库数量 |
| 已收货数 | 实际收货数量 |
| 已上架数 | 已上架数量 |
| 货号 | 商品货号 |
| 商品名称 | 商品名称 |
| 颜色 | 商品颜色 |
| 规格 | 商品规格 |
| 创建时间 | 入库单创建时间 |
| 收货日期 | 实际收货日期 |
| 首状态 | 首次状态 |
| 尾状态 | 当前状态 |
| 整单完成时间 | 入库完成时间 |
| 客退快递单号 | 退货快递单号（退货入库时） |
| 备注 | 备注信息 |
| 仓库 | 仓库名称 |

## 入库类型代码

| 代码 | 说明 |
|------|------|
| CGRK | 采购入库 |
| DBRK | 调拨入库 |
| THRK | 退货入库 |
| QTRK | 其他入库 |
| B2BRK | B2B入库 |
| HHRK | 换货入库 |

---

## 数据字段说明（B2C出库单）

| 字段 | 说明 |
|------|------|
| id | 出库单ID |
| code | 出库单号 |
| created | 创建时间 |
| frontTime | 前端时间 |
| payTime | 支付时间 |
| shipmentType | 出库类型 |
| companyCode | 货主代码 |
| carrierCode | 承运商代码 |
| processType | 处理类型 |
| userDef1 | 订单来源（如 TM=天猫） |
| sourceOrderCode | 来源订单号 |
| primaryWaybillCode | 快递单号 |
| waveId | 波次ID |
| storeName | 店铺名称 |
| shipToState | 收货省份 |
| shipToCity | 收货城市 |
| totalQty | 总数量 |
| totalLines | 总行数 |
| shipToAttentionTo | 收货人 |
| consolidated | 是否合单 |
| warehouseTransferCode | 调拨单号 |
| leadingSts | 首状态 |
| trailingSts | 尾状态 |
| uploadByAt | 上传时间 |
| uploadByUser | 上传用户 |
| rejectionNote | 拒绝原因 |
| actualShipDateTime | 实际发货时间 |
| uploadBatch | 上传批次 |
| deliveryNote | 配送备注 |
| userDef5 | 自定义字段5 |

## 出库状态代码

| 状态值 | 说明 |
|--------|------|
| 100 | 待处理（新建） |
| 200 | 已分配 |
| 300 | 已拣货 |
| 400 | 已复核 |
| 500 | 已打包 |
| 900 | 已发货 |

## 出库类型代码

| 代码 | 说明 |
|------|------|
| JYCK | 经营出库 |
| DBCK | 调拨出库 |
| QTCK | 其他出库 |

---

## 故障排除

### 登录失败
- 检查用户名密码是否正确
- 尝试设置 `HEADLESS=false`（本地）查看实际登录过程
- 检查是否需要验证码（当前配置为 `captcha: "none"`）
- 确认网络能访问 `ttx.56xyy.com`

### 数据获取为空
- 检查查询条件是否正确（仓库代码、日期范围等）
- 确认账号有权限访问该报表
- 尝试放宽筛选条件（如去掉日期限制）

### 401 账号登录状态异常
- 确保使用 `dataManager.get()` 方法而非直接 `fetch`
- 增加登录后的等待时间
- session 可能已过期，需要重新运行

### 超时错误
- 检查网络连接
- 尝试增加 `waitForTimeout` 的时间
- 减少 `PAGE_SIZE` 值

### Docker 相关问题

#### 容器内浏览器启动失败
```
Error: Failed to launch the browser process
```
**解决方案**：确保 Dockerfile 中包含 `--no-sandbox` 参数

#### 中文显示为方块
**解决方案**：确保安装了中文字体
```dockerfile
RUN apt-get install -y fonts-wqy-zenhei
```

#### 内存不足 (OOM)
**解决方案**：增加容器内存限制
```yaml
deploy:
  resources:
    limits:
      memory: 1G
```

#### 权限问题（输出目录）
```
Error: EACCES: permission denied
```
**解决方案**：
```bash
# 创建输出目录并设置权限
mkdir -p output && chmod 777 output

# 或者在容器内以 root 运行（不推荐生产环境）
docker run --user root ...
```

#### 网络无法访问
**解决方案**：检查 DNS 和代理配置
```bash
# 使用主机网络
docker run --network host ...

# 或指定 DNS
docker run --dns 8.8.8.8 ...
```

---

## 调试技巧

### 在浏览器中测试API

```javascript
// 获取当前session信息
console.log(JSON.stringify(window.app.session, null, 2));

// 测试API调用
window.app.dataManager.get('/rest/cbt/filteringSelect/warehouse').then(console.log);

// 测试报表API
const filters = {"and":[{"field":"rh.warehouseCode","value":"HF","operator":"in"}]};
window.app.dataManager.get('/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表', {
    headers: {
        'Range': 'items=0-9',
        'X-Range': 'items=0-9',
        'filter': encodeURIComponent(JSON.stringify(filters))
    }
}).then(console.log);
```

### 查看签名生成

```javascript
// 生成签名
const path = "/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表";
const timestamp = Date.now();
const signature = window.app.dataManager.fab(path, timestamp);
console.log("Timestamp:", timestamp);
console.log("Signature:", decodeURIComponent(signature));
```
