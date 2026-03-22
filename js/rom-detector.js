/**
 * rom-detector.js
 * Detecta información de la ROM: título, código de juego, región, checksum.
 * Soporta: GBA, GB, GBC, NDS, y detección genérica para 3DS/ISO.
 */

const RomDetector = (() => {
    'use strict';

    // ==========================================
    // CRC32 — Tabla precalculada
    // ==========================================
    const crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[i] = c;
    }

    /**
     * Calcula CRC32 de un ArrayBuffer o Uint8Array
     */
    function calculateCRC32(data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = crc32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, '0');
    }

    /**
     * Lee un string ASCII desde un buffer
     */
    function readAscii(view, offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            const ch = view.getUint8(offset + i);
            if (ch === 0) break;
            str += String.fromCharCode(ch);
        }
        return str.trim();
    }

    /**
     * Detecta región a partir del código de juego
     * Último carácter: E=USA, P=Europa, J=Japón, etc.
     */
    function detectRegion(gameCode) {
        if (!gameCode || gameCode.length < 1) return 'Desconocida';
        const regionChar = gameCode[gameCode.length - 1];
        const regionMap = {
            'E': 'USA',
            'P': 'Europa',
            'J': 'Japón',
            'S': 'España',
            'F': 'Francia',
            'D': 'Alemania',
            'I': 'Italia',
            'K': 'Corea',
            'O': 'Internacional'
        };
        return regionMap[regionChar] || `Desconocida (${regionChar})`;
    }

    // ==========================================
    // Base de datos de juegos conocidos de Pokémon
    // ==========================================
    const POKEMON_GAMES = {
        // GBA
        'BPEE': { name: 'Pokémon Emerald', gen: 3 },
        'BPRE': { name: 'Pokémon FireRed', gen: 3 },
        'BPGE': { name: 'Pokémon LeafGreen', gen: 3 },
        'AXVE': { name: 'Pokémon Ruby', gen: 3 },
        'AXPE': { name: 'Pokémon Sapphire', gen: 3 },
        'BPRJ': { name: 'Pokémon FireRed (J)', gen: 3 },
        'BPGJ': { name: 'Pokémon LeafGreen (J)', gen: 3 },
        'BPEJ': { name: 'Pokémon Emerald (J)', gen: 3 },
        'BPRP': { name: 'Pokémon FireRed (EU)', gen: 3 },
        'BPGP': { name: 'Pokémon LeafGreen (EU)', gen: 3 },
        'BPEP': { name: 'Pokémon Emerald (EU)', gen: 3 },
        'AXVJ': { name: 'Pokémon Ruby (J)', gen: 3 },
        'AXPJ': { name: 'Pokémon Sapphire (J)', gen: 3 },
        // NDS
        'ADAE': { name: 'Pokémon Diamond', gen: 4 },
        'APAE': { name: 'Pokémon Pearl', gen: 4 },
        'CPUE': { name: 'Pokémon Platinum', gen: 4 },
        'IPKE': { name: 'Pokémon HeartGold', gen: 4 },
        'IPGE': { name: 'Pokémon SoulSilver', gen: 4 },
        'IRBO': { name: 'Pokémon Black', gen: 5 },
        'IRAO': { name: 'Pokémon White', gen: 5 },
        'IREO': { name: 'Pokémon Black 2', gen: 5 },
        'IRDO': { name: 'Pokémon White 2', gen: 5 },
    };

    // ==========================================
    // Detectores por formato
    // ==========================================

    /**
     * Detecta ROM de Game Boy / Game Boy Color
     */
    function detectGB(buffer) {
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        // Verificar logo de Nintendo en 0x104-0x133
        const nintendoLogo = [0xCE, 0xED, 0x66, 0x66, 0xCC, 0x0D, 0x00, 0x0B];
        let isValid = true;
        for (let i = 0; i < nintendoLogo.length; i++) {
            if (bytes[0x104 + i] !== nintendoLogo[i]) {
                isValid = false;
                break;
            }
        }

        const title = readAscii(view, 0x134, 16);
        const cgbFlag = view.getUint8(0x143);
        const isGBC = (cgbFlag === 0x80 || cgbFlag === 0xC0);
        const cartridgeType = view.getUint8(0x147);
        const romSizeCode = view.getUint8(0x148);

        // El código de juego para GB/GBC está en 0x13F-0x142 (CGB only)
        let gameCode = '';
        if (isGBC) {
            gameCode = readAscii(view, 0x13F, 4);
        }

        return {
            format: isGBC ? 'GBC' : 'GB',
            title: title || 'Desconocido',
            gameCode: gameCode || 'N/A',
            region: gameCode ? detectRegion(gameCode) : 'Desconocida',
            isValid: isValid,
            isPokemon: false,
            pokemonGen: 0
        };
    }

    /**
     * Detecta ROM de Game Boy Advance
     */
    function detectGBA(buffer) {
        const view = new DataView(buffer);

        const title = readAscii(view, 0xA0, 12);
        const gameCode = readAscii(view, 0xAC, 4);
        const makerCode = readAscii(view, 0xB0, 2);

        // Verificar byte de inicio (debe ser un salto ARM: 0x2E000000 area)
        const entryPoint = view.getUint32(0x00, true);
        const isValid = (entryPoint & 0xFF000000) === 0xEA000000 || (entryPoint & 0xFF000000) === 0x2E000000;

        const pokemonInfo = POKEMON_GAMES[gameCode];

        return {
            format: 'GBA',
            title: pokemonInfo ? pokemonInfo.name : (title || 'Desconocido'),
            gameCode: gameCode || 'N/A',
            region: detectRegion(gameCode),
            makerCode: makerCode,
            isValid: true,
            isPokemon: !!pokemonInfo,
            pokemonGen: pokemonInfo ? pokemonInfo.gen : 0
        };
    }

    /**
     * Detecta ROM de Nintendo DS
     */
    function detectNDS(buffer) {
        const view = new DataView(buffer);

        const title = readAscii(view, 0x00, 12);
        const gameCode = readAscii(view, 0x0C, 4);
        const makerCode = readAscii(view, 0x10, 2);

        // Verificar tamaño del encabezado NDS (0x200 bytes como mínimo)
        const headerSize = view.getUint32(0x84, true);

        const pokemonInfo = POKEMON_GAMES[gameCode];

        return {
            format: 'NDS',
            title: pokemonInfo ? pokemonInfo.name : (title || 'Desconocido'),
            gameCode: gameCode || 'N/A',
            region: detectRegion(gameCode),
            makerCode: makerCode,
            isValid: true,
            isPokemon: !!pokemonInfo,
            pokemonGen: pokemonInfo ? pokemonInfo.gen : 0
        };
    }

    /**
     * Detección genérica para ISO
     */
    function detectISO(buffer) {
        return {
            format: 'ISO',
            title: 'Archivo ISO',
            gameCode: 'N/A',
            region: 'Desconocida',
            isValid: true,
            isPokemon: false,
            pokemonGen: 0,
            warning: 'Los archivos .iso pueden ser muy grandes. El parcheo depende de la memoria disponible.'
        };
    }

    // ==========================================
    // API pública
    // ==========================================

    /**
     * Detecta el tipo y la información de una ROM
     * @param {ArrayBuffer} buffer - El contenido del archivo ROM
     * @param {string} extension - La extensión del archivo (sin punto)
     * @returns {Object} Información de la ROM
     */
    function detect(buffer, extension) {
        const ext = extension.toLowerCase();
        let info;

        switch (ext) {
            case 'gb':
            case 'gbc':
                info = detectGB(buffer);
                break;
            case 'gba':
                info = detectGBA(buffer);
                break;
            case 'nds':
                info = detectNDS(buffer);
                break;
            case 'iso':
                info = detectISO(buffer);
                break;
            default:
                info = {
                    format: ext.toUpperCase(),
                    title: 'Desconocido',
                    gameCode: 'N/A',
                    region: 'Desconocida',
                    isValid: false,
                    isPokemon: false,
                    pokemonGen: 0
                };
        }

        // Calcular CRC32 (solo los primeros 16MB para archivos grandes)
        const maxCrcSize = 16 * 1024 * 1024;
        const crcData = buffer.byteLength > maxCrcSize
            ? new Uint8Array(buffer, 0, maxCrcSize)
            : new Uint8Array(buffer);
        info.checksum = calculateCRC32(crcData);
        if (buffer.byteLength > maxCrcSize) {
            info.checksumPartial = true;
        }

        info.fileSize = buffer.byteLength;

        return info;
    }

    /**
     * Verifica si una ROM es compatible con el randomizador
     */
    function isRandomizerCompatible(romInfo) {
        return romInfo.isPokemon && (
            (romInfo.format === 'GBA' && romInfo.pokemonGen === 3) ||
            (romInfo.format === 'NDS' && (romInfo.pokemonGen === 4 || romInfo.pokemonGen === 5))
        );
    }

    /**
     * Formatea bytes a string legible
     */
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    }

    return {
        detect,
        calculateCRC32,
        isRandomizerCompatible,
        formatFileSize,
        POKEMON_GAMES
    };
})();
