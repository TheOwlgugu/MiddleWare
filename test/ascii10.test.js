// test/ascii10.test.js —— WiFi 10 字节 ASCII 协议解析
const test = require('node:test');
const assert = require('node:assert');
const { parseLine } = require('../protocols/ascii10');

test('正常帧：0010102520 → 设备1 温度2520', () => {
    const r = parseLine('0010102520');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual({ deviceId: r.deviceId, type: r.type, rawValue: r.rawValue }, { deviceId: 1, type: 1, rawValue: 2520 });
});

test('负数：00101-0500 → 温度 -500（-5.00℃）', () => {
    const r = parseLine('00101-0500');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.rawValue, -500);
});

test('前导零：0100000007 → 设备10 光照7', () => {
    const r = parseLine('0100000007');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual({ deviceId: r.deviceId, type: r.type, rawValue: r.rawValue }, { deviceId: 10, type: 0, rawValue: 7 });
});

test('长度不对被拒绝', () => {
    assert.strictEqual(parseLine('001010252').ok, false);
    assert.strictEqual(parseLine('00101025200').ok, false);
});

test('非数字被拒绝', () => {
    assert.strictEqual(parseLine('00A0102520').ok, false);
    assert.strictEqual(parseLine('0010X02520').ok, false);
});

test('空行被拒绝', () => {
    assert.strictEqual(parseLine('').ok, false);
});
