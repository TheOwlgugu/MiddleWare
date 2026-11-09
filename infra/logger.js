// infra/logger.js —— 统一日志：控制台 + 按天 JSON Lines 文件
// 级别用环境变量 LOG_LEVEL 控制（debug / info / warn / error），默认 info。
// 生产环境用 info，排查问题时用 debug（会多出原始报文、推送明细）。
const fs = require('fs');
const path = require('path');
const config = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[String(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;

const KEEP_DAYS = Number(process.env.LOG_KEEP_DAYS || 7);

let stream = null;
let streamDay = null;

/** 删除超过保留天数的旧日志（只在进程启动时跑一次） */
function cleanupOldLogs() {
    try {
        const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
        for (const name of fs.readdirSync(config.LOG_DIR)) {
            if (!name.startsWith('middleware-') || !name.endsWith('.log')) continue;
            const p = path.join(config.LOG_DIR, name);
            if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
        }
    } catch (_) {
        /* 日志目录不存在等情况忽略 */
    }
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function getStream() {
    const day = today();
    if (stream && streamDay === day) return stream;

    if (stream) {
        try { stream.end(); } catch (_) { /* ignore */ }
        stream = null;
    }

    fs.mkdirSync(config.LOG_DIR, { recursive: true });
    const file = path.join(config.LOG_DIR, `middleware-${day}.log`);
    stream = fs.createWriteStream(file, { flags: 'a' });
    streamDay = day;
    stream.on('error', () => { stream = null; });   // 下次写入重新打开
    return stream;
}

function emit(level, msg, extra) {
    if (LEVELS[level.toLowerCase()] < minLevel) return;

    const rec = { time: new Date().toISOString(), level, msg };
    if (extra !== undefined) rec.extra = extra;

    try {
        getStream().write(JSON.stringify(rec) + '\n');
    } catch (_) {
        /* 落盘失败不影响主流程 */
    }

    const tail = extra === undefined ? '' : ' ' + JSON.stringify(extra);
    console.log(`[${rec.time.slice(11, 19)}] ${level.padEnd(5)} ${msg}${tail}`);
}

function truncate(value, max) {
    if (typeof value !== 'string') return value;
    return value.length <= max ? value : value.slice(0, max) + '…';
}

cleanupOldLogs();

module.exports = {
    debug: (msg, extra) => emit('DEBUG', msg, extra),
    info:  (msg, extra) => emit('INFO',  msg, extra),
    warn:  (msg, extra) => emit('WARN',  msg, extra),
    error: (msg, extra) => emit('ERROR', msg, extra),
    truncate,
    level: () => Object.keys(LEVELS).find(k => LEVELS[k] === minLevel) || 'info'
};
