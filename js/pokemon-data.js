/**
 * pokemon-data.js
 * Módulo central de datos Pokémon para el Smart GBA Randomizer.
 *
 * En lugar de hardcodear 386 Pokémon, LEE los datos directamente de la ROM GBA:
 *   - Base stats (HP, Atk, Def, Spd, SpAtk, SpDef)
 *   - Tipos
 *   - BST (calculado)
 *   - Evoluciones
 *
 * Solo hardcodeamos:
 *   - Offsets conocidos por juego/región
 *   - Lista de legendarios
 *   - Constantes de tipos
 *   - Auto-detección de offsets como fallback
 */

const PokemonData = (() => {
    'use strict';

    // ===================================================
    //  Constantes de tipos (IDs internos GBA)
    // ===================================================
    const TYPE = {
        NORMAL: 0, FIGHTING: 1, FLYING: 2, POISON: 3, GROUND: 4,
        ROCK: 5, BUG: 6, GHOST: 7, STEEL: 8,
        /* 9 = ??? (sin uso) */
        FIRE: 10, WATER: 11, GRASS: 12, ELECTRIC: 13,
        PSYCHIC: 14, ICE: 15, DRAGON: 16, DARK: 17
    };

    const TYPE_NAMES = {
        0: 'Normal', 1: 'Lucha', 2: 'Volador', 3: 'Veneno', 4: 'Tierra',
        5: 'Roca', 6: 'Bicho', 7: 'Fantasma', 8: 'Acero',
        10: 'Fuego', 11: 'Agua', 12: 'Planta', 13: 'Eléctrico',
        14: 'Psíquico', 15: 'Hielo', 16: 'Dragón', 17: 'Siniestro'
    };

    // ===================================================
    //  Tiers por BST (Base Stat Total)
    // ===================================================
    const TIERS = [
        { min: 0,   max: 300,  label: 'Early Game' },
        { min: 301, max: 450,  label: 'Mid Game' },
        { min: 451, max: 600,  label: 'Late Game' },
        { min: 601, max: 9999, label: 'Endgame / Legendario' }
    ];

    function getTierIndex(bst) {
        for (let i = 0; i < TIERS.length; i++) {
            if (bst >= TIERS[i].min && bst <= TIERS[i].max) return i;
        }
        return TIERS.length - 1;
    }

    // ===================================================
    //  Pokémon legendarios / míticos (Gen 1-3)
    // ===================================================
    const LEGENDARIES = new Set([
        // Gen 1
        144, 145, 146, 150, 151,
        // Gen 2
        243, 244, 245, 249, 250, 251,
        // Gen 3
        377, 378, 379, 380, 381, 382, 383, 384, 385, 386
    ]);

    // ===================================================
    //  Rangos por generación
    // ===================================================
    const GEN_RANGES = {
        1: { start: 1, end: 151 },
        2: { start: 152, end: 251 },
        3: { start: 252, end: 386 }
    };

    // ===================================================
    //  Datos de juegos GBA — Offsets por versión
    //
    //  Estructura de base stats GBA: 28 bytes por entrada
    //    0: HP, 1: Atk, 2: Def, 3: Spd, 4: SpAtk, 5: SpDef
    //    6: Type1, 7: Type2
    //    8: Catch rate, 9: Base EXP
    //    10-11: EV yield, 12-15: Items
    //    16: Gender, 17: Egg cycles, 18: Friendship
    //    19: Growth, 20-21: Egg groups
    //    22-23: Abilities (bytes)
    //    24-27: Misc
    //
    //  Estructura de evolución: 40 bytes por Pokémon (5 × 8 bytes)
    //    0-1: Método, 2-3: Parámetro, 4-5: Target, 6-7: Padding
    // ===================================================

    const GAME_DATA = {
        // ---- FireRed ----
        'BPRE': {
            name: 'Pokémon FireRed', region: 'USA', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: 0x254784,
            evolutionPtr: 0x259754,
            wildPokemonPtr: 0x3C9CB8,
            trainerDataPtr: 0x23EAC8,
            trainerCount: 743,
            pokemonMovesPtr: 0x25D7B4,
            starterOffsets: [0x169BB8]
        },
        'BPRP': {
            name: 'Pokémon FireRed', region: 'EUR', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: null, // auto-detect
            evolutionPtr: null,
            wildPokemonPtr: null,
            trainerDataPtr: null,
            trainerCount: 743,
            pokemonMovesPtr: null,
            starterOffsets: null,
            autoDetect: true
        },

        // ---- LeafGreen ----
        'BPGE': {
            name: 'Pokémon LeafGreen', region: 'USA', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: 0x2545B4,
            evolutionPtr: 0x259584,
            wildPokemonPtr: 0x3C9AE8,
            trainerDataPtr: 0x23E8F8,
            trainerCount: 743,
            pokemonMovesPtr: 0x25D5E4,
            starterOffsets: null
        },
        'BPGP': {
            name: 'Pokémon LeafGreen', region: 'EUR', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: null,
            evolutionPtr: null,
            wildPokemonPtr: null,
            trainerDataPtr: null,
            trainerCount: 743,
            pokemonMovesPtr: null,
            starterOffsets: null,
            autoDetect: true
        },

        // ---- Emerald ----
        'BPEE': {
            name: 'Pokémon Emerald', region: 'USA', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: 0x3203CC,
            evolutionPtr: 0x32531C,
            wildPokemonPtr: 0x552D48,
            trainerDataPtr: 0x3185C8,
            trainerCount: 855,
            pokemonMovesPtr: 0x3230DC,
            starterOffsets: null
        },
        'BPEP': {
            name: 'Pokémon Emerald', region: 'EUR', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: null,
            evolutionPtr: null,
            wildPokemonPtr: null,
            trainerDataPtr: null,
            trainerCount: 855,
            pokemonMovesPtr: null,
            starterOffsets: null,
            autoDetect: true
        },

        // ---- Ruby ----
        'AXVE': {
            name: 'Pokémon Ruby', region: 'USA', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: 0x1FEC18,
            evolutionPtr: 0x20842C,
            wildPokemonPtr: 0x39D454,
            trainerDataPtr: 0x1F04A4,
            trainerCount: 693,
            pokemonMovesPtr: 0x207BC8,
            starterOffsets: null
        },
        'AXVP': {
            name: 'Pokémon Ruby', region: 'EUR', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: null, evolutionPtr: null, wildPokemonPtr: null,
            trainerDataPtr: null, trainerCount: 693, pokemonMovesPtr: null,
            starterOffsets: null, autoDetect: true
        },

        // ---- Sapphire ----
        'AXPE': {
            name: 'Pokémon Sapphire', region: 'USA', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: 0x1FEA78,
            evolutionPtr: 0x20828C,
            wildPokemonPtr: 0x39D2B4,
            trainerDataPtr: 0x1F0304,
            trainerCount: 693,
            pokemonMovesPtr: 0x207A28,
            starterOffsets: null
        },
        'AXPP': {
            name: 'Pokémon Sapphire', region: 'EUR', numPokemon: 386, totalMoves: 354,
            baseStatsPtr: null, evolutionPtr: null, wildPokemonPtr: null,
            trainerDataPtr: null, trainerCount: 693, pokemonMovesPtr: null,
            starterOffsets: null, autoDetect: true
        }
    };

    // ===================================================
    //  Auto-detección de offsets por patrones conocidos
    //  (para ROMs EUR o versiones no catalogadas)
    // ===================================================

    /**
     * Busca el offset de la tabla de base stats buscando las stats de Bulbasaur.
     * Bulbasaur (species 1): HP=45, Atk=49, Def=49, Spd=45, SpAtk=65, SpDef=65, T1=Grass(12), T2=Poison(3)
     * La tabla empieza en species 0 (dummy), Bulbasaur está en offset + 28.
     */
    function findBaseStatsPtr(romData) {
        const pattern = [45, 49, 49, 45, 65, 65, 12, 3]; // Bulbasaur
        const len = romData.length - 28 * 400;

        for (let i = 0x100000; i < len; i++) {
            let match = true;
            for (let j = 0; j < pattern.length; j++) {
                if (romData[i + j] !== pattern[j]) { match = false; break; }
            }
            if (!match) continue;

            // Verificar Charmander (species 4) a +28*3 de Bulbasaur
            const charm = i + 28 * 3; // 3 entries after Bulbasaur
            if (romData[charm] === 39 && romData[charm + 1] === 52 &&
                romData[charm + 6] === 10) { // HP=39, Atk=52, Type1=Fire
                return i - 28; // Retroceder 1 entrada (species 0)
            }
        }
        return null;
    }

    /**
     * Busca la tabla de evoluciones. Cada Pokémon tiene 5 slots de 8 bytes = 40 bytes.
     * Bulbasaur (species 1) evoluciona a Ivysaur (species 2) por nivel (method 4, param ~16).
     */
    function findEvolutionPtr(romData, view) {
        const len = romData.length - 40 * 400;
        for (let i = 0x100000; i < len; i++) {
            // Species 1 (Bulbasaur): method=4 (level), param≈16, target=2 (Ivysaur)
            const base = i + 40; // species 1
            const method = view.getUint16(base, true);
            const param = view.getUint16(base + 2, true);
            const target = view.getUint16(base + 4, true);

            if (method === 4 && param === 16 && target === 2) {
                // Verificar Charmander (species 4): method=4, target=5 (Charmeleon)
                const charm = i + 40 * 4;
                const cm = view.getUint16(charm, true);
                const ct = view.getUint16(charm + 4, true);
                if (cm === 4 && ct === 5) return i;
            }
        }
        return null;
    }

    /**
     * Busca la tabla de encuentros salvajes.
     * Cada zona tiene un header de 20 bytes con mapBank, mapNum y 4 punteros GBA.
     */
    function findWildPokemonPtr(romData, view) {
        // Buscamos un patrón: secuencia de headers con punteros GBA válidos (0x08XXXXXX)
        const len = romData.length - 20 * 210;
        for (let i = 0x100000; i < len; i++) {
            let valid = 0;
            for (let h = 0; h < 5; h++) {
                const off = i + h * 20;
                const p1 = view.getUint32(off + 4, true);
                const p2 = view.getUint32(off + 8, true);
                if ((p1 >= 0x08000000 && p1 < 0x0A000000) ||
                    (p2 >= 0x08000000 && p2 < 0x0A000000)) {
                    valid++;
                }
            }
            // Verificar terminador (0xFF 0xFF en algún punto)
            if (valid >= 4) {
                for (let t = 5; t < 200; t++) {
                    const tOff = i + t * 20;
                    if (tOff + 2 > romData.length) break;
                    if (romData[tOff] === 0xFF && romData[tOff + 1] === 0xFF) {
                        return i;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Intenta auto-detectar TODOS los offsets necesarios para una ROM desconocida.
     * Rellena los campos null del gameData.
     */
    function autoDetectOffsets(romData, gameData) {
        const view = new DataView(romData.buffer);

        if (!gameData.baseStatsPtr) {
            gameData.baseStatsPtr = findBaseStatsPtr(romData);
            if (!gameData.baseStatsPtr) {
                throw new Error('No se pudo detectar la tabla de stats en esta ROM');
            }
        }

        if (!gameData.evolutionPtr) {
            gameData.evolutionPtr = findEvolutionPtr(romData, view);
            // No crítico: sin evoluciones, el modo evoluciones no funciona
        }

        if (!gameData.wildPokemonPtr) {
            gameData.wildPokemonPtr = findWildPokemonPtr(romData, view);
        }

        // trainerDataPtr es difícil de auto-detectar, dejamos null si no hay
        return gameData;
    }

    // ===================================================
    //  Funciones de lectura de datos desde la ROM
    // ===================================================

    /** Lee los 6 base stats de un Pokémon desde la ROM */
    function readBaseStats(romData, gameData, speciesId) {
        const off = gameData.baseStatsPtr + (speciesId * 28);
        if (off + 28 > romData.length) return null;
        return {
            hp:    romData[off],
            atk:   romData[off + 1],
            def:   romData[off + 2],
            spd:   romData[off + 3],
            spatk: romData[off + 4],
            spdef: romData[off + 5]
        };
    }

    /** Calcula BST de un Pokémon leyendo la ROM */
    function calculateBST(romData, gameData, speciesId) {
        const off = gameData.baseStatsPtr + (speciesId * 28);
        if (off + 6 > romData.length) return 0;
        return romData[off] + romData[off + 1] + romData[off + 2] +
               romData[off + 3] + romData[off + 4] + romData[off + 5];
    }

    /** Lee los tipos de un Pokémon desde la ROM */
    function readTypes(romData, gameData, speciesId) {
        const off = gameData.baseStatsPtr + (speciesId * 28);
        if (off + 8 > romData.length) return [0, 0];
        return [romData[off + 6], romData[off + 7]];
    }

    /** Lee las 2 abilities de un Pokémon (bytes 22-23 del bloque de stats) */
    function readAbilities(romData, gameData, speciesId) {
        const off = gameData.baseStatsPtr + (speciesId * 28);
        if (off + 24 > romData.length) return [0, 0];
        return [romData[off + 22], romData[off + 23]];
    }

    /** Lee las evoluciones de un Pokémon (5 slots × 8 bytes) */
    function readEvolutions(romData, view, gameData, speciesId) {
        if (!gameData.evolutionPtr) return [];
        const base = gameData.evolutionPtr + (speciesId * 40);
        if (base + 40 > romData.length) return [];

        const evos = [];
        for (let i = 0; i < 5; i++) {
            const off = base + (i * 8);
            const method = view.getUint16(off, true);
            const param = view.getUint16(off + 2, true);
            const target = view.getUint16(off + 4, true);
            if (method !== 0 && target > 0 && target <= gameData.numPokemon) {
                evos.push({ method, param, target });
            }
        }
        return evos;
    }

    // ===================================================
    //  Builders — construyen listas para randomización
    // ===================================================

    /**
     * Construye listas de Pokémon agrupados por tier.
     * @param {Uint8Array} romData
     * @param {Object} gameData
     * @param {Object} options  { noLegendaries, onlyGen, excludeIds }
     * @returns {Array<number[]>} Array de 4 arrays, uno por tier
     */
    function buildTierLists(romData, gameData, options) {
        const tiers = TIERS.map(() => []);
        const opts = options || {};

        for (let id = 1; id <= gameData.numPokemon; id++) {
            // Filtro: no legendarios
            if (opts.noLegendaries && LEGENDARIES.has(id)) continue;

            // Filtro: solo generación X
            if (opts.onlyGen) {
                const range = GEN_RANGES[opts.onlyGen];
                if (range && (id < range.start || id > range.end)) continue;
            }

            // Filtro: IDs excluidos
            if (opts.excludeIds && opts.excludeIds.has(id)) continue;

            const bst = calculateBST(romData, gameData, id);
            if (bst === 0) continue; // Species inválida

            const tier = getTierIndex(bst);
            tiers[tier].push(id);
        }

        return tiers;
    }

    /**
     * Construye tabla de tipos para TODOS los Pokémon.
     * @returns {Array<[number, number]>} Indexado por species ID
     */
    function buildTypeTable(romData, gameData) {
        const table = new Array(gameData.numPokemon + 1);
        for (let id = 0; id <= gameData.numPokemon; id++) {
            table[id] = readTypes(romData, gameData, id);
        }
        return table;
    }

    /**
     * Construye tabla de BST para TODOS los Pokémon.
     * @returns {Uint16Array} Indexado por species ID
     */
    function buildBSTTable(romData, gameData) {
        const table = new Uint16Array(gameData.numPokemon + 1);
        for (let id = 0; id <= gameData.numPokemon; id++) {
            table[id] = calculateBST(romData, gameData, id);
        }
        return table;
    }

    /**
     * Construye todas las cadenas evolutivas.
     * @returns {Array<number[]>} Lista de cadenas, ej: [[1,2,3], [4,5,6], ...]
     */
    function buildEvolutionChains(romData, view, gameData) {
        if (!gameData.evolutionPtr) return [];

        // Construir grafo pre → [evo targets]
        const evolvesTo = {};
        const evolvesFrom = {};

        for (let id = 1; id <= gameData.numPokemon; id++) {
            const evos = readEvolutions(romData, view, gameData, id);
            for (const e of evos) {
                if (!evolvesTo[id]) evolvesTo[id] = [];
                evolvesTo[id].push(e.target);
                evolvesFrom[e.target] = id;
            }
        }

        // Encontrar raíces (Pokémon que no evolucionan DE nadie)
        const visited = new Set();
        const chains = [];

        for (let id = 1; id <= gameData.numPokemon; id++) {
            if (visited.has(id)) continue;
            if (evolvesFrom[id]) continue; // No es raíz

            // Construir cadena desde esta raíz
            const chain = [];
            const queue = [id];
            while (queue.length > 0) {
                const current = queue.shift();
                if (visited.has(current)) continue;
                visited.add(current);
                chain.push(current);
                if (evolvesTo[current]) {
                    queue.push(...evolvesTo[current]);
                }
            }
            if (chain.length > 0) chains.push(chain);
        }

        return chains;
    }

    /**
     * Determina el "rol" de un Pokémon basado en sus stats.
     * Categorías: 'physical', 'special', 'tank', 'fast', 'balanced'
     */
    function getRole(romData, gameData, speciesId) {
        const stats = readBaseStats(romData, gameData, speciesId);
        if (!stats) return 'balanced';

        const maxStat = Math.max(stats.atk, stats.spatk, stats.def, stats.spdef, stats.spd);

        if (stats.atk === maxStat && stats.atk > stats.spatk * 1.3) return 'physical';
        if (stats.spatk === maxStat && stats.spatk > stats.atk * 1.3) return 'special';
        if ((stats.def + stats.spdef) > (stats.atk + stats.spatk) * 1.2) return 'tank';
        if (stats.spd === maxStat && stats.spd > 90) return 'fast';
        return 'balanced';
    }

    // ===================================================
    //  Utilidad: leer puntero GBA (0x08XXXXXX → offset)
    // ===================================================
    function readGBAPointer(view, offset) {
        const ptr = view.getUint32(offset, true);
        return (ptr === 0 || ptr < 0x08000000) ? 0 : ptr - 0x08000000;
    }

    // ===================================================
    //  Validación de ROM
    // ===================================================
    function validateROM(romData, gameData) {
        if (!gameData.baseStatsPtr) return false;
        // Verificar Bulbasaur: HP=45
        const off = gameData.baseStatsPtr + 28;
        return off < romData.length && romData[off] === 45;
    }

    // ===================================================
    //  API Pública
    // ===================================================
    return {
        TYPE,
        TYPE_NAMES,
        TIERS,
        LEGENDARIES,
        GEN_RANGES,
        GAME_DATA,
        getTierIndex,
        autoDetectOffsets,
        readBaseStats,
        calculateBST,
        readTypes,
        readAbilities,
        readEvolutions,
        readGBAPointer,
        buildTierLists,
        buildTypeTable,
        buildBSTTable,
        buildEvolutionChains,
        getRole,
        validateROM
    };
})();
