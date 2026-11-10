// test/status.test.js —— 设备状态：mode 补零、变化才写
const test = require('node:test');
const assert = require('node:assert');

const db = require('../infra/db');
const status = require('../core/status');

let calls = [];
db.query = async (sql, params) => { calls.push({ sql, params }); return []; };

test('mode 补零成 4 位', () => {
    assert.strictEqual(status.modeToString(2001), '2001');
    assert.strictEqual(status.modeToString(2), '0002');
    assert.strictEqual(status.modeToString(0), '0000');
    assert.strictEqual(status.modeToString(-1), null);
});

test('相同心跳不重复写库', async () => {
    status._reset();
    calls = [];
    await status.onHeartbeat(4, 2001);
    await status.onHeartbeat(4, 2001);
    assert.strictEqual(calls.length, 1);
});

test('模式变化写新行', async () => {
    status._reset();
    calls = [];
    await status.onHeartbeat(4, 2001);
    await status.onHeartbeat(4, 3002);
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[1].params[1], '3002');
});
