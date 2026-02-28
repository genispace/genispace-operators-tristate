#!/usr/bin/env node
/**
 * 单独测试：获取最后运行日期
 * 使用：node scripts/test_last_run_date.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { getDataSourceData } = require('../src/services/datasource-service');

const LAST_RUN_DATE_GET_DATASOURCE_ID = '039b4491-978a-4ac1-b7c7-19dc6ffdc0ca';

function parseLastRunDateFromResponse(result) {
    if (!result.success || !result.data) return null;
    const d = result.data;
    const arr = (d.data && d.data.data) || d.data || d.rows || (Array.isArray(d) ? d : null);
    if (Array.isArray(arr) && arr.length > 0) {
        const row = arr[0];
        const val = row.last_run_time || row.last_run_date || row.run_date || row.date || row.value;
        if (val) {
            const str = String(val).trim();
            const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
            return m ? `${m[1]}-${m[2]}-${m[3]}` : str.slice(0, 10);
        }
    }
    return null;
}

async function main() {
    console.log('=== 测试获取最后运行日期 ===');
    console.log(`数据源ID: ${LAST_RUN_DATE_GET_DATASOURCE_ID}`);
    console.log('');

    const result = await getDataSourceData(LAST_RUN_DATE_GET_DATASOURCE_ID);

    console.log('原始响应:', JSON.stringify(result, null, 2));
    console.log('');

    const lastRunDate = parseLastRunDateFromResponse(result);
    if (lastRunDate) {
        console.log(`✓ 解析成功: 最后运行日期 = ${lastRunDate}`);
        const d = new Date(lastRunDate);
        d.setDate(d.getDate() - 10);
        const startDate = d.toISOString().slice(0, 10) + ' 00:00:00';
        const today = new Date();
        const endDate = today.toISOString().slice(0, 10) + ' 23:59:59';
        console.log(`  TTX_START_DATE = ${startDate} (前10天)`);
        console.log(`  TTX_END_DATE   = ${endDate}`);
    } else {
        console.log('✗ 解析失败: 未获取到日期');
    }
}

main().catch(console.error);
