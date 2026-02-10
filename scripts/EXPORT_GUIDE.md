# 通天晓 WMS 导出脚本开发指南

## 项目概述

本项目是一个基于 Puppeteer 的浏览器自动化脚本，用于从通天晓 WMS 系统导出各类报表数据。项目采用 Node.js 开发，通过模拟浏览器行为实现数据抓取，支持 CSV、JSON 和 dataSource 三种输出格式。

dataSource 格式支持将数据直接同步到远程 API，无需生成中间文件。

项目的核心价值在于解决通天晓系统导出功能的局限性。当系统在网页端直接导出时存在数据量限制（通常仅支持导出前 10000 条记录），而通过本脚本可以绕过这一限制，实现全量数据的导出。这种方案利用了系统内部的数据接口，通过浏览器自动化登录后调用内部 API 获取数据，从而突破了网页导出的瓶颈。

从技术架构角度来看，项目采用分层设计模式。顶层是配置管理层，负责从环境变量读取各项参数；中间层是浏览器自动化层，处理登录、会话管理和页面交互；底层是数据获取层，负责调用系统内部接口并处理分页逻辑。这种分层设计确保了代码的模块化和可维护性，为后续新增导出功能提供了良好的扩展基础。

## 项目结构分析

### 根目录结构

```
genispace-operators-tristate/
├── scripts/                    # 导出脚本目录
│   ├── ttx_export.js         # 主导出脚本（核心）
│   └── output/               # 输出目录
├── src/                      # 核心框架代码
│   ├── config/               # 配置文件
│   ├── core/                 # 核心框架
│   ├── middleware/           # 中间件
│   ├── routes/               # 路由
│   ├── services/            # 服务层
│   └── utils/               # 工具函数
├── operators/               # 操作器目录
└── package.json
```

项目采用了清晰的分层架构。在 `scripts` 目录中存放着具体的导出脚本，这些脚本直接面向业务需求，是用户主要交互的入口。`src` 目录则包含了可复用的框架代码，虽然当前导出脚本未直接使用这些框架组件，但它们为未来将导出功能迁移到更大系统提供了基础设施。`operators` 目录用于存放可独立部署的操作器模块，体现了系统的模块化思想。

### 核心脚本结构

主脚本 `ttx_export.js` 的代码组织遵循了清晰的职责划分。文件开头是依赖导入部分，包括 Puppeteer 浏览器自动化库、文件系统模块、路径处理模块和子进程模块。接下来是浏览器路径查找函数，这是脚本的辅助功能，用于自动检测系统中安装的 Chrome/Chromium 浏览器位置。

类的定义是脚本的核心部分。`TTXExporter` 类封装了所有的导出逻辑，其构造函数接收配置参数，包括系统地址、租户标识、用户名、密码、语言设置、浏览器模式等。这种设计使得类可以被外部模块导入后灵活使用，也支持通过命令行直接运行。类的方法包括浏览器初始化、登录验证、数据查询、报表导出和资源清理等，形成了完整的业务流程。

脚本的最后部分是配置读取函数和主函数。配置函数从环境变量中读取各项参数，支持灵活的运行时配置。主函数则是脚本的入口点，协调各个模块完成完整的导出流程。这种结构使得脚本既可以作为独立程序运行，也可以作为模块被其他程序调用。

## 现有实现分析

### 浏览器自动化机制

脚本使用 Puppeteer 作为浏览器自动化的核心库，这是一个由 Google 维护的 Chrome/Chromium 控制库。通过 Puppeteer，脚本可以完全控制浏览器的各种行为，包括页面导航、元素定位、表单填写、点击操作等。这种方式比传统的 HTTP 请求方案更加可靠，因为它完全模拟了真实用户的浏览器行为，能够绕过许多反爬虫机制和会话验证问题。

浏览器初始化时，脚本会尝试自动查找系统中的 Chrome/Chromium 路径。它首先检查一系列预定义的常见路径，包括 macOS、Linux 和 Windows 系统上的不同浏览器位置。如果预定义路径都未找到，它会尝试使用系统的 `which` 命令动态查找。这种多层次的查找策略确保了脚本在不同环境下的可移植性。

