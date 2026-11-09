// test/auth.test.js —— 设备 AUTH 校验
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const auth = require('../core/auth');

const TOKEN = 'a'.repeat(32);
const HASH  = crypto.createHash('sha256').update(TOKEN).digest('hex');

function seed(id) {
    auth._cache.set(id, { hash: HASH, at: Date.now() });
}

test('认证：token 正确通过', async () => {
    seed(4);
    assert.strictEqual(await auth.verify(4, TOKEN), true);
});

test('认证：token 错误拒绝', async () => {
    seed(4);
    assert.strictEqual(await auth.verify(4, 'b'.repeat(32)), false);
});

test('认证：格式错误直接拒绝', async () => {
    const r = await auth.handleLine('AUTH,4,xyz');
    assert.strictEqual(r.ok, false);
});

test('认证：通过返回设备号', async () => {
    seed(4);
    const r = await auth.handleLine(`AUTH,4,${TOKEN}`);
    assert.deepStrictEqual(r, { ok: true, deviceId: 4 });
});
