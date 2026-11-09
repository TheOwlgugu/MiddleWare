// test/registry.test.js —— 设备路由表
const test = require('node:test');
const assert = require('node:assert');

const registry = require('../infra/registry');

test('WiFi 路由跟着 socket 生命周期，不按时间过期', () => {
    const socket = { destroyed: false };
    registry.bindWifi(1, socket);

    assert.ok(registry.get(1), '连接正常时应能取到');

    socket.destroyed = true;
    assert.strictEqual(registry.get(1), null, 'socket 断开后应移除');
});

test('LoRa 路由按 devEui 登记', () => {
    registry.bindLora(2, '1d4517b623310c87');
    const r = registry.get(2);
    assert.ok(r);
    assert.strictEqual(r.transport, 'lora');
    assert.strictEqual(r.devEui, '1d4517b623310c87');
});

test('未知设备返回 null', () => {
    assert.strictEqual(registry.get(999), null);
});