初始化完成后，脚本设置页面视口为 1920x1080 的标准分辨率，这是一个常用的办公显示器分辨率，能够确保页面布局与实际使用场景一致。登录过程中，脚本首先导航到系统首页，然后等待页面完全加载后查找登录 iframe。通天晓系统采用 iframe 嵌套的方式展示登录页面，这是一种常见的企业级 Web 应用架构模式。

登录验证采用多种策略组合。脚本首先在登录 iframe 中填写用户名和密码并点击登录按钮，然后等待页面导航完成。接着会多次检查浏览器的全局变量 `window.app.session`，确认会话信息已经正确初始化。这种轮询检查的方式比单纯的等待固定时间更加智能，能够根据实际环境调整等待时间。

### 数据获取模式

数据获取是脚本最核心的功能之一，它采用了分页查询的策略来获取大量数据。每一次数据请求都会指定一个范围头（Range Header），告诉服务器需要返回哪一段数据。例如 `Range: items=0-499` 表示请求第 0 到第 499 条记录，共 500 条。服务器会响应实际返回的记录数量，脚本据此判断是否还有更多数据需要获取。

分页查询的流程是：首先设置 `pageStart` 为 0，然后循环执行查询。每次查询后检查返回的记录数量，如果小于请求的页面大小，说明已经到达数据末尾，可以结束循环；否则将 `pageStart` 增加页面大小，继续查询下一批数据。每次查询之间加入了 500 毫秒的延迟，这是为了避免对服务器造成过大压力，同时也是为了确保服务器有足够时间处理请求。

脚本通过 `window.app.dataManager.get` 方法调用系统的内部数据接口，这是一个封装了认证和请求逻辑的全局方法。相比直接使用 `fetch` 或 `axios` 调用 HTTP 接口，这种方式更加可靠，因为它自动处理了所有的认证信息、会话 Cookie 和 CSRF 令牌等。请求头中需要设置 `Range`、`X-Range`、`filter` 等参数，这些参数告诉服务器如何筛选和分页数据。

### 筛选条件构建

筛选条件的构建采用了结构化的方式，脚本定义了一个 `filters` 对象，包含 `and` 数组来存储各个筛选条件。每个筛选条件是一个对象，包含字段名（`field`）、操作符（`operator`）和值（`value`）等属性。这种结构与通天晓系统的 API 格式要求完全一致，确保了筛选条件能够被正确解析和执行。

不同的查询场景有不同的固定条件。例如入库明细报表默认只查询特定类型的入库单（B2C 入库、采购入库、调拨入库等），而 B2C 出库单则固定只查询 `shipObjType` 为 `TO_C` 的记录。这些固定条件反映了业务逻辑的要求，确保查询结果符合预期。

日期范围筛选使用特殊的字段命名约定。以 `begin` 或 `:beg` 结尾的字段表示起始时间，以 `end` 或 `:end` 结尾的字段表示结束时间。这种命名约定是通天晓系统的标准模式，开发者在新增导出功能时需要遵循这一约定。日期格式通常为 `YYYY-MM-DD HH:mm:ss`，但也可以使用更简洁的 `YYYY-MM-DD` 格式。

### 导出格式处理

脚本支持三种输出格式：CSV、JSON 和 dataSource。

CSV 格式适用于需要在 Excel 中进行进一步分析或与其他系统集成的场景。CSV 导出的实现包含多个细节处理：首先，脚本会自动排除 `__id` 字段，这是系统内部使用的标识符，通常不需要出现在导出的数据中。其次，对于每个字段的值，脚本会进行空值处理，将 `null` 和 `undefined` 转换为空字符串。最重要的是引号和逗号的转义处理：如果字段值包含引号，会将每个引号替换为两个引号（CSV 标准转义方式）；如果字段值包含逗号、引号或换行符，则会用双引号将整个值包裹起来。此外，CSV 文件开头会加上 UTF-8 BOM（Byte Order Mark），这是为了确保 Excel 打开文件时能够正确识别编码，避免中文出现乱码。

JSON 导出的实现相对简单，使用标准的 `JSON.stringify` 方法，第二个参数设置为 `null` 表示不过滤任何属性，第三个参数设置为 2 表示使用两个空格的缩进，使输出文件具有良好的可读性。

