#!/usr/bin/env node
/**
 * 通天晓WMS - 数据导出主入口
 * 
 * 支持入库单头部、入库单明细、B2C出库单、B2B出库单等多种报表类型的导出
 * 
 * 依赖安装：
 *   npm install puppeteer-core dotenv
 * 
 * 使用方法：
 *   cp .env.example .env
 *   # 编辑 .env 文件配置参数
 *   node ttx_export.js
 */

require('dotenv').config();

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 导入导出模块
const { ReceiptHeaderExporter } = require('./ttx_receipt_header');
const { ReceiptDetailsExporter } = require('./ttx_receipt_details');
const { B2CShipmentExporter } = require('./ttx_b2c_shipment');
const { B2BShipmentExporter } = require('./ttx_b2b_shipment');
const { B2CPakingDetailsExporter } = require('./ttx_b2c_paking_details');
const { DataSyncExporter } = require('./ttx_data_sync');

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
        
        // 报表类型: receipt_header (入库单头部), receipt_details (入库单明细), b2c_shipment (B2C出库单), b2b_shipment (B2B出库单), paking_details (B2C拣货明细), data_sync (数据同步), all (全部)
        reportType: process.env.REPORT_TYPE || 'receipt_header',
        
        // 通用查询条件
        warehouseCode: process.env.TTX_WAREHOUSE || 'HF',
        startDate: process.env.TTX_START_DATE || '2026-02-05 00:00:00',
        endDate: process.env.TTX_END_DATE || '2026-02-06 23:59:59',
        
        // 入库报表特有条件
        receiptTypes: process.env.TTX_RECEIPT_TYPES 
            ? process.env.TTX_RECEIPT_TYPES.split(',') 
            : ['CGRK', 'DBRK', 'THRK', 'QTRK', 'B2BRK', 'HHRK'],
        
        // B2C出库单特有条件
        processType: process.env.TTX_PROCESS_TYPE || 'NORMAL',
        leadingStsBegin: process.env.TTX_LEADING_STS_BEGIN ? parseInt(process.env.TTX_LEADING_STS_BEGIN, 10) : null,
        leadingStsEnd: process.env.TTX_LEADING_STS_END ? parseInt(process.env.TTX_LEADING_STS_END, 10) : null,

        // 入库单头部特有条件
        checkinStartDate: process.env.TTX_CHECKIN_START_DATE || null,
        checkinEndDate: process.env.TTX_CHECKIN_END_DATE || null,

        // 输出配置
        outputDir: process.env.OUTPUT_DIR || '.',
        outputFormat: process.env.OUTPUT_FORMAT || 'dataSource',  // csv, json, dataSource, both

        // 运行配置
        headless: process.env.HEADLESS !== 'false',
        pageSize: parseInt(process.env.PAGE_SIZE || '500', 10)
    };
}

/**
 * 导出数据到 CSV 文件
 * @param {Array} data 数据数组
 * @param {string} filename 文件路径
 */
