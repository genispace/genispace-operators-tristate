#!/usr/bin/env node
/**
 * 通天晓WMS - 入库单明细导出模块
 * 
 * 提供入库单明细的查询、字段映射和数据源导出功能
 */

/** 数据源ID，修改此处即可更换数据源 */
const DATASOURCE_ID = 'c2306183-f7c2-4a56-bc8f-59c37882afca';

class ReceiptDetailsExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
    }

    /**
     * 获取入库单明细的字段映射
     * @returns {Object} 字段映射对象
     */
    getFieldMap() {
        return {
            '货主': 'owner',
            '入库单号': 'inbound_order_no',
            '来源单号': 'source_order_no',
            '入库单类型': 'inbound_type',
            '货品编码': 'sku',
            '库存状态': 'inventory_status',
            '计划数量': 'planned_qty',
            '已收货数': 'received_qty',
            '已上架数': 'shelved_qty',
            '货号': 'style_number',
            '商品名称': 'product_name',
            '颜色': 'color_number',
            '规格': 'product_size',
            '创建时间': 'create_time',
            '收货日期': 'received_time',
            '首状态': 'first_status',
            '尾状态': 'last_status',
            '整单完成时间': 'completion_time',
            '客退快递单号': 'express_tracking_no',
            '备注': 'remark',
            '仓库': 'warehouse'
        };
    }

    async _fetchOnePage(filterJson, pageStart, pageSize) {
        const result = await this.page.evaluate(async (args) => {
            const { filterJson, pageStart, pageSize } = args;
            try {
                const path = '/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表';
                return await new Promise((resolve) => {
                    const options = {
                        headers: {
                            'Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                            'X-Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                            'filter': encodeURIComponent(filterJson),
                            'Accept': 'application/javascript, application/json'
                        }
                    };
                    if (!window.app?.dataManager?.get) {
                        resolve({ success: false, error: 'dataManager 未就绪' });
                        return;
                    }
                    window.app.dataManager.get(path, options).then(
                        (data) => {
                            if (Array.isArray(data)) resolve({ success: true, data: data, total: null });
                            else if (data && data.error) resolve({ success: false, error: data.msg || 'Unknown error' });
                            else resolve({ success: true, data: data, total: data.total ?? data.totalCount ?? data.recordCount ?? null });
                        },
                        (err) => resolve({ success: false, error: err?.message || String(err) })
                    );
                });
            } catch (e) {
                return { success: false, error: e.message };
            }
        }, { filterJson, pageStart, pageSize });

        if (!result.success) {
            console.error(`获取数据失败: ${result.error}`);
            return null;
        }

        const raw = result.data;
        let batch = [];
        if (Array.isArray(raw)) batch = raw;
        else if (raw && raw.result && Array.isArray(raw.result)) batch = raw.result;
        const total = result.total ?? raw?.total ?? raw?.totalCount ?? raw?.recordCount ?? null;
        return { batch, total };
    }

    _transformRecord(record) {
        const fieldMap = this.getFieldMap();
        const newRecord = {};
        for (const [key, value] of Object.entries(record)) {
            if (key !== '__id') {
                newRecord[fieldMap[key] || key] = value;
            }
        }
        return newRecord;
    }

    async getReportAndExportToDataSource(options = {}) {
        const DEFAULT_RECEIPT_TYPES = ['CGRK', 'DBRK', 'THRK', 'QTRK', 'B2BRK', 'HHRK'];
        const { warehouseCode = 'HF', companyCode = null, receiptTypes = DEFAULT_RECEIPT_TYPES, startDate = null, endDate = null, pageSize = 500 } = options;

        if (!this.page) throw new Error('页面对象未设置，请先调用 setPage() 设置 page');

        const filters = { and: [] };
        if (warehouseCode) filters.and.push({ field: 'rh.warehouseCode', value: warehouseCode, operator: 'in' });
        if (companyCode) filters.and.push({ field: 'rd.companyCode', value: companyCode, operator: 'in' });
        if (receiptTypes?.length) filters.and.push({ field: 'rh.receiptType', value: receiptTypes.join(','), operator: 'in' });
        if (startDate) filters.and.push({ field: 'rh.created:begin', value: startDate, operator: '>=' });
        if (endDate) filters.and.push({ field: 'rh.created:end', value: endDate, operator: '<=' });

        const filterJson = JSON.stringify(filters);
        let pageStart = 0;
        let totalFetched = 0, totalInserted = 0, totalFailed = 0;
        let knownTotal = null;

        console.log(`\n\n`);
        console.log('开始插入 入库单明细数据...');

        while (true) {
            const res = await this._fetchOnePage(filterJson, pageStart, pageSize);
            if (!res) break;
            const { batch, total } = res;
            if (batch.length === 0) break;

            if (total != null) knownTotal = total;
            const totalStr = knownTotal != null ? `，共 ${knownTotal} 条` : `，已累计 ${totalFetched + batch.length} 条`;
            console.log(`第 ${Math.floor(pageStart / pageSize) + 1} 页: 本页 ${batch.length} 条${totalStr}，批量插入中...`);

            const transformedData = batch.map(r => this._transformRecord(r));
            const { insertDataToDataSource } = require('../src/services/datasource-service');
            const result = await insertDataToDataSource(DATASOURCE_ID, transformedData, {
                logPrefix: '入库单明细'
            });

            totalFetched += batch.length;
            totalInserted += (result.successCount || 0);
            totalFailed += (result.failCount || 0);

            if (batch.length < pageSize) break;

            pageStart += pageSize;
            await this.page.waitForTimeout(500);
        }

        console.log(`入库单明细流式导出完成\n  - 共获取: ${totalFetched} 条\n  - 插入成功: ${totalInserted} 条\n  - 插入失败: ${totalFailed} 条`);
        return { totalFetched, totalInserted, totalFailed };
    }

    /**
     * 插入入库单明细数据到远程 API
     * @param {Array} records 要插入的数据记录数组
     */
    async insertData(records) {
        const { insertDataToDataSource } = require('../src/services/datasource-service');
        await insertDataToDataSource(DATASOURCE_ID, records, {
            logPrefix: '入库单明细'
        });
    }

    /**
     * 导出数据并插入到远程 API
     * @param {Array} data 原始数据数组
     */
    async exportToDataSource(data) {
        if (!data || data.length === 0) {
            console.log('没有数据可导出');
            return;
        }

        const transformedData = data.map(record => this._transformRecord(record));
        console.log(`入库单明细数据转换完成，共 ${transformedData.length} 条记录`);
        await this.insertData(transformedData);
    }

    /**
     * 设置页面对象
     * @param {Object} page Puppeteer页面对象
     */
    setPage(page) {
        this.page = page;
    }
}

module.exports = { ReceiptDetailsExporter };
