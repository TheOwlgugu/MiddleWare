// adapters/ws.js —— 推送适配器（Unity 连接这里）
// 上行：广播读数；下行：接收 Unity 的 cmd 消息，交给 core/downlink
const broadcast = require('../infra/broadcast');
const config = require('../config');
const downlink = require('../core/downlink');

function start() {
    return broadcast.init(
        config.WS_PORT,
        (ws, text) => downlink.handleMessage(ws, text),
        config.WS_TOKEN,
        config.WS_HOST
    );
}

module.exports = { start };
