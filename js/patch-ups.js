/**
 * patch-ups.js
 * Motor de parcheo UPS (Universal Patching System)
 *
 * Estructura:
 *   Header: "UPS1" (4 bytes)
 *   Input file size (variable-length encoded)
 *   Output file size (variable-length encoded)
 *   XOR differences: [relative_offset(VLE) | data... | 0x00]
 *   CRC32 input ROM (4 bytes)
 *   CRC32 output ROM (4 bytes)
 *   CRC32 patch (4 bytes)
 */

const PatchUPS = (() => {
    'use strict';

    const UPS_MAGIC = 'UPS1';

    /**
     * Verifica si es un parche UPS
     */
    function isUPS(buffer) {
        if (buffer.byteLength < 8) return false;
        const view = new DataView(buffer);
        let magic = '';
        for (let i = 0; i < 4; i++) {
            magic += String.fromCharCode(view.getUint8(i));
        }
        return magic === UPS_MAGIC;
    }

    /**
     * Decodifica un entero de longitud variable (VLE)
     * UPS usa una codificación donde cada byte tiene 7 bits de datos
     * y el bit más significativo indica si hay más bytes.
     */
    function decodeVLE(view, offset) {
        let value = 0;
        let shift = 0;
        let pos = offset;

        while (true) {
            const byte = view.getUint8(pos);
            pos++;
            value += (byte & 0x7F) << shift;
            if (byte & 0x80) {
                value += (1 << (shift + 7));
                break;
            }
            shift += 7;
        }

        return { value, bytesRead: pos - offset };
    }

    /**
     * Calcula CRC32 de un Uint8Array
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
     * Aplica un parche UPS
     * @param {ArrayBuffer} romBuffer - ROM original
     * @param {ArrayBuffer} patchBuffer - Parche UPS
     * @param {Function} onProgress - Callback de progreso
     * @returns {ArrayBuffer} ROM parcheada
     */
    function apply(romBuffer, patchBuffer, onProgress) {
        const patch = new DataView(patchBuffer);
        const patchBytes = new Uint8Array(patchBuffer);
        let pos = 4; // Saltar "UPS1"

        // Leer tamaños
        const inputSize = decodeVLE(patch, pos);
        pos += inputSize.bytesRead;

        const outputSize = decodeVLE(patch, pos);
        pos += outputSize.bytesRead;

        // Los últimos 12 bytes son CRC32 (input, output, patch)
        const dataEnd = patchBuffer.byteLength - 12;

        const inputCRC = patch.getUint32(dataEnd, true);
        const outputCRC = patch.getUint32(dataEnd + 4, true);
        const patchCRC = patch.getUint32(dataEnd + 8, true);

        // Verificar CRC32 del parche (excluyendo los últimos 4 bytes del CRC del parche mismo)
        const patchDataForCRC = new Uint8Array(patchBuffer, 0, patchBuffer.byteLength - 4);
        const calculatedPatchCRC = crc32(patchDataForCRC);
        if (calculatedPatchCRC !== patchCRC) {
            throw new Error(`CRC32 del parche no coincide. Esperado: ${patchCRC.toString(16)}, Calculado: ${calculatedPatchCRC.toString(16)}`);
        }

        // Verificar CRC32 de la ROM de entrada
        const romBytes = new Uint8Array(romBuffer);
        const calculatedInputCRC = crc32(romBytes);
        if (calculatedInputCRC !== inputCRC) {
            console.warn(`Advertencia: CRC32 de la ROM no coincide. Esperado: ${inputCRC.toString(16)}, Calculado: ${calculatedInputCRC.toString(16)}`);
            // No lanzar error, solo advertir
        }

        // Crear buffer de salida
        const output = new Uint8Array(outputSize.value);
        // Copiar ROM original
        const copyLen = Math.min(romBuffer.byteLength, outputSize.value);
        output.set(new Uint8Array(romBuffer, 0, copyLen));

        // Aplicar XOR diffs
        let romOffset = 0;
        const totalData = dataEnd;

        while (pos < dataEnd) {
            const relOffset = decodeVLE(patch, pos);
            pos += relOffset.bytesRead;
            romOffset += relOffset.value;

            // Aplicar XOR hasta encontrar 0x00
            while (pos < dataEnd) {
                const xorByte = patch.getUint8(pos);
                pos++;

                if (xorByte === 0x00) {
                    romOffset++;
                    break;
                }

                // XOR con el byte original (o 0 si está fuera del rango original)
                const originalByte = romOffset < romBytes.length ? romBytes[romOffset] : 0x00;
                output[romOffset] = originalByte ^ xorByte;
                romOffset++;
            }

            if (onProgress) {
                onProgress(Math.min(95, Math.floor((pos / totalData) * 100)));
            }
        }

        // Verificar CRC32 de la salida
        const calculatedOutputCRC = crc32(output);
        if (calculatedOutputCRC !== outputCRC) {
            console.warn(`Advertencia: CRC32 de salida no coincide. Esperado: ${outputCRC.toString(16)}, Calculado: ${calculatedOutputCRC.toString(16)}`);
        }

        if (onProgress) onProgress(100);

        return output.buffer;
    }

    /**
     * Info del parche UPS
     */
    function getInfo(buffer) {
        if (!isUPS(buffer)) return { format: 'UPS', isValid: false };

        const view = new DataView(buffer);
        let pos = 4;
        const inputSize = decodeVLE(view, pos);
        pos += inputSize.bytesRead;
        const outputSize = decodeVLE(view, pos);

        return {
            format: 'UPS',
            size: buffer.byteLength,
            inputSize: inputSize.value,
            outputSize: outputSize.value,
            isValid: true
        };
    }

    return { isUPS, apply, getInfo };
})();
