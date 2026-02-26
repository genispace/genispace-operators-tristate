#!/usr/bin/env node
/**
 * 通天晓WMS - B2C拣货明细导出模块
 * 
 * 提供B2C拣货明细报表的查询、字段映射和数据源导出功能
 * API: /rest/sqlTemplate/grid/_XLS_/拣货明细报表
 */

/** 数据源ID，修改此处即可更换数据源 */
const DATASOURCE_ID = 'da65089e-0772-465c-b034-06956304c373';

class B2CPakingDetailsExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
    }

    /**
     * 获取B2C拣货明细的字段映射
     * 将通天晓API返回的中文字段映射到Genispace数据源字段
     * @returns {Object} 字段映射对象
     */
    getFieldMap() {
        return {
            // 数量字段
            '数量': 'qty',
            
            // SKU和货品信息
            '货品编码': 'sku',
            '货主': 'owner',
            '物料名称': 'product_name',
            '货号': 'style_number',
            
            // 拣货任务信息
            '拣货员': 'picker',
            '任务号': 'task_no',
            '波次号': 'wave_no',
            
            // 类型信息
            '来源类型': 'source_type',
            '处理类型': 'process_type',
            '业务类型': 'business_type',
            
            // 订单信息
            '来源单号': 'source_order_no',
            
            // 拣货时间和位置
            '拣货完成时间': 'picking_end_time',
            '拣货库位': 'picking_location',
            '任务创建时间': 'task_create_time',
            '拣货开始时间': 'picking_start_time',
        };
    }

    /**
     * 获取B2C拣货明细数据
     * 通过SQL模板报表接口获取数据
     * @param {Object} options 查询选项
     * @param {string} options.startDate 开始日期
     * @param {string} options.endDate 结束日期
     * @param {string|Array} options.companyCodes 货主代码列表（支持逗号分隔或数组）
     * @param {number} options.pageSize 每页数量
     */
    async getReport(options = {}) {
        // 硬编码：货主代码 HF-RB Reebok, HF-NDK Nautica, HF-SPD Spyder
        const {
            startDate = null,
            endDate = null,
            companyCodes = 'HF-RB,HF-NDK,HF-SPD',
            pageSize = 100
        } = options;

        if (!this.page) {
            throw new Error('页面对象未设置，请先调用 setPage() 设置 page');
        }

        // 构建筛选条件
        const filters = { and: [] };

        // 货主筛选（支持多个，用 in 操作符）
        if (companyCodes) {
            const codes = Array.isArray(companyCodes) 
                ? companyCodes.join(',') 
                : companyCodes;
            filters.and.push({
                field: 'td.companyCode',
                operator: 'in',
                value: codes
            });
            console.log(`货主筛选条件: ${codes}`);
        }

        // 时间范围筛选
        if (startDate) {
            filters.and.push({
                field: 'th.created:begin',
                operator: '>=',
                value: startDate
            });
        }

        if (endDate) {
            filters.and.push({
                field: 'th.created:end',
                operator: '<=',
                value: endDate
            });
        }

        const filterJson = JSON.stringify(filters);
        console.log(`B2C拣货明细查询条件: ${filterJson}`);

        // 分页获取数据
        const allData = [];
        let pageStart = 0;

        while (true) {
            console.log(`B2C拣货明细获取数据: ${pageStart} - ${pageStart + pageSize - 1}`);

            const result = await this.page.evaluate(async (args) => {
                const { filterJson, pageStart, pageSize } = args;

                try {
                    // SQL模板报表接口
                    const path = '/rest/sqlTemplate/grid/_XLS_/拣货明细报表';

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
                                } else if (data && data.result && Array.isArray(data.result)) {
                                    resolve({ success: true, data: data.result });
                                } else {
                                    resolve({ success: true, data: [] });
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

        console.log(`\nB2C拣货明细共获取 ${allData.length} 条记录`);
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
     * 拣货明细主要关注picker等字段
     * @param {Array} records 数据记录数组
     */
    maskSensitiveData(records) {
        return records.map(record => {
            const maskedRecord = { ...record };
            // 对 picker 字段进行脱敏
            if (this.shouldMask(maskedRecord.picker)) {
                maskedRecord.picker = '******';
            }
            // 对 source_order_no 字段进行脱敏
            if (this.shouldMask(maskedRecord.source_order_no)) {
                maskedRecord.source_order_no = '******';
            }
            return maskedRecord;
        });
    }

    /**
     * 插入B2C拣货明细数据到远程API
     * @param {Array} records 要插入的数据记录数组
     */
    async insertData(records) {
        const { insertDataToDataSource } = require('../src/services/datasource-service');
        const maskedRecords = this.maskSensitiveData(records);
        console.log('\n--- 脱敏后的数据 ---');
        if (maskedRecords[0]) {
            console.log(JSON.stringify(maskedRecords[0], null, 2));
        }
        await insertDataToDataSource(DATASOURCE_ID, maskedRecords, {
            logPrefix: 'B2C拣货明细'
        });
    }

    /**
     * 导出数据并插入到远程API
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

        console.log(`B2C拣货明细数据转换完成，共 ${transformedData.length} 条记录`);

        // 直接调用API插入数据
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

module.exports = { B2CPakingDetailsExporter };
