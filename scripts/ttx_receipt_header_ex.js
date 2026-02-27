#!/usr/bin/env node
/**
 * 通天晓WMS - 入库单头部扩展导出模块 (receipt_header_ex)
 *
 * receipt_header_ex 为异步导出接口，返回 {"code":"0","msg":"已进入异步任务,请在导出中心下载"}。
 * 本模块在导出成功后调用任务中心下载表格，按 field_mapping 转换后插入数据源。
 * tid=EXPORT_TABLES, oid=receipt_header_ex 为本导出类型固定值。
 */

const fs = require('fs');

/** 数据源ID，与 ttx_receipt_header 使用相同镜像表 */
const DATASOURCE_ID = 'ace5c767-4bce-4da0-b46b-e36e9af365a1';

/** receipt_header_ex 固定的 tid、oid */
const TTX_TID = 'EXPORT_TABLES';
const TTX_OID = 'receipt_header_ex';

/** 日期类型字段，需将 Excel 序列号转为 ISO 字符串 */
const DATE_FIELDS = new Set([
    'create_time', 'callback_time', 'expected_arrival_date',
    'latest_arrival_date', 'completion_time'
]);

/** 字段映射：Excel 中文列名 -> 目标字段（inbound） */
const EXCEL_TO_TARGET_FIELD_MAP = {
    '入库单号': 'inbound_order_no',
    '来源单号': 'source_order_no',
    'JIT退仓号': 'jit_return_no',
    '入库单类型': 'inbound_type',
    '货主': 'owner',
    '总数量': 'total_qty',
    '未收数量': 'unreceived_qty',
    '已收数量': 'received_qty',
    '总行数': 'total_lines',
    '创建时间': 'create_time',
    '首状态': 'first_status',
    '尾状态': 'last_status',
    '快递单号': 'express_no',
    '店铺名称': 'store_name',
    '回传时间': 'callback_time',
    '预计到达日期': 'expected_arrival_date',
    '最晚到达日期': 'latest_arrival_date',
    '供应商名称': 'supplier_name',
    '整单完成时间': 'completion_time',
    '备注': 'remark',
    '仓库': 'warehouse'
};

/** 请求字段，对应 X-Result-Fields */
const RESULT_FIELDS = [
    'code', 'id', 'erpOrderCode', 'userDef3', 'receiptType', 'companyCode',
    'qtyRatio', 'totalQty', 'openQty', 'fulfillQty', 'totalLines',
    'leadingSts', 'trailingSts', 'returnWaybillCode', 'shipFromAttentionTo',
    'uploadBatch', 'created', 'userDef5', 'userDef6', 'receiptNote',
    'endCheckinDatetime', 'scheduledArriveDate', 'userDef1', 'shipFromName',
    'auditStatus', 'iqcStatus', 'iqcPoint', 'crossDockMode', 'returnException',
    'consolidateCode', 'purchaseOrderCode', 'warehouseTransferCode'
].join(',');