dataSource 格式是新增的高级导出模式，它将数据字段名转换为 API 期望的格式（snake_case），然后逐条 POST 到远程 API。这种模式适用于需要将数据直接同步到外部系统的场景，无需生成中间文件。

### 字段映射配置

脚本内置了字段映射配置，用于将通天晓系统的 camelCase 字段名转换为 API 期望的 snake_case 格式。所有映射都硬编码在 `FIELD_MAPPINGS` 对象中，每种报表类型有独立的映射表。

```javascript
const FIELD_MAPPINGS = {
    // 入库报表字段映射
    inbound: {
        'code': 'inbound_order_no',
        'erpOrderCode': 'source_order_no',
        'totalQty': 'total_qty',
        // ...
    },
    // B2C出库单字段映射
    b2c: {
        'code': 'order_no',
        'carrierCode': 'carrier',
        // ...
    }
};
```

这种设计确保了数据导出时字段名格式的一致性，避免了 API 端点因字段名不匹配而无法正确接收数据的问题。

## 新增导出功能指南

### 步骤一：创建查询方法

新增导出功能的第一步是在 `TTXExporter` 类中添加新的查询方法。方法的命名应该清晰地反映其业务含义，例如 `getInventoryReport`（库存报表）、`getOutboundReport`（出库报表）等。方法应该返回 Promise，因为底层的数据获取是异步操作。

方法签名应该包含一个 `options` 参数，用于接收各种查询条件。这种设计保持了与其他方法的一致性，也使得方法的调用者可以灵活地指定筛选条件。方法内部首先解构 `options` 参数，设置合理的默认值，然后构建筛选条件对象。

```javascript
async getNewReport(options = {}) {
    const {
        warehouseCode = 'HF',
        companyCode = null,
        startDate = null,
        endDate = null,
        pageSize = 500
    } = options;

    // 构建筛选条件
    const filters = { and: [] };

    // 添加业务相关的固定条件
    filters.and.push({
        field: 'someField',
        operator: '=',
        value: 'someValue'
    });

    // 添加可选的筛选条件
    if (warehouseCode) {
        filters.and.push({
            field: 'table.warehouseCode',
            operator: '=',
            value: warehouseCode
        });
    }

    // ... 其他条件

    const filterJson = JSON.stringify(filters);
    console.log(`查询条件: ${filterJson}`);

    // 分页获取数据
    const allData = [];
    let pageStart = 0;

    while (true) {
        console.log(`获取数据: ${pageStart} - ${pageStart + pageSize - 1}`);

        const result = await this.page.evaluate(async (args) => {
            // ... 调用数据接口
        }, { filterJson, pageStart, pageSize });

        if (!result.success) {
            console.error(`获取数据失败: ${result.error}`);
            break;
        }

        const batch = result.data || [];
        if (batch.length === 0) {
            break;
        }

        console.log(`  获取到 ${batch.length} 条记录`);
        allData.push(...batch);

        if (batch.length < pageSize) {
            break;
        }

        pageStart += pageSize;
        await this.page.waitForTimeout(500);
    }

    console.log(`\n共获取 ${allData.length} 条记录`);
    return allData;
}
```

在构建筛选条件时，需要注意字段名的完整格式。某些系统字段需要指定表别名，例如 `rh.warehouseCode` 表示 `receipt_header` 表的 `warehouseCode` 字段。确定正确的字段名和表别名是新增导出功能的关键步骤，通常需要通过浏览器开发者工具分析系统中实际使用的查询参数。

### 步骤二：确定数据接口路径

每种报表类型对应不同的后端 API 接口路径。这些路径可以在现有代码中找到参考模式，或者通过浏览器开发者工具捕获。从现有代码中可以看到，通天晓系统的数据接口路径有两种主要格式。

第一种是模板化的 SQL 查询接口，路径格式为 `/rest/sqlTemplate/grid/{templateId}/{reportName}`，例如 `/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表`。这种接口通常用于预定义的报表模板，灵活性较高但参数格式相对固定。

第二种是直接的资源接口，路径格式为 `/rest/{resourceType}`，例如 `/rest/cbt/shipment_header` 用于访问出库单头部信息。这种接口更加标准化，类似于 RESTful API 的设计风格。

