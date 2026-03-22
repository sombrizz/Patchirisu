/**
 * rom-detector.js — Detección de ROMs GBA Pokémon
 * Solo soporta: .gba (FireRed, LeafGreen, Emerald, Ruby, Sapphire)
 */

const RomDetector = (() => {
    'use strict';

    // CRC32
    const crc32Table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        crc32Table[i] = c;
    }

    function calculateCRC32(data) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
        let crc = 0xFFFFFFFF;
        for (let i = 0; i < bytes.length; i++) {
            crc = crc32Table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        }
        return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, '0');
    }

    function readAscii(view, offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            const ch = view.getUint8(offset + i);
            if (ch === 0) break;
            str += String.fromCharCode(ch);
        }
        return str.trim();
    }

    // Juegos Pokémon GBA soportados
    const POKEMON_GAMES = {
        'BPRE': 'Pokémon FireRed',
        'BPGE': 'Pokémon LeafGreen',
        'BPEE': 'Pokémon Emerald',
        'AXVE': 'Pokémon Ruby',
        'AXPE': 'Pokémon Sapphire',
        // EUR
        'BPRP': 'Pokémon FireRed',
        'BPGP': 'Pokémon LeafGreen',
        'BPEP': 'Pokémon Emerald',
        'AXVP': 'Pokémon Ruby',
        'AXPP': 'Pokémon Sapphire',
        // Otras regiones comunes
        'BPRJ': 'Pokémon FireRed',
        'BPGJ': 'Pokémon LeafGreen',
        'BPEJ': 'Pokémon Emerald',
        'AXVJ': 'Pokémon Ruby',
        'AXPJ': 'Pokémon Sapphire',
    };

    function detectRegion(gameCode) {
        if (!gameCode || gameCode.length < 4) return 'Desconocida';
        const r = gameCode[3];
        return { 'E': 'USA', 'P': 'EUR', 'J': 'JPN', 'S': 'ESP', 'F': 'FRA', 'D': 'DEU', 'I': 'ITA' }[r] || r;
    }

    function detect(buffer, extension) {
        const ext = extension.toLowerCase();
        if (ext !== 'gba') {
            return { format: ext.toUpperCase(), isValid: false, isPokemon: false, error: 'Solo se aceptan archivos .gba' };
        }

        if (buffer.byteLength < 0x100) {
            return { format: 'GBA', isValid: false, isPokemon: false, error: 'Archivo demasiado pequeño' };
        }

        const view = new DataView(buffer);
        const title = readAscii(view, 0xA0, 12);
        const gameCode = readAscii(view, 0xAC, 4);

        // Validar entry point ARM
        const entry = view.getUint32(0x00, true);
        const isValid = (entry & 0xFF000000) === 0xEA000000;

        const pokemonName = POKEMON_GAMES[gameCode];

        const info = {
            format: 'GBA',
            title: pokemonName || title || 'Desconocido',
            gameCode: gameCode,
            region: detectRegion(gameCode),
            isValid: isValid,
            isPokemon: !!pokemonName,
            fileSize: buffer.byteLength,
            checksum: calculateCRC32(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16 * 1024 * 1024)))
        };

        // Verificar si el randomizador la soporta
        info.isRandomizerCompatible = !!PokemonData.GAME_DATA[gameCode];

        return info;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    return { detect, calculateCRC32, formatFileSize, POKEMON_GAMES };
})();
