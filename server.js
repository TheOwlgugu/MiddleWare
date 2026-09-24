const net = require('net');
const WebSocket = require('ws');
const mysql = require('mysql2/promise');

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

    socket.on('end', () => console.log('【ESP8266】断开'));
    socket.on('error', err => console.error('TCP错误:', err.message));
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