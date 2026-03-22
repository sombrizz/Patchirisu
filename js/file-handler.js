/**
 * file-handler.js
 * Maneja drag & drop, file inputs, validación de formatos,
 * y lectura de archivos a ArrayBuffer.
 */

const FileHandler = (() => {
    'use strict';

    // Extensiones válidas
    const ROM_EXTENSIONS = ['gba', 'gb', 'gbc', 'nds', 'iso'];
    const PATCH_EXTENSIONS = ['ips', 'ups', 'bps', 'xdelta', 'xdelta3', 'vcdiff'];

    /**
     * Obtiene la extensión de un nombre de archivo (sin punto, minúsculas)
     */
    function getExtension(filename) {
        const parts = filename.split('.');
        if (parts.length < 2) return '';
        return parts[parts.length - 1].toLowerCase();
    }

    /**
     * Verifica si la extensión es una ROM válida
     */
    function isValidROM(filename) {
        return ROM_EXTENSIONS.includes(getExtension(filename));
    }

    /**
     * Verifica si la extensión es un parche válido
     */
    function isValidPatch(filename) {
        return PATCH_EXTENSIONS.includes(getExtension(filename));
    }

    /**
     * Detecta el formato de parche analizando el contenido del archivo
     */
    function detectPatchFormat(buffer) {
        if (PatchIPS.isIPS(buffer)) return 'IPS';
        if (PatchUPS.isUPS(buffer)) return 'UPS';
        if (PatchBPS.isBPS(buffer)) return 'BPS';
        if (PatchXDelta.isXDelta(buffer)) return 'XDELTA';
        return null;
    }

    /**
     * Lee un File en un ArrayBuffer
     * @param {File} file
     * @returns {Promise<ArrayBuffer>}
     */
    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Error al leer el archivo: ' + file.name));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Configura una zona de drag & drop
     * @param {HTMLElement} dropZone - Elemento de la zona de drop
     * @param {HTMLInputElement} fileInput - Input file asociado
     * @param {Function} validator - Función para validar el nombre del archivo
     * @param {Function} onFile - Callback cuando se selecciona un archivo válido
     * @param {Function} onError - Callback para errores
     */
    function setupDropZone(dropZone, fileInput, validator, onFile, onError) {
        // Click para abrir selector
        dropZone.addEventListener('click', () => fileInput.click());

        // Drag events
        dropZone.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Solo quitar la clase si el mouse realmente salió del dropZone
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove('drag-over');
            }
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length === 0) return;

            const file = files[0];
            if (!validator(file.name)) {
                onError(`Formato no soportado: .${getExtension(file.name)}`);
                return;
            }

            try {
                const buffer = await readFile(file);
                onFile(file, buffer);
            } catch (err) {
                onError(err.message);
            }
        });

        // File input change
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!validator(file.name)) {
                onError(`Formato no soportado: .${getExtension(file.name)}`);
                fileInput.value = '';
                return;
            }

            try {
                const buffer = await readFile(file);
                onFile(file, buffer);
            } catch (err) {
                onError(err.message);
            }

            // Reset input para permitir seleccionar el mismo archivo
            fileInput.value = '';
        });
    }

    return {
        ROM_EXTENSIONS,
        PATCH_EXTENSIONS,
        getExtension,
        isValidROM,
        isValidPatch,
        detectPatchFormat,
        readFile,
        setupDropZone,
    };
})();
