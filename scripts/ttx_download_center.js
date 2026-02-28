#!/usr/bin/env node
/**
 * 通天晓WMS - 导出任务中心模块
 *
 * 通过 window.app.dataManager 实现：
 * 1. 查询下载任务中心（ttx_export_log_header），按当天时间范围
 * 2. 筛选指定 tid/oid 的最新一条任务
 * 3. 轮询任务进度直至完成，获取 fileId（从 progress、files 字段）
 * 4. 请求文件下载地址并下载表格
 *
 * 对外开放参数：tid（默认 EXPORT_TABLES）、oid（默认 receipt_header_ex）
 */

const path = require('path');
const fs = require('fs');

/** 任务中心查询结果字段 */
const RESULT_FIELDS = 'id,gid,tid,oid,operator,progress,beginAt,endAt,status';

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 10000;

/** 最大轮询次数（约 5 分钟） */
const MAX_POLL_COUNT = 30;

/**
 * Excel 表格处理工具（供各导出模块复用）
 */
class TtxExcelUtils {
    /**
     * 将 Excel 日期序列号转为 YYYY-MM-DD HH:mm:ss
     */
    static excelSerialToDateString(serial) {
        if (typeof serial !== 'number') return serial;
        const d = new Date((serial - 25569) * 86400 * 1000);
        if (isNaN(d.getTime())) return String(serial);
        return d.toISOString().slice(0, 19).replace('T', ' ');
    }

    /**
     * 清理日期时间字符串：若含脏数据（如通天晓超时错误文本拼接在时间后），取前 19 字符作为 YYYY-MM-DD HH:mm:ss
     */
    static sanitizeDateTimeString(str) {
        if (typeof str !== 'string') return str;
        if (str.length > 19) return str.slice(0, 19);
        return str;
    }

    /**
     * 读取 Excel 文件并转为 JSON 行数组（屏蔽 xlsx 解析时的 Bad uncompressed size 警告）
     */
    static readExcelToRows(filePath) {
        const XLSX = require('xlsx');
        const suppress = (msg) => msg.includes('Bad uncompressed size') || msg.includes('Bad compressed size');
        const origWarn = console.warn;
        const origError = console.error;
        console.warn = (...args) => {
            if (suppress(args.join(' '))) return;
            origWarn.apply(console, args);
        };
        console.error = (...args) => {
            if (suppress(args.join(' '))) return;
            origError.apply(console, args);
        };
        try {
            const workbook = XLSX.readFile(filePath, { cellDates: false, cellNF: false });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            return XLSX.utils.sheet_to_json(sheet);
        } finally {
            console.warn = origWarn;
            console.error = origError;
        }
    }

    /**
     * 按字段映射将 Excel 行转为目标格式，日期字段从 Excel 序列号转为字符串
     * @param {Object} row - Excel 行对象
     * @param {Object} excelToTarget - Excel 列名 -> 目标字段的映射
     * @param {Set|Array} dateFields - 需转换的日期字段集合
     */
    static transformExcelRow(row, excelToTarget, dateFields = new Set()) {
        const dateSet = dateFields instanceof Set ? dateFields : new Set(dateFields);
        const out = {};
        for (const [excelHeader, value] of Object.entries(row)) {
            const targetField = excelToTarget[excelHeader] || excelHeader;
            if (value === undefined || value === null || value === '') continue;
            let finalValue = value;
            if (dateSet.has(targetField)) {
                finalValue = typeof value === 'number'
                    ? TtxExcelUtils.excelSerialToDateString(value)
                    : TtxExcelUtils.sanitizeDateTimeString(value);
            }
            out[targetField] = finalValue;
        }
        return out;
    }

    /**
     * 批量转换 Excel 行
     */
    static transformExcelRows(rows, excelToTarget, dateFields = new Set()) {
        return rows.map((r) => TtxExcelUtils.transformExcelRow(r, excelToTarget, dateFields));
    }
}

