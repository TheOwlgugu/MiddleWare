// test/toggle.test.js —— .env 的 MQTT_ENABLED 切换
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { readEnabled, setEnabled, isOn } = require('../toggle-mqtt');

test('开关判断', () => {
    assert.strictEqual(isOn('1'), true);
    assert.strictEqual(isOn('0'), false);
    assert.strictEqual(isOn('off'), false);
    assert.strictEqual(isOn(''), true);
});

test('写入并读取，保留其他行', () => {
    const file = path.join(os.tmpdir(), `mw-env-${Date.now()}.env`);
    fs.writeFileSync(file, 'DB_USER=root\nMQTT_ENABLED=1\nDB_NAME=sensor_data\n');

    setEnabled('0', file);
    assert.strictEqual(readEnabled(file), '0');
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /DB_USER=root/);
    assert.match(text, /DB_NAME=sensor_data/);

    setEnabled('1', file);
    assert.strictEqual(readEnabled(file), '1');

    fs.unlinkSync(file);
});

test('缺少键时追加', () => {
    const file = path.join(os.tmpdir(), `mw-env-${Date.now()}-2.env`);
    fs.writeFileSync(file, 'DB_USER=root\n');

    setEnabled('0', file);
    assert.strictEqual(readEnabled(file), '0');

    fs.unlinkSync(file);
});
