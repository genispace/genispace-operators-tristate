#!/usr/bin/env node
/**
 * 通天晓WMS - 入库明细报表数据导出脚本 (Node.js版本)
 * 
 * 使用 Puppeteer 进行浏览器自动化，完全模拟浏览器行为
 * 
 * 依赖安装：
 *   npm install puppeteer
 * 
 * 使用方法：
 *   node ttx_export.js
 * 
 * 或者作为模块导入：
 *   const { TTXExporter } = require('./ttx_export.js');
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * 查找系统中安装的 Chrome/Chromium 路径
 */
function findChromePath() {
    const possiblePaths = [
        // macOS
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        // Linux
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        // Windows
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ];
    
    for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
            return chromePath;
        }
    }
    
    // 尝试使用 which 命令查找
    try {
        const result = execSync('which google-chrome || which chromium || which chromium-browser', { encoding: 'utf8' });
        return result.trim();
    } catch (e) {
        // 忽略错误
    }
    
    throw new Error('未找到 Chrome/Chromium 浏览器，请安装 Chrome 或设置 CHROME_PATH 环境变量');
}

class TTXExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.username = options.username || '';
        this.password = options.password || '';
        this.locale = options.locale || 'zh';
        this.headless = options.headless !== false;
        this.chromePath = options.chromePath || process.env.CHROME_PATH || null;
        
        this.browser = null;
        this.page = null;
    }
    
    async init() {
        const chromePath = this.chromePath || findChromePath();
        console.log(`使用浏览器: ${chromePath}`);
        console.log('启动浏览器...');
        
        this.browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: this.headless ? 'new' : false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        
        // 设置viewport
        await this.page.setViewport({ width: 1920, height: 1080 });
    }
    
    async login() {
        console.log(`访问: ${this.baseUrl}`);
        const url = `${this.baseUrl}/index.html?customer=${this.customer}&lang=${this.locale}`;
        await this.page.goto(url, { waitUntil: 'networkidle2' });
        
        // 等待页面加载
        await this.page.waitForTimeout(3000);
        
        // 查找登录iframe
        const frames = this.page.frames();
        let loginFrame = null;
        
        for (const frame of frames) {
            if (frame.url().includes('loginPage')) {
                loginFrame = frame;
                break;
            }
        }
        
        if (loginFrame) {
            console.log(`正在登录: ${this.username}`);
            
            // 等待用户名输入框
            await loginFrame.waitForSelector('#username', { timeout: 10000 });
            
            // 填写登录信息
            await loginFrame.type('#username', this.username);
            await loginFrame.type('#password', this.password);
            
            // 点击登录
            await loginFrame.click('.login_btn');
            
            // 等待登录完成 - 等待导航菜单出现或更长时间
            console.log('等待登录完成...');
            await this.page.waitForTimeout(8000);
        } else {
            console.log('未找到登录iframe，可能已经登录');
        }
        
        // 多次检查登录状态
        let sessionInfo = { success: false };
        for (let i = 0; i < 5; i++) {
            sessionInfo = await this.page.evaluate(() => {
                if (window.app && window.app.session && window.app.session.token) {
                    return {
                        success: true,
                        user: window.app.session.user,
                        userName: window.app.session.userName,
                        token: window.app.session.token,
                        client: window.app.session.client
                    };
                }
                return { success: false };
            });
            
            if (sessionInfo.success) {
                break;
            }
            console.log(`等待session初始化... (${i + 1}/5)`);
            await this.page.waitForTimeout(2000);
        }
        
        if (sessionInfo.success) {
            console.log(`登录成功: ${sessionInfo.userName} (${sessionInfo.user})`);
            console.log(`Token: ${sessionInfo.token.substring(0, 8)}...`);
            return true;
        } else {
            console.error('登录失败');
            return false;
        }
    }
    
    async getInboundReport(options = {}) {
        const {
            warehouseCode = 'HF',
            companyCode = null,
            receiptTypes = null,
            startDate = null,
            endDate = null,
            pageSize = 500
        } = options;
        
        // 构建筛选条件
        const filters = { and: [] };
        
        if (warehouseCode) {
            filters.and.push({
                field: 'rh.warehouseCode',
                value: warehouseCode,
                operator: 'in'
            });
        }
        
        if (companyCode) {
            filters.and.push({
                field: 'rd.companyCode',
                value: companyCode,
                operator: 'in'
            });
        }
        
        if (receiptTypes && receiptTypes.length > 0) {
            filters.and.push({
                field: 'rh.receiptType',
                value: receiptTypes.join(','),
                operator: 'in'
            });
        }
        
        if (startDate) {
            filters.and.push({
                field: 'rh.created:begin',
                value: startDate,
                operator: '>='
            });
        }
        
        if (endDate) {
            filters.and.push({
                field: 'rh.created:end',
                value: endDate,
                operator: '<='
            });
        }
        
        const filterJson = JSON.stringify(filters);
        console.log(`查询条件: ${filterJson}`);
        
        // 分页获取数据
        const allData = [];
        let pageStart = 0;
        
        while (true) {
            console.log(`获取数据: ${pageStart} - ${pageStart + pageSize - 1}`);
            
            const result = await this.page.evaluate(async (args) => {
                const { filterJson, pageStart, pageSize } = args;
                
                try {
                    const path = '/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表';
                    
                    // 使用 dataManager.get 方法，它会自动处理所有认证
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
                            (data) => {
                                if (Array.isArray(data)) {
                                    resolve({ success: true, data: data });
                                } else if (data && data.error) {
                                    resolve({ success: false, error: data.msg || 'Unknown error' });
                                } else {
                                    resolve({ success: true, data: data });
                                }
                            },
                            (error) => {
                                resolve({ success: false, error: error.message || String(error) });
                            }
                        );
                    });
                } catch (e) {
                    return { success: false, error: e.message };
                }
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
    
    /**
     * 获取B2C出库单数据
     * @param {Object} options 查询选项
     * @param {string} options.warehouseCode 仓库代码
     * @param {string} options.companyCode 货主代码
     * @param {string} options.processType 处理类型 (NORMAL, URGENT等)
     * @param {number} options.leadingStsBegin 首状态起始值
     * @param {number} options.leadingStsEnd 首状态结束值
     * @param {string} options.startDate 开始日期
     * @param {string} options.endDate 结束日期
     * @param {number} options.pageSize 每页数量
     */
    async getB2CShipmentReport(options = {}) {
        const {
            warehouseCode = 'HF',
            companyCode = null,
            processType = 'NORMAL',
            leadingStsBegin = null,
            leadingStsEnd = null,
            startDate = null,
            endDate = null,
            pageSize = 500
        } = options;
        
        // 构建筛选条件
        const filters = { and: [] };
        
        // 固定条件：B2C出库单
        filters.and.push({
            field: 'shipObjType',
            operator: '=',
            value: 'TO_C',
            table: 'shipment_header'
        });
        
        if (warehouseCode) {
            filters.and.push({
                field: 'shipment_header.warehouseCode',
                operator: '=',
                value: warehouseCode
            });
        }
        
        if (companyCode) {
            filters.and.push({
                field: 'shipment_header.companyCode',
                operator: '=',
                value: companyCode
            });
        }
        
        if (processType) {
            filters.and.push({
                field: 'shipment_header.processType',
                operator: 'in',
                disOperator: 'IN',
                value: processType,
                type: 'multiSelectCombobox'
            });
        }
        
        if (leadingStsBegin !== null) {
            filters.and.push({
                field: 'leadingSts:beg',
                operator: '>=',
                value: String(leadingStsBegin),
                table: 'shipment_header'
            });
        }
        
        if (leadingStsEnd !== null) {
            filters.and.push({
                field: 'leadingSts:end',
                operator: '<=',
                value: String(leadingStsEnd),
                table: 'shipment_header'
            });
        }
        
        if (startDate) {
            filters.and.push({
                field: 'shipment_header.created:beg',
                operator: '>=',
                value: startDate
            });
        }
        
        if (endDate) {
            filters.and.push({
                field: 'shipment_header.created:end',
                operator: '<=',
                value: endDate
            });
        }
        
        const filterJson = JSON.stringify(filters);
        console.log(`查询条件: ${filterJson}`);
        
        // 定义返回字段
        const resultFields = [
            'id', 'created', 'frontTime', 'payTime', 'code', 'shipmentType',
            'companyCode', 'carrierCode', 'processType', 'userDef1',
            'sourceOrderCode', 'primaryWaybillCode', 'waveId', 'storeName',
            'shipToState', 'shipToCity', 'qtyRatio', 'totalQty', 'totalLines',
            'shipToAttentionTo', 'consolidated', 'warehouseTransferCode',
            'leadingSts', 'trailingSts', 'uploadByAt', 'uploadByUser',
            'rejectionNote', 'actualShipDateTime', 'uploadBatch', 'deliveryNote', 'userDef5'
        ].join(',');
        
        // 分页获取数据
        const allData = [];
        let pageStart = 0;
        
        while (true) {
            console.log(`获取数据: ${pageStart} - ${pageStart + pageSize - 1}`);
            
            const result = await this.page.evaluate(async (args) => {
                const { filterJson, pageStart, pageSize, resultFields } = args;
                
                try {
                    const path = '/rest/cbt/shipment_header';
                    
                    // 使用 dataManager.get 方法
                    return new Promise((resolve) => {
                        const options = {
                            headers: {
                                'Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                                'X-Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                                'X-Bill': 'shipment_header',
                                'X-Result-Fields': resultFields,
                                'filter': encodeURIComponent(filterJson),
                                'Accept': 'application/javascript, application/json'
                            }
                        };
                        
                        window.app.dataManager.get(path, options).then(
                            (data) => {
                                if (Array.isArray(data)) {
                                    resolve({ success: true, data: data });
                                } else if (data && data.error) {
                                    resolve({ success: false, error: data.msg || 'Unknown error' });
                                } else {
                                    resolve({ success: true, data: data });
                                }
                            },
                            (error) => {
                                resolve({ success: false, error: error.message || String(error) });
                            }
                        );
                    });
                } catch (e) {
                    return { success: false, error: e.message };
                }
            }, { filterJson, pageStart, pageSize, resultFields });
            
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
    
    exportToCsv(data, filename = 'inbound_report.csv') {
        if (!data || data.length === 0) {
            console.log('没有数据可导出');
            return;
        }
        
        // 获取字段（排除__id）
        const fields = Object.keys(data[0]).filter(k => k !== '__id');
        
        // 构建CSV内容
        const header = fields.join(',');
        const rows = data.map(record => {
            return fields.map(field => {
                let value = record[field];
                if (value === null || value === undefined) {
                    value = '';
                }
                // 转义引号和逗号
                value = String(value).replace(/"/g, '""');
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = `"${value}"`;
                }
                return value;
            }).join(',');
        });
        
        const csv = '\ufeff' + header + '\n' + rows.join('\n');  // BOM for Excel
        fs.writeFileSync(filename, csv, 'utf8');
        console.log(`已导出CSV: ${filename}`);
    }
    
    exportToJson(data, filename = 'inbound_report.json') {
        if (!data || data.length === 0) {
            console.log('没有数据可导出');
            return;
        }
        
        fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
        console.log(`已导出JSON: ${filename}`);
    }
    
    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

/**
 * 从环境变量获取配置
 */
function getConfig() {
    return {
        // 连接配置
        baseUrl: process.env.TTX_BASE_URL || 'https://ttx.56xyy.com',
        customer: process.env.TTX_CUSTOMER || 'xyy-wms-prod',
        username: process.env.TTX_USERNAME || 'HFLS17',
        password: process.env.TTX_PASSWORD || 'Xyy1234567',
        
        // 报表类型: inbound (入库明细), b2c_shipment (B2C出库单), all (全部)
        reportType: process.env.REPORT_TYPE || 'all',
        
        // 通用查询条件
        warehouseCode: process.env.TTX_WAREHOUSE || 'HF',
        companyCode: process.env.TTX_COMPANY || 'HF-SPD',
        startDate: process.env.TTX_START_DATE || null,  // 默认为本月1日
        endDate: process.env.TTX_END_DATE || null,
        
        // 入库报表特有条件
        receiptTypes: process.env.TTX_RECEIPT_TYPES 
            ? process.env.TTX_RECEIPT_TYPES.split(',') 
            : ['CGRK', 'DBRK', 'THRK', 'QTRK', 'B2BRK', 'HHRK'],
        
        // B2C出库单特有条件
        processType: process.env.TTX_PROCESS_TYPE || 'NORMAL',
        leadingStsBegin: process.env.TTX_LEADING_STS_BEGIN ? parseInt(process.env.TTX_LEADING_STS_BEGIN, 10) : null,
        leadingStsEnd: process.env.TTX_LEADING_STS_END ? parseInt(process.env.TTX_LEADING_STS_END, 10) : null,
        
        // 输出配置
        outputDir: process.env.OUTPUT_DIR || '.',
        outputFormat: process.env.OUTPUT_FORMAT || 'both',  // csv, json, both
        
        // 运行配置
        headless: process.env.HEADLESS !== 'false',
        pageSize: parseInt(process.env.PAGE_SIZE || '500', 10)
    };
}

async function main() {
    const config = getConfig();
    
    console.log('=== 通天晓WMS数据导出 ===');
    console.log(`目标: ${config.baseUrl}`);
    console.log(`租户: ${config.customer}`);
    console.log(`用户: ${config.username}`);
    console.log(`仓库: ${config.warehouseCode}`);
    console.log(`报表类型: ${config.reportType}`);
    console.log(`输出目录: ${config.outputDir}`);
    console.log('');
    
    const exporter = new TTXExporter({
        baseUrl: config.baseUrl,
        customer: config.customer,
        username: config.username,
        password: config.password,
        headless: config.headless
    });
    
    try {
        await exporter.init();
        
        const loggedIn = await exporter.login();
        if (!loggedIn) {
            console.error('登录失败，退出');
            process.exit(1);
        }
        
        // 确保输出目录存在
        if (!fs.existsSync(config.outputDir)) {
            fs.mkdirSync(config.outputDir, { recursive: true });
        }
        
        // 设置默认开始日期（本月1日）
        let startDate = config.startDate;
        if (!startDate) {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            startDate = startOfMonth.toISOString().slice(0, 10) + ' 00:00:00';
        }
        
        // 根据报表类型导出
        const reportType = config.reportType.toLowerCase();
        
        // 导出入库明细报表
        if (reportType === 'inbound' || reportType === 'all') {
            console.log('\n========== 入库明细报表 ==========\n');
            
            const inboundData = await exporter.getInboundReport({
                warehouseCode: config.warehouseCode,
                companyCode: config.companyCode,
                receiptTypes: config.receiptTypes,
                startDate: startDate,
                endDate: config.endDate,
                pageSize: config.pageSize
            });
            
            if (inboundData.length > 0) {
                const csvPath = path.join(config.outputDir, 'inbound_report.csv');
                const jsonPath = path.join(config.outputDir, 'inbound_report.json');
                
                if (config.outputFormat === 'csv' || config.outputFormat === 'both') {
                    exporter.exportToCsv(inboundData, csvPath);
                }
                if (config.outputFormat === 'json' || config.outputFormat === 'both') {
                    exporter.exportToJson(inboundData, jsonPath);
                }
                
                console.log('\n--- 数据示例 ---');
                const sample = inboundData[0];
                for (const [key, value] of Object.entries(sample)) {
                    if (key !== '__id') {
                        console.log(`  ${key}: ${value}`);
                    }
                }
            } else {
                console.log('未获取到入库数据');
            }
        }
        
        // 导出B2C出库单
        if (reportType === 'b2c_shipment' || reportType === 'all') {
            console.log('\n========== B2C出库单 ==========\n');
            
            const shipmentData = await exporter.getB2CShipmentReport({
                warehouseCode: config.warehouseCode,
                companyCode: config.companyCode,
                processType: config.processType,
                leadingStsBegin: config.leadingStsBegin,
                leadingStsEnd: config.leadingStsEnd,
                startDate: startDate,
                endDate: config.endDate,
                pageSize: config.pageSize
            });
            
            if (shipmentData.length > 0) {
                const csvPath = path.join(config.outputDir, 'b2c_shipment_report.csv');
                const jsonPath = path.join(config.outputDir, 'b2c_shipment_report.json');
                
                if (config.outputFormat === 'csv' || config.outputFormat === 'both') {
                    exporter.exportToCsv(shipmentData, csvPath);
                }
                if (config.outputFormat === 'json' || config.outputFormat === 'both') {
                    exporter.exportToJson(shipmentData, jsonPath);
                }
                
                console.log('\n--- 数据示例 ---');
                const sample = shipmentData[0];
                for (const [key, value] of Object.entries(sample)) {
                    if (key !== '__id') {
                        console.log(`  ${key}: ${value}`);
                    }
                }
            } else {
                console.log('未获取到B2C出库单数据');
            }
        }
        
        console.log('\n=== 导出完成 ===');
    } catch (error) {
        console.error('错误:', error);
        process.exit(1);
    } finally {
        await exporter.close();
    }
}

// 如果直接运行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { TTXExporter };
