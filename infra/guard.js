// infra/guard.js —— 认证失败限流：按"通道 + IP"计数，超阈值临时封禁
//
// 通道（scope）分开，避免 Unity 输错 token 把同一出口 IP 的设备也封掉。
const log = require('./logger');
const config = require('../config');

const map = new Map();   // "scope:ip" -> { scope, ip, count, firstAt, bannedUntil }

function now() { return Date.now(); }
function k(scope, ip) { return `${scope}:${ip}`; }

function isBanned(scope, ip) {
    const e = map.get(k(scope, ip));
    if (!e) return false;

    if (e.bannedUntil && e.bannedUntil > now()) return true;

    if (e.bannedUntil && e.bannedUntil <= now()) {
        map.delete(k(scope, ip));
        log.info('【防护】封禁到期，放行', { scope, ip });
    }
    return false;
}

function fail(scope, ip) {
    const key = k(scope, ip);
    let e = map.get(key);

    if (!e || now() - e.firstAt > config.AUTH_WINDOW_MS) {
        e = { scope, ip, count: 0, firstAt: now(), bannedUntil: 0 };
        map.set(key, e);
    }

    e.count++;

    if (e.count >= config.AUTH_MAX_FAILS && !e.bannedUntil) {
        e.bannedUntil = now() + config.AUTH_BAN_MS;
        log.warn('【防护】IP 已封禁', {
            scope,
            ip,
            fails: e.count,
            banSec: Math.round(config.AUTH_BAN_MS / 1000)
        });
    }
}

function ok(scope, ip) {
    map.delete(k(scope, ip));
}

function snapshot() {
    return [...map.values()].map(e => ({ ...e }));
}

function reset() { map.clear(); }

module.exports = { isBanned, fail, ok, snapshot, reset };
