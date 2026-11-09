// protocols/chirpstack.js —— LoRa 的 ChirpStack 上行业务报文
//
// 约定（与现有 Payload Codec 一致）：
//   object.value 与 ASCII 帧的 5 位字段同义，是"原始缩放值"，
//   例如温度 25.20℃ 传 value=2520，湿度 50.01% 传 value=5001，PM2.5 直接传 µg/m³。
//   换算统一放在 core/reading.js，这里只做字段提取，不做缩放。
//
// 额外返回 devEui：下行路由需要它（deviceId → devEui → ChirpStack 命令 topic）。

/**
 * @param {Buffer|string} payload  MQTT 消息体（ChirpStack uplink JSON）
 * @returns {{ok:true, deviceId:number, type:number, rawValue:number, devEui:string|null} | {ok:false, reason:string}}
 */
function parsePayload(payload) {
    let json;
    try {
        json = JSON.parse(payload.toString());
    } catch (err) {
        return { ok: false, reason: `JSON 解析失败: ${err.message}` };
    }

    const obj = json.object;
    if (!obj) {
        return { ok: false, reason: '报文里没有 object 字段（检查 ChirpStack Payload Codec）' };
    }

    const deviceId = Number(obj.deviceId);
    const type     = Number(obj.dataType);
    const rawValue = Number(obj.value);

    if (!Number.isFinite(deviceId) || !Number.isFinite(type) || !Number.isFinite(rawValue)) {
        return { ok: false, reason: `object 字段不是数字: ${JSON.stringify(obj)}` };
    }

    const devEui = json.deviceInfo && json.deviceInfo.devEui ? json.deviceInfo.devEui : null;

    return { ok: true, deviceId, type, rawValue, devEui };
}

module.exports = { parsePayload };
