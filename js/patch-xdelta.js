/**
 * patch-xdelta.js
 * Decodificador VCDIFF / XDELTA3 puro en JavaScript
 * Implementa RFC 3284 (VCDIFF) para descomprimir parches xdelta3.
 *
 * Estructura VCDIFF:
 *   Magic: 0xD6 0xC3 0xC4 0x00
 *   Header indicator byte
 *   [Secondary compressor ID]
 *   [Code table data]
 *   [Application data]
 *   Windows:
 *     Window indicator
 *     [Source/target segment info]
 *     Delta encoding:
 *       Target window length
 *       Data section (ADD/RUN bytes)
 *       Instructions section
 *       Addresses section (COPY addresses)
 */

const PatchXDelta = (() => {
    'use strict';

    // VCDIFF magic bytes
    const VCDIFF_MAGIC = [0xD6, 0xC3, 0xC4, 0x00];

    // XDELTA3 custom magic
    const XDELTA3_MAGIC_STR = '%DIFFX';

    // Window indicator flags
    const VCD_SOURCE = 0x01;
    const VCD_TARGET = 0x02;
    const VCD_ADLER32 = 0x04;

    // Delta indicator flags
    const VCD_DATACOMP = 0x01;
    const VCD_INSTCOMP = 0x02;
    const VCD_ADDRCOMP = 0x04;

    // Instruction types
    const VCD_NOOP = 0;
    const VCD_ADD = 1;
    const VCD_RUN = 2;
    const VCD_COPY = 3;

    /**
     * Default VCDIFF code table (RFC 3284 Section 5.6)
     * Each entry: [type1, size1, mode1, type2, size2, mode2]
     */
    function buildDefaultCodeTable() {
        const table = [];

        // Entry 0: RUN size 0
        table.push([VCD_RUN, 0, 0, VCD_NOOP, 0, 0]);
        // Entry 1: ADD sizes 0..17
        // Entry 1: ADD size 0
        table.push([VCD_ADD, 0, 0, VCD_NOOP, 0, 0]);
        // Entries 2..18: ADD size 1..17
        for (let size = 1; size <= 17; size++) {
            table.push([VCD_ADD, size, 0, VCD_NOOP, 0, 0]);
        }

        // Entries 19..162: COPY mode 0..8, sizes 0..15
        for (let mode = 0; mode <= 8; mode++) {
            // size 0
            table.push([VCD_COPY, 0, mode, VCD_NOOP, 0, 0]);
            // sizes 4..18
            for (let size = 4; size <= 18; size++) {
                table.push([VCD_COPY, size, mode, VCD_NOOP, 0, 0]);
            }
        }

        // Entries 163..234: ADD size 1..4, COPY modes 0..5 size 4..6
        for (let addSize = 1; addSize <= 4; addSize++) {
            for (let copyMode = 0; copyMode <= 5; copyMode++) {
                for (let copySize = 4; copySize <= 6; copySize++) {
                    table.push([VCD_ADD, addSize, 0, VCD_COPY, copySize, copyMode]);
                }
            }
        }

        // Entries 235..246: ADD size 1..4, COPY modes 6..8 size 4
        for (let addSize = 1; addSize <= 4; addSize++) {
            for (let copyMode = 6; copyMode <= 8; copyMode++) {
                table.push([VCD_ADD, addSize, 0, VCD_COPY, 4, copyMode]);
            }
        }

        // Entries 247..255: COPY mode 0..8 size 4, ADD size 1
        for (let copyMode = 0; copyMode <= 8; copyMode++) {
            table.push([VCD_COPY, 4, copyMode, VCD_ADD, 1, 0]);
        }

        return table;
    }

    const DEFAULT_CODE_TABLE = buildDefaultCodeTable();

    /**
     * Verifica si un buffer es un parche VCDIFF/XDELTA
     */
    function isXDelta(buffer) {
        if (buffer.byteLength < 8) return false;
        const bytes = new Uint8Array(buffer);

        // Check VCDIFF magic
        if (bytes[0] === VCDIFF_MAGIC[0] &&
            bytes[1] === VCDIFF_MAGIC[1] &&
            bytes[2] === VCDIFF_MAGIC[2] &&
            bytes[3] === VCDIFF_MAGIC[3]) {
            return true;
        }

        // Check xdelta3 custom header
        const str = String.fromCharCode(...bytes.slice(0, 6));
        if (str === XDELTA3_MAGIC_STR) {
            return true;
        }

        return false;
    }

    /**
     * Lee un entero de longitud variable VCDIFF
     */
    function readVarInt(bytes, pos) {
        let value = 0;
        let p = pos;
        while (true) {
            if (p >= bytes.length) throw new Error('VCDIFF: fin inesperado al leer entero variable');
            const byte = bytes[p];
            p++;
            value = (value << 7) | (byte & 0x7F);
            if (!(byte & 0x80)) break;
        }
        return { value, bytesRead: p - pos };
    }

    /**
     * VCDIFF address cache for COPY instructions
     */
    class AddressCache {
        constructor(nearSize = 4, sameSize = 3) {
            this.nearSize = nearSize;
            this.sameSize = sameSize;
            this.near = new Array(nearSize).fill(0);
            this.same = new Array(sameSize * 256).fill(0);
            this.nextNearSlot = 0;
        }

        update(addr) {
            this.near[this.nextNearSlot] = addr;
            this.nextNearSlot = (this.nextNearSlot + 1) % this.nearSize;
            this.same[addr % (this.sameSize * 256)] = addr;
        }

        decode(mode, hereAddr, addrBytes, addrPos) {
            let addr;
            let bytesRead = 0;

            if (mode === 0) {
                // Self mode
                const vi = readVarInt(addrBytes, addrPos);
                addr = vi.value;
                bytesRead = vi.bytesRead;
            } else if (mode === 1) {
                // Here mode
                const vi = readVarInt(addrBytes, addrPos);
                addr = hereAddr - vi.value;
                bytesRead = vi.bytesRead;
            } else if (mode >= 2 && mode < 2 + this.nearSize) {
                // Near mode
                const vi = readVarInt(addrBytes, addrPos);
                addr = this.near[mode - 2] + vi.value;
                bytesRead = vi.bytesRead;
            } else {
                // Same mode
                const m = mode - (2 + this.nearSize);
                addr = this.same[m * 256 + addrBytes[addrPos]];
                bytesRead = 1;
            }

            this.update(addr);
            return { addr, bytesRead };
        }
    }

    /**
     * Aplica un parche VCDIFF/XDELTA3
     * @param {ArrayBuffer} sourceBuffer - ROM original
     * @param {ArrayBuffer} patchBuffer - Parche xdelta
     * @param {Function} onProgress - Callback de progreso
     * @returns {ArrayBuffer} ROM parcheada
     */
    function apply(sourceBuffer, patchBuffer, onProgress) {
        const patchBytes = new Uint8Array(patchBuffer);
        const source = new Uint8Array(sourceBuffer);
        let pos = 0;

        // === Verificar y parsear header ===
        // Check for xdelta3 custom header
        const headerStr = String.fromCharCode(...patchBytes.slice(0, 6));
        if (headerStr === XDELTA3_MAGIC_STR) {
            // xdelta3 appheader: skip until we find VCDIFF magic
            let found = false;
            for (let i = 0; i < Math.min(patchBytes.length - 4, 1024); i++) {
                if (patchBytes[i] === VCDIFF_MAGIC[0] &&
                    patchBytes[i + 1] === VCDIFF_MAGIC[1] &&
                    patchBytes[i + 2] === VCDIFF_MAGIC[2] &&
                    patchBytes[i + 3] === VCDIFF_MAGIC[3]) {
                    pos = i;
                    found = true;
                    break;
                }
            }
            if (!found) {
                throw new Error('XDELTA: No se encontró la cabecera VCDIFF dentro del archivo');
            }
        }

        // Verificar VCDIFF magic
        if (patchBytes[pos] !== VCDIFF_MAGIC[0] ||
            patchBytes[pos + 1] !== VCDIFF_MAGIC[1] ||
            patchBytes[pos + 2] !== VCDIFF_MAGIC[2] ||
            patchBytes[pos + 3] !== VCDIFF_MAGIC[3]) {
            throw new Error('XDELTA: Cabecera VCDIFF inválida');
        }
        pos += 4;

        // Header indicator
        const hdrIndicator = patchBytes[pos];
        pos++;

        // Secondary compressor ID (if present)
        if (hdrIndicator & 0x01) {
            pos++; // compressor ID
        }

        // Code table data (if present)
        if (hdrIndicator & 0x02) {
            const codeTableLen = readVarInt(patchBytes, pos);
            pos += codeTableLen.bytesRead;
            pos += codeTableLen.value; // Skip custom code table data
        }

        // Application data (if present)
        let appDataLen = 0;
        if (hdrIndicator & 0x04) {
            const appLen = readVarInt(patchBytes, pos);
            pos += appLen.bytesRead;
            appDataLen = appLen.value;
            pos += appDataLen; // skip app data
        }

        // === Process Windows ===
        const outputChunks = [];
        let totalOutputSize = 0;
        let windowCount = 0;

        while (pos < patchBytes.length) {
            // Window indicator
            const winIndicator = patchBytes[pos];
            pos++;

            // Si parece que es padding o fin de archivo, salir
            if (pos >= patchBytes.length) break;

            // Source/target segment
            let sourceSegmentOffset = 0;
            let sourceSegmentLength = 0;
            let sourceSegment = null;

            if (winIndicator & (VCD_SOURCE | VCD_TARGET)) {
                const segLen = readVarInt(patchBytes, pos);
                pos += segLen.bytesRead;
                sourceSegmentLength = segLen.value;

                const segPos = readVarInt(patchBytes, pos);
                pos += segPos.bytesRead;
                sourceSegmentOffset = segPos.value;

                if (winIndicator & VCD_SOURCE) {
                    // Copia del source original
                    sourceSegment = source.slice(sourceSegmentOffset, sourceSegmentOffset + sourceSegmentLength);
                } else {
                    // Copia del target (ya generado)
                    // Necesitamos reconstruir lo que ya hemos emitido
                    const combined = combineChunks(outputChunks, totalOutputSize);
                    sourceSegment = combined.slice(sourceSegmentOffset, sourceSegmentOffset + sourceSegmentLength);
                }
            }

            // Delta encoding length
            const deltaLen = readVarInt(patchBytes, pos);
            pos += deltaLen.bytesRead;

            const deltaEnd = pos + deltaLen.value;

            // Target window length
            const targetWindowLen = readVarInt(patchBytes, pos);
            pos += targetWindowLen.bytesRead;

            // Delta indicator (compression flags for data/inst/addr)
            const deltaIndicator = patchBytes[pos];
            pos++;

            if (deltaIndicator & (VCD_DATACOMP | VCD_INSTCOMP | VCD_ADDRCOMP)) {
                throw new Error('XDELTA: Compresión secundaria no soportada. Este parche requiere un descompresor adicional.');
            }

            // Data section
            const dataLen = readVarInt(patchBytes, pos);
            pos += dataLen.bytesRead;
            const dataSection = patchBytes.slice(pos, pos + dataLen.value);
            pos += dataLen.value;

            // Instructions section
            const instLen = readVarInt(patchBytes, pos);
            pos += instLen.bytesRead;
            const instSection = patchBytes.slice(pos, pos + instLen.value);
            pos += instLen.value;

            // Addresses section
            const addrLen = readVarInt(patchBytes, pos);
            pos += addrLen.bytesRead;
            const addrSection = patchBytes.slice(pos, pos + addrLen.value);
            pos += addrLen.value;

            // Check for Adler32
            if (winIndicator & VCD_ADLER32) {
                pos += 4; // skip checksum
            }

            // === Decode instructions for this window ===
            const targetWindow = new Uint8Array(targetWindowLen.value);
            let targetPos = 0;
            let dataPos = 0;
            let addrPos = 0;
            let instPos = 0;

            const cache = new AddressCache();

            while (instPos < instSection.length && targetPos < targetWindow.length) {
                const codeIdx = instSection[instPos];
                instPos++;

                const code = DEFAULT_CODE_TABLE[codeIdx];
                if (!code) {
                    throw new Error(`XDELTA: código de instrucción inválido: ${codeIdx}`);
                }

                // Procesar hasta 2 instrucciones por código
                for (let k = 0; k < 2; k++) {
                    const type = code[k * 3];
                    let size = code[k * 3 + 1];
                    const mode = code[k * 3 + 2];

                    if (type === VCD_NOOP) continue;

                    // Si size es 0, leer de la sección de instrucciones
                    if (size === 0) {
                        const vi = readVarInt(instSection, instPos);
                        size = vi.value;
                        instPos += vi.bytesRead;
                    }

                    switch (type) {
                        case VCD_ADD:
                            // Copiar bytes literales de la sección de datos
                            for (let i = 0; i < size && targetPos < targetWindow.length; i++) {
                                targetWindow[targetPos] = dataSection[dataPos];
                                targetPos++;
                                dataPos++;
                            }
                            break;

                        case VCD_RUN:
                            // Repetir un byte
                            const runByte = dataSection[dataPos];
                            dataPos++;
                            for (let i = 0; i < size && targetPos < targetWindow.length; i++) {
                                targetWindow[targetPos] = runByte;
                                targetPos++;
                            }
                            break;

                        case VCD_COPY: {
                            // Calcular hereAddress
                            const hereAddr = sourceSegmentLength + targetPos;

                            // Decodificar dirección desde la sección de direcciones
                            const addrResult = cache.decode(mode, hereAddr, addrSection, addrPos);
                            addrPos += addrResult.bytesRead;
                            let addr = addrResult.addr;

                            // Copiar desde source segment o target window
                            for (let i = 0; i < size && targetPos < targetWindow.length; i++) {
                                if (addr < sourceSegmentLength) {
                                    targetWindow[targetPos] = sourceSegment ? sourceSegment[addr] : 0;
                                } else {
                                    targetWindow[targetPos] = targetWindow[addr - sourceSegmentLength];
                                }
                                targetPos++;
                                addr++;
                            }
                            break;
                        }
                    }
                }
            }

            outputChunks.push(targetWindow);
            totalOutputSize += targetWindow.length;
            windowCount++;

            if (onProgress) {
                onProgress(Math.min(95, Math.floor((pos / patchBytes.length) * 100)));
            }
        }

        if (onProgress) onProgress(100);

        // Combinar todos los chunks
        return combineChunks(outputChunks, totalOutputSize).buffer;
    }

    /**
     * Combina los chunks de salida en un solo Uint8Array
     */
    function combineChunks(chunks, totalSize) {
        const result = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    function getInfo(buffer) {
        return {
            format: 'XDELTA',
            size: buffer.byteLength,
            isValid: isXDelta(buffer)
        };
    }

    return { isXDelta, apply, getInfo };
})();