class TtxDownloadCenter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
        this.tid = options.tid || 'EXPORT_TABLES';
        this.oid = options.oid || 'receipt_header_ex';
        this.userName = options.userName || 'HFLS17';
    }

    /**
     * 获取当天 00:00:00 和 23:59:59
     */
    _getTodayRange() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return {
            begin: `${y}-${m}-${d} 00:00:00`,
            end: `${y}-${m}-${d} 23:59:59`
        };
    }

    /**
     * 1. 通过 dataManager 查询任务中心列表
     */
    async _queryExportLogList() {
        const { begin, end } = this._getTodayRange();
        const filter = {
            and: [
                { field: 'beginAt:begin', operator: '>=', value: begin },
                { field: 'beginAt:end', operator: '<=', value: end },
                { field: 'operator', operator: '=', value: this.userName }
            ]
        };
        const filterJson = JSON.stringify(filter);

        const result = await this.page.evaluate(async (args) => {
            const { filterJson, resultFields } = args;
            try {
                if (!window.app?.dataManager?.get) {
                    return { success: false, error: 'dataManager 未就绪' };
                }
                const apiPath = '/rest/cbt/ttx_export_log_header';
                const options = {
                    headers: {
                        Accept: 'application/javascript, application/json',
                        Range: 'items=0-99',
                        'X-Range': 'items=0-99',
                        'X-Button': 'ttx_export_log_header:ttx.wso.Bill:ttx_export_log_header:bills:query',
                        'X-Result-Fields': resultFields,
                        filter: encodeURIComponent(filterJson)
                    }
                };
                return new Promise((resolve) => {
                    window.app.dataManager.get(apiPath, options).then(
                        (data) => resolve({ success: true, data }),
                        (err) => resolve({ success: false, error: err?.message || String(err) })
                    );
                });
            } catch (e) {
                return { success: false, error: e.message || String(e) };
            }
        }, { filterJson, resultFields: RESULT_FIELDS });

        return result;
    }

    /**
     * 2. 从列表中筛选 tid/oid 匹配的、时间上最后一条
     */
    _findLastMatchingTask(list) {
        let items = [];
        if (Array.isArray(list)) {
            items = list;
        } else if (list && Array.isArray(list.result)) {
            items = list.result;
        } else if (list && list.items) {
            items = Array.isArray(list.items) ? list.items : [list.items];
        } else if (list && typeof list === 'object' && list.constructor?.name !== 'Array') {
            items = [list];
        }

        const matching = items.filter(
            (r) => (r.tid || r.TID) === this.tid && (r.oid || r.OID) === this.oid
        );
        if (matching.length === 0) return null;

        matching.sort((a, b) => {
            const tA = a.beginAt || a.BeginAt || a.created || a.Created || '';
            const tB = b.beginAt || b.BeginAt || b.created || b.Created || '';
            return tB.localeCompare(tA);
        });
        return matching[0];
    }

    /**
     * 3. 通过 dataManager 获取任务进度
     */
    async _fetchTaskProgress(headerId) {
        const result = await this.page.evaluate(async (args) => {
            const { apiPath } = args;
            try {
                if (!window.app?.dataManager?.get) {
                    return { success: false, error: 'dataManager 未就绪' };
                }
                const options = {
                    headers: {
                        Accept: '*/*',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                };
                return new Promise((resolve) => {
                    window.app.dataManager.get(apiPath, options).then(
                        (data) => resolve({ success: true, data }),
                        (err) => resolve({ success: false, error: err?.message || String(err) })
                    );
                });
            } catch (e) {
                return { success: false, error: e.message || String(e) };
            }
        }, { apiPath: `/rest/cbt/ttx_export_log_header/${headerId}` });

        return result;
    }

    /**
     * 从任务记录的 files 字段解析 fileId（files 为 JSON 字符串，如 {"fileId":"xxx"}）
     */
    _parseFileIdFromTask(task) {
        if (!task) return null;
        const files = task.files ?? task.Files ?? '';
        if (typeof files !== 'string') return null;
        try {
            const parsed = JSON.parse(files);
            return parsed.fileId ?? parsed.FileId ?? null;
        } catch {
            const match = files.match(/"fileId"\s*:\s*"([^"]+)"/);
            return match ? match[1] : null;
        }
    }

    /**
     * 判断任务是否已完成（progress === '100%'）
     */
    _isProgressComplete(task) {
        if (!task || typeof task !== 'object') return false;
        return (task.progress ?? task.Progress) === '100%';
    }

    /**
     * 4. 通过 dataManager 请求文件下载地址
     */
    async _fetchDownloadUrl(fileId) {
        const result = await this.page.evaluate(async (args) => {
            const { apiPath } = args;
            try {
                if (!window.app?.dataManager?.get) {
                    return { success: false, error: 'dataManager 未就绪' };
                }
                const options = {
                    headers: {
                        Accept: '*/*',
                        'X-Button': 'ttx_export_log_header:ttx.wso.Bill:ttx_export_log_header:bill:download',
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                };
                return new Promise((resolve) => {
                    window.app.dataManager.get(apiPath, options).then(
                        (data) => resolve({ success: true, data }),
                        (err) => resolve({ success: false, error: err?.message || String(err) })
                    );
                });
            } catch (e) {
                return { success: false, error: e.message || String(e) };
            }
        }, { apiPath: `/cbt/mongo/file/id/excel/${fileId}` });

        return result;
    }

    /**
     * 5. 触发文件下载（通过页面内 a 标签点击，依赖当前会话 cookie）
     */
    async _downloadFile(downloadPath, savePath) {
        const fullUrl = this.baseUrl.replace(/\/$/, '') + downloadPath;
        const dir = path.dirname(savePath);
        const absoluteDir = path.resolve(dir);

        const client = await this.page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: absoluteDir
        });

        await this.page.evaluate(({ url }) => {
            const a = document.createElement('a');
            a.href = url;
            a.download = 'export.xlsx';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }, { url: fullUrl });

        const desiredName = path.basename(savePath);
        for (let i = 0; i < 30; i++) {
            await this.page.waitForTimeout(1000);
            const files = fs.readdirSync(absoluteDir).filter(
                (f) => (f.endsWith('.xlsx') || f.endsWith('.xls')) && !f.endsWith('.crdownload')
            );
            const latest = files
                .map((f) => ({ name: f, mtime: fs.statSync(path.join(absoluteDir, f)).mtime }))
                .sort((a, b) => b.mtime - a.mtime)[0];
            if (latest) {
                const src = path.join(absoluteDir, latest.name);
                const dest = path.join(absoluteDir, desiredName);
                if (src !== dest) fs.renameSync(src, dest);
                return dest;
            }
        }
        throw new Error('下载超时，未在目录中找到生成的文件');
    }

    /**
     * 主流程：查询 → 筛选 → 轮询进度 → 获取 fileId → 下载
     *
     * @param {Object} options
     * @param {string} [options.savePath] 保存路径，默认 ./output/receipt_header_ex_YYYYMMDD_HHmmss.xlsx
     * @returns {Promise<{success: boolean, filePath?: string, error?: string}>}
     */
    async downloadLatestExport(options = {}) {
        if (!this.page) {
            throw new Error('页面对象未设置，请先调用 setPage(page) 设置 Puppeteer page');
        }

        const { savePath: userSavePath } = options;
        const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
        const defaultPath = path.resolve(
            __dirname,
            '..',
            'output',
            `${this.oid}_${ts}.xlsx`
        );
        const savePath = userSavePath || defaultPath;

        console.log('\n[导出任务中心] 开始流程');
        console.log(`  - tid: ${this.tid}, oid: ${this.oid}`);
        console.log(`  - 时间: 当天 00:00:00 ~ 23:59:59`);

        const listResult = await this._queryExportLogList();
        if (!listResult.success) {
            console.error('  查询任务列表失败:', listResult.error);
            return { success: false, error: listResult.error };
        }

        const task = this._findLastMatchingTask(listResult.data);
        if (!task) {
            const err = `未找到匹配任务 (tid=${this.tid}, oid=${this.oid})`;
            console.error(' ', err);
            return { success: false, error: err };
        }

        const headerId = task.id || task.ID;
        console.log(`  - 找到任务 id=${headerId}`);

        let fileId = null;
        for (let i = 0; i < MAX_POLL_COUNT; i++) {
            const progResult = await this._fetchTaskProgress(headerId);
            if (!progResult.success) {
                console.error('  获取进度失败:', progResult.error);
                return { success: false, error: progResult.error };
            }

            const taskRecord = progResult.data;
            if (this._isProgressComplete(taskRecord)) {
                fileId = this._parseFileIdFromTask(taskRecord);
                break;
            }

            console.log(`  - 任务进行中，${POLL_INTERVAL_MS / 1000}s 后重试... (${i + 1}/${MAX_POLL_COUNT})`);
            await this.page.waitForTimeout(POLL_INTERVAL_MS);
        }

        if (!fileId) {
            const err = '任务未在超时内完成或解析 fileId 失败';
            console.error(' ', err);
            return { success: false, error: err };
        }

        console.log(`  - fileId: ${fileId}`);

        const urlResult = await this._fetchDownloadUrl(fileId);
        if (!urlResult.success) {
            console.error('  获取下载地址失败:', urlResult.error);
            return { success: false, error: urlResult.error };
        }

        const resp = urlResult.data;
        const downloadPath = resp?.data ?? resp?.Data;
        if (!downloadPath || typeof downloadPath !== 'string') {
            const err = '响应中未包含下载路径';
            console.error(' ', err);
            return { success: false, error: err };
        }

        const dir = path.dirname(savePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        try {
            const filePath = await this._downloadFile(downloadPath, savePath);
            console.log(`  - 下载完成: ${filePath}`);
            return { success: true, filePath };
        } catch (e) {
            console.error('  下载失败:', e.message);
            return { success: false, error: e.message };
        }
    }

    setPage(page) {
        this.page = page;
    }
}

