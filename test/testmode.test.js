// test/testmode.test.js —— 网络测试帧：归一化、缺口检测、ACK 下发
const test = require('node:test');
const assert = require('node:assert');

const tm = require('../core/testmode');
const { normalize } = require('../core/reading');

test('测试帧归一化：类型 98，不入库不广播', () => {
    const res = normalize({ deviceId: 4, type: 98, rawValue: 42, source: 'WiFi' });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.reading.key, 'test');
    assert.strictEqual(res.reading.value, 42);
    assert.strictEqual(res.reading.store, false);
    assert.strictEqual(res.reading.broadcast, false);
});

test('缺口检测：连续序号', () => {
    tm.reset();
    assert.deepStrictEqual(tm.track(4, 0), { duplicate: false, gap: 0 });
    assert.deepStrictEqual(tm.track(4, 1), { duplicate: false, gap: 0 });
    assert.deepStrictEqual(tm.track(4, 2), { duplicate: false, gap: 0 });
});

test('缺口检测：发现中间缺帧', () => {
    tm.reset();
    tm.track(4, 0);
    tm.track(4, 1);
    assert.strictEqual(tm.track(4, 4).gap, 2);   // 缺 2、3
});

test('缺口检测：99999 -> 0 回绕', () => {
    tm.reset();
    tm.track(4, 99998);
    tm.track(4, 99999);
    assert.strictEqual(tm.track(4, 0).gap, 0);
    assert.strictEqual(tm.track(4, 1).gap, 0);
});

test('重复帧不重复计数', () => {
    tm.reset();
    tm.track(4, 7);
    assert.deepStrictEqual(tm.track(4, 7), { duplicate: true, gap: 0 });
});

test('收到测试帧后回 ACK：port 4、code = 序号', async () => {
    tm.reset();
    const downlink = require('../core/downlink');
    const orig = downlink.send;
    let sent = null;
    downlink.send = async (cmd) => { sent = cmd; return { ok: true }; };
    try {
        await tm.handle({ deviceId: 4, value: 7 });
        assert.deepStrictEqual(sent, { deviceId: 4, port: 4, code: 7 });
    } finally {
        downlink.send = orig;
    }
});
