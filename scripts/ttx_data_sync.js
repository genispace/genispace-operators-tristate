#!/usr/bin/env node
/**
 * 通天晓WMS - 数据同步模块
 *
 * 用于将导出数据同步到 Genespace 数据源
 *
 * 使用方法：
 *   const { DataSyncExporter } = require('./ttx_data_sync');
 *   const exporter = new DataSyncExporter();
 *   await exporter.syncAll();
 */

// 从环境变量获取配置
const API_TOKEN = process.env.GENISPCE_API_TOKEN || 'q16Z2piek6iYG3f4TnNwRXyRxa9cp6wdm8ddcEpx';
const BASE_URL = process.env.GENISPCE_BASE_URL || 'https://api.genispace.cn';

/**
 * 数据源配置列表
 */
const DATA_SOURCES = {
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

/**
 * 数据同步导出器类
 */
class DataSyncExporter {
    constructor(options = {}) {
        this.apiToken = options.apiToken || API_TOKEN;
        this.baseUrl = options.baseUrl || BASE_URL;
        this.timeout = options.timeout || 30000;
    }

    /**
     * 同步单个数据源
     * @param {string} dataSourceKey 数据源键名
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async syncDataSource(dataSourceKey) {
        const config = DATA_SOURCES[dataSourceKey];
        if (!config) {
            console.error(`未找到数据源配置: ${dataSourceKey}`);
            return { success: false, message: `未找到数据源配置: ${dataSourceKey}` };
        }

        const url = `${this.baseUrl}/datasources/${config.datasourceId}/data`;
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiToken}`
        };
        const body = JSON.stringify({ d: 'x' });

        console.log(`\n同步数据源: ${config.name}`);
        console.log(`数据源ID: ${config.datasourceId}`);
        console.log(`请求URL: ${url}`);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: body
            });

            if (response.ok) {
                const resultText = await response.text();
                let resultData = null;

                // 解析返回的JSON
                try {
                    resultData = JSON.parse(resultText);
                } catch (e) {
                    console.warn('返回数据解析失败:', resultText);
                }

                // 提取影响行数和处理时间
                const affectedRows = resultData?.data?.affectedRows ?? 'N/A';
                const executionTime = resultData?.data?.executionTime ?? 'N/A';
                const operationType = resultData?.data?.operationType ?? 'N/A';

                console.log(`✓ ${config.name} 同步成功`);
                console.log(`  操作类型: ${operationType}`);
                console.log(`  影响行数: ${affectedRows}`);
                console.log(`  执行时间: ${executionTime}ms`);

                return {
                    success: true,
                    message: resultText,
                    affectedRows: affectedRows,
                    executionTime: executionTime,
                    operationType: operationType
                };
            } else {
                const errorText = await response.text();
                console.error(`✗ ${config.name} 同步失败: ${response.status} ${response.statusText}`);
                console.error(`错误详情: ${errorText}`);
                return { success: false, message: errorText, status: response.status };
            }
        } catch (error) {
            console.error(`✗ ${config.name} 同步异常: ${error.message}`);
            return { success: false, message: error.message };
        }
    }

    /**
     * 同步所有数据源
     * @param {string[]} dataSourceKeys 要同步的数据源列表，默认全部
     * @returns {Promise<{total: number, success: number, failed: number, results: Array}>}
     */
    async syncAll(dataSourceKeys = null) {
        const keys = dataSourceKeys || Object.keys(DATA_SOURCES);
        const results = [];
        let successCount = 0;
        let failedCount = 0;

        console.log('='.repeat(50));
        console.log('开始数据同步到 Genespace');
        console.log('='.repeat(50));
        console.log(`API Token: ${this.apiToken.substring(0, 10)}...`);
        console.log(`Base URL: ${this.baseUrl}`);
        console.log(`待同步数据源数量: ${keys.length}`);
        console.log('');

        for (const key of keys) {
            const result = await this.syncDataSource(key);
            results.push({
                dataSource: key,
                ...result
            });

            if (result.success) {
                successCount++;
            } else {
                failedCount++;
            }
            console.log('');
        }

        console.log('='.repeat(50));
        console.log('数据同步完成');
        console.log('='.repeat(50));
        console.log(`总计: ${keys.length}`);
        console.log(`成功: ${successCount}`);
        console.log(`失败: ${failedCount}`);

        if (failedCount > 0) {
            console.log('\n失败的数据源:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`  - ${r.dataSource}: ${r.message}`);
            });
        }

        return {
            total: keys.length,
            success: successCount,
            failed: failedCount,
            results: results
        };
    }

    /**
     * 获取所有数据源配置
     * @returns {Object}
     */
    static getDataSources() {
        return DATA_SOURCES;
    }

    /**
     * 获取数据源配置
     * @param {string} key
     * @returns {Object|null}
     */
    static getDataSource(key) {
        return DATA_SOURCES[key] || null;
    }
}

/**
 * 同步单个数据源（便捷函数）
 * @param {string} dataSourceKey 数据源键名
 * @param {Object} options 配置选项
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function syncDataSource(dataSourceKey, options = {}) {
    const exporter = new DataSyncExporter(options);
    return await exporter.syncDataSource(dataSourceKey);
}

/**
 * 同步所有数据源（便捷函数）
 * @param {string[]} dataSourceKeys 要同步的数据源列表
 * @param {Object} options 配置选项
 * @returns {Promise<{total: number, success: number, failed: number, results: Array}>}
 */
async function syncAll(dataSourceKeys = null, options = {}) {
    const exporter = new DataSyncExporter(options);
    return await exporter.syncAll(dataSourceKeys);
}

// 如果直接运行
if (require.main === module) {
    console.log('执行数据同步...\n');

    syncAll()
        .then(result => {
            console.log('\n同步结果:', JSON.stringify(result, null, 2));
            process.exit(result.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('同步异常:', error);
            process.exit(1);
        });
}

module.exports = {
    DataSyncExporter,
    syncDataSource,
    syncAll,
    DATA_SOURCES
};
