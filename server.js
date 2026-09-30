const net = require('net');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const express = require('express');

// ============ 配置区 ============
const TCP_PORT = 4000;    // ESP8266 连这个端口
const WS_PORT  = 8080;    // Unity 连这个端口

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '12345',   // ← 改成你的密码
    database: 'sensor_data'
};
// ================================

// ---------- 1. TCP 服务器：接收 ESP8266 ----------
const tcpServer = net.createServer(socket => {
    console.log('[ESP8266]connected');

    let buffer = '';

    socket.on('data', async data => {
        buffer += data.toString();

        // 按换行分割，最后一段可能不完整
        const lines = buffer.split('\n');
        buffer = lines.pop();   // 保留最后一段

        for (const line of lines) {
            const message = line.trim();
            if (!message) continue;
            console.log('【收到】', message);

            // 协议：7位数字 IIILTTTT
            if (message.length === 7) {
                const deviceId = parseInt(message.substring(0, 2));
                const lightState = parseInt(message.substring(2, 3));
                const temperature = parseInt(message.substring(3, 7)) / 100.0;

                await saveToDB(deviceId, lightState, temperature);
                broadcast({
                    deviceId,
                    lightState,
                    temperature,
                    timestamp: Date.now()
                });
            }
        }
    });

    socket.on('end',   () => console.log('【ESP8266】对方主动断开'));
    socket.on('close', () => console.log('【ESP8266】连接完全关闭'));
    socket.on('error', err => console.error('【ESP8266】TCP错误:', err.message));
});

tcpServer.listen(TCP_PORT, '0.0.0.0', () => {
    console.log(`TCP服务器已启动，监听 ${TCP_PORT} 端口`);
});

// ---------- 2. WebSocket 服务器：推送给 Unity ----------
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', ws => {
    console.log('【Unity】已连接');
    ws.on('close', () => console.log('【Unity】断开'));
});

function broadcast(data) {
    const payload = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
    console.log('【推送】', payload);
}

// ---------- 3. 写数据库 ----------
async function saveToDB(deviceId, lightState, temperature) {
    try {
        const conn = await mysql.createConnection(dbConfig);
        await conn.execute(
            'INSERT INTO readings (device_id, light_state, temperature) VALUES (?, ?, ?)',
            [deviceId, lightState, temperature]
        );
        await conn.end();
    } catch (err) {
        console.error('数据库写入失败:', err.message);
    }
}

// ---------- 4. 自动清理一周前的旧数据 ----------
async function cleanOldData() {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [result] = await conn.execute(
            'DELETE FROM readings WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
        );
        await conn.end();
        if (result.affectedRows > 0) {
            console.log(`【清理】删除了 ${result.affectedRows} 条超过一周的旧数据`);
        }
    } catch (err) {
        console.error('清理失败:', err.message);
    }
}

// 启动后先清一次，然后每小时清一次
cleanOldData();
setInterval(cleanOldData, 24 * 60 * 60 * 1000);

// ---------- 5. HTTP API（主机端浏览数据） ----------
const app = express();
const HTTP_PORT = 3000;

// 允许跨域访问（Unity 需要）
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// 接口1：获取所有设备列表
app.get('/api/devices', async (req, res) => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            'SELECT DISTINCT device_id FROM readings WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY device_id'
        );
        await conn.end();
        res.json(rows.map(r => r.device_id));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 接口2：获取某设备最近 N 小时的数据（北京时间）
app.get('/api/data/:deviceId', async (req, res) => {
    const deviceId = parseInt(req.params.deviceId);
    const hours = parseInt(req.query.hours) || 24;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            `SELECT 
             light_state, 
             ROUND(temperature, 2) AS temperature,
             DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS time
         FROM readings 
         WHERE device_id = ? AND recorded_at > DATE_SUB(NOW(), INTERVAL ? HOUR)
         ORDER BY recorded_at ASC`,
            [deviceId, hours]
        );
        await conn.end();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 接口3：获取最新 N 条数据（所有设备，北京时间）
app.get('/api/latest', async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            `SELECT 
                device_id, 
                light_state, 
                ROUND(temperature, 2) AS temperature,
                DATE_FORMAT(recorded_at, '%Y-%m-%d %H:%i:%s') AS time
             FROM readings 
             WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
             ORDER BY recorded_at DESC LIMIT ?`,
            [limit]
        );
        await conn.end();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 接口4：查询某设备在某时间段的汇总统计
app.get('/api/stats/:deviceId', async (req, res) => {
    const deviceId = parseInt(req.params.deviceId);
    const hours = parseInt(req.query.hours) || 24;
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.execute(
            `SELECT 
                COUNT(*) AS count,
                AVG(temperature) AS avg_temp,
                MIN(temperature) AS min_temp,
                MAX(temperature) AS max_temp
             FROM readings 
             WHERE device_id = ? AND recorded_at > DATE_SUB(NOW(), INTERVAL ? HOUR)`,
            [deviceId, hours]
        );
        await conn.end();
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`HTTP API 已启动，监听 ${HTTP_PORT} 端口`);
});