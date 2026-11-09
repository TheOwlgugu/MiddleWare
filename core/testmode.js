// core/testmode.js —— 网络测试帧（类型 98）
//
// 职责：
//   1. 记录每台设备的测试序号，发现缺帧（断发）时告警
//   2. 回一帧下行 ACK（port 4，code = 原序号），设备侧显示 ACK:OK
//
// 测试帧不入库、不推 Unity：只要单片机 ↔ 中间层通了，
// 数据库/Unity 是中间层自己的事，不在固件测试范围内。
const log = require('../infra/logger');

const MOD = 100000;                 // 序号回绕范围
const state = new Map();            // deviceId -> { lastSeq, received, missing }
const stats = { received: 0, gaps: 0, acks: 0, ackFailed: 0 };

function nextSeq(seq) { return (seq + 1) % MOD; }

/**
 * 记录一帧测试序号，返回缺口信息（纯函数，便于测试）
 * @returns {{duplicate:boolean, gap:number}}
 */
function track(deviceId, seq) {
    let s = state.get(deviceId);
    if (!s) {
        s = { lastSeq: null, received: 0, missing: 0 };
        state.set(deviceId, s);
    }

    if (s.lastSeq !== null) {
        if (seq === s.lastSeq) return { duplicate: true, gap: 0 };

        const gap = (seq - nextSeq(s.lastSeq) + MOD) % MOD;
        if (gap > 0) {
            stats.gaps += gap;
            s.missing += gap;
        }
        s.lastSeq = seq;
        s.received++;
        return { duplicate: false, gap };
    }

    s.lastSeq = seq;
    s.received++;
    return { duplicate: false, gap: 0 };
}

/**
 * 处理一条测试读数：日志 + 缺口检测 + 回 ACK
 */
async function handle(reading) {
    const { deviceId, value } = reading;
    stats.received++;

    const r = track(deviceId, value);

    if (r.duplicate) {
        log.warn('【测试】重复帧', { deviceId, seq: value });
        return { ok: true, duplicate: true };
    }

    if (r.gap > 0) {
        log.warn('【测试】缺帧', {
            deviceId,
            expected: nextSeq(value - r.gap < 0 ? value - r.gap + MOD : value - r.gap),
            got: value,
            missing: r.gap
        });
    }

    log.info('【测试】收到', { deviceId, seq: value });

    /* 延迟 require，避免 testmode → downlink → mqtt → ingest 的循环依赖 */
    const downlink = require('./downlink');
    const res = await downlink.send({ deviceId, port: 4, code: value });
    if (res.ok) {
        stats.acks++;
    } else {
        stats.ackFailed++;
        log.warn('【测试】ACK 下发失败', { deviceId, seq: value, error: res.error });
    }

    return { ok: true, seq: value, ack: res.ok };
}

function snapshot() {
    return { ...stats, devices: [...state.entries()].map(([id, s]) => ({ deviceId: id, ...s })) };
}

function reset() {
    state.clear();
    stats.received = 0;
    stats.gaps = 0;
    stats.acks = 0;
    stats.ackFailed = 0;
}

module.exports = { handle, track, snapshot, reset, nextSeq };
