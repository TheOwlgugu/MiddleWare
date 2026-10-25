// test/reading.test.js —— 统一读数模型（缩放 / 范围 / 设备号）
const test = require('node:test');
const assert = require('node:assert');
const { normalize, TYPES } = require('../core/reading');

test('温度缩放：2520 → 25.20℃', () => {
    const r = normalize({ deviceId: 1, type: 1, rawValue: 2520, source: 'WiFi' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.reading.value, 25.2);
    assert.strictEqual(r.reading.unit, '°C');
    assert.strictEqual(r.reading.key, 'temp');
});

test('湿度缩放：5001 → 50.01%', () => {
    const r = normalize({ deviceId: 1, type: 3, rawValue: 5001, source: 'WiFi' });
    assert.strictEqual(r.reading.value, 50.01);
});

test('负温度：-500 → -5.00℃', () => {
    const r = normalize({ deviceId: 1, type: 1, rawValue: -500, source: 'LoRa' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.reading.value, -5);
});

test('PM2.5 原值不缩放', () => {
    const r = normalize({ deviceId: 1, type: 4, rawValue: 35, source: 'WiFi' });
    assert.strictEqual(r.reading.value, 35);
    assert.strictEqual(r.reading.unit, 'µg/m³');
});

test('未知类型被拒绝', () => {
    const r = normalize({ deviceId: 1, type: 9, rawValue: 1, source: 'WiFi' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /未知/);
});

test('超范围被拒绝：温度 200.00℃', () => {
    const r = normalize({ deviceId: 1, type: 1, rawValue: 20000, source: 'WiFi' });
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /超范围/);
});

test('设备号越界被拒绝', () => {
    assert.strictEqual(normalize({ deviceId: 0,   type: 1, rawValue: 100, source: 'WiFi' }).ok, false);
    assert.strictEqual(normalize({ deviceId: 1000, type: 1, rawValue: 100, source: 'WiFi' }).ok, false);
});

test('类型表覆盖 0-4', () => {
    assert.deepStrictEqual(Object.keys(TYPES), ['0', '1', '2', '3', '4']);
});
