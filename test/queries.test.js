// test/queries.test.js —— 命名查询的参数校验与结果映射
const test = require('node:test');
const assert = require('node:assert');

const db = require('../infra/db');
const queries = require('../core/queries');

let sent = [];
const ws = { readyState: 1, send: s => sent.push(JSON.parse(s)) };

function stub(rows) { db.query = async () => rows; }

test('latest：返回映射后的 items', async () => {
    sent = [];
    stub([{ id: 1, deviceId: 3, dataType: 1, value: 20.65, time: 1794046821000 }]);

    await queries.handle(ws, {
        kind: 'query', requestId: 'q1', name: 'latest',
        params: { deviceId: 3, dataType: 1, limit: 10 }
    });

    assert.strictEqual(sent[0].ok, true);
    assert.strictEqual(sent[0].requestId, 'q1');
    assert.deepStrictEqual(sent[0].items[0], {
        id: 1, deviceId: 3, dataType: 1, value: 20.65, time: 1794046821000
    });
});

test('latest：参数非法返回 ok=false', async () => {
    sent = [];
    await queries.handle(ws, {
        kind: 'query', requestId: 'q2', name: 'latest',
        params: { deviceId: 3, dataType: 1, limit: 0 }
    });
    assert.strictEqual(sent[0].ok, false);
    assert.match(sent[0].error, /limit/);
});

test('status：0009 离线，其他在线，无记录离线', async () => {
    sent = [];
    stub([{ work: '2001' }]);
    await queries.handle(ws, { kind: 'query', requestId: 's1', name: 'status', params: { deviceId: 3 } });
    assert.strictEqual(sent[0].online, true);

    sent = [];
    stub([{ work: '0009' }]);
    await queries.handle(ws, { kind: 'query', requestId: 's2', name: 'status', params: { deviceId: 3 } });
    assert.strictEqual(sent[0].online, false);

    sent = [];
    stub([]);
    await queries.handle(ws, { kind: 'query', requestId: 's3', name: 'status', params: { deviceId: 3 } });
    assert.strictEqual(sent[0].online, false);
});

test('history：时间范围校验', async () => {
    sent = [];
    await queries.handle(ws, {
        kind: 'query', requestId: 'h1', name: 'history',
        params: { deviceId: 3, dataType: 1, start: 2000, end: 1000 }
    });
    assert.strictEqual(sent[0].ok, false);
    assert.match(sent[0].error, /start/);
});

test('未知查询返回错误', async () => {
    sent = [];
    await queries.handle(ws, { kind: 'query', requestId: 'x', name: 'drop', params: {} });
    assert.strictEqual(sent[0].ok, false);
    assert.match(sent[0].error, /未知查询/);
});
