// infra/broadcast.js —— 向 Unity 推送统一读数，同时接收 Unity 发来的下行命令
const WebSocket = require('ws');
const log = require('./logger');

let wss = null;
let clientCount = 0;

/**
 * @param {number} port
 * @param {(ws: WebSocket, text: string) => void} [onMessage]  Unity 发来消息时的回调
 */
function init(port, onMessage) {
    return new Promise((resolve, reject) => {
        wss = new WebSocket.Server({ port });

        wss.once('listening', () => {
            log.info('WebSocket 已监听', { port });
            resolve(wss);
        });
        wss.once('error', reject);

        wss.on('connection', ws => {
            clientCount++;
            log.info('【Unity】已连接', { clients: clientCount });

            ws.on('message', raw => {
                if (!onMessage) return;
                try {
                    onMessage(ws, raw.toString());
                } catch (err) {
                    log.error('【Unity】消息处理异常', { message: err.message });
                }
            });

            ws.on('close', () => {
                clientCount--;
                log.info('【Unity】断开', { clients: clientCount });
            });
        });
    });
}

/**
 * 广播一条统一读数
 * 保留 dataType 字段，兼容现有 Unity 客户端；kind 用来区分"读数"和"下行 ack"
 */
function broadcast(reading) {
    if (!wss) return;
    const payload = JSON.stringify({
        kind: 'reading',
        deviceId: reading.deviceId,
        dataType: reading.type,
        type: reading.type,
        key: reading.key,
        value: reading.value,
        unit: reading.unit,
        source: reading.source,
        timestamp: reading.timestamp
    });
    let sent = 0;
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            sent++;
        }
    });
    log.debug(`【推送】${payload}`, { clients: sent });
}

module.exports = { init, broadcast, clientCount: () => clientCount };
