// adapters/mqtt.js —— LoRa/ChirpStack 传输层
// 只负责订阅与取报文，字段解析交给 protocols/chirpstack，之后同样进 ingest。
const mqtt = require('mqtt');
const config = require('../config');
const log = require('../infra/logger');
const chirpstack = require('../protocols/chirpstack');
const ingest = require('../core/ingest');

function start() {
    const client = mqtt.connect(config.mqtt.broker, {
        clientId: 'iot-middleware-' + Math.random().toString(16).slice(2, 8),
        reconnectPeriod: 5000
    });

    client.on('connect', () => {
        log.info('【MQTT】已连接 ChirpStack');
        client.subscribe(config.mqtt.topic, err => {
            if (err) log.error('【MQTT】订阅失败', { message: err.message });
            else log.info(`【MQTT】已订阅 ${config.mqtt.topic}`);
        });
    });

    client.on('message', async (topic, payload) => {
        log.info('【MQTT原始】', { topic, bytes: payload.length });

        const parsed = chirpstack.parsePayload(payload);
        if (!parsed.ok) {
            ingest.reject(parsed.reason, { source: 'LoRa', raw: payload.toString().slice(0, 200) });
            return;
        }

        await ingest.submit({ ...parsed, source: 'LoRa', raw: payload.toString().slice(0, 200) });
    });

    client.on('error', err => log.error('【MQTT】错误', { message: err.message }));

    return client;
}

module.exports = { start };
