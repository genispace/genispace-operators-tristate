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

    console.log(`\n开始插入${logPrefix}数据到 API，共 ${records.length} 条记录...`);
    console.log(`API URL: ${apiUrl}`);

    // 调试：输出第一条记录
    console.log('\n--- 示例数据 ---');
    console.log(JSON.stringify(records[0], null, 2));

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
    console.log(`请求URL: ${url}`);

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
            console.log(`  操作类型: ${operationType}`);
            console.log(`  影响行数: ${affectedRows}`);
            console.log(`  执行时间: ${executionTime}ms`);

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
    syncDataSourceData
};
