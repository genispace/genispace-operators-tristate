#!/usr/bin/env node
/**
 * 通天晓WMS - 入库单头部导出模块
 * 
 * 提供入库单头部的查询、字段映射和数据源导出功能
 */

/** 数据源ID，修改此处即可更换数据源 */
const DATASOURCE_ID = 'ace5c767-4bce-4da0-b46b-e36e9af365a1';

class ReceiptHeaderExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
    }

    /**
     * 获取入库单头部的字段映射
     * @returns {Object} 字段映射对象
     */
    getFieldMap() {
        return {
            'id': 'id',
            'code': 'inbound_order_no',
            'erpOrderCode': 'source_order_no',
            'userDef3': 'jit_return_no',
            'receiptType': 'inbound_type',
            'companyCode': 'owner',
            'qtyRatio': 'qty_ratio',
            'totalQty': 'total_qty',
            'totalLines': 'total_lines',
            'leadingSts': 'first_status',
            'trailingSts': 'last_status',
            'returnWaybillCode': 'express_no',
            'shipFromAttentionTo': 'store_name',
            'uploadBatch': 'upload_batch',
            'created': 'create_time',
            'userDef5': 'user_def5',
            'userDef6': 'user_def6',
            'receiptNote': 'remark',
            'endCheckinDatetime': 'callback_time',
            'scheduledArriveDate': 'expected_arrival_date',
            'userDef1': 'user_def1',
            'shipFromName': 'supplier_name',
            'auditStatus': 'audit_status',
            'iqcStatus': 'iqc_status',
            'iqcPoint': 'iqc_point',
            'crossDockMode': 'cross_dock_mode',
            'returnException': 'return_exception',
            'consolidateCode': 'consolidate_code',
            'purchaseOrderCode': 'purchase_order_code',
            'warehouseTransferCode': 'warehouse_transfer_code',
            'warehouseCode': 'warehouse'
        };
    }


    async _fetchOnePage(filterJson, resultFields, pageStart, pageSize) {

        const result = await this.page.evaluate(async (args) => {
            const { filterJson, pageStart, pageSize, resultFields } = args;
            try {
                const path = '/rest/cbt/receipt_header';
                return new Promise((resolve) => {
                    const options = {
                        headers: {
                            'Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                            'X-Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                            'X-Bill': 'receipt_header',
                            'X-Result-Fields': resultFields,
                            'filter': encodeURIComponent(filterJson),
                            'Accept': 'application/javascript, application/json'
                        }
                    };
                    window.app.dataManager.get(path, options).then(
                        (data) => {
                            if (Array.isArray(data)) resolve({ success: true, data: data });
                            else if (data && data.error) resolve({ success: false, error: data.msg || 'Unknown error' });
                            else resolve({ success: true, data: data });
                        },
                        (error) => resolve({ success: false, error: error.message || String(error) })
                    );
                });
            } catch (e) {
                return { success: false, error: e.message };
            }
        }, { filterJson, pageStart, pageSize, resultFields });

        if (!result.success) {
            console.error(`获取数据失败: ${result.error}`);
            return null;
        }
        return result.data || [];
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
        const { warehouseCode = 'HF', companyCode = null, startDate = null, endDate = null, checkinStartDate = null, checkinEndDate = null, pageSize = 500 } = options;

        if (!this.page) throw new Error('页面对象未设置，请先调用 setPage() 设置 page');

        const filters = { and: [] };
        if (warehouseCode) filters.and.push({ field: 'receipt_header.warehouseCode', operator: '=', value: warehouseCode });
        if (companyCode) filters.and.push({ field: 'receipt_header.companyCode', operator: 'in', disOperator: 'IN', value: companyCode, disValue: 'HF-RB Reebok,HF-NDK Nautica,HF-SPD Spyder', type: 'multiSelectCombobox' });
        if (startDate) filters.and.push({ field: 'receipt_header.created:beg', operator: '>=', value: startDate });
        if (endDate) filters.and.push({ field: 'receipt_header.created:end', operator: '<=', value: endDate });
        if (checkinStartDate) filters.and.push({ field: 'receipt_header.endCheckinDatetime:beg', operator: '>=', value: checkinStartDate });
        if (checkinEndDate) filters.and.push({ field: 'receipt_header.endCheckinDatetime:end', operator: '<=', value: checkinEndDate });

        const filterJson = JSON.stringify(filters);
        const resultFields = [
            'id', 'code', 'erpOrderCode', 'userDef3', 'receiptType', 'companyCode',
            'qtyRatio', 'totalQty', 'totalLines', 'leadingSts', 'trailingSts',
            'returnWaybillCode', 'shipFromAttentionTo', 'uploadBatch', 'created',
            'userDef5', 'userDef6', 'receiptNote', 'endCheckinDatetime',
            'scheduledArriveDate', 'userDef1', 'shipFromName', 'auditStatus',
            'iqcStatus', 'iqcPoint', 'crossDockMode', 'returnException',
            'consolidateCode', 'purchaseOrderCode', 'warehouseTransferCode'
        ].join(',');

        let pageStart = 0;
        let totalFetched = 0, totalInserted = 0, totalFailed = 0;
        
        console.log(`\n\n`);
        console.log('开始插入 入库单头部数据...');

        while (true) {
            const batch = await this._fetchOnePage(filterJson, resultFields, pageStart, pageSize);
            if (!batch) break;
            if (batch.length === 0) break;

            const totalStr = `，已累计 ${totalFetched + batch.length} 条`;
            console.log(`第 ${Math.floor(pageStart / pageSize) + 1} 页: 本页 ${batch.length} 条${totalStr}，批量插入中...`);

            const transformedData = batch.map(r => this._transformRecord(r));
            const { insertDataToDataSource } = require('../src/services/datasource-service');
            const result = await insertDataToDataSource(DATASOURCE_ID, transformedData, { logPrefix: '入库单头部' });

            totalFetched += batch.length;
            totalInserted += (result.successCount || 0);
            totalFailed += (result.failCount || 0);

            if (batch.length < pageSize) break;

            pageStart += pageSize;
            await this.page.waitForTimeout(500);
        }

        console.log(`入库单头部流式导出完成\n  - 共获取: ${totalFetched} 条\n  - 插入成功: ${totalInserted} 条\n  - 插入失败: ${totalFailed} 条`);
        return { totalFetched, totalInserted, totalFailed };
    }

    /**
     * 插入入库单头部数据到远程 API
     * @param {Array} records 要插入的数据记录数组
     */
    async insertData(records) {
        const { insertDataToDataSource } = require('../src/services/datasource-service');
        await insertDataToDataSource(DATASOURCE_ID, records, {
            logPrefix: '入库单头部'
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
        console.log(`入库单头部数据转换完成，共 ${transformedData.length} 条记录`);
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

module.exports = { ReceiptHeaderExporter };
