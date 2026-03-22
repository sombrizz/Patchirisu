/**
 * patch-bps.js
 * Motor de parcheo BPS (Binary Patching System)
 *
 * Estructura:
 *   Header: "BPS1" (4 bytes)
 *   Source size (VLE)
 *   Target size (VLE)
 *   Metadata size (VLE) + metadata
 *   Actions: [data(VLE) encodedAction | ...]
 *     Action types (bits 0-1):
 *       0 = SourceRead
 *       1 = TargetRead (inline data)
 *       2 = SourceCopy (relative offset)
 *       3 = TargetCopy (relative offset)
 *   CRC32 source (4 bytes)
 *   CRC32 target (4 bytes)
 *   CRC32 patch (4 bytes)
 */

const PatchBPS = (() => {
    'use strict';

    const BPS_MAGIC = 'BPS1';

    function isBPS(buffer) {
        if (buffer.byteLength < 8) return false;
        const view = new DataView(buffer);
        let magic = '';
        for (let i = 0; i < 4; i++) {
            magic += String.fromCharCode(view.getUint8(i));
        }
        return magic === BPS_MAGIC;
    }

    /**
     * Decodifica entero VLE de BPS
     * Cada byte: 7 bits de datos, bit 7 = flag de fin
     */
    function decodeVLE(bytes, offset) {
        let value = 0;
        let shift = 1;
        let pos = offset;

        while (true) {
            const byte = bytes[pos];
            pos++;
            value += (byte & 0x7F) * shift;
            if (byte & 0x80) break;
            shift <<= 7;
            value += shift;
        }

        return { value, bytesRead: pos - offset };
    }

    /**
     * CRC32
     */
    function crc32(data) {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c;
        }
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < data.length; i++) {
            crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    /**
     * Aplica un parche BPS
     */
    function apply(romBuffer, patchBuffer, onProgress) {
        const patchBytes = new Uint8Array(patchBuffer);
        const source = new Uint8Array(romBuffer);
        let pos = 4; // Saltar "BPS1"

        // Leer tamaños
        const srcSize = decodeVLE(patchBytes, pos);
        pos += srcSize.bytesRead;

        const tgtSize = decodeVLE(patchBytes, pos);
        pos += tgtSize.bytesRead;

        const metaSize = decodeVLE(patchBytes, pos);
        pos += metaSize.bytesRead;

        // Saltar metadata
        pos += metaSize.value;

        // Los últimos 12 bytes son CRC32s
        const dataEnd = patchBuffer.byteLength - 12;
        const view = new DataView(patchBuffer);
        const sourceCRC = view.getUint32(dataEnd, true);
        const targetCRC = view.getUint32(dataEnd + 4, true);
        const patchCRC = view.getUint32(dataEnd + 8, true);

        // Verificar CRC del parche
        const patchForCRC = new Uint8Array(patchBuffer, 0, patchBuffer.byteLength - 4);
        const calcPatchCRC = crc32(patchForCRC);
        if (calcPatchCRC !== patchCRC) {
            throw new Error(`CRC32 del parche BPS no coincide. Esperado: ${patchCRC.toString(16)}, Calculado: ${calcPatchCRC.toString(16)}`);
        }

        // Verificar CRC de la fuente
        const calcSourceCRC = crc32(source);
        if (calcSourceCRC !== sourceCRC) {
            console.warn(`Advertencia BPS: CRC32 de ROM fuente no coincide. Esperado: ${sourceCRC.toString(16)}, Calculado: ${calcSourceCRC.toString(16)}`);
        }

        // Crear buffer de salida
        const target = new Uint8Array(tgtSize.value);
        let targetOffset = 0;
        let sourceRelOffset = 0;
        let targetRelOffset = 0;

        let actionCount = 0;

        while (pos < dataEnd) {
            const data = decodeVLE(patchBytes, pos);
            pos += data.bytesRead;

            const action = data.value & 3;
            const length = (data.value >> 2) + 1;

            switch (action) {
                case 0: // SourceRead
                    for (let i = 0; i < length; i++) {
                        target[targetOffset] = source[targetOffset] || 0;
                        targetOffset++;
                    }
                    break;

                case 1: // TargetRead
                    for (let i = 0; i < length; i++) {
                        target[targetOffset] = patchBytes[pos];
                        pos++;
                        targetOffset++;
                    }
                    break;

                case 2: { // SourceCopy
                    const offsetData = decodeVLE(patchBytes, pos);
                    pos += offsetData.bytesRead;
                    const sign = offsetData.value & 1;
                    const absOffset = offsetData.value >> 1;
                    sourceRelOffset += sign ? -absOffset : absOffset;

                    for (let i = 0; i < length; i++) {
                        target[targetOffset] = source[sourceRelOffset] || 0;
                        targetOffset++;
                        sourceRelOffset++;
                    }
                    break;
                }

                case 3: { // TargetCopy
                    const offsetData = decodeVLE(patchBytes, pos);
                    pos += offsetData.bytesRead;
                    const sign = offsetData.value & 1;
                    const absOffset = offsetData.value >> 1;
                    targetRelOffset += sign ? -absOffset : absOffset;

                    for (let i = 0; i < length; i++) {
                        target[targetOffset] = target[targetRelOffset];
                        targetOffset++;
                        targetRelOffset++;
                    }
                    break;
                }
            }

            actionCount++;
            if (onProgress && actionCount % 500 === 0) {
                onProgress(Math.min(95, Math.floor((pos / dataEnd) * 100)));
            }
        }

        // Verificar CRC de salida
        const calcTargetCRC = crc32(target);
        if (calcTargetCRC !== targetCRC) {
            console.warn(`Advertencia BPS: CRC32 de salida no coincide. Esperado: ${targetCRC.toString(16)}, Calculado: ${calcTargetCRC.toString(16)}`);
        }

        if (onProgress) onProgress(100);
        return target.buffer;
    }

    function getInfo(buffer) {
        if (!isBPS(buffer)) return { format: 'BPS', isValid: false };

        const bytes = new Uint8Array(buffer);
        let pos = 4;
        const srcSize = decodeVLE(bytes, pos);
        pos += srcSize.bytesRead;
        const tgtSize = decodeVLE(bytes, pos);

        return {
            format: 'BPS',
            size: buffer.byteLength,
            sourceSize: srcSize.value,
            targetSize: tgtSize.value,
            isValid: true
        };
    }

    return { isBPS, apply, getInfo };
})();
