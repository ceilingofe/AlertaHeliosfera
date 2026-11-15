# Créditos y licencias · Alerta Heliosfera

Equipo **SpaceCrows** (NASA Space Apps Challenge 2026): Sergio, Karmin (arte y sprites), David, Héctor, Cristian y Valeria.

> Este juego usa datos abiertos de la NASA. No está avalado por la NASA.

## Arte
- Sprites del astronauta, Corvi, base, rocas, tubos y paneles: **Karmin** (equipo SpaceCrows).
- Decoración del terreno (piedritas, dunas, huellas, estación de aire): dibujada en código con la paleta **ENDESGA 32** (`src/ui/ProceduralTextures.ts`).

## Música
- *Blueprints for a New World*, *Sunsets Over Red Soil* y *Beyond the Starboard Window*: soundtrack entregado por el equipo. **Pendiente: confirmar autor y licencia antes de publicar.**
- Archivos re-codificados a 128 kbps en `public/assets/audio/music/`.

## Efectos de sonido
- **Kenney · Interface Sounds** (CC0 1.0): clics, confirmaciones, errores, pestañas. Licencia en `public/assets/audio/kenney/License-Kenney-Interface-Sounds.txt`. Fuente: kenney.nl (copia obtenida del repositorio Calinou/kenney-interface-sounds).
- **Efectos originales** sintetizados para este juego (pasos, broca, viento, zumbido de la base, válvulas, sirena, cohete, estática, etc.). Se regeneran con `python3 tools/sfx/generate_sfx.py && bash tools/sfx/build_audio.sh`. Se liberan bajo la misma licencia que el juego.

## Tipografía y código
- **Pixelify Sans** — SIL Open Font License (`public/assets/fonts/OFL.txt`).
- **Phaser 3** (MIT) y **phaser3-rex-plugins** (MIT).

## Datos y ciencia NASA
| Uso en el juego | Fuente | Etiqueta |
|---|---|---|
| Tormenta solar de mayo de 2024 (llamarada X12, 8 100 µGy en Curiosity RAD, auroras de MAVEN) | NASA: *NASA Watches Mars Light Up During Epic Solar Storm* (2024) | ARCHIVO REAL |
| Alertas de CME y falsa alarma | NASA CCMC DONKI y WSA-Enlil (`npm run data` descarga CME recientes) | ARCHIVO REAL |
| Retraso de la luz Tierra–Marte del día | Elementos orbitales de JPL (E. M. Standish), calculados en `src/systems/Ephemeris.ts` | CALCULADO |
| Pronóstico de temperatura en Jezero | Rango de temperatura del aire reportado por MEDA (−83 °C a −23 °C) | CALCULADO |
| Radiación diaria (~0.64 mSv/día) y límite de carrera (600 mSv) | Curiosity RAD (Hassler et al., 2014); NASA-STD-3001 | ARCHIVO REAL |
| MOXIE (122 g de O₂, ~800 °C), SHERLOC, SuperCam, PIXL, regolito, Cheyava Falls | NASA Mars 2020 / Perseverance | ARCHIVO REAL |
| Polvo en paneles (InSight 2022), percloratos (Phoenix 2008) | NASA InSight y Phoenix | ARCHIVO REAL |

InSight dejó de operar en 2022: el juego **no** presenta su clima como dato en vivo.
