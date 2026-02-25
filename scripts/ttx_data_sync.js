#!/usr/bin/env node
/**
 * 通天晓WMS - 数据同步模块
 *
 * 实现《通天晓数据同步步骤》中的 5 个步骤，支持分步执行以便调试。
 *
 * 使用方法：
 *   # 执行全部步骤
 *   node ttx_data_sync.js
 *
 *   # 仅执行指定步骤（单步调试）
 *   TTX_SYNC_STEP=1 node ttx_data_sync.js    # 仅步骤1：删除镜像表
 *   TTX_SYNC_STEP=2 node ttx_data_sync.js    # 仅步骤2：通天晓导出→镜像表
 *   TTX_SYNC_STEP=3 node ttx_data_sync.js    # 仅步骤3：镜像表→临时表
 *   TTX_SYNC_STEP=4 node ttx_data_sync.js    # 仅步骤4：临时表→职能表
 *   TTX_SYNC_STEP=5 node ttx_data_sync.js    # 仅步骤5：临时表清理
 *
 *   # 执行多步骤
 *   TTX_SYNC_STEP=1,3,4 node ttx_data_sync.js
 */

require('dotenv').config();

const { syncDataSourceData } = require('../src/services/datasource-service');
const { execSync } = require('child_process');
const path = require('path');

// 从环境变量获取配置
const API_TOKEN = process.env.GENISPCE_API_TOKEN || 'q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx';
const BASE_URL = process.env.GENISPCE_BASE_URL || 'https://api.genispace.cn';

/** 步骤1：清空镜像表 - 数据源ID（syncDataSourceData 触发删除） */
const MIRROR_DELETE_DATASOURCES = [
    {
        key: 'mirror_inbound_details_raw_delete_all',
        name: '清空 镜像表-入库单明细',
        datasourceId: '7263ade3-5c9d-4949-807e-0431cda6c8fb'
    },
    {
        key: 'mirror_inbound_raw_delete_all',
        name: '清空 镜像表-入库单头部',
        datasourceId: '9033becb-cc3f-45a6-a361-f2620d189f1a'
    },
    {
        key: 'mirror_b2c_express_package_raw_delete_all',
        name: '清空 镜像表-B2C快递包裹',
        datasourceId: 'bb124bb4-2d00-4292-bec6-6c6745410140'
    },
    {
        key: 'mirror_b2c_picking_details_raw_delete_all',
        name: '清空 镜像表-B2C拣货明细',
        datasourceId: '126c445e-0437-48f9-a104-ea3bb5910c10'
    },
    {
        key: 'mirror_b2c_raw_delete_all',
        name: '清空 镜像表-B2C出库单',
        datasourceId: 'fb22f9a4-ffcc-4a50-9194-d586d6338522'
    },
    {
        key: 'mirror_b2b_raw_delete_all',
        name: '清空 镜像表-B2B出库单',
        datasourceId: '7a3174f3-63f4-4913-8748-b713cd443e28'
    }
];

/** 步骤3：镜像表 → 临时表（UPSERT）- 数据源ID */
const MIRROR_TO_TEMP_DATASOURCES = [
    {
        key: 'mirror_b2c_express_package_to_temp',
        name: 'B2C快递包裹 → 临时表',
        datasourceId: 'ad69038b-0a41-4042-b709-93775b4639ac'
    },
    {
        key: 'mirror_b2c_picking_details_to_temp',
        name: 'B2C拣货明细 → 临时表',
        datasourceId: '01a1fb3c-84d3-4e97-ac2d-94ddaa1b8c75'
    },
    {
        key: 'mirror_b2b_to_temp',
        name: 'B2B出库单 → 临时表',
        datasourceId: '248619e6-7a93-4d72-8694-92d9945ef333'
    },
    {
        key: 'mirror_b2c_to_temp',
        name: 'B2C出库单 → 临时表',
        datasourceId: 'd9bff880-4e4a-4729-a5fd-22822fa300e7'
    },
    {
        key: 'mirror_inbound_details_to_temp',
        name: '入库单明细 → 临时表',
        datasourceId: 'b405de25-84f6-4394-a3b9-472c61251659'
    },
    {
        key: 'mirror_inbound_to_temp',
        name: '入库单头部 → 临时表',
        datasourceId: '86ebcc0c-50e5-4773-81f7-2b66d0e1b7d0'
    }
];

/** 步骤4：临时表 → 职能表 - 数据源ID（syncTempToData） */
const TEMP_TO_DATA_DATASOURCES = {
    purchase_inbound_in_transit: {
        name: '采购入库在途',
        datasourceId: '9c13a06a-2f2f-40d6-b258-ea5a360af918'
    },
    store_return_in_transit: {
        name: '门店退货在途',
        datasourceId: '700fa8c0-2a46-4c5a-ac7e-408d79ec7f17'
    },
    customer_return_in_transit: {
        name: '客户退货在途',
        datasourceId: '40c28871-7ab9-4c95-97b1-244bb4a9d6a6'
    },
    b2b_orders: {
        name: 'B2B订单',
        datasourceId: 'b44bc57c-83c2-4df1-adbb-02cdebceeba3'
    },
    outbound_orders: {
        name: '出库订单',
        datasourceId: 'eae8c6af-70b4-4522-a0e0-35c1b9ab7281'
    },
    abnormal_pickup_orders: {
        name: '异常提货订单',
        datasourceId: 'e6400f85-4c94-4dd5-92bb-e746dcf35a93'
    }
};

