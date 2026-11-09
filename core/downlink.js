// core/downlink.js —— 下行命令：校验 → 查路由 → 发送
//
// Unity 发来的格式：
//   { "type": "cmd", "requestId": "17", "deviceId": 2, "port": 1, "code": 5 }
//
// 设备收到的格式（10 个 ASCII 字符）：
//   "002100001S" = 设备 002、端口 1、指令 00001、校验 S
//   设备号(3) + 端口(1) + 指令(5) + 校验(1)
//   WiFi: 写 TCP socket，追加 '\n' 分帧
//   LoRa: 10 字节原始载荷，通过 ChirpStack MQTT 命令 topic 下发
const registry = require('../infra/registry');
const log = require('../infra/logger');
const mqttAdapter = require('../adapters/mqtt');

const stats = { total: 0, ok: 0, failed: 0, lastError: null };

/** 校验码字符表：sum % 36 → 0-9A-Z */
const CHECK_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** 计算前 9 个字符的校验位 */
function checkChar(body) {
    let sum = 0;
    for (let i = 0; i < body.length; i++) sum += body.charCodeAt(i);
    return CHECK_CHARS[sum % CHECK_CHARS.length];
}

/** 拼设备帧："002100001S" */
function buildFrame(deviceId, port, code) {
    const body = String(deviceId).padStart(3, '0')
               + String(port)
               + String(code).padStart(5, '0');
    return body + checkChar(body);
}

function validate({ deviceId, port, code }) {
    if (!Number.isInteger(deviceId) || deviceId < 1 || deviceId > 999) {
        return 'deviceId 必须是 1-999 的整数';
    }
    if (!Number.isInteger(port) || port < 1 || port > 4) {
        return 'port 必须是 1-4 的整数';
    }
    if (!Number.isInteger(code) || code < 0 || code > 99999) {
        return 'code 必须是 0-99999 的整数';
    }
    return null;
}

/**
 * 发送一条控制命令
 * @returns {Promise<{ok:boolean, route?:string, error?:string}>}
 */
async function send(cmd) {
    stats.total++;

    const invalid = validate(cmd);
    if (invalid) {
        stats.failed++;
        stats.lastError = invalid;
        log.warn('【下行】参数非法', { cmd, reason: invalid });
        return { ok: false, error: invalid };
    }

    const route = registry.get(cmd.deviceId);
    if (!route) {
        stats.failed++;
        stats.lastError = '设备未上报或已离线';
        log.warn('【下行】设备不在路由表', { deviceId: cmd.deviceId });
        return { ok: false, error: '设备未上报或已离线' };
    }

    const frame = buildFrame(cmd.deviceId, cmd.port, cmd.code);

    try {
        if (route.transport === 'wifi') {
            if (!route.socket || route.socket.destroyed) {
                stats.failed++;
                stats.lastError = 'TCP 连接已断开';
                return { ok: false, error: 'TCP 连接已断开' };
            }
            route.socket.write(frame + '\n');
        } else {
            await mqttAdapter.sendDownlink(route.devEui, frame);
        }

        stats.ok++;
        log.info('【下行】', {
            deviceId: cmd.deviceId,
            port: cmd.port,
            code: cmd.code,
            frame,
            route: route.transport,
            devEui: route.devEui || null
        });
        return { ok: true, route: route.transport };
    } catch (err) {
        stats.failed++;
        stats.lastError = err.message;
        log.error('【下行】发送失败', { cmd, message: err.message });
        return { ok: false, error: err.message };
    }
}

/** 处理 Unity 通过 WebSocket 发来的消息 */
async function handleMessage(ws, text) {
    let msg;
    try {
        msg = JSON.parse(text);
    } catch (err) {
        sendAck(ws, null, false, 'JSON 解析失败');
        return;
    }

    if (!msg || msg.type !== 'cmd') return;   // 只处理控制命令

    const res = await send(msg);
    sendAck(ws, msg.requestId === undefined ? null : msg.requestId, res.ok, res.error, res.route);
}

function sendAck(ws, requestId, ok, error, route) {
    if (ws.readyState !== 1) return;   // 1 = WebSocket.OPEN
    const ack = {
        kind: 'ack',
        requestId: requestId === undefined ? null : requestId,
        ok: !!ok,
        route: route || null,
        error: error || null
    };
    ws.send(JSON.stringify(ack));
    log.info('【下行】ack', ack);
}

function snapshot() {
    return { ...stats };
}

module.exports = { send, handleMessage, snapshot, buildFrame, validate };
