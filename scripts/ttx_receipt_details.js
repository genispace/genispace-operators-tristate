#!/usr/bin/env node
/**
 * 通天晓WMS - 入库单明细导出模块
 * 
 * 提供入库单明细的查询、字段映射和数据源导出功能
 */

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

    /**
     * 获取入库单明细数据
     * @param {Object} options 查询选项
     * @param {string} options.warehouseCode 仓库代码
     * @param {string} options.companyCode 货主代码
     * @param {Array} options.receiptTypes 入库单类型列表
     * @param {string} options.startDate 开始日期
     * @param {string} options.endDate 结束日期
     * @param {number} options.pageSize 每页数量
     */
    async getReport(options = {}) {
        const {
            warehouseCode = 'HF',
            companyCode = null,
            receiptTypes = null,
            startDate = null,
            endDate = null,
            pageSize = 500
        } = options;

        if (!this.page) {
            throw new Error('页面对象未设置，请先调用 setPage() 设置 page');
        }

        // 构建筛选条件
        const filters = { and: [] };

        if (warehouseCode) {
            filters.and.push({
                field: 'rh.warehouseCode',
                value: warehouseCode,
                operator: 'in'
            });
        }

        if (companyCode) {
            filters.and.push({
                field: 'rd.companyCode',
                value: companyCode,
                operator: 'in'
            });
        }

        if (receiptTypes && receiptTypes.length > 0) {
            filters.and.push({
                field: 'rh.receiptType',
                value: receiptTypes.join(','),
                operator: 'in'
            });
        }

        if (startDate) {
            filters.and.push({
                field: 'rh.created:begin',
                value: startDate,
                operator: '>='
            });
        }

        if (endDate) {
            filters.and.push({
                field: 'rh.created:end',
                value: endDate,
                operator: '<='
            });
        }

        const filterJson = JSON.stringify(filters);
        console.log(`入库单明细查询条件: ${filterJson}`);

        // 分页获取数据
        const allData = [];
        let pageStart = 0;

        while (true) {
            console.log(`入库单明细获取数据: ${pageStart} - ${pageStart + pageSize - 1}`);

            const result = await this.page.evaluate(async (args) => {
                const { filterJson, pageStart, pageSize } = args;

                try {
                    const path = '/rest/sqlTemplate/grid/_XLS_reciept1/入库明细报表';

                    return new Promise((resolve) => {
                        const options = {
                            headers: {
                                'Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
                                'X-Range': `items=${pageStart}-${pageStart + pageSize - 1}`,
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
            }, { filterJson, pageStart, pageSize });

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

        console.log(`\n入库单明细共获取 ${allData.length} 条记录`);
        return allData;
    }

    /**
     * 插入入库单明细数据到远程 API
     * @param {Array} records 要插入的数据记录数组
     */
    async insertData(records) {
        const { insertDataSourceData } = require('../src/services/datasource-service');
        await insertDataSourceData('c2306183-f7c2-4a56-bc8f-59c37882afca', records, {
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

        console.log(`入库单明细数据转换完成，共 ${transformedData.length} 条记录`);

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

module.exports = { ReceiptDetailsExporter };
