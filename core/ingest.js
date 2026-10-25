// core/ingest.js —— 统一入口：所有协议解析完都走这里
// 顺序：校验/归一化 → 推送 Unity（实时优先）→ 异步入库（慢/挂了不拖链路）
const db = require('../infra/db');
const { broadcast } = require('../infra/broadcast');
const log = require('../infra/logger');
const { normalize } = require('./reading');

const stats = {
    received: 0,
    accepted: 0,
    rejected: 0,
    dbFailed: 0,
    lastError: null
};

/**
 * 协议层解析失败时调用（比如长度不对、字段缺失），统一计数
 */
function reject(reason, extra) {
    stats.rejected++;
    stats.lastError = reason;
    log.warn('报文被拒绝', { reason, ...extra });
    return { ok: false, reason };
}

/**
 * 提交一条已按协议解析的读数
 * @param {{deviceId:number, type:number, rawValue:number, source:string, raw?:string}} input
 */
async function submit(input) {
    stats.received++;

    const res = normalize(input);
    if (!res.ok) {
        return reject(res.reason, { source: input.source, raw: input.raw });
    }

    const reading = res.reading;
    stats.accepted++;
    log.info(`【${reading.source}收到】${reading.name} ${reading.value}${reading.unit}`, {
        deviceId: reading.deviceId,
        raw: reading.raw
    });

    // 先推送：Unity 要实时，数据库慢或挂掉不能拖住接收链路
    broadcast(reading);

    const saved = await db.saveReading(reading.deviceId, reading.type, reading.value);
    if (!saved) stats.dbFailed++;

    return { ok: true, reading };
}

function snapshot() {
    return { ...stats };
}

module.exports = { submit, reject, snapshot };
