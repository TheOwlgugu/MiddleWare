// adapters/ws.js —— 推送适配器（Unity 连接这里）
// 上行：广播读数；下行：接收 Unity 的 cmd 消息，交给 core/downlink
const broadcast = require('../infra/broadcast');
const config = require('../config');
const downlink = require('../core/downlink');
const queries = require('../core/queries');

function route(ws, text) {
    let msg;
    try {
        msg = JSON.parse(text);
    } catch (_) {
        return downlink.handleMessage(ws, text);
    }

    if (msg && msg.kind === 'query') {
        return queries.handle(ws, msg);
    }

    return downlink.handleMessage(ws, text);
}

function start() {
    return broadcast.init(
        config.WS_PORT,
        route,
        config.WS_TOKEN,
        config.WS_HOST
    );
}

module.exports = { start };