/** 步骤5：临时表清理 - 数据源ID（后续提供） */
const TEMP_CLEANUP_DATASOURCES = [];

/**
 * 解析要执行的步骤
 * @param {string} stepEnv - 环境变量 TTX_SYNC_STEP 的值，如 "1" / "1,2,3" / "all"
 * @returns {number[]} 步骤编号数组，如 [1, 2, 3, 4, 5]
 */
function parseSyncSteps(stepEnv) {
    if (!stepEnv || stepEnv.toLowerCase() === 'all') {
        return [1, 2, 3, 4, 5];
    }
    const steps = stepEnv.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 5);
    return steps.length > 0 ? [...new Set(steps)].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

/**
 * 数据同步导出器类
 */
class DataSyncExporter {
    constructor(options = {}) {
        this.apiToken = options.apiToken || API_TOKEN;
        this.baseUrl = options.baseUrl || BASE_URL;
        this.timeout = options.timeout || 30000;
    }

    /** 步骤1：删除镜像表（清空当次数据） */
    async runStep1() {
        console.log('\n' + '='.repeat(50));
        console.log('【步骤1】删除镜像表 - 清空当次数据');
        console.log('='.repeat(50));

        const results = [];
        for (const config of MIRROR_DELETE_DATASOURCES) {
            const result = await syncDataSourceData(config.datasourceId, {
                logPrefix: config.name,
                apiToken: this.apiToken,
                baseUrl: this.baseUrl
            });
            results.push({ key: config.key, ...result });
        }
        return results;
    }

    /** 步骤2：通天晓导出 → 镜像表（通过 ttx_export.js 执行） */
    async runStep2() {
        console.log('\n' + '='.repeat(50));
        console.log('【步骤2】通天晓导出 → 镜像表');
        console.log('='.repeat(50));
        console.log('调用 ttx_export.js，报表类型: all，输出: dataSource\n');

        const scriptDir = path.dirname(__filename);
        const ttxExportPath = path.join(scriptDir, 'ttx_export.js');
        const env = {
            ...process.env,
            REPORT_TYPE: 'all',
            OUTPUT_FORMAT: 'dataSource',
            TTX_SKIP_FINAL_SYNC: '1'  // 步骤2仅导出入库镜像，不执行临时表→职能表
        };

        try {
            execSync(`node "${ttxExportPath}"`, {
                stdio: 'inherit',
                env,
                cwd: scriptDir
            });
            return [{ success: true, message: '通天晓导出并写入镜像表完成' }];
        } catch (error) {
            console.error('步骤2 执行失败:', error.message);
            return [{ success: false, message: error.message }];
        }
    }

    /** 步骤3：镜像表 → 临时表（UPSERT） */
    async runStep3() {
        console.log('\n' + '='.repeat(50));
        console.log('【步骤3】镜像表 → 临时表 (UPSERT)');
        console.log('='.repeat(50));

        const results = [];
        for (const config of MIRROR_TO_TEMP_DATASOURCES) {
            const result = await syncDataSourceData(config.datasourceId, {
                logPrefix: config.name,
                apiToken: this.apiToken,
                baseUrl: this.baseUrl
            });
            results.push({ key: config.key, ...result });
        }
        return results;
    }

    /** 步骤4：临时表 → 职能表 */
    async runStep4() {
        console.log('\n' + '='.repeat(50));
        console.log('【步骤4】临时表 → 职能表');
        console.log('='.repeat(50));

        const keys = Object.keys(TEMP_TO_DATA_DATASOURCES);
        const results = [];

        for (const key of keys) {
            const config = TEMP_TO_DATA_DATASOURCES[key];
            const result = await syncDataSourceData(config.datasourceId, {
                logPrefix: config.name,
                apiToken: this.apiToken,
                baseUrl: this.baseUrl
            });
            results.push({ dataSource: key, ...result });
        }

        return results;
    }

    /** 步骤5：临时表清理（占位，后续提供数据源ID） */
    async runStep5() {
        console.log('\n' + '='.repeat(50));
        console.log('【步骤5】临时表清理');
        console.log('='.repeat(50));

        if (TEMP_CLEANUP_DATASOURCES.length === 0) {
            console.log('（占位）临时表清理数据源ID尚未配置，跳过');
            return [{ success: true, message: '占位跳过，待配置 TEMP_CLEANUP_DATASOURCES' }];
        }

        const results = [];
        for (const config of TEMP_CLEANUP_DATASOURCES) {
            const result = await syncDataSourceData(config.datasourceId, {
                logPrefix: config.name,
                apiToken: this.apiToken,
                baseUrl: this.baseUrl
            });
            results.push({ key: config.key, ...result });
        }
        return results;
    }