/**
 * 独立运行：启动浏览器、登录、执行下载
 * 使用：node ttx_download_center.js
 * 环境变量：同 ttx_export.js（TTX_BASE_URL, TTX_USERNAME, TTX_PASSWORD 等）
 */
async function runStandalone() {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
    const puppeteer = require('puppeteer-core');
    const { execSync } = require('child_process');

    function findChromePath() {
        const paths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium'
        ];
        for (const p of paths) {
            if (fs.existsSync(p)) return p;
        }
        try {
            return execSync('which google-chrome || which chromium', { encoding: 'utf8' }).trim();
        } catch {
            throw new Error('未找到 Chrome，请设置 CHROME_PATH');
        }
    }

    const baseUrl = process.env.TTX_BASE_URL || 'https://ttx.56xyy.com';
    const customer = process.env.TTX_CUSTOMER || 'xyy-wms-prod';
    const username = process.env.TTX_USERNAME || 'HFLS17';
    const password = process.env.TTX_PASSWORD || 'Xyy1234567';
    const tid = process.env.TTX_DOWNLOAD_TID || 'EXPORT_TABLES';
    const oid = process.env.TTX_DOWNLOAD_OID || 'receipt_header_ex';

    const browser = await puppeteer.launch({
        executablePath: findChromePath(),
        headless: process.env.HEADLESS !== 'false',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(`${baseUrl}/index.html?customer=${customer}&lang=zh`, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await page.waitForTimeout(5000);

        const frames = page.frames();
        const loginFrame = frames.find((f) => f.url().includes('loginPage'));
        if (loginFrame) {
            await loginFrame.waitForSelector('#username', { timeout: 10000 });
            await loginFrame.type('#username', username);
            await loginFrame.type('#password', password);
            await loginFrame.click('.login_btn');
            await page.waitForTimeout(8000);
        }

        let ok = false;
        for (let i = 0; i < 5; i++) {
            ok = await page.evaluate(() => !!window.app?.session?.token);
            if (ok) break;
            await page.waitForTimeout(2000);
        }
        if (!ok) throw new Error('登录失败');

        await page.waitForTimeout(3000);

        const center = new TtxDownloadCenter({
            page,
            baseUrl,
            customer,
            tid,
            oid,
            userName: username
        });
        const result = await center.downloadLatestExport();
        if (!result.success) throw new Error(result.error);
        console.log('\n完成:', result.filePath);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    runStandalone().catch((e) => {
        console.error(e.message || e);
        process.exit(1);
    });
}

module.exports = { TtxDownloadCenter, TtxExcelUtils, runStandalone };
