// core/queries.js —— Unity 的命名查询（只允许白名单，不接收 SQL）
const db = require('../infra/db');
const log = require('../infra/logger');

const MAX_ROWS = 5000;
const MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

function int(v, name, min, max) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new Error(`${name} 必须是 ${min}-${max} 的整数`);
    }
    return n;
}

function reply(ws, msg, payload) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ kind: 'queryResult', requestId: msg.requestId, ...payload }));
}

function normalize(rows) {
    return rows.map(r => ({
        id: Number(r.id),
        deviceId: Number(r.deviceId),
        dataType: Number(r.dataType),
        value: Number(r.value),
        time: Number(r.time)
    }));
}

async function latest(ws, msg, p) {
    const deviceId = int(p.deviceId, 'deviceId', 1, 999);
    const dataType = int(p.dataType, 'dataType', 0, 99);
    const limit = int(p.limit, 'limit', 1, 1000);

    const rows = await db.query(
        `SELECT id, device_id AS deviceId, data_type AS dataType,
                ROUND(value, 2) AS value,
                UNIX_TIMESTAMP(recorded_at) * 1000 AS time
         FROM readings
         WHERE device_id = ? AND data_type = ?
         ORDER BY recorded_at DESC
         LIMIT ?`,
        [deviceId, dataType, limit]
    );

    reply(ws, msg, { ok: true, items: normalize(rows) });
}

async function status(ws, msg, p) {
    const deviceId = int(p.deviceId, 'deviceId', 1, 999);

    const rows = await db.query(
        `SELECT work FROM device_status_log
         WHERE device_id = ? ORDER BY id DESC LIMIT 1`,
        [deviceId]
    );

    // 没有记录按离线；work 末位 9 = 0009
    const online = rows.length > 0 && !String(rows[0].work).endsWith('9');
    reply(ws, msg, { ok: true, online });
}

async function history(ws, msg, p) {
    const deviceId = int(p.deviceId, 'deviceId', 1, 999);
    const dataType = int(p.dataType, 'dataType', 0, 99);
    const start = int(p.start, 'start', 0, Number.MAX_SAFE_INTEGER);
    const end = int(p.end, 'end', 0, Number.MAX_SAFE_INTEGER);

    if (!(start < end)) throw new Error('start 必须早于 end');
    if (end - start > MAX_RANGE_MS) throw new Error('时间跨度不能超过 30 天');

    const rows = await db.query(
        `SELECT id, device_id AS deviceId, data_type AS dataType,
                ROUND(value, 2) AS value,
                UNIX_TIMESTAMP(recorded_at) * 1000 AS time
         FROM readings
         WHERE device_id = ? AND data_type = ?
           AND recorded_at >= FROM_UNIXTIME(? / 1000)
           AND recorded_at <  FROM_UNIXTIME(? / 1000)
         ORDER BY recorded_at ASC
         LIMIT ?`,
        [deviceId, dataType, start, end, MAX_ROWS + 1]
    );

    const truncated = rows.length > MAX_ROWS;
    reply(ws, msg, { ok: true, items: normalize(rows.slice(0, MAX_ROWS)), truncated });
}

const QUERIES = { latest, status, history };

async function handle(ws, msg) {
    const name = String(msg.name || '');
    const fn = QUERIES[name];

    if (!fn) {
        reply(ws, msg, { ok: false, error: `未知查询: ${name}` });
        return;
    }

    try {
        await fn(ws, msg, msg.params || {});
    } catch (e) {
        log.warn('【查询】失败', { name, message: e.message });
        reply(ws, msg, { ok: false, error: e.message });
    }
}

module.exports = { handle, _QUERIES: QUERIES };
