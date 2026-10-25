// index.js —— 组装：传输适配器 → 协议解析 → 统一 ingest
const net = require('net');
const config = require('./config');
const log = require('./infra/logger');
const db = require('./infra/db');

const wsAdapter   = require('./adapters/ws');
const tcpAdapter  = require('./adapters/tcp');
const httpAdapter = require('./adapters/http');
const mqttAdapter = require('./adapters/mqtt');

/**
 * 端口占用探测
 * Windows 上 SO_REUSEADDR 会让 Node 悄悄绑上别人已监听的端口，
 * listen 回调照常触发，但流量仍归原进程，所以不能只依赖 EADDRINUSE。
 */
function portInUse(port) {
    return new Promise(resolve => {
        const probe = net.connect({ port, host: '127.0.0.1' });
        let settled = false;
        const done = value => {
            if (settled) return;
            settled = true;
            probe.destroy();
            resolve(value);
        };
        probe.setTimeout(300, () => done(false));
        probe.once('connect', () => done(true));
        probe.once('error', () => done(false));
    });
}

async function main() {
    log.info('===== IoT 中间层启动 =====', {
        tcp: config.TCP_PORT,
        ws: config.WS_PORT,
        http: config.HTTP_PORT,
        logDir: config.LOG_DIR
    });

    let failed = 0;

    const services = [
        ['WebSocket', wsAdapter,   config.WS_PORT],
        ['TCP',       tcpAdapter,  config.TCP_PORT],
        ['HTTP',      httpAdapter, config.HTTP_PORT]
    ];

    for (const [name, mod, port] of services) {
        if (await portInUse(port)) {
            failed++;
            log.error(`${name} 启动失败：端口 ${port} 已被占用（用 TCP_PORT / WS_PORT / HTTP_PORT 换端口）`);
            continue;
        }
        try {
            await mod.start();
        } catch (err) {
            failed++;
            const hint = (err && err.code === 'EADDRINUSE')
                ? '（端口被占用，可用 TCP_PORT / WS_PORT / HTTP_PORT 环境变量换端口）'
                : '';
            log.error(`${name} 启动失败${hint}`, { message: err.message, code: err.code });
        }
    }

    // MQTT 是可选链路：连不上只记日志，不影响 WiFi/TCP
    mqttAdapter.start();

    setTimeout(db.cleanOldData, 5000);
    setInterval(db.cleanOldData, 7 * 24 * 60 * 60 * 1000);

    if (failed > 0) {
        log.error(`有 ${failed} 个服务启动失败，进程退出（退出码 1）`);
        process.exit(1);
    }

    log.info('===== 所有服务已启动 =====');
}

process.on('SIGINT', () => {
    log.info('收到 SIGINT，退出');
    process.exit(0);
});

process.on('unhandledRejection', err => {
    log.error('未处理的 Promise 拒绝（已捕获，进程继续）', { message: err && err.message });
});

main().catch(err => {
    log.error('启动异常', { message: err.message, stack: err.stack });
    process.exit(1);
});
