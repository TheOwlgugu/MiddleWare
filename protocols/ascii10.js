// protocols/ascii10.js —— WiFi/TCP 的 10 字节 ASCII 协议
// 帧：设备号(3) + 类型(2) + 数值(5) = 10 字符，数值允许负号（如 -0500 = -5.00℃）
// 只负责"字符串 → 统一字段"，不做缩放、不碰数据库。

const ID_RE   = /^\d{3}$/;
const TYPE_RE = /^\d{2}$/;
const VAL_RE  = /^-?\d{4,5}$/;

/**
 * @param {string} line  一行报文（已去掉 \r\n）
 * @returns {{ok:true, deviceId:number, type:number, rawValue:number} | {ok:false, reason:string}}
 */
function parseLine(line) {
    if (typeof line !== 'string') {
        return { ok: false, reason: '报文不是字符串' };
    }
    if (line.length !== 10) {
        return { ok: false, reason: `长度 ${line.length} 应为 10` };
    }

    const idPart   = line.slice(0, 3);
    const typePart = line.slice(3, 5);
    const valPart  = line.slice(5);

    if (!ID_RE.test(idPart))   return { ok: false, reason: `设备号不是 3 位数字: ${idPart}` };
    if (!TYPE_RE.test(typePart)) return { ok: false, reason: `类型不是 2 位数字: ${typePart}` };
    if (!VAL_RE.test(valPart)) return { ok: false, reason: `数值格式不对: ${valPart}` };

    return {
        ok: true,
        deviceId: Number(idPart),
        type: Number(typePart),
        rawValue: Number(valPart)
    };
}

module.exports = { parseLine };
