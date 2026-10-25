// infra/logger.js —— 统一日志：控制台 + 按天 JSON Lines 文件
const fs = require('fs');
const path = require('path');
const config = require('../config');

let stream = null;

function today() {
    return new Date().toISOString().slice(0, 10);
}

function getStream() {
    if (stream) return stream;
    fs.mkdirSync(config.LOG_DIR, { recursive: true });
    const file = path.join(config.LOG_DIR, `middleware-${today()}.log`);
    stream = fs.createWriteStream(file, { flags: 'a' });
    stream.on('error', () => { stream = null; });   // 下次写入重新打开
    return stream;
}

function emit(level, msg, extra) {
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

module.exports = {
    info:  (msg, extra) => emit('INFO',  msg, extra),
    warn:  (msg, extra) => emit('WARN',  msg, extra),
    error: (msg, extra) => emit('ERROR', msg, extra)
};
