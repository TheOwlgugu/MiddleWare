// config.js —— 所有可调参数集中在这里，支持环境变量覆盖（M0）
// 例：TCP_PORT=4001 HTTP_PORT=3001 node index.js
require('dotenv').config();   // 从 .env 读取敏感配置（不入库）
const path = require('path');

function flag(name, def) {
    const raw = (process.env[name] || '').trim().toLowerCase();
    if (raw === '') return def;
    return !['0', 'false', 'off', 'no', 'disabled'].includes(raw);
}

function port(name, def) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return def;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`环境变量 ${name}="${raw}" 不是合法端口（1-65535）`);
    }
    return n;
}

module.exports = {
    TCP_PORT:  port('TCP_PORT',  4000),
    WS_PORT:   port('WS_PORT',   8081),
    HTTP_PORT: port('HTTP_PORT', 3000),

    // Unity WebSocket 访问令牌（空 = 不校验，生产必须设置）
    WS_TOKEN: process.env.WS_TOKEN || '',

    // 认证失败限流：窗口内失败次数达到阈值，封禁该 IP 一段时间
    AUTH_MAX_FAILS:  Number(process.env.AUTH_MAX_FAILS  || 10),
    AUTH_WINDOW_MS:  Number(process.env.AUTH_WINDOW_MS  || 5 * 60 * 1000),
    AUTH_BAN_MS:     Number(process.env.AUTH_BAN_MS     || 15 * 60 * 1000),

    // WebSocket 绑定地址：默认只绑本机，由 SSH 隧道/Nginx 反代
    WS_HOST: process.env.WS_HOST || '127.0.0.1',

    // 设备认证：连接后多久没发 AUTH 就断开（毫秒）
    AUTH_TIMEOUT_MS: Number(process.env.AUTH_TIMEOUT_MS || 5000),

    // 日志目录：默认在仓库内 logs/，可用 LOG_DIR 覆盖
    LOG_DIR: process.env.LOG_DIR || path.join(__dirname, 'logs'),

    // 数据库
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: port('DB_PORT', 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '12345',
        database: process.env.DB_NAME || 'sensor_data',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4'
    },

    // ChirpStack MQTT
    mqtt: {
        // 0/false/off 时完全不启动 MQTT，适合暂时不开 ChirpStack
        enabled: flag('MQTT_ENABLED', true),
        broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
        appId: process.env.MQTT_APP_ID || '3c643783-29fa-4e4f-970d-202c5428d4b6',
        get topic() {
            return `application/${this.appId}/device/+/event/up`;
        }
    },

    // 下行
    downlink: {
        // LoRa 队列项有效期（秒）：超过这个时间还没下发就由 ChirpStack 丢弃，
        // 避免设备离线几小时后上线时执行一条过期命令
        loraTtlSec: Number(process.env.DOWNLINK_TTL_SEC || 120)
    }
};