确定接口路径后，还需要了解请求时需要设置的特殊请求头。`Range` 和 `X-Range` 头用于分页，`X-Bill` 头用于指定单据类型，`X-Result-Fields` 头用于指定返回字段列表，`filter` 头用于传递筛选条件。不同类型的接口可能需要不同的请求头组合，这些信息通常需要通过实际调试来确定。

### 步骤三：配置环境变量支持

为了让新导出的功能支持运行时配置，需要在 `getConfig` 函数中添加相应的环境变量读取逻辑。环境变量的命名应该遵循一致的约定：都以 `TTX_` 开头，后跟功能名称和参数名称，使用下划线分隔单词。

```javascript
// 新增导出功能的环境变量配置
newReportParam: process.env.TTX_NEW_REPORT_PARAM || 'defaultValue',
newReportEnabled: process.env.TTX_NEW_REPORT_ENABLED === 'true',
```

当前支持的完整环境变量列表：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TTX_BASE_URL` | `https://ttx.56xyy.com` | 系统地址 |
| `TTX_CUSTOMER` | `xyy-wms-prod` | 租户标识 |
| `TTX_USERNAME` | `HFLS17` | 用户名 |
| `TTX_PASSWORD` | `Xyy1234567` | 密码 |
| `TTX_WAREHOUSE` | `HF` | 仓库代码 |
| `TTX_COMPANY` | `HF-SPD` | 货主代码 |
| `TTX_START_DATE` | 本月1日 | 开始日期 |
| `TTX_END_DATE` | 当前日期 | 结束日期 |
| `TTX_CHECKIN_START_DATE` | null | 签收开始日期 |
| `TTX_CHECKIN_END_DATE` | null | 签收结束日期 |
| `REPORT_TYPE` | `receipt_header` | 报表类型 |
| `OUTPUT_FORMAT` | `dataSource` | 输出格式 |
| `OUTPUT_DIR` | `.` | 输出目录 |
| `PAGE_SIZE` | `500` | 每页数量 |
| `HEADLESS` | `true` | 无头模式 |

对于布尔类型的配置项，比较时需要使用字符串比较，因为环境变量都是字符串类型。常见的模式是检查变量是否等于字符串 `'true'`。

### 步骤四：添加主函数逻辑

在 `main` 函数中，需要添加对新导出功能的调用逻辑。这部分代码通常包含在报告类型判断的代码块中。需要考虑的因素包括：是否支持单独导出、是否与其他报表互斥、输出的文件名和格式等。

```javascript
// 导出新报表
if (reportType === 'new_report' || reportType === 'all') {
    console.log('\n========== 新报表 ==========\n');
    
    const reportData = await exporter.getNewReport({
        warehouseCode: config.warehouseCode,
        companyCode: config.companyCode,
        startDate: startDate,
        endDate: config.endDate,
        pageSize: config.pageSize
    });
    
    if (reportData.length > 0) {
        const csvPath = path.join(config.outputDir, 'new_report.csv');
        const jsonPath = path.join(config.outputDir, 'new_report.json');
        
        if (config.outputFormat === 'csv' || config.outputFormat === 'both') {
            exporter.exportToCsv(reportData, csvPath);
        }
        if (config.outputFormat === 'json' || config.outputFormat === 'both') {
            exporter.exportToJson(reportData, jsonPath);
        }
        
        console.log('\n--- 数据示例 ---');
        const sample = reportData[0];
        for (const [key, value] of Object.entries(sample)) {
            if (key !== '__id') {
                console.log(`  ${key}: ${value}`);
            }
        }
    } else {
        console.log('未获取到新报表数据');
    }
}
```

### 步骤五：处理特定字段映射

通天晓系统的原始数据字段名采用驼峰命名法（如 `warehouseCode`），而远程 API 通常期望 snake_case 格式的字段名（如 `warehouse_code`）。脚本内置了字段映射配置，将通天晓系统的字段名自动转换为 API 期望的格式。

字段映射定义在 `FIELD_MAPPINGS` 常量对象中，每种报表类型有独立的映射表：

```javascript
const FIELD_MAPPINGS = {
    // 入库报表字段映射
    inbound: {
        'code': 'inbound_order_no',
        'erpOrderCode': 'source_order_no',
        'totalQty': 'total_qty',
        'leadingSts': 'first_status',
        'trailingSts': 'last_status',
        // ... 更多映射
    },
    // B2C出库单字段映射
    b2c: {
        'code': 'order_no',
        'carrierCode': 'carrier',
        'totalQty': 'total_qty',
        // ... 更多映射
    }
};
```

