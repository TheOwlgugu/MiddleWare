// infra/registry.js —— 设备路由表：deviceId → 走哪条链路
//
// 中间层原本只"收"数据，不知道设备在哪条链路上。下行必须知道，所以在每次
// 有效上行时顺手登记：WiFi 记 socket，LoRa 记 devEui。表是内存态，中间层
// 重启后要等设备下一次上行才会重建。
const log = require('./logger');

const TTL_MS = 5 * 60 * 1000;   // 5 分钟没有上行就认为离线
const routes = new Map();

function bindWifi(deviceId, socket) {
    routes.set(deviceId, { transport: 'wifi', socket, lastSeen: Date.now() });
}

function bindLora(deviceId, devEui) {
    routes.set(deviceId, { transport: 'lora', devEui, lastSeen: Date.now() });
}

function get(deviceId) {
    const r = routes.get(deviceId);
    if (!r) return null;

    if (r.transport === 'wifi') {
        // WiFi：连接还在就算在线，不按时间过期
        if (!r.socket || r.socket.destroyed) {
            routes.delete(deviceId);
            log.warn('【路由】TCP 已断开，移除设备', { deviceId });
            return null;
        }
        return r;
    }

    // LoRa：靠上行/心跳保活，超时视为离线
    if (Date.now() - r.lastSeen > TTL_MS) {
        routes.delete(deviceId);
        log.warn('【路由】设备超时，移除', { deviceId, transport: r.transport });
        return null;
    }
    return r;
}

function unbindSocket(socket) {
    for (const [id, r] of routes) {
        if (r.socket === socket) {
            routes.delete(id);
            log.info('【路由】连接关闭，移除设备', { deviceId: id });
        }
    }
}

function snapshot() {
    return [...routes.entries()].map(([deviceId, r]) => ({
        deviceId,
        transport: r.transport,
        devEui: r.devEui || null,
        lastSeen: r.lastSeen
    }));
}

module.exports = { bindWifi, bindLora, get, unbindSocket, snapshot, TTL_MS };
