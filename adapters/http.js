// adapters/http.js —— 查询接口 + 健康检查
const express = require('express');
const config = require('../config');
const db = require('../infra/db');
const log = require('../infra/logger');
const broadcast = require('../infra/broadcast');
const ingest = require('../core/ingest');

function start() {
    const app = express();
    const startedAt = Date.now();

    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        next();
    });

    // 健康检查：DB 不可用时 503，但进程不退出
    app.get('/healthz', async (req, res) => {
        const dbOk = await db.ping();
        res.status(dbOk ? 200 : 503).json({
            status: dbOk ? 'ok' : 'degraded',
            uptime_s: Math.round((Date.now() - startedAt) / 1000),
            ports: { tcp: config.TCP_PORT, ws: config.WS_PORT, http: config.HTTP_PORT },
            db: dbOk,
            ws_clients: broadcast.clientCount(),
            ingest: ingest.snapshot()
        });
    });

    // 设备列表
    app.get('/api/devices', async (req, res) => {
        try {
            const rows = await db.query(
                'SELECT DISTINCT device_id FROM readings WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY device_id'
            );
            res.json(rows.map(r => r.device_id));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 某设备最近 N 小时数据
    app.get('/api/data/:deviceId', async (req, res) => {
        const deviceId = parseInt(req.params.deviceId);
        const hours = Math.min(parseInt(req.query.hours) || 24, 24 * 30);
        const dataType = req.query.type;

        try {
            let sql = `SELECT data_type, ROUND(value, 2) AS value,
                       DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS time
                       FROM readings
                       WHERE device_id = ? AND recorded_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`;
            let params = [deviceId, hours];

            if (dataType !== undefined) {
                sql += ` AND data_type = ?`;
                params.push(parseInt(dataType));
            }
            sql += ` ORDER BY recorded_at ASC`;

            res.json(await db.query(sql, params));
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 最新 N 条
    app.get('/api/latest', async (req, res) => {
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        try {
            const rows = await db.query(
                `SELECT device_id, data_type, ROUND(value, 2) AS value,
                        DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS time
                 FROM readings
                 WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
                 ORDER BY recorded_at DESC LIMIT ?`,
                [limit]
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // 统计
    app.get('/api/stats/:deviceId', async (req, res) => {
        const deviceId = parseInt(req.params.deviceId);
        const hours = Math.min(parseInt(req.query.hours) || 24, 24 * 30);
        const dataType = parseInt(req.query.type) || 1;
        try {
            const rows = await db.query(
                `SELECT COUNT(*) AS count, AVG(value) AS avg_val,
                        MIN(value) AS min_val, MAX(value) AS max_val
                 FROM readings
                 WHERE device_id = ? AND data_type = ?
                   AND recorded_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`,
                [deviceId, dataType, hours]
            );
            res.json(rows[0]);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    return new Promise((resolve, reject) => {
        const server = app.listen(config.HTTP_PORT, '0.0.0.0', () => {
            log.info('HTTP 已监听', { port: config.HTTP_PORT });
            resolve(server);
        });
        server.once('error', reject);
    });
}

module.exports = { start };
