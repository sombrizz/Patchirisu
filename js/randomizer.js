/**
 * randomizer.js — Randomizador Avanzado para ROMs Pokémon (GBA + NDS)
 * 
 * 4 Modos:
 *   FULL          → Todo aleatorio, sin restricciones
 *   SEMI          → Salvajes + ítems aleatorios, entrenadores intactos
 *   PROGRESSIVE   → Reemplazo por BST similar (salvajes + entrenadores)
 *   SEMI_PROG     → Salvajes por BST similar, entrenadores intactos, ítems aleatorios
 *
 * Sistema de BST (Base Stat Total):
 *   Tier 1: 0–299   (Pokémon débiles / primera evolución)
 *   Tier 2: 300–449  (Pokémon medios / segunda evolución)
 *   Tier 3: 450–549  (Pokémon fuertes / tercera evolución)
 *   Tier 4: 550–599  (Pseudolegendarios)
 *   Tier 5: 600+     (Legendarios / míticos)
 */

const Randomizer = (() => {
    'use strict';

    // ==========================================
    // BST DATA — Base Stat Totals por Pokémon
    // Array indexado por dex number (índice 0 = padding)
    // Cubre Gen 1–5 (649 Pokémon)
    // ==========================================
    const BST = [
        0, // 0 = placeholder
        // Gen 1 (1-151)
        318,405,525,309,405,534,314,405,530,195,205,395,195,205,395,251,349,479,253,
        413,262,442,288,438,320,500,253,413,275,495,275,495,288,438,302,462,299,459,
        300,450,320,500,320,500,294,474,320,460,305,450,305,385,305,450,320,465,325,
        495,320,500,314,454,340,480,305,405,500,305,405,534,300,410,490,250,355,490,
        310,405,495,325,425,580,250,355,490,305,430,305,430,325,475,288,348,228,303,
        318,268,365,380,535,288,480,310,440,310,440,305,465,325,460,310,448,430,490,
        320,440,290,490,300,490,330,480,305,490,310,325,430,350,535,340,530,340,530,
        455,490,325,505,460,580,580,580,300,340,525,535,580,680,580,600,
        // Gen 2 (152-251)
        318,405,525,309,405,534,314,405,530,250,235,250,430,385,250,365,310,535,430,
        320,390,510,320,510,430,385,355,440,250,340,280,500,280,500,305,465,270,435,
        320,360,300,530,250,380,305,260,405,305,410,250,365,250,330,495,405,350,510,
        300,490,310,430,230,390,250,450,310,480,340,510,310,510,310,475,340,495,
        330,495,530,330,525,300,290,540,300,310,540,535,580,580,580,580,600,680,
        // Gen 3 (252-386)
        310,405,530,310,405,530,310,405,535,220,340,275,365,265,370,260,440,288,
        431,266,386,295,455,310,480,380,500,220,360,295,380,265,360,310,475,276,
        430,353,475,325,455,290,410,269,381,310,440,320,460,330,485,303,334,463,
        295,454,370,330,510,310,320,465,330,510,410,380,480,220,320,430,280,280,
        480,335,455,480,380,305,365,465,385,485,490,500,340,480,320,480,200,270,
        265,300,360,440,430,302,282,236,270,350,330,454,282,382,405,300,345,375,
        480,330,510,303,280,490,295,470,350,309,580,580,535,535,600,600,600,
        670,670,680,600,600,
        // Gen 4 (387-493)
        318,405,525,309,405,534,314,405,530,268,411,268,411,352,356,472,310,454,
        330,474,300,340,480,340,275,430,305,405,330,518,330,282,382,310,310,415,
        455,470,500,390,300,474,310,490,310,330,370,479,345,480,405,525,360,360,
        460,295,290,320,435,405,495,310,405,465,330,495,320,520,285,455,328,
        508,405,480,530,385,498,300,470,460,510,540,380,490,500,505,515,505,
        515,600,580,480,580,580,580,600,600,600,670,600,600,600,
        // Gen 5 (494-649)
        528,308,413,528,308,413,528,308,413,528,292,348,452,264,358,468,305,
        370,464,328,488,329,316,316,471,275,385,470,275,275,325,325,494,494,
        301,401,501,368,488,285,351,260,260,500,257,340,488,225,334,474,284,
        484,308,495,230,310,428,528,284,484,355,495,289,481,335,485,325,495,
        401,501,345,363,483,308,490,265,310,466,255,431,310,490,330,480,330,
        510,310,500,252,300,480,486,474,305,505,315,255,275,350,350,349,253,
        360,350,485,300,362,552,405,580,580,580,470,580,600,600,600,680,
        580,580,270,600,600,600,600,600,600
    ];

    // Validar tamaño BST
    // Si faltan, rellenar con 400 como fallback
    while (BST.length <= 649) BST.push(400);

    // ==========================================
    // Tiers por BST
    // ==========================================
    const TIERS = [
        { min: 0, max: 299, label: 'Débil' },
        { min: 300, max: 449, label: 'Medio' },
        { min: 450, max: 549, label: 'Fuerte' },
        { min: 550, max: 599, label: 'Pseudo' },
        { min: 600, max: 9999, label: 'Legendario' },
    ];

    function getTierIndex(bst) {
        for (let i = 0; i < TIERS.length; i++) {
            if (bst >= TIERS[i].min && bst <= TIERS[i].max) return i;
        }
        return TIERS.length - 1;
    }

    // Precomputar listas de Pokémon por tier para cada generación
    function buildTierLists(maxDex) {
        const tiers = TIERS.map(() => []);
        for (let id = 1; id <= maxDex; id++) {
            const bst = BST[id] || 400;
            const tier = getTierIndex(bst);
            tiers[tier].push(id);
        }
        return tiers;
    }

    // Obtener un reemplazo del mismo tier (o tier adyacente si vacío)
    function getProgressiveReplacement(speciesId, tierLists, rng) {
        const bst = BST[speciesId] || 400;
        const tierIdx = getTierIndex(bst);

        // Intentar mismo tier primero
        if (tierLists[tierIdx].length > 0) {
            return rng.pick(tierLists[tierIdx]);
        }

        // Tier adyacente (inferior primero, luego superior)
        for (let offset = 1; offset < TIERS.length; offset++) {
            if (tierIdx - offset >= 0 && tierLists[tierIdx - offset].length > 0) {
                return rng.pick(tierLists[tierIdx - offset]);
            }
            if (tierIdx + offset < TIERS.length && tierLists[tierIdx + offset].length > 0) {
                return rng.pick(tierLists[tierIdx + offset]);
            }
        }

        return speciesId; // Sin cambios si no hay alternativa
    }

    // Pokémon comunes (excluyendo legendarios tier 5) para modo total
    function buildAllPokemon(maxDex) {
        const list = [];
        for (let i = 1; i <= maxDex; i++) list.push(i);
        return list;
    }

    function buildNonLegendary(maxDex) {
        const list = [];
        for (let i = 1; i <= maxDex; i++) {
            const bst = BST[i] || 400;
            if (bst < 600) list.push(i);
        }
        return list;
    }

    // ==========================================
    // Game Data — GBA
    // ==========================================
    const GBA_GAME_DATA = {
        'BPRE': { name: 'FireRed', platform: 'GBA', numPokemon: 386, totalMoves: 354, wildPokemonPtr: 0x3C9CB8, trainerDataPtr: 0x23EAC8, trainerCount: 743, pokemonMovesPtr: 0x25D7B4 },
        'BPEE': { name: 'Emerald', platform: 'GBA', numPokemon: 386, totalMoves: 354, wildPokemonPtr: 0x552D48, trainerDataPtr: 0x3185C8, trainerCount: 855, pokemonMovesPtr: 0x3230DC },
        'AXVE': { name: 'Ruby', platform: 'GBA', numPokemon: 386, totalMoves: 354, wildPokemonPtr: 0x39D454, trainerDataPtr: 0x1F04A4, trainerCount: 693, pokemonMovesPtr: 0x207BC8 },
        'AXPE': { name: 'Sapphire', platform: 'GBA', numPokemon: 386, totalMoves: 354, wildPokemonPtr: 0x39D2B4, trainerDataPtr: 0x1F0304, trainerCount: 693, pokemonMovesPtr: 0x207A28 },
        'BPGE': { name: 'LeafGreen', platform: 'GBA', numPokemon: 386, totalMoves: 354, wildPokemonPtr: 0x3C9AE8, trainerDataPtr: 0x23E8F8, trainerCount: 743, pokemonMovesPtr: 0x25D5E4 },
    };

    // ==========================================
    // Game Data — NDS
    // ==========================================
    const NDS_GAME_DATA = {
        'ADAE': { name: 'Diamond', platform: 'NDS', gen: 4, numPokemon: 493, totalMoves: 467, encounterNarcOffset: 0x1167C0, encounterTableSize: 232, numEncounterTables: 103, trainerOffset: 0xF9CB0, trainerCount: 618, trainerPokemonOffset: 0xFAFEC, pokemonMovesOffset: 0x1064C0 },
        'APAE': { name: 'Pearl', platform: 'NDS', gen: 4, numPokemon: 493, totalMoves: 467, encounterNarcOffset: 0x116480, encounterTableSize: 232, numEncounterTables: 103, trainerOffset: 0xF99E8, trainerCount: 618, trainerPokemonOffset: 0xFAD24, pokemonMovesOffset: 0x106248 },
        'CPUE': { name: 'Platinum', platform: 'NDS', gen: 4, numPokemon: 493, totalMoves: 467, encounterNarcOffset: 0x127E74, encounterTableSize: 232, numEncounterTables: 111, trainerOffset: 0xFCBB0, trainerCount: 728, trainerPokemonOffset: 0xFE410, pokemonMovesOffset: 0x10E480 },
        'IPKE': { name: 'HeartGold', platform: 'NDS', gen: 4, numPokemon: 493, totalMoves: 467, encounterNarcOffset: 0x124400, encounterTableSize: 232, numEncounterTables: 118, trainerOffset: 0xFBA28, trainerCount: 749, trainerPokemonOffset: 0xFD060, pokemonMovesOffset: 0x10EB00 },
        'IPGE': { name: 'SoulSilver', platform: 'NDS', gen: 4, numPokemon: 493, totalMoves: 467, encounterNarcOffset: 0x1243C0, encounterTableSize: 232, numEncounterTables: 118, trainerOffset: 0xFBA28, trainerCount: 749, trainerPokemonOffset: 0xFD060, pokemonMovesOffset: 0x10EAC0 },
        'IRBO': { name: 'Black', platform: 'NDS', gen: 5, numPokemon: 649, totalMoves: 559, encounterNarcOffset: 0x193800, encounterTableSize: 264, numEncounterTables: 124, trainerOffset: 0x7D3B0, trainerCount: 811, trainerPokemonOffset: 0x7EC00, pokemonMovesOffset: 0x8D000 },
        'IRAO': { name: 'White', platform: 'NDS', gen: 5, numPokemon: 649, totalMoves: 559, encounterNarcOffset: 0x193800, encounterTableSize: 264, numEncounterTables: 124, trainerOffset: 0x7D3B0, trainerCount: 811, trainerPokemonOffset: 0x7EC00, pokemonMovesOffset: 0x8D000 },
        'IREO': { name: 'Black 2', platform: 'NDS', gen: 5, numPokemon: 649, totalMoves: 559, encounterNarcOffset: 0x1A4C00, encounterTableSize: 264, numEncounterTables: 132, trainerOffset: 0x84930, trainerCount: 928, trainerPokemonOffset: 0x86280, pokemonMovesOffset: 0x95200 },
        'IRDO': { name: 'White 2', platform: 'NDS', gen: 5, numPokemon: 649, totalMoves: 559, encounterNarcOffset: 0x1A4C00, encounterTableSize: 264, numEncounterTables: 132, trainerOffset: 0x84930, trainerCount: 928, trainerPokemonOffset: 0x86280, pokemonMovesOffset: 0x95200 },
    };

    const GAME_DATA = { ...GBA_GAME_DATA, ...NDS_GAME_DATA };

    // ==========================================
    // Seeded RNG
    // ==========================================
    class SeededRandom {
        constructor(seed) { this.seed = seed || Date.now(); }
        next() { this.seed = (this.seed * 1103515245 + 12345) & 0x7FFFFFFF; return this.seed / 0x7FFFFFFF; }
        nextInt(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
        pick(arr) { return arr[this.nextInt(0, arr.length - 1)]; }
    }

    // ==========================================
    // Utilidades de lectura
    // ==========================================
    function readGBAPointer(view, offset) {
        const ptr = view.getUint32(offset, true);
        return (ptr === 0 || ptr < 0x08000000) ? 0 : ptr - 0x08000000;
    }

    // ==========================================
    // GBA — Randomización de salvajes
    // ==========================================
    function gbaWild(data, view, gd, rng, replacer) {
        let count = 0;
        let ptr = gd.wildPokemonPtr;
        if (!ptr) return 0;

        for (let i = 0; i < 200; i++) {
            if (ptr + 20 > data.length) break;
            if (data[ptr] === 0xFF && data[ptr + 1] === 0xFF) break;

            const ptrs = [readGBAPointer(view, ptr + 4), readGBAPointer(view, ptr + 8), readGBAPointer(view, ptr + 12), readGBAPointer(view, ptr + 16)];
            const slots = [12, 5, 5, 10];

            for (let t = 0; t < 4; t++) {
                const tp = ptrs[t];
                if (!tp || tp >= data.length) continue;
                const ep = readGBAPointer(view, tp + 4);
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
    // GBA — Randomización de entrenadores
    // ==========================================
    function gbaTrainers(data, view, gd, rng, replacer) {
        if (!gd.trainerDataPtr) return 0;
        let count = 0;

        for (let i = 0; i < gd.trainerCount; i++) {
            const off = gd.trainerDataPtr + (i * 40);
            if (off + 40 > data.length) break;

            const structType = data[off];
            const numPkm = view.getUint32(off + 32, true);
            const partyPtr = readGBAPointer(view, off + 36);
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
            }
        }
        return count;
    }

    // ==========================================
    // GBA — Randomización de movimientos
    // ==========================================
    function gbaMoves(data, view, gd, rng) {
        if (!gd.pokemonMovesPtr) return 0;
        let count = 0;

        for (let i = 0; i < gd.numPokemon; i++) {
            const pOff = gd.pokemonMovesPtr + (i * 4);
            if (pOff + 4 > data.length) break;
            const mp = readGBAPointer(view, pOff);
            if (!mp || mp >= data.length) continue;

            let mOff = mp;
            for (let j = 0; j < 20; j++) {
                if (mOff + 2 > data.length) break;
                const entry = view.getUint16(mOff, true);
                if (entry === 0xFFFF) break;
                const moveId = entry & 0x1FF;
                const level = (entry >> 9) & 0x7F;
                if (moveId > 0 && moveId <= gd.totalMoves) {
                    const newEntry = (level << 9) | (rng.nextInt(1, gd.totalMoves) & 0x1FF);
                    view.setUint16(mOff, newEntry, true);
                    count++;
                }
                mOff += 2;
            }
        }
        return count;
    }

    // ==========================================
    // NDS — Randomización de salvajes
    // ==========================================
    function ndsWild(data, view, gd, rng, replacer) {
        const base = gd.encounterNarcOffset;
        if (!base || base >= data.length) return 0;
        let count = 0;

        if (gd.gen === 4) {
            for (let t = 0; t < gd.numEncounterTables; t++) {
                const ts = base + (t * gd.encounterTableSize);
                if (ts + gd.encounterTableSize > data.length) break;

                // Grass: 12 slots (level u32 + species u32), starts at +4
                let off = ts + 4;
                for (let s = 0; s < 12; s++) {
                    if (off + 8 > data.length) break;
                    const sp = view.getUint32(off + 4, true);
                    if (sp > 0 && sp <= gd.numPokemon) {
                        view.setUint32(off + 4, replacer(sp), true);
                        count++;
                    }
                    off += 8;
                }
                // Variant species (20 u32)
                for (let v = 0; v < 20; v++) {
                    if (off + 4 > data.length) break;
                    const sp = view.getUint32(off, true);
                    if (sp > 0 && sp <= gd.numPokemon) {
                        view.setUint32(off, replacer(sp), true);
                        count++;
                    }
                    off += 4;
                }
                // Water: 5 slots
                off = ts + 188;
                for (let s = 0; s < 5; s++) {
                    if (off + 8 > data.length) break;
                    const sp = view.getUint32(off + 4, true);
                    if (sp > 0 && sp <= gd.numPokemon) {
                        view.setUint32(off + 4, replacer(sp), true);
                        count++;
                    }
                    off += 8;
                }
            }
        } else if (gd.gen === 5) {
            for (let t = 0; t < gd.numEncounterTables; t++) {
                const ts = base + (t * gd.encounterTableSize);
                if (ts + gd.encounterTableSize > data.length) break;

                let off = ts + 4;
                // Grass + double + dark grass = 36 slots
                for (let s = 0; s < 36; s++) {
                    if (off + 4 > data.length) break;
                    const sp = view.getUint16(off, true);
                    if (sp > 0 && sp <= gd.numPokemon) {
                        view.setUint16(off, replacer(sp), true);
                        count++;
                    }
                    off += 4;
                }
                // Water + fishing = 10 slots
                off = ts + 192;
                for (let s = 0; s < 10; s++) {
                    if (off + 4 > data.length) break;
                    const sp = view.getUint16(off, true);
                    if (sp > 0 && sp <= gd.numPokemon) {
                        view.setUint16(off, replacer(sp), true);
                        count++;
                    }
                    off += 4;
                }
            }
        }
        return count;
    }

    // ==========================================
    // NDS — Randomización de entrenadores
    // ==========================================
    function ndsTrainers(data, view, gd, rng, replacer) {
        if (!gd.trainerPokemonOffset) return 0;
        let count = 0;
        let off = gd.trainerPokemonOffset;
        const end = Math.min(off + (gd.trainerCount * 96), data.length);

        while (off + 6 <= end) {
            const sp = view.getUint16(off, true);
            const lv = view.getUint16(off + 2, true);
            if (sp > 0 && sp <= gd.numPokemon && lv > 0 && lv <= 100) {
                view.setUint16(off, replacer(sp), true);
                count++;
                off += 6;
            } else {
                off += 2;
            }
        }
        return count;
    }

    // ==========================================
    // NDS — Randomización de movimientos
    // ==========================================
    function ndsMoves(data, view, gd, rng) {
        if (!gd.pokemonMovesOffset) return 0;
        let count = 0;
        let off = gd.pokemonMovesOffset;
        const end = Math.min(off + (gd.numPokemon * 100), data.length);

        while (off + 4 <= end) {
            const moveId = view.getUint16(off, true);
            const level = view.getUint16(off + 2, true);
            if (moveId === 0xFFFF && level === 0xFFFF) { off += 4; continue; }
            if (moveId > 0 && moveId <= gd.totalMoves && level >= 0 && level <= 100) {
                view.setUint16(off, rng.nextInt(1, gd.totalMoves), true);
                count++;
            }
            off += 4;
        }
        return count;
    }

    // ==========================================
    // MODOS DE RANDOMIZACIÓN (Solo Progresivos)
    // ==========================================

    /**
     * MODO PROGRESSIVE — Reemplazo por BST similar
     */
    function randomizeProgressive(buffer, gd, rng, onProgress) {
        const data = new Uint8Array(buffer);
        const view = new DataView(buffer);
        const tierLists = buildTierLists(gd.numPokemon);
        const replacer = (sp) => getProgressiveReplacement(sp, tierLists, rng);
        const isGBA = gd.platform === 'GBA';
        const stats = { wildPokemon: 0, trainers: 0 };

        if (onProgress) onProgress(10);
        stats.wildPokemon = isGBA ? gbaWild(data, view, gd, rng, replacer) : ndsWild(data, view, gd, rng, replacer);
        if (onProgress) onProgress(50);
        stats.trainers = isGBA ? gbaTrainers(data, view, gd, rng, replacer) : ndsTrainers(data, view, gd, rng, replacer);
        if (onProgress) onProgress(100);

        return stats;
    }

    /**
     * MODO 4: SEMI-PROGRESSIVE — Salvajes por BST, entrenadores intactos, ítems aleatorios
     */
    function randomizeSemiProgressive(buffer, gd, rng, onProgress) {
        const data = new Uint8Array(buffer);
        const view = new DataView(buffer);
        const tierLists = buildTierLists(gd.numPokemon);
        const replacer = (sp) => getProgressiveReplacement(sp, tierLists, rng);
        const isGBA = gd.platform === 'GBA';
        const stats = { wildPokemon: 0, trainers: 0 };

        if (onProgress) onProgress(10);
        stats.wildPokemon = isGBA ? gbaWild(data, view, gd, rng, replacer) : ndsWild(data, view, gd, rng, replacer);
        if (onProgress) onProgress(70);
        // Entrenadores y Movimientos: NO se tocan
        if (onProgress) onProgress(100);

        return stats;
    }

    // ==========================================
    // API PÚBLICA
    // ==========================================

    function isSupported(gameCode) {
        return !!GAME_DATA[gameCode];
    }

    /**
     * @param {ArrayBuffer} romBuffer
     * @param {string} gameCode
     * @param {Object} options   { mode: 'full'|'semi'|'progressive'|'semiProgressive', seed: number }
     * @param {Function} onProgress
     */
    function randomize(romBuffer, gameCode, options, onProgress) {
        const gd = GAME_DATA[gameCode];
        if (!gd) throw new Error(`Juego no soportado: ${gameCode}`);

        const buffer = romBuffer.slice(0);
        const rng = new SeededRandom(options.seed || Date.now());
        const mode = options.mode || 'progressive';

        let stats;
        switch (mode) {
            case 'progressive':
                stats = randomizeProgressive(buffer, gd, rng, onProgress);
                break;
            case 'semiProgressive':
                stats = randomizeSemiProgressive(buffer, gd, rng, onProgress);
                break;
            default:
                throw new Error(`Modo de randomización no válido: ${mode}`);
        }

        return {
            buffer,
            stats,
            gameName: gd.name,
            mode,
        };
    }

    // Exponer tiers y BST para uso externo si se necesita debug
    return {
        isSupported,
        randomize,
        GAME_DATA,
        BST,
        TIERS,
    };
})();
