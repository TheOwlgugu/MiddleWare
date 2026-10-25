// adapters/tcp.js —— WiFi/TCP 传输层
// 只做一件事：按 '\n' 分帧，把每行交给 ascii10 协议解析器，再送 ingest。
const net = require('net');
const config = require('../config');
const log = require('../infra/logger');
const ascii10 = require('../protocols/ascii10');
const ingest = require('../core/ingest');

function start() {
    return new Promise((resolve, reject) => {
        const server = net.createServer(socket => {
            const peer = `${socket.remoteAddress}:${socket.remotePort}`;
            log.info('【WiFi】已连接', { peer });

            let buffer = '';
            let chain = Promise.resolve();   // 同一连接内按顺序处理，避免乱序入库

            socket.on('data', data => {
                buffer += data.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const message = line.trim();
                    if (!message) continue;

                    log.info('【TCP原始】', { message });

                    const parsed = ascii10.parseLine(message);
                    if (!parsed.ok) {
                        ingest.reject(parsed.reason, { source: 'WiFi', raw: message });
                        continue;
                    }

                    chain = chain.then(() => ingest.submit({ ...parsed, source: 'WiFi', raw: message }));
                }
            });

            socket.on('end',   () => log.info('【WiFi】对方主动断开', { peer }));
            socket.on('close', () => log.info('【WiFi】连接关闭', { peer }));
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
