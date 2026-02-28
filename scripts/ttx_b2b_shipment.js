#!/usr/bin/env node
/**
 * 通天晓WMS - B2B出库单导出模块
 *
 * 提供B2B出库单的查询、字段映射和数据源导出功能
 */

/** 数据源ID，修改此处即可更换数据源 */
const DATASOURCE_ID = '809a7e42-6f79-4a82-b776-2734a7076f25';

class B2BShipmentExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
    }

    /**
     * 获取B2B出库单的字段映射
     * @returns {Object} 字段映射对象
     */
    getFieldMap() {
        return {
            'id': 'order_id',
            'created': 'create_time',
            'code': 'order_no',
            'shipmentType': 'outbound_type',
            'companyCode': 'owner',
            'carrierCode': 'carrier',
            'processType': 'process_type',
            'userDef1': 'customer',
            'primaryWaybillCode': 'express_no',
            'waveId': 'wave',
            'shipToName': 'customer_name',
            'shipTo': 'vip_order_no',
            'shipToAttentionTo': 'receiver',
            'shipToState': 'province',
            'shipToCity': 'city',
            'qtyRatio': 'amount',
            'totalQty': 'total_qty',
            'totalLines': 'total_lines',
            'totalContainers': 'total_boxes',
            'consolidated': 'consolidated',
            'leadingSts': 'first_status',
            'trailingSts': 'last_status',
            'uploadBatch': 'upload_batch',
            'deliveryNote': 'order_remark',
            'rejectionNote': 'failure_reason',
            'sourcePlatform': 'source_platform',
            'packageCenterName': 'store',
            'userDef1': 'platform_order_no',
            'warehouseCode': 'warehouse',
        };
    }

    /**
     * 获取单页数据（内部方法，供 getReport 和 getReportAndExportToDataSource 复用）
     * @private
     */
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
                        (error) => {
                            resolve({ success: false, error: error.message || String(error) });
                        }
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

    /**
     * 转换单条记录的字段名
     * @param {Object} record 原始记录
     * @returns {Object} 转换后的记录
     */
    _transformRecord(record) {
        const fieldMap = this.getFieldMap();
        const newRecord = {};
        for (const [key, value] of Object.entries(record)) {
            if (key !== '__id') {
                const newKey = fieldMap[key] || key;
                newRecord[newKey] = value;
            }
        }
        return newRecord;
    }

    /**
     * 流式导出：分页获取数据后立即批量插入，不累积到内存
     * 适用于数据量大的场景，避免内存溢出
     * @param {Object} options 同 getReport 的 options
     * @returns {Promise<{totalFetched: number, totalInserted: number, totalFailed: number}>}
     */
    async getReportAndExportToDataSource(options = {}) {
        const {
            warehouseCode = 'HF',
            companyCode = null,
            processType = 'NORMAL',
            leadingStsBegin = 100,
            leadingStsEnd = 100,
            startDate = null,
            endDate = null,
            pageSize = 500
        } = options;

        if (!this.page) {
            throw new Error('页面对象未设置，请先调用 setPage() 设置 page');
        }

        // 构建筛选条件（与 getReport 一致）
        const filters = { and: [] };

        if (companyCode) {
            filters.and.push({
                field: 'shipment_header.companyCode',
                operator: 'in',
                disOperator: 'IN',
                value: companyCode,
                disValue: 'HF-RB Reebok,HF-NDK Nautica,HF-SPD Spyder',
                type: 'multiSelectCombobox'
            });
        }

        if (processType) {
            filters.and.push({
                field: 'shipment_header.processType',
                operator: 'in',
                disOperator: 'IN',
                value: processType,
                type: 'multiSelectCombobox'
            });
        }

        filters.and.push({
            field: 'leadingSts:beg',
            operator: '>=',
            value: String(leadingStsBegin),
            table: 'shipment_header'
        });
        filters.and.push({
            field: 'leadingSts:end',
            operator: '<=',
            value: String(leadingStsEnd),
            table: 'shipment_header'
        });

        if (startDate) {
            filters.and.push({
                field: 'shipment_header.created:beg',
                operator: '>=',
                value: startDate
            });
        }

        if (endDate) {
            filters.and.push({
                field: 'shipment_header.created:end',
                operator: '<=',
                value: endDate
            });
        }

        if (warehouseCode) {
            filters.and.push({
                field: 'shipment_header.warehouseCode',
                operator: '=',
                value: warehouseCode
            });
        }

        filters.and.push({
            field: 'shipObjType',
            operator: '=',
            value: 'TO_B',
            table: 'shipment_header'
        });

        const filterJson = JSON.stringify(filters);
        const resultFields = [
            'id', 'created', 'code', 'shipmentType', 'companyCode', 'userDef1',
            'shipToAttentionTo', 'shipToAddress1', 'carrierCode', 'shipTo', 'shipToName',
            'packageCenterName', 'primaryWaybillCode', 'leadingSts', 'trailingSts',
            'waveId', 'shipToState', 'sourcePlatform', 'qtyRatio', 'totalQty',
            'totalLines', 'totalContainers', 'userDef8', 'processType', 'rejectionNote',
            'deliveryNote', 'uploadBatch', 'consolidated'
        ].join(',');

        let pageStart = 0;
        let totalFetched = 0;
        let totalInserted = 0;
        let totalFailed = 0;

        console.log(`\n\n`);
        console.log('开始插入 B2B出库单数据...');

        while (true) {
            const batch = await this._fetchOnePage(filterJson, resultFields, pageStart, pageSize);
            if (!batch) break;
            if (batch.length === 0) break;

            const totalStr = `，已累计 ${totalFetched + batch.length} 条`;
            console.log(`第 ${Math.floor(pageStart / pageSize) + 1} 页: 本页 ${batch.length} 条${totalStr}，批量插入中...`);

            // 转换并脱敏后立即插入，不累积
            const transformedData = batch.map(r => this._transformRecord(r));
            const maskedRecords = this.maskSensitiveData(transformedData);

            const { insertDataToDataSource } = require('../src/services/datasource-service');
            const result = await insertDataToDataSource(DATASOURCE_ID, maskedRecords, {
                logPrefix: 'B2B出库单'
            });

            totalFetched += batch.length;
            totalInserted += (result.successCount || 0);
            totalFailed += (result.failCount || 0);

            if (batch.length < pageSize) {
                break;
            }

            pageStart += pageSize;
            await this.page.waitForTimeout(500);
        }

        console.log(`B2B出库单流式导出完成`);
        console.log(`  - 共获取: ${totalFetched} 条`);
        console.log(`  - 插入成功: ${totalInserted} 条`);
        console.log(`  - 插入失败: ${totalFailed} 条`);

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
            if (this.shouldMask(maskedRecord.receiver)) {
                maskedRecord.receiver = '******';
            }
            // 对 shipToAddress1 (详细地址) 字段进行脱敏
            if (this.shouldMask(maskedRecord.shipToAddress1)) {
                maskedRecord.shipToAddress1 = '******';
            }
            return maskedRecord;
        });
    }

    /**
     * 插入B2B出库单数据到远程 API
     * @param {Array} records 要插入的数据记录数组
     */
    async insertData(records) {
        const { insertDataToDataSource } = require('../src/services/datasource-service');
        const maskedRecords = this.maskSensitiveData(records);
        await insertDataToDataSource(DATASOURCE_ID, maskedRecords, {
            logPrefix: 'B2B出库单'
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
        console.log(`B2B出库单数据转换完成，共 ${transformedData.length} 条记录`);

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

module.exports = { B2BShipmentExporter };
