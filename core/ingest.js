// core/ingest.js —— 统一入口：所有协议解析完都走这里
// 顺序：校验/归一化 → 推送 Unity（实时优先）→ 异步入库（慢/挂了不拖链路）
const db = require('../infra/db');
const { broadcast } = require('../infra/broadcast');
const log = require('../infra/logger');
const { normalize } = require('./reading');
const testmode = require('./testmode');
const status = require('./status');

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
    const safe = { ...extra };
    if (typeof safe.raw === 'string') safe.raw = log.truncate(safe.raw, 120);
    log.warn('报文被拒绝', { reason, ...safe });
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

    /* 所有上行都刷新在线时间（LoRa 的超时离线靠它） */
    status.noteUplink(reading.deviceId);

    /* 测试帧：只做通信测试（缺口检测 + 回 ACK），不入库、不广播 */
    if (reading.type === 98) {
        return testmode.handle(reading);
    }

    /* 心跳：value = mode，只在上线/模式变化时写状态表 */
    if (reading.type === 99) {
        await status.onHeartbeat(reading.deviceId, reading.value);
        return { ok: true, reading };
    }
    log.info(`【${reading.source}收到】${reading.name} ${reading.value}${reading.unit}`, {
        deviceId: reading.deviceId
    });

    // 原始报文放到 debug 级，避免每个设备每天几 MB 的日志
    if (reading.raw) {
        log.debug('原始报文', { deviceId: reading.deviceId, raw: log.truncate(reading.raw, 120) });
    }

    // 心跳帧只刷新路由，不推 Unity、不入库
    if (reading.broadcast) {
        broadcast(reading);
    }

    if (!reading.store) {
        return { ok: true, reading };
    }

    const saved = await db.saveReading(reading.deviceId, reading.type, reading.value);
    if (!saved) stats.dbFailed++;

    return { ok: true, reading };
}

function snapshot() {
    return { ...stats };
}

module.exports = { submit, reject, snapshot };
