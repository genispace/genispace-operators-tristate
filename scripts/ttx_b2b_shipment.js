#!/usr/bin/env node
/**
 * 通天晓WMS - B2B出库单导出模块
 *
 * 提供B2B出库单的查询、字段映射和数据源导出功能
 */

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
     * 获取B2B出库单数据
     * @param {Object} options 查询选项
     * @param {string} options.warehouseCode 仓库代码
     * @param {string} options.companyCode 货主代码
     * @param {string} options.processType 处理类型
     * @param {number} options.leadingStsBegin 首状态起始值
     * @param {number} options.leadingStsEnd 首状态结束值
     * @param {string} options.startDate 开始日期
     * @param {string} options.endDate 结束日期
     * @param {number} options.pageSize 每页数量
     */
    async getReport(options = {}) {
        // 硬编码：B2B出库单 processType=NORMAL，首尾状态=100
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

        // 构建筛选条件（与curl条件顺序一致）
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

        // leadingSts 条件始终添加（默认值100）
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

        // 固定条件：B2B出库单
        filters.and.push({
            field: 'shipObjType',
            operator: '=',
            value: 'TO_B',
            table: 'shipment_header'
        });

        const filterJson = JSON.stringify(filters);
        console.log(`B2B出库单查询条件: ${filterJson}`);

        // 定义返回字段（与curl中的X-Result-Fields保持一致）
        const resultFields = [
            'id', 'created', 'code', 'shipmentType', 'companyCode', 'userDef1',
            'shipToAttentionTo', 'shipToAddress1', 'carrierCode', 'shipTo', 'shipToName',
            'packageCenterName', 'primaryWaybillCode', 'leadingSts', 'trailingSts',
            'waveId', 'shipToState', 'sourcePlatform', 'qtyRatio', 'totalQty',
            'totalLines', 'totalContainers', 'userDef8', 'processType', 'rejectionNote',
            'deliveryNote', 'uploadBatch', 'consolidated'
        ].join(',');

        // 分页获取数据
        const allData = [];
        let pageStart = 0;

        while (true) {
            console.log(`B2B出库单获取数据: ${pageStart} - ${pageStart + pageSize - 1}`);

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
                break;
            }

            const batch = result.data || [];
            if (batch.length === 0) {
                break;
            }

            console.log(`  获取到 ${batch.length} 条记录`);
            allData.push(...batch);

            if (batch.length < pageSize) {
                break;
            }

            pageStart += pageSize;
            await this.page.waitForTimeout(500);
        }

        console.log(`\nB2B出库单共获取 ${allData.length} 条记录`);
        return allData;
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
        console.log('\n--- 脱敏后的数据 ---');
        console.log(JSON.stringify(maskedRecords[0], null, 2));
        await insertDataToDataSource('809a7e42-6f79-4a82-b776-2734a7076f25', maskedRecords, {
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

        // 获取字段映射
        const fieldMap = this.getFieldMap();

        // 转换数据字段名
        const transformedData = data.map(record => {
            const newRecord = {};
            for (const [key, value] of Object.entries(record)) {
                if (key !== '__id') {
                    const newKey = fieldMap[key] || key;
                    newRecord[newKey] = value;
                }
            }
            return newRecord;
        });

        console.log(`B2B出库单数据转换完成，共 ${transformedData.length} 条记录`);

        // 直接调用 API 插入数据
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