function exportToCsv(data, filename) {
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

/**
 * 导出数据到 JSON 文件
 * @param {Array} data 数据数组
 * @param {string} filename 文件路径
 */
function exportToJson(data, filename) {
    if (!data || data.length === 0) {
        console.log('没有数据可导出');
        return;
    }
    
    fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
    console.log(`已导出JSON: ${filename}`);
}

/**
 * 输出数据示例
 * @param {Array} data 数据数组
 */
function printSampleData(data) {
    console.log('\n--- 数据示例 ---');
    const sample = data[0];
    for (const [key, value] of Object.entries(sample)) {
        if (key !== '__id') {
            console.log(`  ${key}: ${value}`);
        }
    }
}

async function main() {
    const config = getConfig();

    console.log('=== 通天晓WMS数据导出 ===');
    console.log(`目标: ${config.baseUrl}`);
    console.log(`租户: ${config.customer}`);
    console.log(`仓库: ${config.warehouseCode}`);
    console.log(`报表类型: ${config.reportType}`);
    console.log(`输出目录: ${config.outputDir}`);
    console.log('');

    // 数据同步模式：无需登录通天晓系统
    if (config.reportType.toLowerCase() === 'data_sync') {
        console.log('========== 数据同步到Genespace ==========\n');

        const exporter = new DataSyncExporter();
        const result = await exporter.syncAll();

        if (result.failed > 0) {
            console.log(`\n警告: 数据同步完成，但有 ${result.failed} 个数据源同步失败`);
        } else {
            console.log('\n所有数据源同步成功');
        }

        console.log('\n=== 数据同步完成 ===');
        return;
    }

    // 报表导出模式：需要登录通天晓系统
    console.log(`用户: ${config.username}`);

    let browser = null;

    try {
        // 启动浏览器
        const chromePath = findChromePath();
        console.log(`使用浏览器: ${chromePath}`);
        console.log('启动浏览器...');

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: config.headless ? 'new' : false,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 登录
        console.log(`访问: ${config.baseUrl}`);
        const url = `${config.baseUrl}/index.html?customer=${config.customer}&lang=zh`;
        await page.goto(url, { waitUntil: 'networkidle2' });
        await page.waitForTimeout(3000);
        
        // 查找登录iframe
        const frames = page.frames();
        let loginFrame = null;
        
        for (const frame of frames) {
            if (frame.url().includes('loginPage')) {
                loginFrame = frame;
                break;
            }
        }
        
        if (loginFrame) {
            console.log(`正在登录: ${config.username}`);
            await loginFrame.waitForSelector('#username', { timeout: 10000 });
            await loginFrame.type('#username', config.username);
            await loginFrame.type('#password', config.password);
            await loginFrame.click('.login_btn');
            console.log('等待登录完成...');
            await page.waitForTimeout(8000);
        } else {
            console.log('未找到登录iframe，可能已经登录');
        }
        
        // 检查登录状态
        let sessionInfo = { success: false };
        for (let i = 0; i < 5; i++) {
            sessionInfo = await page.evaluate(() => {
                if (window.app && window.app.session && window.app.session.token) {
                    return {
                        success: true,
                        userName: window.app.session.userName,
                        token: window.app.session.token
                    };
                }
                return { success: false };
            });
            
            if (sessionInfo.success) {
                break;
            }
            console.log(`等待session初始化... (${i + 1}/5)`);
            await page.waitForTimeout(2000);
        }

        if (!sessionInfo.success) {
            console.error('登录失败');
            process.exit(1);
        }
        console.log(`登录成功: ${sessionInfo.userName}`);

        // 等待页面主框架完全加载
        console.log('等待页面主框架加载...');
        try {
            await page.waitForFunction('document.readyState === "complete"', {
                timeout: 30000
            });
            console.log('页面主框架已加载');
        } catch (e) {
            console.warn('等待页面主框架超时，继续执行...');
        }

        // 额外等待确保页面完全就绪
        await page.waitForTimeout(3000);

        // 确保主框架可用
        await page.mainFrame(); // 这会抛出异常如果主框架还没准备好

        // 确保输出目录存在
        if (!fs.existsSync(config.outputDir)) {
            fs.mkdirSync(config.outputDir, { recursive: true });
        }
        
        // 设置默认开始日期
        let startDate = config.startDate;
        if (!startDate) {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            startDate = startOfMonth.toISOString().slice(0, 10) + ' 00:00:00';
        }
        
        // 根据报表类型导出
        const reportType = config.reportType.toLowerCase();
        
        // 导出入库单头部
        if (reportType === 'receipt_header' || reportType === 'all') {
            console.log('\n========== 入库单头部 ==========\n');
            
            const exporter = new ReceiptHeaderExporter({ page });
            
            const data = await exporter.getReport({
                warehouseCode: config.warehouseCode,
                companyCode: 'HF-RB,HF-NDK,HF-SPD',
                startDate: startDate,
                endDate: config.endDate,
                checkinStartDate: config.checkinStartDate,
                checkinEndDate: config.checkinEndDate,
                pageSize: config.pageSize
            });
            
            if (data.length > 0) {
                const csvPath = path.join(config.outputDir, 'receipt_header_report.csv');
                const jsonPath = path.join(config.outputDir, 'receipt_header_report.json');
                
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
                console.log('未获取到入库单头部数据');
            }
        }
        
        // 导出入库单明细
        if (reportType === 'receipt_details' || reportType === 'all') {
            console.log('\n========== 入库单明细报表 ==========\n');
            
            const exporter = new ReceiptDetailsExporter({ page });
            
            const data = await exporter.getReport({
                warehouseCode: config.warehouseCode,
                companyCode: 'HF-RB,HF-NDK,HF-SPD',
                receiptTypes: config.receiptTypes,
                startDate: startDate,
                endDate: config.endDate,
                pageSize: config.pageSize
            });
            
            if (data.length > 0) {
                const csvPath = path.join(config.outputDir, 'receipt_details_report.csv');
                const jsonPath = path.join(config.outputDir, 'receipt_details_report.json');
                
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
                console.log('未获取到入库单明细数据');
            }
        }
        
        // 导出B2C出库单
        if (reportType === 'b2c_shipment' || reportType === 'all') {
            console.log('\n========== B2C出库单 ==========\n');
            
            const exporter = new B2CShipmentExporter({ page });
            
            const data = await exporter.getReport({
                warehouseCode: config.warehouseCode,
                companyCode: 'HF-RB,HF-NDK,HF-SPD',
                processType: config.processType,
                leadingStsBegin: config.leadingStsBegin,
                leadingStsEnd: config.leadingStsEnd,
                startDate: startDate,
                endDate: config.endDate,
                pageSize: config.pageSize
            });
            
            if (data.length > 0) {
                const csvPath = path.join(config.outputDir, 'b2c_shipment_report.csv');
                const jsonPath = path.join(config.outputDir, 'b2c_shipment_report.json');
                
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
                console.log('未获取到B2C出库单数据');
            }
        }
        
        // 导出B2B出库单
        if (reportType === 'b2b_shipment' || reportType === 'all') {
            console.log('\n========== B2B出库单 ==========\n');
            
            const exporter = new B2BShipmentExporter({ page });
            
            const data = await exporter.getReport({
                warehouseCode: config.warehouseCode,
                companyCode: 'HF-RB,HF-NDK,HF-SPD',
                processType: config.processType,
                startDate: startDate,
                endDate: config.endDate,
                pageSize: config.pageSize
            });
            
            if (data.length > 0) {
                const csvPath = path.join(config.outputDir, 'b2b_shipment_report.csv');
                const jsonPath = path.join(config.outputDir, 'b2b_shipment_report.json');
                
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
                console.log('未获取到B2B出库单数据');
            }
        }
        
        // 导出B2C拣货明细
        if (reportType === 'paking_details' || reportType === 'all') {
            console.log('\n========== B2C拣货明细 ==========\n');
            
            const exporter = new B2CPakingDetailsExporter({ page });
            
            const data = await exporter.getReport({
                startDate: startDate,
                endDate: config.endDate,
                companyCodes: 'HF-RB,HF-NDK,HF-SPD',
                pageSize: config.pageSize
            });
            
            if (data.length > 0) {
                const csvPath = path.join(config.outputDir, 'b2c_paking_details_report.csv');
                const jsonPath = path.join(config.outputDir, 'b2c_paking_details_report.json');
                
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
                console.log('未获取到B2C拣货明细数据');
            }
        }

        // 数据同步到Genespace
        if (reportType === 'all') {
            console.log('\n========== 数据同步到Genespace ==========\n');

            const exporter = new DataSyncExporter();

            const result = await exporter.syncAll();

            if (result.failed > 0) {
                console.log(`\n警告: 数据同步完成，但有 ${result.failed} 个数据源同步失败`);
            } else {
                console.log('\n所有数据源同步成功');
            }
        }

        console.log('\n=== 导出完成 ===');
    } catch (error) {
        console.error('错误:', error);
        process.exit(1);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// 如果直接运行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main };
