#!/usr/bin/env node
/**
 * 通天晓WMS - 数据导出主入口
 *
 * 按 TTX_SYNC_STEP 执行指定步骤，步骤2根据 REPORT_TYPE 导出对应报表
 * TTX_SYNC_STEP 默认 all，REPORT_TYPE 默认 all
 *
 * 依赖：npm install puppeteer-core dotenv
 * 使用：cp .env.example .env && node ttx_export.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { execSync } = require('child_process');

// 导入导出模块
const { ReceiptHeaderExporter } = require('./ttx_receipt_header');
const { ReceiptHeaderExExporter } = require('./ttx_receipt_header_ex');
const { ReceiptDetailsExporter } = require('./ttx_receipt_details');
const { B2CShipmentExporter } = require('./ttx_b2c_shipment');
const { B2BShipmentExporter } = require('./ttx_b2b_shipment');
const { B2CPakingDetailsExporter } = require('./ttx_b2c_paking_details');
const { DataSyncExporter, parseSyncSteps } = require('./ttx_data_sync');

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
        
        // 报表类型（步骤2时）: receipt_header, receipt_header_ex, receipt_details, b2c_shipment, b2b_shipment, paking_details, all
        reportType: process.env.REPORT_TYPE || 'all',

        // 通用查询条件
        warehouseCode: process.env.TTX_WAREHOUSE || 'HF',
        startDate: process.env.TTX_START_DATE || '2026-02-05 00:00:00',
        endDate: process.env.TTX_END_DATE || '2026-02-06 23:59:59',

        // 运行配置
        headless: process.env.HEADLESS !== 'false',
        pageSize: parseInt(process.env.PAGE_SIZE || '500', 10),
        navigationTimeout: parseInt(process.env.TTX_NAVIGATION_TIMEOUT || '60000', 10),

        // 分步执行，默认 all
        ttSyncStep: process.env.TTX_SYNC_STEP || 'all'
    };
}

/**
 * 步骤2：通天晓导出 → 镜像表（根据 REPORT_TYPE 导出对应报表到 dataSource）
 * @param {Object} config 配置对象
 * @param {Object} browserInstance Puppeteer 浏览器实例（可选）
 * @param {string} reportType receipt_header | receipt_details | b2c_shipment | b2b_shipment | paking_details | all
 * @returns {Promise<{success: boolean}>}
 */
async function runBrowserExportToMirror(config, browserInstance = null, reportType = 'all') {
    const chromePath = findChromePath();
    const ownBrowser = !browserInstance;
    const browser = browserInstance || await puppeteer.launch({
        executablePath: chromePath,
        headless: config.headless ? 'new' : false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        const url = `${config.baseUrl}/index.html?customer=${config.customer}&lang=zh`;
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: config.navigationTimeout
        });
        await page.waitForTimeout(5000);

        const frames = page.frames();
        let loginFrame = null;
        for (const frame of frames) {
            if (frame.url().includes('loginPage')) {
                loginFrame = frame;
                break;
            }
        }
        if (loginFrame) {
            await loginFrame.waitForSelector('#username', { timeout: 10000 });
            await loginFrame.type('#username', config.username);
            await loginFrame.type('#password', config.password);
            await loginFrame.click('.login_btn');
            await page.waitForTimeout(8000);
        }

        let sessionInfo = { success: false };
        for (let i = 0; i < 5; i++) {
            sessionInfo = await page.evaluate(() => {
                if (window.app && window.app.session && window.app.session.token) {
                    return { success: true, userName: window.app.session.userName };
                }
                return { success: false };
            });
            if (sessionInfo.success) break;
            await page.waitForTimeout(2000);
        }
        if (!sessionInfo.success) throw new Error('登录失败');
        console.log(`登录成功: ${sessionInfo.userName}`);

        await page.waitForFunction('document.readyState === "complete"', { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);

        const startDate = config.startDate || (() => {
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            return startOfMonth.toISOString().slice(0, 10) + ' 00:00:00';
        })();
        const reportOptions = {
            warehouseCode: config.warehouseCode,
            companyCode: 'HF-RB,HF-NDK,HF-SPD',
            startDate,
            endDate: config.endDate,
            pageSize: config.pageSize
        };
        const pickingOptions = { startDate, endDate: config.endDate, pageSize: config.pageSize };

        const type = reportType.toLowerCase();
        const runAll = type === 'all';

        if (runAll || type === 'receipt_header_ex') {
            await new ReceiptHeaderExExporter({ page }).getReportAndExportToDataSource({ ...reportOptions, userName: config.username });
        }
        if (runAll || type === 'receipt_details') {
            await new ReceiptDetailsExporter({ page }).getReportAndExportToDataSource(reportOptions);
        }
        if (runAll || type === 'b2c_shipment') {
            await new B2CShipmentExporter({ page }).getReportAndExportToDataSource(reportOptions);
        }
        if (runAll || type === 'b2b_shipment') {
            await new B2BShipmentExporter({ page }).getReportAndExportToDataSource(reportOptions);
        }
        if (runAll || type === 'paking_details') {
            await new B2CPakingDetailsExporter({ page }).getReportAndExportToDataSource(pickingOptions);
        }
        return { success: true };
    } finally {
        if (ownBrowser && browser) await browser.close();
    }
}

async function main() {
    const config = getConfig();

    const steps = parseSyncSteps(config.ttSyncStep);
    console.log('=== 通天晓数据同步（ttx_export.js 入口）===');
    console.log(`执行步骤: ${steps.join(', ')} (TTX_SYNC_STEP=${config.ttSyncStep})`);
    console.log(`目标: ${config.baseUrl}`);
    console.log(`租户: ${config.customer}`);
    console.log('');

    const exporter = new DataSyncExporter();
    let totalFailed = 0;

    for (const step of steps) {
        switch (step) {
            case 1:
                await exporter.runStep1();
                break;
            case 2:
                console.log('\n' + '='.repeat(50));
                console.log(`【步骤2】通天晓导出 → 镜像表 (REPORT_TYPE=${config.reportType})`);
                console.log('='.repeat(50));
                try {
                    await runBrowserExportToMirror(config, null, config.reportType);
                } catch (err) {
                    console.error('步骤2 执行失败:', err.message);
                    totalFailed++;
                }
                break;
            case 3:
                await exporter.runStep3();
                break;
            case 4:
                await exporter.runStep4();
                break;
            case 5:
                await exporter.runStep5();
                break;
            default:
                console.warn(`未知步骤: ${step}`);
        }
    }

    console.log('\n=== 数据同步完成 ===');
    if (totalFailed > 0) process.exit(1);
}

// 如果直接运行
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main, runBrowserExportToMirror };
