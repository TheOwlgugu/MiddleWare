// infra/db.js —— MySQL 存储
const mysql = require('mysql2/promise');
const config = require('../config');
const log = require('./logger');

const pool = mysql.createPool(config.db);

/**
 * 写入一条读数
 * @returns {Promise<boolean>} 成功 true，失败 false（不抛异常，避免拖垮调用方）
 */
async function saveReading(deviceId, dataType, value) {
    try {
        await pool.execute(
            'INSERT INTO readings (device_id, data_type, value) VALUES (?, ?, ?)',
            [deviceId, dataType, value]
        );
        return true;
    } catch (err) {
        log.error('数据库写入失败', { message: err.message, deviceId, dataType });
        return false;
    }
}

/**
 * 清理一周前的旧数据
 */
async function cleanOldData() {
    try {
        const [result] = await pool.execute(
            'DELETE FROM readings WHERE recorded_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
        );
        if (result.affectedRows > 0) {
            log.info('清理旧数据', { deleted: result.affectedRows });
        }
    } catch (err) {
        log.error('清理失败', { message: err.message });
    }
}

/**
 * 通用查询（HTTP API 用）
 */
async function query(sql, params) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

/**
 * 健康检查（带超时）
 */
async function ping(timeoutMs = 800) {
    try {
        await Promise.race([
            pool.query('SELECT 1'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('db ping timeout')), timeoutMs))
        ]);
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { pool, saveReading, cleanOldData, query, ping };
