# 通天晓WMS数据导出工具

用于从通天晓WMS系统（Cybertrans）导出报表数据。

## 快速开始

```bash
cd /Users/joshua/Workspaces/GeniSpace/CorePlatform/operators-tristate/scripts

# 安装依赖（只需执行一次）
npm install

# 运行导出
node ttx_export.js
```

导出完成后会生成：
- `inbound_report.csv` - CSV格式（可用Excel打开）
- `inbound_report.json` - JSON格式

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

### 方法1：浏览器自动化（推荐）

由于签名机制复杂且与session绑定，推荐使用 Puppeteer 进行浏览器自动化：

1. 启动浏览器访问登录页
2. 填写用户名密码并登录
3. 登录成功后，通过 `window.app.dataManager.get()` 方法发送API请求
4. 该方法会自动处理签名和认证

核心代码：
```javascript
// 在浏览器上下文中执行
const result = await window.app.dataManager.get(path, {
    headers: {
        'Range': 'items=0-99',
        'X-Range': 'items=0-99',
        'filter': encodeURIComponent(filterJson),
        'Accept': 'application/javascript, application/json'
    }
});
```

### 方法2：纯API调用（需手动获取session）

如果能从浏览器获取有效的session信息，可以直接调用API：

1. 在浏览器控制台运行：
```javascript
console.log(JSON.stringify({
    token: window.app.session.token,
    client: window.app.session.client,
    params: window.app.session.params
}, null, 2));
```

2. 使用获取的信息调用API（注意：session会过期）

### 方法3：其他报表导出

要导出其他报表，需要：

1. 在浏览器中打开目标报表
2. 打开开发者工具 → Network 标签
3. 查看报表加载时的API请求
4. 记录：
   - API路径（如 `/rest/sqlTemplate/grid/_XLS_xxx/报表名称`）
   - 筛选条件格式
5. 修改 `ttx_export.js` 中的 `getInboundReport` 方法，更改路径和筛选条件

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

## 故障排除

### 登录失败
- 检查用户名密码是否正确
- 尝试设置 `headless: false` 查看实际登录过程
- 检查是否需要验证码（当前配置为 `captcha: "none"`）

### 数据获取为空
- 检查查询条件是否正确（仓库代码、日期范围等）
- 确认账号有权限访问该报表
- 查看浏览器控制台是否有错误信息

### 401 账号登录状态异常
- 确保使用 `dataManager.get()` 方法而非直接 `fetch`
- 增加登录后的等待时间
- session可能已过期，需要重新登录

### 超时错误
- 检查网络连接
- 尝试增加 `waitForTimeout` 的时间
- 减少 `pageSize` 值

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
