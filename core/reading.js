// core/reading.js —— 统一读数模型
// 所有协议（WiFi 10 字节 ASCII / LoRa ChirpStack JSON）解析后都收敛成这个结构，
// 下游的入库、推送、统计只认这一种格式。

/**
 * 传感器类型表：类型码（线上协议）→ 名称、单位、工程值范围、原始值缩放
 * scale = 原始值 / scale = 工程值（温度、湿度是 ×100 传的）
 */
const TYPES = {
    0: { key: 'light', name: '光照',  unit: '',      min: 0,   max: 1,    scale: 1   },
    1: { key: 'temp',  name: '温度',  unit: '°C',    min: -40, max: 125,  scale: 100 },
    2: { key: 'co2',   name: 'CO2',   unit: 'ppm',   min: 0,   max: 5000, scale: 1   },
    3: { key: 'humi',  name: '湿度',  unit: '%',     min: 0,   max: 100,  scale: 100 },
    4: { key: 'pm25',  name: 'PM2.5', unit: 'µg/m³', min: 0,   max: 1000, scale: 1   }
};

function round(value, digits) {
    const p = Math.pow(10, digits);
    return Math.round(value * p) / p;
}

/**
 * 原始值（协议里的整数）→ 统一读数
 * @param {{deviceId:number, type:number, rawValue:number, source:string, raw?:string}} input
 * @returns {{ok:true, reading:object} | {ok:false, reason:string}}
 */
function normalize({ deviceId, type, rawValue, source, raw }) {
    const meta = TYPES[type];
    if (!meta) {
        return { ok: false, reason: `未知传感器类型 ${type}` };
    }
    if (!Number.isInteger(deviceId) || deviceId < 1 || deviceId > 999) {
        return { ok: false, reason: `设备号越界 ${deviceId}` };
    }
    if (!Number.isFinite(rawValue)) {
        return { ok: false, reason: `数值不是数字 ${rawValue}` };
    }

    const value = round(rawValue / meta.scale, 2);

    if (value < meta.min || value > meta.max) {
        return { ok: false, reason: `${meta.name} 超范围 ${value}${meta.unit}` };
    }

    return {
        ok: true,
        reading: {
            deviceId,
            type,
            key: meta.key,
            name: meta.name,
            value,
            unit: meta.unit,
            source,
            raw: raw === undefined ? null : raw,
            timestamp: Date.now()
        }
    };
}

module.exports = { TYPES, normalize };
