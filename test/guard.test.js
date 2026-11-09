// test/guard.test.js —— 认证失败限流
const test = require('node:test');
const assert = require('node:assert');

const guard = require('../infra/guard');
const config = require('../config');

test('未失败不封禁', () => {
    guard.reset();
    assert.strictEqual(guard.isBanned('ws', '1.2.3.4'), false);
});

test('达到阈值后封禁', () => {
    guard.reset();
    for (let i = 0; i < config.AUTH_MAX_FAILS; i++) guard.fail('ws', '1.2.3.4');
    assert.strictEqual(guard.isBanned('ws', '1.2.3.4'), true);
    assert.strictEqual(guard.isBanned('ws', '5.6.7.8'), false);
});

test('通道隔离：ws 被封不影响 tcp', () => {
    guard.reset();
    for (let i = 0; i < config.AUTH_MAX_FAILS; i++) guard.fail('ws', '9.9.9.9');
    assert.strictEqual(guard.isBanned('ws', '9.9.9.9'), true);
    assert.strictEqual(guard.isBanned('tcp', '9.9.9.9'), false);
});

test('认证成功后清除计数', () => {
    guard.reset();
    guard.fail('ws', '5.6.7.8');
    guard.ok('ws', '5.6.7.8');
    assert.strictEqual(guard.isBanned('ws', '5.6.7.8'), false);
});
