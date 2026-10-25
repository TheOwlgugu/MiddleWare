// config.js —— 所有可调参数集中在这里，支持环境变量覆盖（M0）
// 例：TCP_PORT=4001 HTTP_PORT=3001 node index.js
const path = require('path');

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

    // 日志目录：默认在仓库内 logs/，可用 LOG_DIR 覆盖
    LOG_DIR: process.env.LOG_DIR || path.join(__dirname, 'logs'),

    // 数据库
    db: {
        host: process.env.DB_HOST || 'localhost',
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
        broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
        appId: process.env.MQTT_APP_ID || '3c643783-29fa-4e4f-970d-202c5428d4b6',
        get topic() {
            return `application/${this.appId}/device/+/event/up`;
        }
    }
};
