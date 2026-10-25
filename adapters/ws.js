// adapters/ws.js —— 推送适配器（Unity 连接这里）
const broadcast = require('../infra/broadcast');
const config = require('../config');

function start() {
    return broadcast.init(config.WS_PORT);
}

module.exports = { start };
