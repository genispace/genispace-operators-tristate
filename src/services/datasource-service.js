/**
 * 数据源 API 服务
 *
 * 提供 Genispace 数据源的插入和同步接口
 */

const API_TOKEN = process.env.GENISPCE_API_TOKEN;
const BASE_URL = process.env.GENISPCE_BASE_URL;

/**
 * 插入数据到数据源
 * 逐条 POST 每条记录到数据源
 *
 * @param {string} datasourceId - 数据源 ID (UUID)
 * @param {Array<Object>} records - 要插入的数据记录数组
 * @param {Object} options - 可选配置
 * @param {string} options.logPrefix - 日志前缀 (如 '入库单头部')
 * @param {string} options.apiToken - API Token，默认从环境变量读取
 * @param {string} options.baseUrl - API 基础 URL，默认从环境变量读取
 * @param {number} options.delayMs - 每条记录间的延迟毫秒数，默认 100
 * @param {number} options.logInterval - 每隔多少条记录输出进度日志，默认 50
 * @returns {Promise<{successCount: number, failCount: number}>}
 */
async function insertDataSourceData(datasourceId, records, options = {}) {
    const {
        logPrefix = '数据',
        apiToken = API_TOKEN,
        baseUrl = BASE_URL,
        delayMs = 100,
        logInterval = 50
    } = options;

    if (!records || records.length === 0) {
        console.log('没有数据需要插入');
        return { successCount: 0, failCount: 0 };
    }

    const apiUrl = `${baseUrl}/datasources/${datasourceId}/data`;

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < records.length; i++) {
        const record = records[i];

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiToken}`
                },
                body: JSON.stringify(record)
            });

            if (response.ok) {
                successCount++;
                if (logInterval > 0 && successCount % logInterval === 0) {
                    console.log(`  已插入 ${successCount} / ${records.length} 条记录...`);
                }
            } else {
                failCount++;
                const errorText = await response.text();
                console.warn(`  插入失败 [${i + 1}/${records.length}]: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
            }
        } catch (error) {
            failCount++;
            console.warn(`  插入异常 [${i + 1}/${records.length}]: ${error.message}`);
        }

        // 添加延迟避免请求过快
        if (i < records.length - 1 && delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    console.log(`\n${logPrefix}数据插入完成`);
    console.log(`  - 成功: ${successCount} 条`);
    console.log(`  - 失败: ${failCount} 条`);

    return { successCount, failCount };
}

/**
 * 批量插入数据到数据源
 * 一次 POST 发送 { data: records }，要求数据源类型为 BATCH_INSERT
 *
 * @param {string} datasourceId - 数据源 ID (UUID)，须为 BATCH_INSERT 类型
 * @param {Array<Object>} records - 要插入的数据记录数组
 * @param {Object} options - 可选配置
 * @param {string} options.logPrefix - 日志前缀 (如 '入库单头部')
 * @param {string} options.apiToken - API Token，默认从环境变量读取
 * @param {string} options.baseUrl - API 基础 URL，默认从环境变量读取
 * @returns {Promise<{success: boolean, successCount: number, failCount: number, affectedRows?: number}>}
 */
async function batchInsertDataSourceData(datasourceId, records, options = {}) {
    const {
        logPrefix = '数据',
        apiToken = API_TOKEN,
        baseUrl = BASE_URL
    } = options;

    if (!records || records.length === 0) {
        console.log('没有数据需要插入');
        return { success: true, successCount: 0, failCount: 0 };
    }

    const apiUrl = `${baseUrl}/datasources/${datasourceId}/data`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            },
            body: JSON.stringify({ data: records })
        });

        if (response.ok) {
            const resultData = await response.json();
            const affectedRows = resultData?.data?.affectedRows ?? 0;
            return {
                success: true,
                successCount: records.length,
                failCount: 0,
                affectedRows
            };
        } else {
            const errorText = await response.text();
            console.error(`✗ ${logPrefix} 批量插入失败: ${response.status} ${response.statusText}`);
            console.error(`错误详情: ${errorText}`);
            return {
                success: false,
                successCount: 0,
                failCount: records.length
            };
        }
    } catch (error) {
        console.error(`✗ ${logPrefix} 批量插入异常: ${error.message}`);
        return {
            success: false,
            successCount: 0,
            failCount: records.length
        };
    }
}

/**
 * 根据配置选择插入方式并执行
 * 环境变量 TTX_USE_BATCH_INSERT 为 true 时使用批量插入，否则使用单条插入
 *
 * @param {string} datasourceId - 数据源 ID (UUID)
 * @param {Array<Object>} records - 要插入的数据记录数组
 * @param {Object} options - 可选配置，同 insertDataSourceData / batchInsertDataSourceData
 * @returns {Promise<{successCount: number, failCount: number, ...}>}
 */
async function insertDataToDataSource(datasourceId, records, options = {}) {
    return batchInsertDataSourceData(datasourceId, records, options);
}

/**
 * 同步数据源
 * 发送固定 body { d: 'x' } 触发数据源同步
 *
 * @param {string} datasourceId - 数据源 ID (UUID)
 * @param {Object} options - 可选配置
 * @param {string} options.logPrefix - 日志前缀 (如 '采购入库在途')
 * @param {string} options.apiToken - API Token，默认从环境变量读取
 * @param {string} options.baseUrl - API 基础 URL，默认从环境变量读取
 * @returns {Promise<{success: boolean, message: string, affectedRows?: *, executionTime?: *, operationType?: *, status?: number}>}
 */
async function syncDataSourceData(datasourceId, options = {}) {
    const {
        logPrefix = '数据源',
        apiToken = API_TOKEN,
        baseUrl = BASE_URL
    } = options;

    const url = `${baseUrl}/datasources/${datasourceId}/data`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`
    };
    const body = JSON.stringify({ d: 'x' });

    console.log(`\n同步${logPrefix}`);
    console.log(`数据源ID: ${datasourceId}`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body
        });

        if (response.ok) {
            const resultText = await response.text();
            let resultData = null;

            try {
                resultData = JSON.parse(resultText);
            } catch (e) {
                console.warn('返回数据解析失败:', resultText);
            }

            const affectedRows = resultData?.data?.affectedRows ?? 'N/A';
            const executionTime = resultData?.data?.executionTime ?? 'N/A';
            const operationType = resultData?.data?.operationType ?? 'N/A';

            console.log(`✓ ${logPrefix} 同步成功`);

            return {
                success: true,
                message: resultText,
                affectedRows,
                executionTime,
                operationType
            };
        } else {
            const errorText = await response.text();
            console.error(`✗ ${logPrefix} 同步失败: ${response.status} ${response.statusText}`);
            console.error(`错误详情: ${errorText}`);
            return { success: false, message: errorText, status: response.status };
        }
    } catch (error) {
        console.error(`✗ ${logPrefix} 同步异常: ${error.message}`);
        return { success: false, message: error.message };
    }
}

module.exports = {
    insertDataSourceData,
    batchInsertDataSourceData,
    insertDataToDataSource,
    syncDataSourceData
};
