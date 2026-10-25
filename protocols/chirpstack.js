// protocols/chirpstack.js —— LoRa 的 ChirpStack 上行业务报文
//
// 约定（与现有 Payload Codec 一致）：
//   object.value 与 ASCII 帧的 5 位字段同义，是"原始缩放值"，
//   例如温度 25.20℃ 传 value=2520，湿度 50.01% 传 value=5001，PM2.5 直接传 µg/m³。
//   换算统一放在 core/reading.js，这里只做字段提取，不做缩放。
//
// 这样做的原因：ChirpStack 的设备端编解码器不在本仓库，改动它需要同时升级设备，
// 所以先保持线上语义不变；将来 Codec 若改发工程值，只需要改这一个文件。

/**
 * @param {Buffer|string} payload  MQTT 消息体（ChirpStack uplink JSON）
 * @returns {{ok:true, deviceId:number, type:number, rawValue:number} | {ok:false, reason:string}}
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

    return { ok: true, deviceId, type, rawValue };
}

module.exports = { parsePayload };
