// adapters/tcp.js —— WiFi/TCP 传输层
// 上行：AUTH 握手 → 按 '\n' 分帧 → ascii10 → ingest
// 下行：把 deviceId → socket 登记到路由表，供 core/downlink 写回
const net = require('net');
const config = require('../config');
const log = require('../infra/logger');
const registry = require('../infra/registry');
const ascii10 = require('../protocols/ascii10');
const ingest = require('../core/ingest');
const auth = require('../core/auth');
const guard = require('../infra/guard');

function start() {
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            const peer = `${socket.remoteAddress}:${socket.remotePort}`;

            if (guard.isBanned('tcp', socket.remoteAddress)) {
                log.warn('【防护】已封禁 IP 尝试连接，直接断开', { peer });
                socket.destroy();
                return;
            }

            log.info('【WiFi】已连接', { peer });
            socket.setNoDelay(true);

            let buffer = '';
            let chain = Promise.resolve();     // 同一连接内按顺序处理
            let authed = false;
            let authedDeviceId = null;

            const authTimer = setTimeout(() => {
                if (!authed) {
                    log.warn('【认证】超时，断开', { peer });
                    socket.destroy();
                }
            }, config.AUTH_TIMEOUT_MS || 5000);

            socket.on('data', data => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const message = line.trim();
                    if (!message) continue;

                    chain = chain.then(async () => {
                        if (!authed) {
                            const r = await auth.handleLine(message);
                            if (!r.ok) {
                                guard.fail('tcp', socket.remoteAddress);
                                socket.end('AUTH,ERR\n');
                                return;
                            }
                            guard.ok('tcp', socket.remoteAddress);
                            authed = true;
                            authedDeviceId = r.deviceId;
                            clearTimeout(authTimer);
                            socket.write('AUTH,OK\n');
                            log.info('【认证】连接已授权', { peer, deviceId: authedDeviceId });
                            return;
                        }

                        const parsed = ascii10.parseLine(message);
                        if (!parsed.ok) {
                            ingest.reject(parsed.reason, { source: 'WiFi', raw: message });
                            return;
                        }

                        /* 认证过的 socket 只能代表它自己的设备号 */
                        if (parsed.deviceId !== authedDeviceId) {
                            ingest.reject('设备号与认证不一致', {
                                source: 'WiFi', raw: message, authed: authedDeviceId
                            });
                            return;
                        }

                        registry.bindWifi(parsed.deviceId, socket);
                        await ingest.submit({ ...parsed, source: 'WiFi', raw: message });
                    }).catch(err => {
                        log.error('【WiFi】处理失败', { peer, message: err.message });
                        if (!authed) socket.end('AUTH,ERR\n');
                    });
                }
            });

            socket.on('end',   () => log.info('【WiFi】对方主动断开', { peer }));
            socket.on('close', () => {
                clearTimeout(authTimer);
                registry.unbindSocket(socket);
                log.info('【WiFi】连接关闭', { peer, authed });
            });
            socket.on('error', err => log.error('【WiFi】TCP 错误', { peer, message: err.message }));
        });

        server.once('listening', () => {
            log.info('TCP 已监听', { port: config.TCP_PORT });
            resolve(server);
        });
        server.once('error', reject);
        server.listen(config.TCP_PORT, '0.0.0.0');
    });
}

module.exports = { start };
