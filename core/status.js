// core/status.js —— 设备在线状态：只在上线/下线时追加一行
//
// 和 readings 一样按"设备 + 值 + 时间"存，只是写入时机限定为状态变化：
//   上线：心跳(type 99) 的 value = mode，如 2001
//   下线：work = '0009'（NET 位不可能为 9，所以不会和真实模式冲突）
const db = require('../infra/db');
const log = require('../infra/logger');

const OFFLINE_WORK = '0009';
const DISCONNECT_GRACE_MS = 5000;      // 5 秒内重连视为抖动，不记离线
const LORA_TTL_MS = 5 * 60 * 1000;     // LoRa 无连接，5 分钟没上行视为离线
const SWEEP_MS = 30 * 1000;

const lastWork = new Map();            // deviceId -> 最后一次记录的状态
const lastSeen = new Map();            // deviceId -> 最后上行时间(ms)
const offlineTimers = new Map();       // deviceId -> 延迟离线定时器

function modeToString(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 9999) return null;
    return String(Math.trunc(n)).padStart(4, '0');
}

async function insert(deviceId, work, reason) {
    try {
        await db.query(
            'INSERT INTO device_status_log (device_id, work) VALUES (?, ?)',
            [deviceId, work]
        );
        lastWork.set(deviceId, work);
        log.info('【状态】', { deviceId, work, reason });
    } catch (e) {
        log.error('【状态】写入失败', { deviceId, work, message: e.message });
    }
}

async function onHeartbeat(deviceId, value) {
    const work = modeToString(value);
    if (!work) return;

    const timer = offlineTimers.get(deviceId);
    if (timer) {
        clearTimeout(timer);
        offlineTimers.delete(deviceId);
    }

    lastSeen.set(deviceId, Date.now());

    if (lastWork.get(deviceId) === work) return;   // 状态没变，不写库
    await insert(deviceId, work, 'heartbeat');
}

function noteUplink(deviceId) {
    lastSeen.set(deviceId, Date.now());
}

function onDisconnect(deviceId) {
    if (offlineTimers.has(deviceId)) return;

    const timer = setTimeout(async () => {
        offlineTimers.delete(deviceId);
        if (lastWork.get(deviceId) === OFFLINE_WORK) return;

        await insert(deviceId, OFFLINE_WORK, 'disconnect>5s');
        log.warn('【状态】设备离线超过 5 秒', { deviceId });
    }, DISCONNECT_GRACE_MS);

    if (timer.unref) timer.unref();
    offlineTimers.set(deviceId, timer);
}

async function sweep() {
    const now = Date.now();

    for (const [deviceId, seen] of lastSeen) {
        if (now - seen <= LORA_TTL_MS) continue;
        if (lastWork.get(deviceId) === OFFLINE_WORK) continue;

        await insert(deviceId, OFFLINE_WORK, 'timeout');
        log.warn('【状态】设备超时离线', { deviceId, sec: Math.round((now - seen) / 1000) });
    }
}

function start() {
    const t = setInterval(() => { sweep().catch(() => {}); }, SWEEP_MS);
    if (t.unref) t.unref();
}

async function cleanOld() {
    try {
        await db.query(
            'DELETE FROM device_status_log WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
        );
    } catch (e) {
        log.error('【状态】清理失败', { message: e.message });
    }
}

function snapshot() {
    return [...lastWork.entries()].map(([deviceId, work]) => ({ deviceId, work }));
}

function _reset() {
    for (const t of offlineTimers.values()) clearTimeout(t);
    offlineTimers.clear();
    lastWork.clear();
    lastSeen.clear();
}

module.exports = {
    onHeartbeat, noteUplink, onDisconnect, sweep, start, cleanOld,
    modeToString, snapshot, _reset
};