所有映射已硬编码在脚本中，无需额外配置。在新增导出功能时，需要在 `FIELD_MAPPINGS` 中添加对应的映射配置。

### 步骤六：数据源格式导出与 API 集成

脚本支持 `dataSource` 输出格式，该格式将转换后的数据直接 POST 到远程 API，无需生成中间文件。

```javascript
async exportToDataSource(data, mappingType = 'inbound') {
    // 1. 根据 mappingType 获取字段映射
    const fieldMap = FIELD_MAPPINGS[mappingType] || {};

    // 2. 转换数据字段名
    const transformedData = data.map(record => {
        const newRecord = {};
        for (const [key, value] of Object.entries(record)) {
            if (key !== '__id') {
                const newKey = fieldMap[key] || key;
                newRecord[newKey] = value;
            }
        }
        return newRecord;
    });

    // 3. 调用 API 插入数据
    await this.insertReceiptHeader(transformedData);
}
```

`insertReceiptHeader` 方法负责将数据逐条 POST 到远程 API：

```javascript
async insertReceiptHeader(records) {
    const apiUrl = 'https://api.genispace.cn/datasources/.../data';
    const apiToken = 'YOUR_API_TOKEN';

    // 遍历记录，逐条插入
    for (let i = 0; i < records.length; i++) {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify(record)
        });
        // 处理响应...
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}
```

API 集成的特点：每条记录之间有 100ms 延迟，避免请求过快导致 API 限流；实时显示插入进度和结果统计（成功/失败数量）；输出示例数据便于调试。

## 最佳实践建议

### 错误处理策略

健壮的错误处理是脚本可靠性的关键。在新增导出功能时，应该考虑以下几种错误场景并分别处理。

网络请求失败是最常见的错误类型。当数据接口返回错误时，脚本应该记录详细的错误信息，包括请求参数、响应状态和错误消息。这些信息对于后续排查问题非常重要。脚本可以使用重试机制来处理临时性的网络故障，例如在首次失败后等待一段时间再重试，连续失败三次后最终放弃。

数据格式异常也需要处理。通天晓系统的接口可能返回不符合预期的数据格式，例如字段类型与文档描述不符、缺少某些字段、或者数据结构发生变化。脚本应该在处理数据之前验证数据格式，对于不符合预期的数据可以选择跳过、记录警告或者抛出异常。

登录状态失效是一种特殊情况。如果在长时间运行的脚本执行过程中登录会话过期，后续的数据请求都会失败。脚本可以定期检查登录状态，或者在收到认证错误时自动重新登录。对于数据量较大的导出任务，建议在开始导出前验证登录状态，并在必要时重新登录。

### 性能优化建议

导出大量数据时，性能优化变得重要。以下是几个可以显著提升性能的优化点。

批量写入文件比逐条写入效率高得多。当前脚本已经使用了这种方式，在内存中构建完整的 CSV 内容后一次性写入文件。如果数据量非常大（如超过 10 万条记录），可能需要分批写入以避免占用过多内存。

合理设置页面大小可以平衡性能和可靠性。较大的页面大小意味着更少的请求次数和更快的执行速度，但如果服务器对单次请求的数据量有限制，过大的页面大小可能导致请求失败。500 条是一个比较均衡的默认值，但可以根据实际情况调整。

减少不必要的等待时间。当前脚本在每次分页请求之间等待 500 毫秒，这个时间足够大多数场景使用，但如果有性能压力可以适当缩短。如果遇到请求失败率升高的情况，应该增加等待时间。

### 可配置性设计

良好的可配置性使得脚本更加灵活，更容易适应不同环境的需求。以下是建议的可配置项。

连接配置应该支持通过环境变量覆盖默认值，包括系统地址、租户标识、用户名和密码。这使得脚本可以在不同环境（测试环境、生产环境）之间切换，而无需修改代码。

查询条件应该有合理的默认值，同时允许通过参数覆盖。例如仓库代码默认使用 `HF`，但应该允许配置为其他仓库。日期范围的默认值可以是本月1日到当前日期，但应该允许指定任意日期范围。

