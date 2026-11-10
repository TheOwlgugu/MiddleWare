#!/usr/bin/env node
// toggle-mqtt.js —— 在服务器上直接切换 .env 里的 MQTT_ENABLED
//
// 用法：
//   node toggle-mqtt.js status   # 查看当前值
//   node toggle-mqtt.js on       # 开启（下次启动生效）
//   node toggle-mqtt.js off      # 关闭（下次启动生效）
//   node toggle-mqtt.js toggle   # 反转
const fs = require('fs');
const path = require('path');

const ENV = path.join(__dirname, '.env');
const KEY = 'MQTT_ENABLED';

function readEnabled(file = ENV) {
    if (!fs.existsSync(file)) return null;
    const text = fs.readFileSync(file, 'utf8');
    const m = new RegExp(`^${KEY}\s*=\s*(.*)$`, 'm').exec(text);
    return m ? m[1].trim() : null;
}

function setEnabled(value, file = ENV) {
    if (!fs.existsSync(file)) {
        throw new Error('.env 不存在，先执行 cp .env.example .env 并填写');
    }

    const text = fs.readFileSync(file, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    let found = false;

    const out = lines.map(line => {
        if (new RegExp(`^${KEY}\\s*=`).test(line)) {
            found = true;
            return `${KEY}=${value}`;
        }
        return line;
    });

    if (!found) out.push(`${KEY}=${value}`);

    fs.writeFileSync(file, out.join(eol));
}

function isOn(v) {
    return !['0', 'false', 'off', 'no', 'disabled'].includes(String(v || '').trim().toLowerCase());
}

function show() {
    const v = readEnabled();
    if (v === null) {
        console.log(`${KEY} 未配置（默认开启）`);
    } else {
        console.log(`${KEY}=${v}  →  ${isOn(v) ? '开启' : '关闭'}`);
    }
}

if (require.main === module) {
    const arg = (process.argv[2] || 'status').toLowerCase();

    try {
        if (arg === 'status' || arg === '') {
            show();
        } else if (arg === 'on' || arg === '1' || arg === 'enable') {
            setEnabled('1');
            show();
            console.log('重启后生效：sudo systemctl restart iot-middleware');
        } else if (arg === 'off' || arg === '0' || arg === 'disable') {
            setEnabled('0');
            show();
            console.log('重启后生效：sudo systemctl restart iot-middleware');
        } else if (arg === 'toggle') {
            setEnabled(isOn(readEnabled()) ? '0' : '1');
            show();
            console.log('重启后生效：sudo systemctl restart iot-middleware');
        } else {
            console.log('用法: node toggle-mqtt.js status|on|off|toggle');
            process.exit(1);
        }
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}

module.exports = { readEnabled, setEnabled, isOn };
