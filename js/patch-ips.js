/**
 * patch-ips.js
 * Motor de parcheo IPS (International Patching System)
 * Formato: https://zerosoft.zophar.net/ips.php
 *
 * Estructura:
 *   Header: "PATCH" (5 bytes)
 *   Records: [offset(3) | size(2) | data(size)] o RLE [offset(3) | 0x0000 | rle_size(2) | rle_byte(1)]
 *   Footer: "EOF" (3 bytes)
 *
 * También soporta IPS32 (offsets de 4 bytes).
 */

const PatchIPS = (() => {
    'use strict';

    const IPS_MAGIC = 'PATCH';
    const IPS_EOF = 'EOF';
    const IPS32_MAGIC = 'IPS32';
    const IPS32_EOF = 'EEOF';

    /**
     * Verifica si un archivo es un parche IPS válido
     */
    function isIPS(buffer) {
        if (buffer.byteLength < 8) return false;
        const view = new DataView(buffer);
        let magic = '';
        for (let i = 0; i < 5; i++) {
            magic += String.fromCharCode(view.getUint8(i));
        }
        return magic === IPS_MAGIC || magic === IPS32_MAGIC;
    }

    /**
     * Aplica un parche IPS al ROM
     * @param {ArrayBuffer} romBuffer - ROM original
     * @param {ArrayBuffer} patchBuffer - Parche IPS
     * @param {Function} onProgress - Callback de progreso (0-100)
     * @returns {ArrayBuffer} ROM parcheada
     */
    function apply(romBuffer, patchBuffer, onProgress) {
        const patch = new DataView(patchBuffer);
        const patchBytes = new Uint8Array(patchBuffer);

        // Detectar si es IPS o IPS32
        let magic = '';
        for (let i = 0; i < 5; i++) {
            magic += String.fromCharCode(patch.getUint8(i));
        }

        const isIPS32 = (magic === IPS32_MAGIC);
        const offsetSize = isIPS32 ? 4 : 3;
        const eofMark = isIPS32 ? IPS32_EOF : IPS_EOF;
        const eofLen = eofMark.length;

        // Calcular tamaño máximo necesario
        let maxSize = romBuffer.byteLength;
        let pos = 5; // Saltar magic

        // Primera pasada: calcular tamaño final necesario
        let tempPos = 5;
        while (tempPos + offsetSize <= patchBuffer.byteLength) {
            // Verificar EOF
            let eofCheck = '';
            for (let i = 0; i < eofLen && tempPos + i < patchBuffer.byteLength; i++) {
                eofCheck += String.fromCharCode(patch.getUint8(tempPos + i));
            }
            if (eofCheck === eofMark) break;

            const offset = isIPS32
                ? patch.getUint32(tempPos, false)
                : (patch.getUint8(tempPos) << 16) | (patch.getUint8(tempPos + 1) << 8) | patch.getUint8(tempPos + 2);
            tempPos += offsetSize;

            const size = patch.getUint16(tempPos, false);
            tempPos += 2;

            if (size === 0) {
                // RLE
                const rleSize = patch.getUint16(tempPos, false);
                tempPos += 2;
                tempPos += 1; // RLE byte
                const end = offset + rleSize;
                if (end > maxSize) maxSize = end;
            } else {
                const end = offset + size;
                if (end > maxSize) maxSize = end;
                tempPos += size;
            }
        }

        // Crear buffer de salida (puede ser más grande que el original)
        const output = new Uint8Array(maxSize);
        output.set(new Uint8Array(romBuffer));

        // Segunda pasada: aplicar parches
        pos = 5;
        let recordCount = 0;
        const totalPatchSize = patchBuffer.byteLength;

        while (pos + offsetSize <= patchBuffer.byteLength) {
            // Verificar EOF
            let eofCheck = '';
            for (let i = 0; i < eofLen && pos + i < patchBuffer.byteLength; i++) {
                eofCheck += String.fromCharCode(patch.getUint8(pos + i));
            }
            if (eofCheck === eofMark) break;

            // Leer offset
            const offset = isIPS32
                ? patch.getUint32(pos, false)
                : (patch.getUint8(pos) << 16) | (patch.getUint8(pos + 1) << 8) | patch.getUint8(pos + 2);
            pos += offsetSize;

            // Leer tamaño
            const size = patch.getUint16(pos, false);
            pos += 2;

            if (size === 0) {
                // Registro RLE
                const rleSize = patch.getUint16(pos, false);
                pos += 2;
                const rleByte = patch.getUint8(pos);
                pos += 1;

                for (let i = 0; i < rleSize; i++) {
                    output[offset + i] = rleByte;
                }
            } else {
                // Registro normal
                for (let i = 0; i < size; i++) {
                    output[offset + i] = patch.getUint8(pos + i);
                }
                pos += size;
            }

            recordCount++;

            // Reportar progreso
            if (onProgress && recordCount % 100 === 0) {
                onProgress(Math.min(95, Math.floor((pos / totalPatchSize) * 100)));
            }
        }

        if (onProgress) onProgress(100);

        return output.buffer;
    }

    /**
     * Obtiene información básica del parche IPS
     */
    function getInfo(buffer) {
        const view = new DataView(buffer);
        let magic = '';
        for (let i = 0; i < 5; i++) {
            magic += String.fromCharCode(view.getUint8(i));
        }

        return {
            format: magic === IPS32_MAGIC ? 'IPS32' : 'IPS',
            size: buffer.byteLength,
            isValid: magic === IPS_MAGIC || magic === IPS32_MAGIC
        };
    }

    return { isIPS, apply, getInfo };
})();