class ReceiptHeaderExExporter {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || 'https://ttx.56xyy.com';
        this.customer = options.customer || 'xyy-wms-prod';
        this.page = options.page || null;
    }

    /**
     * 获取 Excel 列名 -> 目标字段的映射
     */
    getExcelToTargetFieldMap() {
        return { ...EXCEL_TO_TARGET_FIELD_MAP };
    }

    /**
     * 构建 filter JSON（与 CURL 中 filter 参数一致）
     */
    _buildFilter(options = {}) {
        const {
            warehouseCode = 'HF',
            companyCode = null,
            startDate = null,
            endDate = null,
            checkinStartDate = null,
            checkinEndDate = null,
            leadingStsMin = null
        } = options;

        const and = [];
        if (warehouseCode) {
            and.push({ field: 'receipt_header.warehouseCode', operator: '=', value: warehouseCode });
        }
        if (companyCode) {
            and.push({
                field: 'receipt_header.companyCode',
                operator: 'in',
                disOperator: 'IN',
                value: companyCode,
                disValue: companyCode,
                type: 'multiSelectCombobox'
            });
        }
        if (startDate) {
            and.push({ field: 'receipt_header.created:beg', operator: '>=', value: startDate });
        }
        if (endDate) {
            and.push({ field: 'receipt_header.created:end', operator: '<=', value: endDate });
        }
        if (checkinStartDate) {
            and.push({ field: 'receipt_header.endCheckinDatetime:beg', operator: '>=', value: checkinStartDate });
        }
        if (checkinEndDate) {
            and.push({ field: 'receipt_header.endCheckinDatetime:end', operator: '<=', value: checkinEndDate });
        }
        if (leadingStsMin != null) {
            and.push({ field: 'leadingSts:beg', operator: '>=', value: String(leadingStsMin), table: 'receipt_header' });
        }
        return { and };
    }

    /**
     * 通过 window.app.dataManager.get 请求（含通天晓加密，不可用 fetch）
     * 接口返回 JSON 数据
     */
    async _fetchViaDataManager(filterJson) {
        const result = await this.page.evaluate(async (args) => {
            const { filterJson, resultFields } = args;
            try {
                const path = '/rest/sqlTemplate/xls/EXPORT_TABLES/receipt_header_ex';
                return new Promise((resolve) => {
                    const options = {
                        headers: {
                            'X-Bill': 'receipt_header',
                            'X-Button': 'receipt_header:ttx.wso.TabbedBill:receipt_header:bills:receipt_header_ex',
                            'X-Result-Fields': resultFields,
                            'filter': encodeURIComponent(filterJson),
                            'Accept': 'application/javascript, application/json'
                        }
                    };
                    window.app.dataManager.get(path, options).then(
                        (data) => {
                            resolve({ success: true, data: data });
                        },
                        (error) => resolve({ success: false, error: error.message || String(error) })
                    );
                });
            } catch (e) {
                return { success: false, error: e.message || String(e) };
            }
        }, { filterJson, resultFields: RESULT_FIELDS });

        return result;
    }

    /**
     * 主流程：触发导出 → 任务中心下载 → 读取 Excel → 转换 → 插入数据源
     */
    async getReportAndExportToDataSource(options = {}) {
        const {
            warehouseCode = 'HF',
            companyCode = null,
            startDate = null,
            endDate = null,
            checkinStartDate = null,
            checkinEndDate = null,
            leadingStsMin = null,
            userName = 'HFLS17'
        } = options;

        if (!this.page) throw new Error('页面对象未设置，请先调用 setPage() 设置 page');

        const filters = this._buildFilter({
            warehouseCode,
            companyCode,
            startDate,
            endDate,
            checkinStartDate,
            checkinEndDate,
            leadingStsMin
        });
        const filterJson = JSON.stringify(filters);

        console.log('\n[入库单头部 receipt_header_ex] 开始请求...');
        console.log(`  - 仓库: ${warehouseCode}`);
        console.log(`  - 时间: ${startDate || '(不限)'} ~ ${endDate || '(不限)'}`);

        const fetchResult = await this._fetchViaDataManager(filterJson);

        if (!fetchResult.success) {
            console.log('导出执行失败，错误信息：', fetchResult.error);
            return { totalFetched: 0, totalInserted: 0, totalFailed: 0 };
        }

        console.log('导出任务已创建，等待任务中心下载...');
        await this.page.waitForTimeout(3000);

        const { TtxDownloadCenter, TtxExcelUtils } = require('./ttx_download_center');
        const downloadCenter = new TtxDownloadCenter({
            page: this.page,
            baseUrl: this.baseUrl,
            customer: this.customer,
            tid: TTX_TID,
            oid: TTX_OID,
            userName
        });

        const downloadResult = await downloadCenter.downloadLatestExport();
        if (!downloadResult.success) {
            console.error('下载失败:', downloadResult.error);
            return { totalFetched: 0, totalInserted: 0, totalFailed: 0 };
        }

        const filePath = downloadResult.filePath;
        try {
            const rawRows = TtxExcelUtils.readExcelToRows(filePath);
            if (rawRows.length === 0) {
                console.log('  - Excel 无数据');
                return { totalFetched: 0, totalInserted: 0, totalFailed: 0 };
            }

            const excelToTarget = this.getExcelToTargetFieldMap();
            const transformedData = TtxExcelUtils.transformExcelRows(rawRows, excelToTarget, DATE_FIELDS);

            const BATCH_INSERT_SIZE = parseInt(process.env.BATCH_INSERT_SIZE || '500', 10);
            const { insertDataToDataSource } = require('../src/services/datasource-service');
            let totalInserted = 0;
            let totalFailed = 0;

            for (let i = 0; i < transformedData.length; i += BATCH_INSERT_SIZE) {
                const batch = transformedData.slice(i, i + BATCH_INSERT_SIZE);
                const batchNo = Math.floor(i / BATCH_INSERT_SIZE) + 1;
                const totalBatches = Math.ceil(transformedData.length / BATCH_INSERT_SIZE);
                console.log(`  - 批量插入 ${batchNo}/${totalBatches}，本批 ${batch.length} 条...`);
                const result = await insertDataToDataSource(DATASOURCE_ID, batch, {
                    logPrefix: '入库单头部(receipt_header_ex)'
                });
                totalInserted += result.successCount || 0;
                totalFailed += result.failCount || 0;
            }
            console.log(`\n入库单头部 receipt_header_ex 导出完成`);
            console.log(`  - 共获取: ${transformedData.length} 条`);
            console.log(`  - 插入成功: ${totalInserted} 条`);
            console.log(`  - 插入失败: ${totalFailed} 条`);

            return {
                totalFetched: transformedData.length,
                totalInserted,
                totalFailed
            };
        } finally {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    }

    setPage(page) {
        this.page = page;
    }
}

module.exports = { ReceiptHeaderExExporter };
