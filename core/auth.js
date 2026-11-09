// core/auth.js —— WiFi 设备的连接认证
//
// 协议（连接后第一行）：
//   AUTH,<deviceId>,<32位hex token>\n
//   服务器回 AUTH,OK\n 或 AUTH,ERR\n
//
// 服务器只存 token 的 SHA-256，不存明文；设备端 token 存在 W25Q64 里。
const crypto = require('crypto');
const db = require('../infra/db');
const log = require('../infra/logger');

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();          // deviceId -> { hash, at }

function sha256(s) {
    return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

async function getHash(deviceId) {
    const hit = cache.get(deviceId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.hash;

    const rows = await db.query(
        'SELECT token_hash, enabled FROM devices WHERE device_id = ?',
        [deviceId]
    );
    const row = rows[0];
    const hash = (row && row.enabled) ? String(row.token_hash).toLowerCase() : null;
    cache.set(deviceId, { hash, at: Date.now() });
    return hash;
}

async function verify(deviceId, token) {
    if (!Number.isInteger(deviceId) || deviceId < 1 || deviceId > 999) return false;
    if (typeof token !== 'string' || !/^[0-9a-fA-F]{32}$/.test(token)) return false;

    const hash = await getHash(deviceId);
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return false;

    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(sha256(token.toLowerCase()), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 处理一行 AUTH 报文
 * @returns {{ok:boolean, deviceId?:number, reason?:string}}
 */
async function handleLine(line) {
    const m = /^AUTH,(\d{1,3}),([0-9a-fA-F]{32})$/.exec(line);
    if (!m) return { ok: false, reason: 'AUTH 格式错误' };

    const deviceId = Number(m[1]);
    if (await verify(deviceId, m[2])) {
        log.info('【认证】通过', { deviceId });
        return { ok: true, deviceId };
    }

    log.warn('【认证】失败', { deviceId });
    return { ok: false, deviceId, reason: 'token 不匹配' };
}

module.exports = { handleLine, verify, _cache: cache };
