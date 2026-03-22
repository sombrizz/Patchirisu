/**
 * app.js
 * Controlador principal de la aplicación PatchMaster
 * Orquesta el flujo del wizard: ROM → Parche → Opciones → Parchear & Descargar
 */

(function () {
    'use strict';

    // ==========================================
    // Estado de la aplicación
    // ==========================================
    const state = {
        currentStep: 1,
        romFile: null,
        romBuffer: null,
        romInfo: null,
        patchFile: null,
        patchBuffer: null,
        patchFormat: null,
        patchedBuffer: null,
        outputFileName: 'rom_parcheada',
    };

    // ==========================================
    // Referencias DOM
    // ==========================================
    const $ = (id) => document.getElementById(id);

    const dom = {
        // Step indicator
        stepIndicator: $('stepIndicator'),

        // Step panels
        step1: $('step1'),
        step2: $('step2'),
        step3: $('step3'),
        step4: $('step4'),

        // Step 1: ROM
        romDropZone: $('romDropZone'),
        romFileInput: $('romFileInput'),
        romInfoCard: $('romInfoCard'),
        romFileName: $('romFileName'),
        romFormat: $('romFormat'),
        romGameTitle: $('romGameTitle'),
        romGameCode: $('romGameCode'),
        romRegion: $('romRegion'),
        romSize: $('romSize'),
        romChecksum: $('romChecksum'),
        romWarning: $('romWarning'),
        romWarningText: $('romWarningText'),
        romRemoveBtn: $('romRemoveBtn'),
        step1Next: $('step1Next'),

        // Step 2: Patch
        patchDropZone: $('patchDropZone'),
        patchFileInput: $('patchFileInput'),
        patchInfoCard: $('patchInfoCard'),
        patchFileName: $('patchFileName'),
        patchFormat: $('patchFormat'),
        patchSize: $('patchSize'),
        patchWarning: $('patchWarning'),
        patchWarningText: $('patchWarningText'),
        patchRemoveBtn: $('patchRemoveBtn'),
        step2Back: $('step2Back'),
        step2Skip: $('step2Skip'),
        step2Next: $('step2Next'),

        // Step 3: Options
        randomizerToggle: $('randomizerToggle'),
        randomizerOptions: $('randomizerOptions'),
        randomizerUnsupported: $('randomizerUnsupported'),
        modeWarning: $('modeWarning'),
        modeWarningText: $('modeWarningText'),
        modeSummaryList: $('modeSummaryList'),
        outputFileName: $('outputFileName'),
        outputExt: $('outputExt'),
        step3Back: $('step3Back'),
        step3Next: $('step3Next'),

        // Step 4: Patch
        patchStatusText: $('patchStatusText'),
        progressFill: $('progressFill'),
        progressPercent: $('progressPercent'),
        patchLog: $('patchLog'),
        successCard: $('successCard'),
        successInfo: $('successInfo'),
        downloadBtn: $('downloadBtn'),
        errorCard: $('errorCard'),
        errorText: $('errorText'),
        step4Reset: $('step4Reset'),

        // Modal
        limitationsModal: $('limitationsModal'),
        modalClose: $('modalClose'),
        showLimitations: $('showLimitations'),

        // Background
        bgParticles: $('bgParticles'),
    };

    // ==========================================
    // Inicialización
    // ==========================================
    function init() {
        createParticles();
        setupFileHandlers();
        setupNavigation();
        setupOptions();
        setupModal();
    }

    // ==========================================
    // Partículas de fondo
    // ==========================================
    function createParticles() {
        const colors = ['#e74055', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981'];
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            const size = Math.random() * 4 + 2;
            const color = colors[Math.floor(Math.random() * colors.length)];
            particle.style.cssText = `
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                left: ${Math.random() * 100}%;
                animation-duration: ${Math.random() * 15 + 10}s;
                animation-delay: ${Math.random() * 10}s;
            `;
            dom.bgParticles.appendChild(particle);
        }
    }

    // ==========================================
    // Manejo de archivos
    // ==========================================
    function setupFileHandlers() {
        // ROM Drop Zone
        FileHandler.setupDropZone(
            dom.romDropZone,
            dom.romFileInput,
            FileHandler.isValidROM,
            handleRomFile,
            (err) => showToast(err, 'error')
        );

        // Patch Drop Zone
        FileHandler.setupDropZone(
            dom.patchDropZone,
            dom.patchFileInput,
            FileHandler.isValidPatch,
            handlePatchFile,
            (err) => showToast(err, 'error')
        );

        // Remove buttons
        dom.romRemoveBtn.addEventListener('click', removeRom);
        dom.patchRemoveBtn.addEventListener('click', removePatch);
    }

    function handleRomFile(file, buffer) {
        state.romFile = file;
        state.romBuffer = buffer;

        // Detectar información de la ROM
        const ext = FileHandler.getExtension(file.name);
        state.romInfo = RomDetector.detect(buffer, ext);

        // Mostrar info
        dom.romDropZone.classList.add('has-file');
        dom.romInfoCard.classList.remove('hidden');

        dom.romFileName.textContent = file.name;
        dom.romFormat.textContent = state.romInfo.format;
        dom.romGameTitle.textContent = state.romInfo.title;
        dom.romGameCode.textContent = state.romInfo.gameCode;
        dom.romRegion.textContent = state.romInfo.region;
        dom.romSize.textContent = RomDetector.formatFileSize(state.romInfo.fileSize);
        dom.romChecksum.textContent = state.romInfo.checksum + (state.romInfo.checksumPartial ? ' (parcial)' : '');

        // Mostrar warnings
        if (state.romInfo.warning) {
            dom.romWarning.classList.remove('hidden');
            dom.romWarningText.textContent = state.romInfo.warning;
        } else {
            dom.romWarning.classList.add('hidden');
        }

        // Habilitar siguiente
        dom.step1Next.disabled = false;

        // Configurar nombre de salida
        const baseName = file.name.replace(/\.[^.]+$/, '');
        dom.outputFileName.value = baseName + '_parcheado';
        dom.outputExt.textContent = '.' + ext;
    }

    function removeRom() {
        state.romFile = null;
        state.romBuffer = null;
        state.romInfo = null;

        dom.romDropZone.classList.remove('has-file');
        dom.romInfoCard.classList.add('hidden');
        dom.romWarning.classList.add('hidden');
        dom.step1Next.disabled = true;
    }

    function handlePatchFile(file, buffer) {
        state.patchFile = file;
        state.patchBuffer = buffer;

        // Detectar formato del parche por contenido
        state.patchFormat = FileHandler.detectPatchFormat(buffer);

        // Si no se detectó por contenido, usar extensión
        if (!state.patchFormat) {
            const ext = FileHandler.getExtension(file.name);
            const extMap = {
                'ips': 'IPS', 'ups': 'UPS', 'bps': 'BPS',
                'xdelta': 'XDELTA', 'xdelta3': 'XDELTA', 'vcdiff': 'XDELTA'
            };
            state.patchFormat = extMap[ext] || null;
        }

        if (!state.patchFormat) {
            showToast('No se pudo detectar el formato del parche', 'error');
            return;
        }

        // Mostrar info
        dom.patchDropZone.classList.add('has-file');
        dom.patchInfoCard.classList.remove('hidden');

        dom.patchFileName.textContent = file.name;
        dom.patchFormat.textContent = state.patchFormat;
        dom.patchSize.textContent = RomDetector.formatFileSize(buffer.byteLength);

        // Verificar compatibilidad con ROM
        if (state.romInfo) {
            const isLargeFile = state.romInfo.fileSize > 100 * 1024 * 1024; // >100MB
            if (isLargeFile && state.patchFormat !== 'XDELTA') {
                dom.patchWarning.classList.remove('hidden');
                dom.patchWarningText.textContent = 'Para archivos ROM grandes, se recomienda usar parches XDELTA.';
            } else {
                dom.patchWarning.classList.add('hidden');
            }
        }

        dom.step2Next.disabled = false;
    }

    function removePatch() {
        state.patchFile = null;
        state.patchBuffer = null;
        state.patchFormat = null;

        dom.patchDropZone.classList.remove('has-file');
        dom.patchInfoCard.classList.add('hidden');
        dom.patchWarning.classList.add('hidden');
        dom.step2Next.disabled = true;
    }

    // ==========================================
    // Navegación
    // ==========================================
    function setupNavigation() {
        dom.step1Next.addEventListener('click', () => goToStep(2));
        dom.step2Back.addEventListener('click', () => goToStep(1));
        
        dom.step2Skip.addEventListener('click', () => {
            // Limpiar parche y forzar ir a opciones para "solo randomizar"
            removePatch();
            const supported = state.romInfo && Randomizer.isSupported(state.romInfo.gameCode);
            if (supported) {
                goToStep(3);
                // Activar el randomizador automáticamente para conveniencia
                dom.randomizerToggle.checked = true;
                dom.randomizerOptions.classList.remove('hidden');
                updateModeUI();
                dom.step3NextLabel.textContent = 'Randomizar';
            } else {
                showToast('Esta ROM no soporta randomización. Debes subir un parche.', 'error');
            }
        });

        dom.step2Next.addEventListener('click', () => {
            goToStep(3);
            dom.step3NextLabel.textContent = 'Aplicar Parche';
        });
        dom.step3Back.addEventListener('click', () => goToStep(2));
        dom.step3Next.addEventListener('click', () => {
            goToStep(4);
            startPatching();
        });
        dom.step4Reset.addEventListener('click', resetAll);
    }

    function goToStep(step) {
        // Actualizar paneles
        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById('step' + step);
        if (panel) panel.classList.add('active');

        // Actualizar indicador
        const items = document.querySelectorAll('.step-item');
        const lines = document.querySelectorAll('.step-line');

        items.forEach((item, idx) => {
            const stepNum = idx + 1;
            item.classList.remove('active', 'completed');
            if (stepNum === step) {
                item.classList.add('active');
            } else if (stepNum < step) {
                item.classList.add('completed');
            }
        });

        lines.forEach((line, idx) => {
            line.classList.toggle('active', idx < step - 1);
        });

        state.currentStep = step;

        // Configurar opciones del step 3 según la ROM cargada
        if (step === 3) {
            updateRandomizerAvailability();
        }
    }

    // ==========================================
    // Opciones (Step 3) — Randomizador Avanzado
    // ==========================================
    const MODE_INFO = {
        progressive: {
            warning: 'Los Pokémon se reemplazan por otros de stats similares (BST). Mantiene la progresión natural del juego. Los movimientos e ítems no se tocan para mantener la experiencia equilibrada.',
            summary: [
                '✅ Pokémon salvajes: <strong>Aleatorios por BST similar</strong>',
                '✅ Entrenadores: <strong>Aleatorios por BST similar</strong>',
                '❌ Ítems / Movimientos: <strong>No implementado</strong>',
                '✅ Restricción BST: <strong>Sí (5 tiers)</strong>',
            ],
        },
        semiProgressive: {
            warning: 'La opción más equilibrada. Salvajes por BST similar, entrenadores intactos.',
            summary: [
                '✅ Pokémon salvajes: <strong>Aleatorios por BST similar</strong>',
                '🔒 Entrenadores: <strong>Originales (no se tocan)</strong>',
                '❌ Ítems / Movimientos: <strong>No implementado</strong>',
                '✅ Restricción BST: <strong>Sí (5 tiers)</strong>',
            ],
        },
    };

    function setupOptions() {
        // Toggle principal
        dom.randomizerToggle.addEventListener('change', () => {
            if (dom.randomizerToggle.checked) {
                if (state.romInfo && Randomizer.isSupported(state.romInfo.gameCode)) {
                    dom.randomizerOptions.classList.remove('hidden');
                    dom.randomizerUnsupported.classList.add('hidden');
                    updateModeUI();
                } else {
                    dom.randomizerOptions.classList.add('hidden');
                    dom.randomizerUnsupported.classList.remove('hidden');
                    dom.randomizerToggle.checked = false;
                }
            } else {
                dom.randomizerOptions.classList.add('hidden');
            }
        });

        // Radio button mode changes
        document.querySelectorAll('input[name="randMode"]').forEach(radio => {
            radio.addEventListener('change', updateModeUI);
        });
    }

    function getSelectedMode() {
        const checked = document.querySelector('input[name="randMode"]:checked');
        return checked ? checked.value : 'progressive';
    }

    function updateModeUI() {
        const mode = getSelectedMode();
        const info = MODE_INFO[mode];
        if (!info) return;

        // Update warning
        dom.modeWarningText.textContent = info.warning;

        // Update summary list
        dom.modeSummaryList.innerHTML = info.summary.map(s => `<li>${s}</li>`).join('');
    }

    function updateRandomizerAvailability() {
        const supported = state.romInfo && Randomizer.isSupported(state.romInfo.gameCode);
        if (!supported) {
            dom.randomizerToggle.checked = false;
            dom.randomizerOptions.classList.add('hidden');
            dom.randomizerUnsupported.classList.remove('hidden');
        } else {
            dom.randomizerUnsupported.classList.add('hidden');
        }
    }

    // ==========================================
    // Parcheo (Step 4)
    // ==========================================
    function addLog(text, type = '') {
        const entry = document.createElement('div');
        entry.className = 'log-entry' + (type ? ' ' + type : '');
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        dom.patchLog.appendChild(entry);
        dom.patchLog.scrollTop = dom.patchLog.scrollHeight;
    }

    function setProgress(percent) {
        dom.progressFill.style.width = percent + '%';
        dom.progressPercent.textContent = Math.round(percent) + '%';
    }

    async function startPatching() {
        // Reset UI
        dom.patchLog.innerHTML = '';
        dom.successCard.classList.add('hidden');
        dom.errorCard.classList.add('hidden');
        setProgress(0);

        try {
            const onlyRandomize = !state.patchFile;

            addLog(onlyRandomize ? 'Iniciando proceso de randomización...' : 'Iniciando proceso de parcheo...', 'info');
            dom.patchStatusText.textContent = onlyRandomize ? 'Preparando...' : 'Aplicando parche...';

            addLog(`ROM: ${state.romFile.name} (${RomDetector.formatFileSize(state.romBuffer.byteLength)})`, 'info');
            
            if (!onlyRandomize) {
                addLog(`Parche: ${state.patchFile.name} (${state.patchFormat})`, 'info');
            }

            // Pequeña espera para que la UI se actualice
            await sleep(100);

            let patchedBuffer = state.romBuffer.slice(0); // Copia inicial
            const progressCallback = (p) => setProgress(p * 0.7); // 70% para el parcheo

            if (!onlyRandomize) {
                addLog(`Aplicando parche ${state.patchFormat}...`);

                switch (state.patchFormat) {
                    case 'IPS':
                        patchedBuffer = PatchIPS.apply(state.romBuffer, state.patchBuffer, progressCallback);
                        break;
                    case 'UPS':
                        patchedBuffer = PatchUPS.apply(state.romBuffer, state.patchBuffer, progressCallback);
                        break;
                    case 'BPS':
                        patchedBuffer = PatchBPS.apply(state.romBuffer, state.patchBuffer, progressCallback);
                        break;
                    case 'XDELTA':
                        patchedBuffer = PatchXDelta.apply(state.romBuffer, state.patchBuffer, progressCallback);
                        break;
                    default:
                        throw new Error(`Formato de parche no soportado: ${state.patchFormat}`);
                }

                addLog(`Parche aplicado correctamente. Tamaño: ${RomDetector.formatFileSize(patchedBuffer.byteLength)}`, 'success');
            } else {
                addLog('Omitiendo parcheo (modo Solo Randomizar).', 'info');
            }

            setProgress(70);

            await sleep(50);

            // Aplicar randomización si está activada
            if (dom.randomizerToggle.checked && state.romInfo && Randomizer.isSupported(state.romInfo.gameCode)) {
                const mode = getSelectedMode();
                const modeLabels = { full: 'Total', semi: 'Semi Random', progressive: 'Progresivo', semiProgressive: 'Semi Progresivo' };
                addLog(`Aplicando randomización: modo ${modeLabels[mode] || mode}...`, 'info');
                dom.patchStatusText.textContent = `Randomizando (${modeLabels[mode]})...`;

                const randOptions = {
                    mode: mode,
                    seed: Date.now(),
                };

                const randResult = Randomizer.randomize(
                    patchedBuffer,
                    state.romInfo.gameCode,
                    randOptions,
                    (p) => setProgress(70 + p * 0.25)
                );

                patchedBuffer = randResult.buffer;

                if (randResult.stats.wildPokemon > 0) {
                    addLog(`  → Pokémon salvajes randomizados: ${randResult.stats.wildPokemon}`, 'success');
                }
                if (randResult.stats.trainers > 0) {
                    addLog(`  → Entrenadores randomizados: ${randResult.stats.trainers}`, 'success');
                } else {
                    addLog(`  → Entrenadores: sin cambios (modo ${modeLabels[mode]})`, 'info');
                }
                if (randResult.stats.moves > 0) {
                    addLog(`  → Movimientos randomizados: ${randResult.stats.moves}`, 'success');
                }

                addLog(`Randomización completada (modo: ${modeLabels[mode]}).`, 'success');
            }

            setProgress(95);

            // Guardar resultado
            state.patchedBuffer = patchedBuffer;

            // Calcular checksum de salida
            const outputChecksum = RomDetector.calculateCRC32(new Uint8Array(patchedBuffer));
            addLog(`CRC32 de salida: ${outputChecksum}`, 'info');

            setProgress(100);
            dom.patchStatusText.textContent = '¡Completado!';

            // Mostrar card de éxito
            dom.successCard.classList.remove('hidden');
            dom.successInfo.textContent = `Tamaño final: ${RomDetector.formatFileSize(patchedBuffer.byteLength)} | CRC32: ${outputChecksum}`;

            const successMsg = dom.randomizerToggle.checked && !state.patchFile 
                ? '¡Randomización completada con éxito! Listo para descargar.'
                : '¡Proceso completado con éxito! Listo para descargar.';
            addLog(successMsg, 'success');

            // Actualizar textos de éxito en UI
            dom.successCard.querySelector('h3').textContent = dom.randomizerToggle.checked && !state.patchFile 
                ? '¡ROM Randomizada con éxito!'
                : '¡Parche aplicado con éxito!';
            dom.downloadBtn.innerHTML = '📥 Descargar ROM Modificada';

            // Configurar descarga
            dom.downloadBtn.onclick = downloadPatchedRom;

        } catch (err) {
            console.error('Error de parcheo:', err);
            addLog(`ERROR: ${err.message}`, 'error');
            dom.patchStatusText.textContent = 'Error';
            dom.errorCard.classList.remove('hidden');
            dom.errorText.textContent = err.message;
        }
    }

    // ==========================================
    // Descarga
    // ==========================================
    function downloadPatchedRom() {
        if (!state.patchedBuffer) return;

        const ext = FileHandler.getExtension(state.romFile.name);
        let fileName = dom.outputFileName.value;
        if (!fileName) {
            fileName = state.patchFile ? 'rom_parcheada' : 'rom_random';
        }
        fileName += '.' + ext;

        const blob = new Blob([state.patchedBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Liberar URL después de un momento
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        addLog(`Descargado: ${fileName}`, 'success');
    }

    // ==========================================
    // Reset
    // ==========================================
    function resetAll() {
        // Limpiar estado
        if (state.patchedBuffer) {
            // Intentar limpiar memoria
            state.patchedBuffer = null;
        }

        state.romFile = null;
        state.romBuffer = null;
        state.romInfo = null;
        state.patchFile = null;
        state.patchBuffer = null;
        state.patchFormat = null;
        state.patchedBuffer = null;
        state.outputFileName = 'rom_parcheada';

        // Reset UI
        dom.romDropZone.classList.remove('has-file');
        dom.romInfoCard.classList.add('hidden');
        dom.romWarning.classList.add('hidden');
        dom.step1Next.disabled = true;

        dom.patchDropZone.classList.remove('has-file');
        dom.patchInfoCard.classList.add('hidden');
        dom.patchWarning.classList.add('hidden');
        dom.step2Next.disabled = true;

        dom.randomizerToggle.checked = false;
        dom.randomizerOptions.classList.add('hidden');
        dom.randomizerUnsupported.classList.add('hidden');
        dom.outputFileName.value = '';

        dom.patchLog.innerHTML = '';
        dom.successCard.classList.add('hidden');
        dom.errorCard.classList.add('hidden');
        setProgress(0);
        dom.patchStatusText.textContent = 'Preparando...';

        // Volver al paso 1
        goToStep(1);
    }

    // ==========================================
    // Modal
    // ==========================================
    function setupModal() {
        dom.showLimitations.addEventListener('click', () => {
            dom.limitationsModal.classList.remove('hidden');
        });

        dom.modalClose.addEventListener('click', () => {
            dom.limitationsModal.classList.add('hidden');
        });

        dom.limitationsModal.addEventListener('click', (e) => {
            if (e.target === dom.limitationsModal) {
                dom.limitationsModal.classList.add('hidden');
            }
        });
    }

    // ==========================================
    // Utilidades
    // ==========================================
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showToast(message, type = 'info') {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 2rem;
            left: 50%;
            transform: translateX(-50%);
            padding: 0.8rem 1.5rem;
            background: ${type === 'error' ? '#e74055' : '#3b82f6'};
            color: white;
            border-radius: 10px;
            font-family: 'Outfit', sans-serif;
            font-size: 0.9rem;
            font-weight: 500;
            z-index: 9999;
            animation: fadeSlideIn 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // Arranque
    // ==========================================
    document.addEventListener('DOMContentLoaded', init);
})();
