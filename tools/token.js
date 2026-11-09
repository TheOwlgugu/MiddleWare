// tools/token.js —— 生成设备 token 和对应的 SHA-256
//
// 用法：node tools/token.js <deviceId> [name]
// 输出：明文 token（烧进设备）+ 可直接执行的 SQL
const crypto = require('crypto');

const id = Number(process.argv[2]);
const name = process.argv[3] || '';

if (!Number.isInteger(id) || id < 1 || id > 999) {
    console.error('用法: node tools/token.js <deviceId> [name]');
    process.exit(1);
}

const token = crypto.randomBytes(16).toString('hex');   // 32 位 hex
const hash  = crypto.createHash('sha256').update(token).digest('hex');

console.log('device_id :', id);
console.log('token     :', token, '   <-- 烧进设备 set:token=...');
console.log('token_hash:', hash);
console.log('');
console.log('-- 在 MySQL 里执行：');
console.log(`INSERT INTO devices (device_id, token_hash, name) VALUES (${id}, '${hash}', '${name}')
ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), name = VALUES(name), enabled = 1;`);
