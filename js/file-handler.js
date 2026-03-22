/**
 * file-handler.js — Gestión de archivos para Smart GBA Randomizer
 * Solo soporta: .gba + .ips/.ups/.bps
 */

const FileHandler = (() => {
    'use strict';

    const ROM_EXTENSIONS = ['gba'];
    const PATCH_EXTENSIONS = ['ips', 'ups', 'bps'];

    function getExtension(filename) {
        const parts = filename.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : '';
    }

    function isROM(filename) {
        return ROM_EXTENSIONS.includes(getExtension(filename));
    }

    function isPatch(filename) {
        return PATCH_EXTENSIONS.includes(getExtension(filename));
    }

    function detectPatchFormat(buffer) {
        if (buffer.byteLength < 5) return null;
        const bytes = new Uint8Array(buffer);

        // IPS: "PATCH"
        if (bytes[0] === 0x50 && bytes[1] === 0x41 && bytes[2] === 0x54 &&
            bytes[3] === 0x43 && bytes[4] === 0x48) return 'IPS';

        // UPS: "UPS1"
        if (bytes[0] === 0x55 && bytes[1] === 0x50 && bytes[2] === 0x53 &&
            bytes[3] === 0x31) return 'UPS';

        // BPS: "BPS1"
        if (bytes[0] === 0x42 && bytes[1] === 0x50 && bytes[2] === 0x53 &&
            bytes[3] === 0x31) return 'BPS';

        return null;
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Error al leer: ' + file.name));
            reader.readAsArrayBuffer(file);
        });
    }

    function setupDropZone(element, onFile) {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            element.classList.add('drag-over');
        });
        element.addEventListener('dragleave', () => {
            element.classList.remove('drag-over');
        });
        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) onFile(file);
        });
    }

    return { isROM, isPatch, getExtension, detectPatchFormat, readFile, setupDropZone, ROM_EXTENSIONS, PATCH_EXTENSIONS };
})();