输出配置包括输出目录、输出格式（CSV、JSON 或两者都输出）、文件命名规则等。这些配置使得脚本可以更容易地集成到自动化工作流中。

### 代码复用策略

当前脚本中的多个查询方法有很多相似代码，可以提取公共逻辑以减少重复。以下是几个可以复用的部分。

分页查询逻辑可以抽象为一个通用函数，接收查询参数和回调函数，返回累积的所有数据。查询路径、请求头和筛选条件可以作为参数传递，处理函数负责执行单次查询并返回结果。

```javascript
async paginatedQuery(path, options, resultFields = null) {
    const { pageSize = 500 } = options;
    const allData = [];
    let pageStart = 0;
    
    while (true) {
        const result = await this.executeQuery(path, {
            ...options,
            pageStart,
            pageSize,
            resultFields
        });
        
        if (!result.success || result.data.length === 0) {
            break;
        }
        
        allData.push(...result.data);
        
        if (result.data.length < pageSize) {
            break;
        }
        
        pageStart += pageSize;
        await this.page.waitForTimeout(500);
    }
    
    return allData;
}
```

筛选条件构建器可以封装为一个独立的类或函数，提供链式 API 来添加各种条件。这会使查询方法的代码更加简洁，逻辑更加清晰。

```javascript
class FilterBuilder {
    constructor() {
        this.conditions = [];
    }
    
    addInCondition(field, value) {
        this.conditions.push({ field, operator: 'in', value });
        return this;
    }
    
    addEqualCondition(field, value) {
        this.conditions.push({ field, operator: '=', value });
        return this;
    }
    
    addDateRange(field, startDate, endDate) {
        if (startDate) {
            this.conditions.push({ field: `${field}:begin`, operator: '>=', value: startDate });
        }
        if (endDate) {
            this.conditions.push({ field: `${field}:end`, operator: '<=', value: endDate });
        }
        return this;
    }
    
    build() {
        return { and: this.conditions };
    }
}
```

## 常见问题排查

### 登录相关问题

登录失败是使用脚本时最常遇到的问题之一。可能的原因和解决方法如下。

如果提示找不到 Chrome/Chromium 浏览器，首先检查系统是否已安装 Chrome 浏览器。如果没有安装，可以从 Google 官网下载安装包进行安装。如果已经安装但脚本无法找到，可以显式设置 `chromePath` 参数，或者设置 `CHROME_PATH` 环境变量指向浏览器的可执行文件路径。

如果登录后提示认证失败，检查用户名和密码是否正确。通天晓系统的租户标识（`customer` 参数）也很重要，不同租户可能有不同的登录入口。确保使用的租户标识与实际要访问的系统租户一致。

如果登录成功但后续数据请求失败，可能是登录 iframe 的定位逻辑有问题。通天晓系统的登录页面可能有多种变体，建议通过浏览器开发者工具检查实际的 iframe 结构，然后相应地调整选择器逻辑。

### 数据获取问题

获取不到数据或获取的数据量少于预期是另一个常见问题类别。

首先检查筛选条件是否过于严格。可以先尝试不设置任何筛选条件，获取所有数据，然后逐步添加条件，确定是哪一条条件导致没有数据返回。通天晓系统的字段名和表名可能有特殊要求，错误的字段名会被系统忽略但不会报错。

检查分页逻辑是否正确执行。如果脚本报告获取到 0 条记录后立即结束，可能是因为分页请求本身失败了，但错误被静默处理了。可以在循环内部添加更详细的日志输出，跟踪每次请求的输入输出。

确认日期格式是否正确。通天晓系统对日期格式有严格要求，错误的格式可能导致条件被忽略。建议使用 `YYYY-MM-DD HH:mm:ss` 格式，这是最通用的格式。

### 编码和格式问题

CSV 文件在 Excel 中打开时出现乱码是一个常见问题。这通常是因为文件编码不是 UTF-8，或者 Excel 无法正确识别编码。脚本已经添加了 UTF-8 BOM 来解决这个问题，但某些旧版本的 Excel 可能仍然无法正确识别。