    /**
     * 同步单个职能表数据源（兼容旧接口）
     * @param {string} dataSourceKey 数据源键名
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async syncDataSource(dataSourceKey) {
        const config = TEMP_TO_DATA_DATASOURCES[dataSourceKey];
        if (!config) {
            console.error(`未找到数据源配置: ${dataSourceKey}`);
            return { success: false, message: `未找到数据源配置: ${dataSourceKey}` };
        }

        return await syncDataSourceData(config.datasourceId, {
            logPrefix: config.name,
            apiToken: this.apiToken,
            baseUrl: this.baseUrl
        });
    }

    /**
     * 同步临时表到职能表（步骤4，兼容旧接口）
     * @param {string[]} dataSourceKeys 要同步的数据源列表，默认全部
     * @returns {Promise<{total: number, success: number, failed: number, results: Array}>}
     */
    async syncTempToData(dataSourceKeys = null) {
        const keys = dataSourceKeys || Object.keys(TEMP_TO_DATA_DATASOURCES);
        const results = [];
        let successCount = 0;
        let failedCount = 0;

        console.log('='.repeat(50));
        console.log('开始数据同步到 Genespace（临时表→职能表）');
        console.log('='.repeat(50));

        for (const key of keys) {
            const result = await this.syncDataSource(key);
            results.push({ dataSource: key, ...result });
            if (result.success) successCount++;
            else failedCount++;
        }

        return {
            total: keys.length,
            success: successCount,
            failed: failedCount,
            results
        };
    }

    /**
     * 执行完整同步流程（支持分步）
     * @param {number[]} steps 要执行的步骤列表，默认 [1,2,3,4,5]
     * @returns {Promise<Object>}
     */
    async runSync(steps = [1, 2, 3, 4, 5]) {
        const stepResults = {};
        let totalFailed = 0;

        for (const step of steps) {
            let results = [];
            switch (step) {
                case 1:
                    results = await this.runStep1();
                    break;
                case 2:
                    results = await this.runStep2();
                    break;
                case 3:
                    results = await this.runStep3();
                    break;
                case 4:
                    results = await this.runStep4();
                    break;
                case 5:
                    results = await this.runStep5();
                    break;
                default:
                    console.warn(`未知步骤: ${step}`);
            }
            stepResults[`step${step}`] = results;
            const failed = results.filter(r => r.success === false).length;
            totalFailed += failed;
        }

        return { stepResults, totalFailed };
    }

    static getDataSources() {
        return TEMP_TO_DATA_DATASOURCES;
    }

    static getDataSource(key) {
        return TEMP_TO_DATA_DATASOURCES[key] || null;
    }
}

/**
 * 同步单个数据源（便捷函数）
 */
async function syncDataSource(dataSourceKey, options = {}) {
    const exporter = new DataSyncExporter(options);
    return await exporter.syncDataSource(dataSourceKey);
}

/**
 * 同步临时表到职能表（便捷函数）
 */
async function syncTempToData(dataSourceKeys = null, options = {}) {
    const exporter = new DataSyncExporter(options);
    return await exporter.syncTempToData(dataSourceKeys);
}

/**
 * 主入口：按 TTX_SYNC_STEP 执行
 */
async function main() {
    const stepEnv = process.env.TTX_SYNC_STEP;
    const steps = parseSyncSteps(stepEnv);

    console.log('=== 通天晓数据同步 ===');
    console.log(`执行步骤: ${steps.join(', ')}`);
    console.log(`API: ${BASE_URL}`);
    console.log(`（可通过 TTX_SYNC_STEP=1 或 1,2,3 指定步骤）\n`);

    const exporter = new DataSyncExporter();
    const { stepResults, totalFailed } = await exporter.runSync(steps);

    console.log('\n' + '='.repeat(50));
    console.log('数据同步完成');
    console.log('='.repeat(50));
    console.log(`执行步骤: ${steps.join(', ')}`);

    if (totalFailed > 0) {
        console.log(`\n失败数: ${totalFailed}`);
        Object.entries(stepResults).forEach(([step, results]) => {
            const failed = results.filter(r => r.success === false);
            if (failed.length > 0) {
                console.log(`  ${step}:`);
                failed.forEach(r => console.log(`    - ${r.key || r.dataSource}: ${r.message}`));
            }
        });
    }

    return { stepResults, totalFailed };
}

// 直接运行
if (require.main === module) {
    main()
        .then(({ totalFailed }) => process.exit(totalFailed > 0 ? 1 : 0))
        .catch(error => {
            console.error('同步异常:', error);
            process.exit(1);
        });
}

module.exports = {
    DataSyncExporter,
    syncDataSource,
    syncTempToData,
    parseSyncSteps,
    MIRROR_DELETE_DATASOURCES,
    MIRROR_TO_TEMP_DATASOURCES,
    TEMP_TO_DATA_DATASOURCES,
    DATA_SOURCES: TEMP_TO_DATA_DATASOURCES
};
