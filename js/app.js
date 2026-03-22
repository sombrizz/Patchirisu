/**
 * app.js — Smart Pokémon GBA Randomizer Controller
 *
 * Flujo de 3 pasos:
 *   1. ROM (+ parche opcional)
 *   2. Opciones (modo, toggles, seed)
 *   3. Procesar & Descargar
 */

(() => {
    'use strict';

    // ==========================================
    //  Estado de la aplicación
    // ==========================================
    const state = {
        romBuffer: null,
        romInfo: null,
        patchBuffer: null,
        patchFormat: null,
        patchedBuffer: null,       // resultado final para descargar
        resultSeed: null,
        romFileName: ''
    };

    // ==========================================
    //  Referencias DOM
    // ==========================================
    const dom = {
        // Steps
        step1: document.getElementById('step1'),
        step2: document.getElementById('step2'),
        step3: document.getElementById('step3'),
        stepDots: document.querySelectorAll('.step-dot'),

        // Step 1
        romDropZone: document.getElementById('romDropZone'),
        romFileInput: document.getElementById('romFileInput'),
        romInfoCard: document.getElementById('romInfoCard'),
        btnReuploadROM: document.getElementById('btnReuploadROM'),
        romBadge: document.getElementById('romBadge'),
        romTitle: document.getElementById('romTitle'),
        romRegion: document.getElementById('romRegion'),
        romSize: document.getElementById('romSize'),
        romCode: document.getElementById('romCode'),
        romStatus: document.getElementById('romStatus'),
        btnToStep2: document.getElementById('btnToStep2'),
        togglePatchBtn: document.getElementById('togglePatchBtn'),
        patchUpload: document.getElementById('patchUpload'),
        patchDropZone: document.getElementById('patchDropZone'),
        patchFileInput: document.getElementById('patchFileInput'),

        // Step 2
        btnBackToStep1: document.getElementById('btnBackToStep1'),
        btnToStep3: document.getElementById('btnToStep3'),
        seedInput: document.getElementById('seedInput'),
        btnNewSeed: document.getElementById('btnNewSeed'),
        btnCopySeed: document.getElementById('btnCopySeed'),
        optEvolutions: document.getElementById('optEvolutions'),
        optMoves: document.getElementById('optMoves'),
        optAbilities: document.getElementById('optAbilities'),
        optNoLegendaries: document.getElementById('optNoLegendaries'),
        optDifficulty: document.getElementById('optDifficulty'),
        optGenFilter: document.getElementById('optGenFilter'),

        // Step 3
        processTitle: document.getElementById('processTitle'),
        processStatus: document.getElementById('processStatus'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        logBox: document.getElementById('logBox'),
        resultCard: document.getElementById('resultCard'),
        resultStats: document.getElementById('resultStats'),
        resultSeed: document.getElementById('resultSeed'),
        errorCard: document.getElementById('errorCard'),
        errorText: document.getElementById('errorText'),
        btnDownload: document.getElementById('btnDownload'),
        btnRestart: document.getElementById('btnRestart'),
        btnCopyResultSeed: document.getElementById('btnCopyResultSeed')
    };

    // ==========================================
    //  Navegación entre pasos
    // ==========================================
    function showStep(n) {
        [dom.step1, dom.step2, dom.step3].forEach((el, i) => {
            el.classList.toggle('hidden', i !== n - 1);
        });
        dom.stepDots.forEach((dot, i) => {
            dot.classList.toggle('active', i < n);
            dot.classList.toggle('current', i === n - 1);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ==========================================
    //  STEP 1: Carga de ROM + Parche opcional
    // ==========================================

    async function handleROMFile(file) {
        if (!FileHandler.isROM(file.name)) {
            showROMStatus('Solo se aceptan archivos .gba', 'error');
            return;
        }

        try {
            state.romBuffer = await FileHandler.readFile(file);
            state.romFileName = file.name;
            const ext = FileHandler.getExtension(file.name);
            state.romInfo = RomDetector.detect(state.romBuffer, ext);

            showROMInfo(state.romInfo);

            if (state.romInfo.isRandomizerCompatible) {
                showROMStatus('✅ ROM compatible con el randomizador', 'success');
                dom.btnToStep2.classList.remove('hidden');
                dom.btnToStep2.disabled = false;
            } else if (state.romInfo.isPokemon) {
                showROMStatus('⚠️ ROM Pokémon detectada pero no soportada por el randomizador', 'warning');
                dom.btnToStep2.classList.remove('hidden');
                dom.btnToStep2.disabled = true;
            } else {
                showROMStatus('❌ No es una ROM Pokémon GBA soportada', 'error');
                dom.btnToStep2.classList.add('hidden');
            }
        } catch (err) {
            showROMStatus('Error: ' + err.message, 'error');
        }
    }

    function showROMInfo(info) {
        dom.romInfoCard.classList.remove('hidden');
        dom.romDropZone.classList.add('hidden');
        dom.romBadge.textContent = info.format;
        dom.romTitle.textContent = info.title;
        dom.romRegion.textContent = '🌍 ' + info.region;
        dom.romSize.textContent = '💾 ' + RomDetector.formatFileSize(info.fileSize);
        dom.romCode.textContent = '🏷️ ' + info.gameCode;
    }

    function showROMStatus(text, type) {
        dom.romStatus.textContent = text;
        dom.romStatus.className = 'rom-status rom-status-' + type;
    }

    function reuploadROM() {
        state.romBuffer = null;
        state.romInfo = null;
        state.romFileName = '';
        dom.romInfoCard.classList.add('hidden');
        dom.romDropZone.classList.remove('hidden');
        dom.btnToStep2.classList.add('hidden');
        dom.romStatus.textContent = '';
        dom.patchUpload.classList.add('hidden');
    }

    async function handlePatchFile(file) {
        if (!FileHandler.isPatch(file.name)) {
            showROMStatus('Solo se aceptan parches .ips, .ups o .bps', 'error');
            return;
        }
        try {
            state.patchBuffer = await FileHandler.readFile(file);
            state.patchFormat = FileHandler.detectPatchFormat(state.patchBuffer);
            if (!state.patchFormat) {
                showROMStatus('Formato de parche no reconocido', 'error');
                state.patchBuffer = null;
                return;
            }
            showROMStatus('✅ Parche ' + state.patchFormat + ' cargado (' +
                RomDetector.formatFileSize(state.patchBuffer.byteLength) + ')', 'success');
        } catch (err) {
            showROMStatus('Error al cargar parche: ' + err.message, 'error');
        }
    }

    // ==========================================
    //  STEP 2: Seed management
    // ==========================================

    function newSeed() {
        dom.seedInput.value = Randomizer.generateSeed();
    }

    function copySeed(inputEl) {
        const text = inputEl.value || inputEl.textContent;
        if (text && navigator.clipboard) {
            navigator.clipboard.writeText(text).then(() => {
                const orig = inputEl.style.borderColor;
                inputEl.style.borderColor = 'var(--accent-green)';
                setTimeout(() => { inputEl.style.borderColor = orig; }, 500);
            });
        }
    }

    // ==========================================
    //  STEP 3: Randomización
    // ==========================================

    function addLog(text, type) {
        const line = document.createElement('div');
        line.className = 'log-line' + (type ? ' log-' + type : '');
        const time = new Date().toLocaleTimeString('es-ES', { hour12: false });
        line.textContent = `[${time}] ${text}`;
        dom.logBox.appendChild(line);
        dom.logBox.scrollTop = dom.logBox.scrollHeight;
    }

    function setProgress(pct) {
        const p = Math.max(0, Math.min(100, Math.round(pct)));
        dom.progressFill.style.width = p + '%';
        dom.progressText.textContent = p + '%';
    }

    async function startRandomization() {
        // Limpiar estado
        dom.logBox.innerHTML = '';
        dom.resultCard.classList.add('hidden');
        dom.errorCard.classList.add('hidden');
        dom.processTitle.textContent = '🚀 Randomizando…';
        dom.processStatus.textContent = 'Procesando tu ROM';
        setProgress(0);

        try {
            let romBuffer = state.romBuffer;

            // 1. Aplicar parche si hay
            if (state.patchBuffer && state.patchFormat) {
                addLog('Aplicando parche ' + state.patchFormat + '…');
                setProgress(5);

                switch (state.patchFormat) {
                    case 'IPS':
                        romBuffer = PatchIPS.apply(romBuffer, state.patchBuffer);
                        break;
                    case 'UPS':
                        romBuffer = PatchUPS.apply(romBuffer, state.patchBuffer);
                        break;
                    case 'BPS':
                        romBuffer = PatchBPS.apply(romBuffer, state.patchBuffer);
                        break;
                }
                addLog('Parche aplicado correctamente');
                setProgress(10);
            }

            // 2. Recoger opciones
            const selectedMode = document.querySelector('input[name="mode"]:checked').value;
            const genFilter = dom.optGenFilter.value;

            const options = {
                mode: selectedMode,
                seed: dom.seedInput.value || undefined,
                randomMoves: dom.optMoves.checked,
                randomAbilities: dom.optAbilities.checked,
                randomEvolutions: dom.optEvolutions.checked,
                noLegendaries: dom.optNoLegendaries.checked,
                extraDifficulty: dom.optDifficulty.checked,
                onlyGen: genFilter ? parseInt(genFilter) : null
            };

            addLog('Modo: ' + selectedMode);
            addLog('ROM: ' + state.romInfo.title + ' (' + state.romInfo.region + ')');
            if (options.seed) addLog('Seed: ' + options.seed);

            setProgress(15);

            // 3. Randomizar
            addLog('Iniciando randomización…');

            const result = Randomizer.randomize(
                romBuffer,
                state.romInfo.gameCode,
                options,
                (pct) => {
                    setProgress(15 + pct * 0.75); // 15-90%
                }
            );

            setProgress(95);
            addLog('✅ Randomización completada');

            // 4. Mostrar resultado
            state.patchedBuffer = result.buffer;
            state.resultSeed = result.seed;

            // Stats
            const s = result.stats;
            let statsHTML = '<div class="stats-grid">';
            statsHTML += `<div class="stat-item"><span class="stat-num">${s.wildPokemon}</span><span class="stat-label">Salvajes</span></div>`;
            statsHTML += `<div class="stat-item"><span class="stat-num">${s.trainers}</span><span class="stat-label">Entrenadores</span></div>`;
            if (s.moves) statsHTML += `<div class="stat-item"><span class="stat-num">${s.moves}</span><span class="stat-label">Movimientos</span></div>`;
            if (s.abilities) statsHTML += `<div class="stat-item"><span class="stat-num">${s.abilities}</span><span class="stat-label">Habilidades</span></div>`;
            if (s.evolutions) statsHTML += `<div class="stat-item"><span class="stat-num">${s.evolutions}</span><span class="stat-label">Evoluciones</span></div>`;
            if (s.starters) statsHTML += `<div class="stat-item"><span class="stat-num">${s.starters > 0 ? 3 : 0}</span><span class="stat-label">Iniciales</span></div>`;
            statsHTML += '</div>';

            dom.resultStats.innerHTML = statsHTML;
            dom.resultSeed.textContent = result.seed;

            dom.processTitle.textContent = '✅ ¡Listo!';
            dom.processStatus.textContent = result.gameName + ' — ' + result.mode;
            dom.resultCard.classList.remove('hidden');
            setProgress(100);

            addLog('Seed: ' + result.seed);
            addLog('Listo para descargar');
            
            // Sugerir nombre de archivo
            const defaultName = state.romFileName.replace(/\.gba$/i, '') + '_patchirisu';
            const filenameInput = document.getElementById('downloadFilename');
            if (filenameInput) filenameInput.value = defaultName;

        } catch (err) {
            console.error('Randomization error:', err);
            addLog('ERROR: ' + err.message, 'error');
            dom.processTitle.textContent = '❌ Error';
            dom.processStatus.textContent = 'Algo salió mal';
            dom.errorCard.classList.remove('hidden');
            dom.errorText.textContent = err.message;
        }
    }

    function downloadResult() {
        if (!state.patchedBuffer) return;

        const blob = new Blob([state.patchedBuffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        const input = document.getElementById('downloadFilename');
        let filename = input ? input.value.trim() : '';
        if (!filename) filename = 'patchirisu';

        a.href = url;
        a.download = filename + '.gba';
        a.click();
        URL.revokeObjectURL(url);
    }

    function restart() {
        state.romBuffer = null;
        state.romInfo = null;
        state.patchBuffer = null;
        state.patchFormat = null;
        state.patchedBuffer = null;
        state.resultSeed = null;
        state.romFileName = '';

        dom.romInfoCard.classList.add('hidden');
        dom.romDropZone.classList.remove('hidden');
        dom.btnToStep2.classList.add('hidden');
        dom.romStatus.textContent = '';
        dom.patchUpload.classList.add('hidden');
        dom.seedInput.value = '';
        dom.logBox.innerHTML = '';

        showStep(1);
    }

    // ==========================================
    //  Event Listeners
    // ==========================================

    // ROM drop/click
    dom.romDropZone.addEventListener('click', () => dom.romFileInput.click());
    dom.romFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handleROMFile(e.target.files[0]);
    });
    FileHandler.setupDropZone(dom.romDropZone, handleROMFile);

    dom.btnReuploadROM.addEventListener('click', reuploadROM);

    // Patch toggle
    dom.togglePatchBtn.addEventListener('click', () => {
        dom.patchUpload.classList.toggle('hidden');
    });
    dom.patchDropZone.addEventListener('click', () => dom.patchFileInput.click());
    dom.patchFileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) handlePatchFile(e.target.files[0]);
    });
    FileHandler.setupDropZone(dom.patchDropZone, handlePatchFile);

    // Navigation
    dom.btnToStep2.addEventListener('click', () => {
        if (!dom.seedInput.value) newSeed();
        showStep(2);
    });
    dom.btnBackToStep1.addEventListener('click', () => showStep(1));
    dom.btnToStep3.addEventListener('click', () => {
        showStep(3);
        // Pequeño delay para que la UI se actualice antes de procesar
        setTimeout(() => startRandomization(), 100);
    });

    // Seed
    dom.btnNewSeed.addEventListener('click', newSeed);
    dom.btnCopySeed.addEventListener('click', () => copySeed(dom.seedInput));
    dom.btnCopyResultSeed.addEventListener('click', () => copySeed(dom.resultSeed));

    // Download & Restart
    dom.btnDownload.addEventListener('click', downloadResult);
    dom.btnRestart.addEventListener('click', restart);

    // Init
    showStep(1);

})();
