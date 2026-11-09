// adapters/mqtt.js —— LoRa/ChirpStack 传输层
// 上行：订阅 → protocols/chirpstack 解析 → ingest，同时登记 deviceId → devEui
// 下行：通过 ChirpStack 的 MQTT 命令 topic 下发（application/<appId>/device/<devEui>/command/down）
const mqtt = require('mqtt');
const config = require('../config');
const log = require('../infra/logger');
const registry = require('../infra/registry');
const chirpstack = require('../protocols/chirpstack');
const ingest = require('../core/ingest');

let client = null;

function start() {
    client = mqtt.connect(config.mqtt.broker, {
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
        log.debug('【MQTT原始】', { topic, bytes: payload.length });

        const parsed = chirpstack.parsePayload(payload);
        if (!parsed.ok) {
            ingest.reject(parsed.reason, { source: 'LoRa', raw: payload.toString().slice(0, 120) });
            return;
        }

        // 登记路由：下行时才知道这个设备对应哪个 devEui
        if (parsed.devEui) registry.bindLora(parsed.deviceId, parsed.devEui);

        await ingest.submit({ ...parsed, source: 'LoRa', raw: payload.toString().slice(0, 120) });
    });

    client.on('error', err => log.error('【MQTT】错误', { message: err.message }));

    return client;
}

/**
 * 发布一条 LoRa 下行命令
 * @param {string} devEui  设备 DevEUI
 * @param {string} frame   10 个 ASCII 字符，例如 "0021000014"
 */
function sendDownlink(devEui, frame) {
    return new Promise((resolve, reject) => {
        if (!client || !client.connected) {
            reject(new Error('MQTT 未连接'));
            return;
        }

        const topic = `application/${config.mqtt.appId}/device/${devEui}/command/down`;
        const expiresAt = new Date(Date.now() + config.downlink.loraTtlSec * 1000).toISOString();
        const body = JSON.stringify({
            devEui,
            confirmed: false,
            fPort: 10,
            data: Buffer.from(frame, 'ascii').toString('base64'),
            expiresAt
        });

        client.publish(topic, body, { qos: 0 }, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = { start, sendDownlink };
