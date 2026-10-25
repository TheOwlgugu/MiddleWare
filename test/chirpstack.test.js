// test/chirpstack.test.js —— LoRa/ChirpStack 报文解析
const test = require('node:test');
const assert = require('node:assert');
const { parsePayload } = require('../protocols/chirpstack');

function up(object) {
    return Buffer.from(JSON.stringify({ deviceInfo: { devEui: 'x' }, object }));
}

test('正常 object', () => {
    const r = parsePayload(up({ deviceId: 1, dataType: 1, value: 2520 }));
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual({ deviceId: r.deviceId, type: r.type, rawValue: r.rawValue }, { deviceId: 1, type: 1, rawValue: 2520 });
});

test('负温度：value=-500 不再被拼串破坏', () => {
    const r = parsePayload(up({ deviceId: 1, dataType: 1, value: -500 }));
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.rawValue, -500);
});

test('没有 object 字段被拒绝', () => {
    const r = parsePayload(Buffer.from(JSON.stringify({ deviceInfo: {} })));
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /object/);
});

test('字段不是数字被拒绝', () => {
    const r = parsePayload(up({ deviceId: 'x', dataType: 1, value: 1 }));
    assert.strictEqual(r.ok, false);
});

test('非法 JSON 被拒绝', () => {
    const r = parsePayload(Buffer.from('{not json'));
    assert.strictEqual(r.ok, false);
    assert.match(r.reason, /JSON/);
});
