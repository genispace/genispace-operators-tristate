#!/usr/bin/env node
/**
 * 通天晓WMS - B2C出库单导出模块
 * 
 * 提供B2C出库单的查询、字段映射和数据源导出功能
 */

/** 数据源ID，修改此处即可更换数据源 */
const DATASOURCE_ID = 'e7fbe6d1-060a-4fd8-9c32-77cf960bf5c7';

class B2CShipmentExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
    }

    /**
     * 获取B2C出库单的字段映射
     * @returns {Object} 字段映射对象
     */
    getFieldMap() {
        return {
            'id': 'order_id',
            'created': 'create_time',
            'frontTime': 'order_time',
            'payTime': 'payment_time',
            'code': 'order_no',
            'shipmentType': 'outbound_type',
            'companyCode': 'owner',
            'carrierCode': 'carrier',
            'processType': 'process_type',
            'sourceOrderCode': 'platform_order_no',
            'primaryWaybillCode': 'express_no',
            'waveId': 'wave',
            'storeName': 'store',
            'shipToState': 'province',
            'shipToCity': 'city',
            'qtyRatio': 'amount',
            'totalQty': 'total_qty',
            'totalLines': 'total_lines',
            'shipToAttentionTo': 'receiver',
            'consolidated': 'consolidated',
            'warehouseTransferCode': 'warehouse_transfer_code',
            'leadingSts': 'first_status',
            'trailingSts': 'last_status',
            'uploadByAt': 'upload_time',
            'uploadByUser': 'upload_user',
            'rejectionNote': 'failure_reason',
            'actualShipDateTime': 'outbound_time',
            'uploadBatch': 'upload_batch',
            'deliveryNote': 'order_remark',
            'warehouseCode': 'warehouse',
            'isPresale': 'is_presale',
            'userDef1': 'source_platform',
            'plannedQty': 'review_qty',
            'pickedQty': 'picking_qty',
            'packedQty': 'outbound_qty',
        };
    }


    async _fetchOnePage(filterJson, resultFields, pageStart, pageSize) {

        const result = await this.page.evaluate(async (args) => {
            const { filterJson, pageStart, pageSize, resultFields } = args;
            try {
                const path = '/rest/cbt/shipment_header';
                return new Promise((resolve) => {
                    const options = {
                        headers: {
                            'Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                            'X-Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                            'X-Bill': 'shipment_header',
                            'X-Result-Fields': resultFields,
                            'filter': encodeURIComponent(filterJson),
                            'Accept': 'application/javascript, application/json'
                        }
                    };
                    window.app.dataManager.get(path, options).then(
                        (data) => {
                            if (Array.isArray(data)) {
                                resolve({ success: true, data: data });
                            } else if (data && data.error) {
                                resolve({ success: false, error: data.msg || 'Unknown error' });
                            } else {
                                resolve({ success: true, data: data });
                            }
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
        const {
            warehouseCode = 'HF',
            companyCode = null,
            processType = 'NORMAL',
            leadingStsBegin = null,
            leadingStsEnd = null,
            startDate = null,
            endDate = null,
            pageSize = 500
        } = options;

        if (!this.page) throw new Error('页面对象未设置，请先调用 setPage() 设置 page');

        const filters = { and: [] };
        filters.and.push({ field: 'shipObjType', operator: '=', value: 'TO_C', table: 'shipment_header' });
        if (warehouseCode) filters.and.push({ field: 'shipment_header.warehouseCode', operator: '=', value: warehouseCode });
        if (companyCode) filters.and.push({ field: 'shipment_header.companyCode', operator: 'in', disOperator: 'IN', value: companyCode, disValue: 'HF-RB Reebok,HF-NDK Nautica,HF-SPD Spyder', type: 'multiSelectCombobox' });
        if (processType) filters.and.push({ field: 'shipment_header.processType', operator: 'in', disOperator: 'IN', value: processType, type: 'multiSelectCombobox' });
        if (leadingStsBegin !== null) filters.and.push({ field: 'leadingSts:beg', operator: '>=', value: String(leadingStsBegin), table: 'shipment_header' });
        if (leadingStsEnd !== null) filters.and.push({ field: 'leadingSts:end', operator: '<=', value: String(leadingStsEnd), table: 'shipment_header' });
        if (startDate) filters.and.push({ field: 'shipment_header.created:beg', operator: '>=', value: startDate });
        if (endDate) filters.and.push({ field: 'shipment_header.created:end', operator: '<=', value: endDate });

        const filterJson = JSON.stringify(filters);
        const resultFields = [
            'id', 'created', 'frontTime', 'payTime', 'code', 'shipmentType',
            'companyCode', 'carrierCode', 'processType', 'userDef1',
            'sourceOrderCode', 'primaryWaybillCode', 'waveId', 'storeName',
            'shipToState', 'shipToCity', 'qtyRatio', 'totalQty', 'totalLines',
            'shipToAttentionTo', 'consolidated', 'warehouseTransferCode',
            'leadingSts', 'trailingSts', 'uploadByAt', 'uploadByUser',
            'rejectionNote', 'actualShipDateTime', 'uploadBatch', 'deliveryNote', 'userDef5'
        ].join(',');

        let pageStart = 0;
        let totalFetched = 0, totalInserted = 0, totalFailed = 0;
        
        console.log(`\n\n`);
        console.log('开始插入 B2C出库单数据...');

        while (true) {
            const batch = await this._fetchOnePage(filterJson, resultFields, pageStart, pageSize);
            if (!batch) break;
            if (batch.length === 0) break;

            const totalStr = `，已累计 ${totalFetched + batch.length} 条`;
            console.log(`第 ${Math.floor(pageStart / pageSize) + 1} 页: 本页 ${batch.length} 条${totalStr}，批量插入中...`);

            const transformedData = batch.map(r => this._transformRecord(r));
            const maskedRecords = this.maskSensitiveData(transformedData);

            const { insertDataToDataSource } = require('../src/services/datasource-service');
            const result = await insertDataToDataSource(DATASOURCE_ID, maskedRecords, { logPrefix: 'B2C出库单' });

            totalFetched += batch.length;
            totalInserted += (result.successCount || 0);
            totalFailed += (result.failCount || 0);

            if (batch.length < pageSize) break;

            pageStart += pageSize;
            await this.page.waitForTimeout(500);
        }

        console.log(`B2C出库单流式导出完成\n  - 共获取: ${totalFetched} 条\n  - 插入成功: ${totalInserted} 条\n  - 插入失败: ${totalFailed} 条`);
        return { totalFetched, totalInserted, totalFailed };
    }

    /**
     * 检测值是否需要脱敏（过长的加密字符串）
     * @param {string} value 要检测的值
     * @returns {boolean} 是否需要脱敏
     */
    shouldMask(value) {
        if (typeof value !== 'string') return false;
        // 检测以 ## 开头且长度超过20的字符串
        return value.startsWith('##') && value.length > 20;
    }

    /**
     * 对数据中的敏感字段进行脱敏处理
     * @param {Array} records 数据记录数组
     */
    maskSensitiveData(records) {
        return records.map(record => {
            const maskedRecord = { ...record };
            // 对 shipToAttentionTo (receiver) 字段进行脱敏
            // 检查映射前和映射后的字段名
            if (this.shouldMask(maskedRecord.receiver)) {
                maskedRecord.receiver = '******';
            }
            return maskedRecord;
        });
    }

    /**
     * 插入B2C出库单数据到远程 API
     * @param {Array} records 要插入的数据记录数组
     */
    async insertData(records) {
        const { insertDataToDataSource } = require('../src/services/datasource-service');
        const maskedRecords = this.maskSensitiveData(records);
        await insertDataToDataSource(DATASOURCE_ID, maskedRecords, {
            logPrefix: 'B2C出库单'
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
        console.log(`B2C出库单数据转换完成，共 ${transformedData.length} 条记录`);
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

module.exports = { B2CShipmentExporter };
