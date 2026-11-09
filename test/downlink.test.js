// test/downlink.test.js —— 下行帧编码与参数校验
const test = require('node:test');
const assert = require('node:assert');

const { buildFrame, validate } = require('../core/downlink');

test('下行帧：设备号(3) + 端口(1) + 指令(5) + 校验(1)', () => {
    // 002 + 1 + 00001 + 4
    assert.strictEqual(buildFrame(2, 1, 1), '0021000014');
    // 003 + 3 + 99999 + F
    assert.strictEqual(buildFrame(3, 3, 99999), '003399999F');
    assert.strictEqual(buildFrame(2, 1, 1).length, 10);
});

test('下行参数校验', () => {
    assert.strictEqual(validate({ deviceId: 2, port: 1, code: 99999 }), null);
    assert.match(validate({ deviceId: 2, port: 1, code: 100000 }), /99999/);
    assert.match(validate({ deviceId: 0, port: 1, code: 1 }), /deviceId/);
    assert.match(validate({ deviceId: 2, port: 5, code: 1 }), /port/);
    assert.strictEqual(validate({ deviceId: 2, port: 4, code: 1 }), null);
});

test('心跳类型只刷新路由，不入库不广播', () => {
    const { normalize } = require('../core/reading');
    const res = normalize({ deviceId: 2, type: 99, rawValue: 0, source: 'LoRa' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.reading.key, 'hello');
    assert.strictEqual(res.reading.store, false);
    assert.strictEqual(res.reading.broadcast, false);

    // 普通读数仍然入库、广播
    const temp = normalize({ deviceId: 2, type: 1, rawValue: 2457, source: 'LoRa' });
    assert.strictEqual(temp.reading.store, true);
    assert.strictEqual(temp.reading.broadcast, true);
    assert.strictEqual(temp.reading.value, 24.57);
});
