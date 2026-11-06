const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
}

/**
 * CRC-32 as PNG and ZIP use it. Pass the result of a previous call as `previous` to continue over the next
 * piece: `crc32(b, crc32(a))` equals `crc32` of `a` followed by `b`.
 * CRC-32 в том виде, как его используют PNG и ZIP. Результат прошлого вызова в `previous` продолжает счёт по
 * следующему куску: `crc32(b, crc32(a))` равен `crc32` от `a`, за которым идёт `b`.
 */
export function crc32(data: Uint8Array, previous = 0): number {
    let c = (previous ^ 0xffffffff) >>> 0;
    for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]!) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