字段值中包含特殊字符（如换行符、引号、逗号）可能导致 CSV 格式混乱。脚本已经实现了基本的转义逻辑，但某些极端情况（如字段值中包含大量引号）可能需要更复杂的处理。如果遇到格式问题，可以使用文本编辑器（而非 Excel）打开 CSV 文件，检查实际的原始内容。

## 维护和扩展建议

### 日志记录改进

当前脚本使用 `console.log` 和 `console.error` 进行日志输出，这在调试时很有帮助，但在生产环境中可能需要更完善的日志系统。建议的改进包括：添加时间戳前缀、使用不同的日志级别（DEBUG、INFO、WARN、ERROR）、支持日志文件输出、支持日志级别动态调整。

```javascript
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] ${message}`;
    if (data) {
        console[level === 'DEBUG' ? 'log' : level.toLowerCase()](formattedMessage, data);
    } else {
        console[level === 'DEBUG' ? 'log' : level.toLowerCase()](formattedMessage);
    }
};
```

### 配置文件外置

当前所有配置都硬编码在代码中或通过环境变量设置。对于复杂的配置项（如多仓库、多报表类型），可以考虑使用独立的配置文件（如 `config.json`），支持更灵活的配置管理。配置文件可以使用 JSON 或 YAML 格式，支持配置分层和环境区分。

### 定时任务集成

脚本可以集成到操作系统的定时任务中，实现自动化数据导出。在 Linux/macOS 系统上可以使用 `cron`，在 Windows 系统上可以使用任务计划程序。定时任务可以配置在每天凌晨执行，自动导出前一天的报表数据，并发送到指定的邮箱或存储位置。

```bash
# crontab 示例：每天凌晨2点执行导出
0 2 * * * cd /path/to/scripts && node ttx_export.js >> /var/log/ttx_export.log 2>&1
```

### 模块化重构

随着导出功能的增加，脚本的代码量会不断膨胀。建议适时进行模块化重构，将不同报表类型的导出逻辑分离到独立文件中，通过主脚本统一调用和管理。这种方式可以提高代码的可维护性，也便于团队协作开发。

## 报表类型说明

### 入库单头部报表（receipt_header）

入库单头部报表用于导出通天晓系统的入库单主信息，包括单据状态、货主、仓库等核心字段。

**使用方法：**
```bash
export REPORT_TYPE='receipt_header'
export OUTPUT_FORMAT='dataSource'
node ttx_export.js
```

**查询参数：**
- `warehouseCode`: 仓库代码（默认 HF）
- `companyCode`: 货主代码
- `startDate`: 创建开始日期
- `endDate`: 创建结束日期
- `checkinStartDate`: 签收开始日期
- `checkinEndDate`: 签收结束日期

**导出字段：**
入库单号、来源单号、JIT退仓号、入库单类型、货主、总数量、总行数、首状态、尾状态、快递单号、店铺名称、批次号、创建时间、备注、签收时间等。

### 入库明细报表（inbound）

入库明细报表导出详细的入库单明细信息，支持按入库类型筛选。

**使用方法：**
```bash
export REPORT_TYPE='inbound'
export OUTPUT_FORMAT='csv,json'
node ttx_export.js
```

### B2C出库单报表（b2c_shipment）

B2C出库单报表导出电商出库单信息，支持按处理类型、首状态等条件筛选。

**使用方法：**
```bash
export REPORT_TYPE='b2c_shipment'
export OUTPUT_FORMAT='dataSource'
node ttx_export.js
```

## 参考资料

- 通天晓 WMS 系统官方文档
- Puppeteer 官方文档：https://pptr.dev/
- CSV 格式规范：RFC 4180
- Node.js 官方文档：https://nodejs.org/

## 更新日志

| 日期 | 版本 | 变更说明 |
|------|------|----------|
| 2026-02-10 | 1.0 | 初始版本，涵盖入库明细和 B2C 出库单两种报表 |
| 2026-02-10 | 1.1 | 新增入库单头部报表（getReceiptHeaderReport）；新增 dataSource 输出格式支持字段名映射；新增 insertReceiptHeader 方法集成远程 API；更新字段映射为 snake_case 格式 |
| 2026-02-10 | 1.2 | 优化 dataSource 格式，直接调用 API 插入数据无需生成文件；硬编码字段映射配置 |

