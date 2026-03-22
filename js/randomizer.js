/**
 * randomizer.js — Smart Pokémon GBA Randomizer
 *
 * 5 Modos de randomización:
 *   FULL           → Todo aleatorio, caótico
 *   PROGRESSIVE    → Salvajes + entrenadores por BST (±1 tier)
 *   SEMI_PROG      → Solo salvajes por BST, entrenadores intactos
 *   SMART          → BST + tipos + roles similares (RECOMENDADO)
 *   EVOLUTIONS     → Randomiza cadenas evolutivas
 *
 * Opciones avanzadas:
 *   randomMoves     → Randomiza movesets manteniendo categoría
 *   randomAbilities → Cambia abilities evitando rotas en early
 *   noLegendaries   → Excluye legendarios
 *   onlyGen         → Limita a Gen 1/2/3
 *   extraDifficulty → Niveles +15%
 *
 * Usa PokemonData para leer datos directamente de la ROM.
 * Sistema de seed determinista para reproducibilidad.
 */

const Randomizer = (() => {
    'use strict';

    // ==========================================
    //  Seeded RNG  (Linear Congruential Generator)
    // ==========================================
    class SeededRandom {
        constructor(seed) {
            this.seed = seed >>> 0 || 1;
        }
        next() {
            this.seed = (this.seed * 1103515245 + 12345) & 0x7FFFFFFF;
            return this.seed / 0x7FFFFFFF;
        }
        nextInt(min, max) {
            return Math.floor(this.next() * (max - min + 1)) + min;
        }
        pick(arr) {
            if (arr.length === 0) return null;
            return arr[this.nextInt(0, arr.length - 1)];
        }
        /** Baraja un array in-place (Fisher-Yates) */
        shuffle(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = this.nextInt(0, i);
                const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
            return arr;
        }
    }

    // ==========================================
    //  Seed System — Formato legible A7F3-K9LM
    // ==========================================
    const SEED_CHARS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I, O (confusión visual)

    function generateSeed() {
        const parts = [];
        for (let p = 0; p < 2; p++) {
            let chunk = '';
            for (let i = 0; i < 4; i++) {
                chunk += SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)];
            }
            parts.push(chunk);
        }
        return parts.join('-');
    }

    function seedToNumber(seedStr) {
        const clean = seedStr.replace(/[-\s]/g, '').toUpperCase();
        let hash = 0;
        for (let i = 0; i < clean.length; i++) {
            hash = ((hash << 5) - hash + clean.charCodeAt(i)) & 0x7FFFFFFF;
        }
        return hash || 1;
    }

    // ==========================================
    //  Helpers de reemplazo
    // ==========================================

    /** Reemplazo progresivo: mismo tier ±1 */
    function getProgressiveReplacement(speciesId, bstTable, tierLists, rng) {
        const bst = bstTable[speciesId] || 400;
        const tierIdx = PokemonData.getTierIndex(bst);

        // Intentar mismo tier
        if (tierLists[tierIdx] && tierLists[tierIdx].length > 0) {
            return rng.pick(tierLists[tierIdx]);
        }
        // Tier adyacente
        for (let offset = 1; offset < PokemonData.TIERS.length; offset++) {
            if (tierIdx - offset >= 0 && tierLists[tierIdx - offset].length > 0)
                return rng.pick(tierLists[tierIdx - offset]);
            if (tierIdx + offset < PokemonData.TIERS.length && tierLists[tierIdx + offset].length > 0)
                return rng.pick(tierLists[tierIdx + offset]);
        }
        return speciesId;
    }

    /** Reemplazo inteligente: BST similar + tipo similar + rol similar */
    function getSmartReplacement(speciesId, romData, gameData, bstTable, typeTable, tierLists, rng) {
        const bst = bstTable[speciesId] || 400;
        const tierIdx = PokemonData.getTierIndex(bst);
        const types = typeTable[speciesId] || [0, 0];
        const role = PokemonData.getRole(romData, gameData, speciesId);

        // Recoger candidatos del mismo tier y adyacentes
        const candidates = [];
        for (let t = Math.max(0, tierIdx - 1); t <= Math.min(PokemonData.TIERS.length - 1, tierIdx + 1); t++) {
            if (tierLists[t]) candidates.push(...tierLists[t]);
        }

        if (candidates.length === 0) return speciesId;

        // Puntuar cada candidato
        const scored = candidates.map(id => {
            let score = 0;
            const cTypes = typeTable[id] || [0, 0];
            const cRole = PokemonData.getRole(romData, gameData, id);

            // +3 por compartir un tipo
            if (cTypes[0] === types[0] || cTypes[0] === types[1] ||
                cTypes[1] === types[0] || cTypes[1] === types[1]) {
                score += 3;
            }

            // +2 por mismo rol
            if (cRole === role) score += 2;

            // +1 por mismo tier exacto
            if (PokemonData.getTierIndex(bstTable[id]) === tierIdx) score += 1;

            // Penalización si es el mismo Pokémon
            if (id === speciesId) score -= 5;

            return { id, score };
        });

        // Selección ponderada: mejores scores más probables
        scored.sort((a, b) => b.score - a.score);
        const topN = Math.max(3, Math.ceil(scored.length * 0.2));
        const top = scored.slice(0, topN);

        return rng.pick(top).id;
    }

    // ==========================================
    //  GBA — Randomización de salvajes
    // ==========================================
    function gbaWild(data, view, gd, rng, replacer) {
        let count = 0;
        let ptr = gd.wildPokemonPtr;
        if (!ptr) return 0;

        for (let i = 0; i < 200; i++) {
            if (ptr + 20 > data.length) break;
            if (data[ptr] === 0xFF && data[ptr + 1] === 0xFF) break;

            const ptrs = [
                PokemonData.readGBAPointer(view, ptr + 4),
                PokemonData.readGBAPointer(view, ptr + 8),
                PokemonData.readGBAPointer(view, ptr + 12),
                PokemonData.readGBAPointer(view, ptr + 16)
            ];
            const slots = [12, 5, 5, 10]; // grass, water, rock_smash, fishing

            for (let t = 0; t < 4; t++) {
                const tp = ptrs[t];
                if (!tp || tp >= data.length) continue;
                const ep = PokemonData.readGBAPointer(view, tp + 4);
                if (!ep || ep >= data.length) continue;

                for (let s = 0; s < slots[t]; s++) {
                    const off = ep + (s * 4);
                    if (off + 4 > data.length) break;
                    const sp = view.getUint16(off + 2, true);
                    if (sp > 0 && sp <= gd.numPokemon) {
                        view.setUint16(off + 2, replacer(sp), true);
                        count++;
                    }
                }
            }
            ptr += 20;
        }
        return count;
    }

    // ==========================================
    //  GBA — Randomización de entrenadores
    // ==========================================
    function gbaTrainers(data, view, gd, rng, replacer, scaleLevels) {
        if (!gd.trainerDataPtr) return 0;
        let count = 0;

        for (let i = 0; i < gd.trainerCount; i++) {
            const off = gd.trainerDataPtr + (i * 40);
            if (off + 40 > data.length) break;

            const structType = data[off];
            const numPkm = view.getUint32(off + 32, true);
            const partyPtr = PokemonData.readGBAPointer(view, off + 36);
            if (!partyPtr || partyPtr >= data.length || numPkm === 0 || numPkm > 6) continue;

            const entrySize = (structType & 0x02) ? 16 : 8;

            for (let j = 0; j < numPkm; j++) {
                const pOff = partyPtr + (j * entrySize);
                if (pOff + entrySize > data.length) break;
                const sp = view.getUint16(pOff + 4, true);
                if (sp > 0 && sp <= gd.numPokemon) {
                    view.setUint16(pOff + 4, replacer(sp), true);
                    count++;
                }
                // Escalado de niveles
                if (scaleLevels) {
                    const lvl = view.getUint16(pOff + 2, true);
                    if (lvl > 0 && lvl <= 100) {
                        const newLvl = Math.min(100, Math.ceil(lvl * scaleLevels));
                        view.setUint16(pOff + 2, newLvl, true);
                    }
                }
            }
        }
        return count;
    }

    // ==========================================
    //  GBA — Randomización de movimientos
    // ==========================================
    function gbaRandomizeMoves(data, view, gd, rng) {
        if (!gd.pokemonMovesPtr) return 0;
        let count = 0;

        for (let i = 1; i <= gd.numPokemon; i++) {
            const pOff = gd.pokemonMovesPtr + (i * 4);
            if (pOff + 4 > data.length) break;
            const mp = PokemonData.readGBAPointer(view, pOff);
            if (!mp || mp >= data.length) continue;

            let mOff = mp;
            for (let j = 0; j < 20; j++) {
                if (mOff + 2 > data.length) break;
                const entry = view.getUint16(mOff, true);
                if (entry === 0xFFFF) break;
                const moveId = entry & 0x1FF;
                const level = (entry >> 9) & 0x7F;
                if (moveId > 0 && moveId <= gd.totalMoves) {
                    const newMove = rng.nextInt(1, gd.totalMoves);
                    const newEntry = (level << 9) | (newMove & 0x1FF);
                    view.setUint16(mOff, newEntry, true);
                    count++;
                }
                mOff += 2;
            }
        }
        return count;
    }

    // ==========================================
    //  GBA — Randomización de habilidades
    // ==========================================
    function gbaRandomizeAbilities(data, gd, rng) {
        if (!gd.baseStatsPtr) return 0;
        let count = 0;

        // Habilidades "rotas" que no deberían aparecer en early (Pokémon tier 1)
        const BROKEN_ABILITIES = new Set([
            22, 23, 33, 42, 44, 76
            // Wonder Guard(25), Shadow Tag(23), Speed Boost(3), Huge Power(37), Pure Power(74)
        ]);

        for (let id = 1; id <= gd.numPokemon; id++) {
            const off = gd.baseStatsPtr + (id * 28) + 22;
            if (off + 2 > data.length) break;

            const bst = PokemonData.calculateBST(data, gd, id);
            const tier = PokemonData.getTierIndex(bst);

            for (let a = 0; a < 2; a++) {
                if (data[off + a] === 0) continue;

                let newAbility;
                let attempts = 0;
                do {
                    newAbility = rng.nextInt(1, 76);
                    attempts++;
                } while (tier <= 1 && BROKEN_ABILITIES.has(newAbility) && attempts < 20);

                data[off + a] = newAbility;
                count++;
            }
        }
        return count;
    }

    // ==========================================
    //  GBA — Randomización de iniciales (Heurística)
    // ==========================================
    function gbaRandomizeStarters(data, gd, rng, bstTable, tierLists, options) {
        let count = 0;
        
        // Seleccionar 3 nuevos iniciales
        const earlyTiers = [...(tierLists[0] || []), ...(tierLists[1] || [])];
        if (earlyTiers.length < 3) return 0;

        let newStarters = [];
        let attempts = 0;
        while(newStarters.length < 3 && attempts < 100) {
            let pkm = rng.pick(earlyTiers);
            if (!newStarters.includes(pkm)) newStarters.push(pkm);
            attempts++;
        }
        if (newStarters.length < 3) newStarters = [1, 4, 7];

        // Función para convertir Nacional ID a Internal ID (usado por el juego GBA)
        const toInternal = (id) => {
            if (id > 251) return id + 25; // Celebi (251). Siguen 25 Unowns. Treecko (252) -> 277
            return id;
        };

        const s1Int = toInternal(newStarters[0]);
        const s2Int = toInternal(newStarters[1]);
        const s3Int = toInternal(newStarters[2]);

        // --- Para Ruby/Sapphire/Emerald ---
        // Treecko (Internal: 277 = 0x0115), Torchic (Internal: 280 = 0x0118), Mudkip (Internal: 283 = 0x011B)
        // Bytes: 15 01 18 01 1B 01
        const rsePattern = [0x15, 0x01, 0x18, 0x01, 0x1B, 0x01];
        
        for (let i = 0; i < data.length - 6; i++) {
            if (data[i]   === rsePattern[0] && data[i+1] === rsePattern[1] &&
                data[i+2] === rsePattern[2] && data[i+3] === rsePattern[3] &&
                data[i+4] === rsePattern[4] && data[i+5] === rsePattern[5]) {
                
                data[i]   = s1Int & 0xFF; data[i+1] = (s1Int >> 8) & 0xFF;
                data[i+2] = s2Int & 0xFF; data[i+3] = (s2Int >> 8) & 0xFF;
                data[i+4] = s3Int & 0xFF; data[i+5] = (s3Int >> 8) & 0xFF;
                count++;
            }
        }

        // --- Para FireRed/LeafGreen ---
        // Bulbasaur (1), Charmander (4), Squirtle (7)
        const frlgPatterns = [
            [0x79, 0x01, 0x00, 0x05, 0x00, 0x00],
            [0x79, 0x04, 0x00, 0x05, 0x00, 0x00],
            [0x79, 0x07, 0x00, 0x05, 0x00, 0x00]
        ];
        
        const frlgPics = [
            [0x75, 0x01, 0x00, 0x0A, 0x03],
            [0x75, 0x04, 0x00, 0x0A, 0x03],
            [0x75, 0x07, 0x00, 0x0A, 0x03]
        ];

        for (let i = 0; i < data.length - 6; i++) {
            for (let j = 0; j < 3; j++) {
                const newInt = j === 0 ? s1Int : (j === 1 ? s2Int : s3Int);
                
                // givepokemon
                if (data[i]   === frlgPatterns[j][0] && data[i+1] === frlgPatterns[j][1] &&
                    data[i+2] === frlgPatterns[j][2] && data[i+3] === frlgPatterns[j][3] &&
                    data[i+4] === frlgPatterns[j][4] && data[i+5] === frlgPatterns[j][5]) {
                    
                    data[i+1] = newInt & 0xFF;
                    data[i+2] = (newInt >> 8) & 0xFF;
                    count++;
                }
                // showpokepic
                if (data[i]   === frlgPics[j][0] && data[i+1] === frlgPics[j][1] &&
                    data[i+2] === frlgPics[j][2] && data[i+3] === frlgPics[j][3] &&
                    data[i+4] === frlgPics[j][4]) {
                    
                    data[i+1] = newInt & 0xFF;
                    data[i+2] = (newInt >> 8) & 0xFF;
                    count++;
                }
            }
        }

        return count;
    }

    // ==========================================
    //  GBA — Randomización de evoluciones
    // ==========================================
    function gbaRandomizeEvolutions(data, view, gd, rng, options) {
        if (!gd.evolutionPtr) return 0;
        let count = 0;

        const opts = options || {};
        const tierLists = PokemonData.buildTierLists(data, gd, opts);

        for (let id = 1; id <= gd.numPokemon; id++) {
            const base = gd.evolutionPtr + (id * 40);
            if (base + 40 > data.length) break;

            for (let i = 0; i < 5; i++) {
                const off = base + (i * 8);
                const method = view.getUint16(off, true);
                const target = view.getUint16(off + 4, true);

                if (method === 0 || target === 0) continue;
                if (target > gd.numPokemon) continue;

                // Buscar reemplazo del mismo tier que el target original
                const targetBST = PokemonData.calculateBST(data, gd, target);
                const tierIdx = PokemonData.getTierIndex(targetBST);

                let newTarget;
                if (tierLists[tierIdx] && tierLists[tierIdx].length > 0) {
                    newTarget = rng.pick(tierLists[tierIdx]);
                } else {
                    newTarget = rng.nextInt(1, gd.numPokemon);
                }

                view.setUint16(off + 4, newTarget, true);
                count++;
            }
        }
        return count;
    }

    // ==========================================
    //  MODOS DE RANDOMIZACIÓN
    // ==========================================

    /** MODO 1: RANDOM TOTAL — Todo aleatorio, caótico */
    function randomizeFull(buffer, romData, gd, rng, options) {
        const view = new DataView(buffer);
        const bstTable = PokemonData.buildBSTTable(romData, gd);
        const tierLists = PokemonData.buildTierLists(romData, gd, options);
        const allPokemon = [];
        for (let i = 1; i <= gd.numPokemon; i++) {
            if (options.noLegendaries && PokemonData.LEGENDARIES.has(i)) continue;
            if (options.onlyGen) {
                const range = PokemonData.GEN_RANGES[options.onlyGen];
                if (range && (i < range.start || i > range.end)) continue;
            }
            allPokemon.push(i);
        }
        if (allPokemon.length === 0) throw new Error('No hay Pokémon disponibles con estos filtros');

        const replacer = () => rng.pick(allPokemon);
        const stats = {
            wildPokemon: gbaWild(romData, view, gd, rng, replacer),
            trainers: gbaTrainers(romData, view, gd, rng, replacer, options.extraDifficulty ? 1.15 : null),
            starters: gbaRandomizeStarters(romData, gd, rng, bstTable, tierLists, options),
            moves: 0, abilities: 0, evolutions: 0
        };

        if (options.randomMoves) stats.moves = gbaRandomizeMoves(romData, view, gd, rng);
        if (options.randomAbilities) stats.abilities = gbaRandomizeAbilities(romData, gd, rng);
        if (options.randomEvolutions) stats.evolutions = gbaRandomizeEvolutions(romData, view, gd, rng, options);

        return stats;
    }

    /** MODO 2: RANDOM PROGRESIVO — Salvajes + entrenadores por BST ±1 tier */
    function randomizeProgressive(buffer, romData, gd, rng, options) {
        const view = new DataView(buffer);
        const bstTable = PokemonData.buildBSTTable(romData, gd);
        const tierLists = PokemonData.buildTierLists(romData, gd, options);

        const replacer = (sp) => getProgressiveReplacement(sp, bstTable, tierLists, rng);
        const stats = {
            wildPokemon: gbaWild(romData, view, gd, rng, replacer),
            trainers: gbaTrainers(romData, view, gd, rng, replacer, options.extraDifficulty ? 1.15 : null),
            starters: gbaRandomizeStarters(romData, gd, rng, bstTable, tierLists, options),
            moves: 0, abilities: 0, evolutions: 0
        };

        if (options.randomMoves) stats.moves = gbaRandomizeMoves(romData, view, gd, rng);
        if (options.randomAbilities) stats.abilities = gbaRandomizeAbilities(romData, gd, rng);
        if (options.randomEvolutions) stats.evolutions = gbaRandomizeEvolutions(romData, view, gd, rng, options);

        return stats;
    }

    /** MODO 3: SEMIRANDOM PROGRESIVO — Solo salvajes, entrenadores intactos */
    function randomizeSemiProgressive(buffer, romData, gd, rng, options) {
        const view = new DataView(buffer);
        const bstTable = PokemonData.buildBSTTable(romData, gd);
        const tierLists = PokemonData.buildTierLists(romData, gd, options);

        const replacer = (sp) => getProgressiveReplacement(sp, bstTable, tierLists, rng);
        const stats = {
            wildPokemon: gbaWild(romData, view, gd, rng, replacer),
            trainers: 0, // Entrenadores intactos
            starters: gbaRandomizeStarters(romData, gd, rng, bstTable, tierLists, options),
            moves: 0, abilities: 0, evolutions: 0
        };

        if (options.randomMoves) stats.moves = gbaRandomizeMoves(romData, view, gd, rng);
        if (options.randomAbilities) stats.abilities = gbaRandomizeAbilities(romData, gd, rng);
        if (options.randomEvolutions) stats.evolutions = gbaRandomizeEvolutions(romData, view, gd, rng, options);

        return stats;
    }

    /** MODO 4: RANDOM INTELIGENTE — BST + tipos + roles (RECOMENDADO) */
    function randomizeSmart(buffer, romData, gd, rng, options) {
        const view = new DataView(buffer);
        const bstTable = PokemonData.buildBSTTable(romData, gd);
        const typeTable = PokemonData.buildTypeTable(romData, gd);
        const tierLists = PokemonData.buildTierLists(romData, gd, options);

        const replacer = (sp) => getSmartReplacement(sp, romData, gd, bstTable, typeTable, tierLists, rng);
        const stats = {
            wildPokemon: gbaWild(romData, view, gd, rng, replacer),
            trainers: gbaTrainers(romData, view, gd, rng, replacer, options.extraDifficulty ? 1.15 : null),
            starters: gbaRandomizeStarters(romData, gd, rng, bstTable, tierLists, options),
            moves: 0, abilities: 0, evolutions: 0
        };

        if (options.randomMoves) stats.moves = gbaRandomizeMoves(romData, view, gd, rng);
        if (options.randomAbilities) stats.abilities = gbaRandomizeAbilities(romData, gd, rng);
        if (options.randomEvolutions) stats.evolutions = gbaRandomizeEvolutions(romData, view, gd, rng, options);

        return stats;
    }

    // ==========================================
    //  API PÚBLICA
    // ==========================================

    function isSupported(gameCode) {
        return !!PokemonData.GAME_DATA[gameCode];
    }

    /**
     * Punto de entrada principal del randomizador.
     * @param {ArrayBuffer} romBuffer — ROM original
     * @param {string} gameCode — Código del juego (ej: 'BPRE')
     * @param {Object} options — { mode, seed, noLegendaries, onlyGen, randomMoves, etc. }
     * @param {Function} onProgress — Callback de progreso (0-100)
     * @returns {{ buffer, stats, seed, gameName, mode }}
     */
    function randomize(romBuffer, gameCode, options, onProgress) {
        const gdTemplate = PokemonData.GAME_DATA[gameCode];
        if (!gdTemplate) throw new Error(`Juego no soportado: ${gameCode}`);

        // Copiar buffer (no modificar original)
        const buffer = romBuffer.slice(0);
        const romData = new Uint8Array(buffer);
        const view = new DataView(buffer);

        // Copiar game data (puede ser modificada por auto-detect)
        const gd = Object.assign({}, gdTemplate);

        // Auto-detectar offsets si es necesario (ROMs EUR, etc.)
        if (gd.autoDetect) {
            if (onProgress) onProgress(5);
            PokemonData.autoDetectOffsets(romData, gd);
        }

        // Validar ROM
        if (!PokemonData.validateROM(romData, gd)) {
            throw new Error('ROM no válida o corrupta. Verifica que sea un archivo .gba original.');
        }

        // Seed
        const seedStr = options.seed || generateSeed();
        const seedNum = seedToNumber(seedStr);
        const rng = new SeededRandom(seedNum);
        const mode = options.mode || 'smart';

        if (onProgress) onProgress(10);

        let stats;
        switch (mode) {
            case 'full':
                stats = randomizeFull(buffer, romData, gd, rng, options);
                break;
            case 'progressive':
                stats = randomizeProgressive(buffer, romData, gd, rng, options);
                break;
            case 'semiProgressive':
                stats = randomizeSemiProgressive(buffer, romData, gd, rng, options);
                break;
            case 'smart':
                stats = randomizeSmart(buffer, romData, gd, rng, options);
                break;
            default:
                throw new Error(`Modo no válido: ${mode}`);
        }

        if (onProgress) onProgress(90);

        // Evoluciones separadas (toggle independiente)
        if (options.randomEvolutions && !stats.evolutions) {
            stats.evolutions = gbaRandomizeEvolutions(romData, view, gd, rng, options);
        }

        if (onProgress) onProgress(100);

        return {
            buffer,
            stats,
            seed: seedStr,
            gameName: gd.name,
            region: gd.region,
            mode
        };
    }

    return {
        isSupported,
        randomize,
        generateSeed,
        seedToNumber,
        GAME_DATA: PokemonData.GAME_DATA
    };
})();
