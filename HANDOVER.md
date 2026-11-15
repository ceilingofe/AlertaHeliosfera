# HANDOVER · Alerta Heliosfera (para Antigravity / Gemini)

> Pega este archivo completo como contexto al iniciar cada sesión. Está escrito como instrucciones para el agente.

## 0. Tu papel y reglas de oro
Eres el desarrollador del juego **Alerta Heliosfera** (SpaceCrows, NASA Space Apps 2026). Es un juego Phaser 3 + TypeScript + Vite de supervivencia en Marte. Antes de cambiar algo:
1. **Lee el archivo completo que vas a tocar** y los que lo importan. No reescribas archivos enteros si basta con un cambio.
2. **Nunca entregues sin pasar la verificación (sección 6).** `npm run build` incluye `tsc --noEmit`, y el proyecto usa `noUnusedLocals`: un import sin usar rompe el build.
3. **No inventes datos de la NASA.** Si un dato no está verificado con una fuente, no lo pongas con la etiqueta "ARCHIVO REAL".
4. **El arte de personajes es de Karmin.** No redibujes ni reemplaces al astronauta, a Corvi ni la base. Sólo puedes agregar decoración de terreno con la paleta ENDESGA 32.
5. **Todos los textos visibles van en `content/*.json`**, en español neutro y sin género: "Te damos la bienvenida", no "Bienvenida"; "Calma", no "Tranquila".

## 1. Mapa del proyecto
```
src/main.ts                  Config de Phaser (lienzo 1280×720) y lista de escenas. Expone window.__game para depurar.
src/ui/installCameraDefaults Todas las cámaras: zoom ×2, diseño en 640×360. Mundo usa zoom 4.
src/ui/installTextDefaults   Resolución de texto = zoom de la cámara (texto nítido). NO pongas `resolution` a mano.
src/ui/DialogBox.ts          Diálogo de Corvi ('big' ocupa y≈240–360; 'small' y≈285–325).
src/ui/ProceduralTextures.ts Texturas de decoración generadas en código (se crean en Preload).
src/state/GameState.ts       Estado único (gameStore). Versión 2. Save.ts guarda en localStorage y migra v1→v2.
src/state/bus.ts             EventBus tipado entre escenas (HUD escucha; Mundo/Base emiten).
src/state/mapMarkers.ts      Marcadores que Mundo publica y el HUD dibuja en el radar y el mapa.
src/systems/*                Lógica pura y probada: Clock, Vitals, BaseSystem, Events, Quota, Data,
                             Ephemeris (distancia Tierra–Marte), SampleSites (sitios por día),
                             TriviaBank, Audio (música + efectos).
src/scenes/                  Boot → Preload → Titulo → Despegue (día 1) / Transmision → Mundo ⇄ Base
                             (con HUD, Dialogo y Tormenta encima) → Noche → Transmision… ; Rescate → Diploma.
                             Trivia se lanza sobre Base (pausa Base).
src/minigames/               MinigameBase (intentos ♥, O₂, calidad, teclado) + widgets.ts (TimingBar, button…)
                             + 6 minijuegos + pipePuzzle.ts (lógica pura con pruebas).
content/                     balance.json (números del juego), ui_text.json, minigames.json, trivia.json,
                             facts.json, days.json, corvi_qa.json.
public/data/                 events.json (tormenta X12 de mayo 2024), meda_jezero.json, horizons_delay.json.
public/assets/audio/         music/ (3 pistas), kenney/ (CC0), sfx/ (originales, se regeneran con tools/sfx).
tests/                       Vitest (42 pruebas). tests/Mission.test.ts cubre lo nuevo.
CREDITS.md                   Licencias y fuentes. Actualízalo si agregas un asset o un dato.
```

**Zonas reservadas del HUD** (coordenadas 640×360; el HUD se dibuja ENCIMA de Mundo y Base):
- Signos vitales: x 6–190, y 6–70. Misiones: x 6–190, y 74 hacia abajo (crece con las misiones).
- Zona/lugar: centro, y 6–22. Reloj: x 520–634, y 6–40. Estrellas y puntos: x 520–634, y 42–58.
- Radar (sólo afuera): centro (576,104), radio 44. Barra de herramientas y caja de tubos: x 206–512, y 324–356.
- Avisos (prompt): (320,308). Notificaciones (toasts): (574,62).
- Un modal dentro de Base debe ocultar el HUD (`this.scene.setVisible(false,'HUD')`) y volver a mostrarlo al cerrarse.

## 2. Errores que se cometieron antes y cómo evitarlos (reglas)
| # | Error que hubo | Regla |
|---|---|---|
| 1 | Texto borroso: se ponía `resolution: 2` y la cámara reducía la imagen. | Usa los valores por defecto de `installTextDefaults`. Nunca pongas `resolution` en el estilo de un texto. |
| 2 | Clics desfasados: se usaba `pointer.x` con zoom de cámara. | Usa siempre `pointer.worldX` / `pointer.worldY`. |
| 3 | Espacio resolvía solo los minijuegos ("alinear el siguiente tramo pendiente"). | Ningún atajo de teclado puede resolver ni dar pistas de la solución. El teclado sólo mueve una mira o elige (`MinigameBase.updateKeyboardCursor`, `pickWithReticle`). |
| 4 | Recursos infinitos: los sitios de muestra reaparecían al volver a entrar a Mundo. | Todo lo que cambia durante el día se guarda en `GameState` (por ejemplo `sitesUsedToday`), nunca sólo en la escena. |
| 5 | Eventos imposibles o incoherentes: la antena nunca se rompía, el minijuego de paneles se abría con paneles limpios y ponía la energía en 100. | Cada evento necesita disparador + forma de resolverlo + prueba. Los minijuegos no escriben valores mágicos: llaman a `Events.resolveMaintenanceEvent(state, tipo, panelId)`. |
| 6 | Fallar no costaba nada. | Toda acción debe tener costo o riesgo: O₂ (`Vitals.tickFieldWork`), intentos (`addStrike`), sitio perdido, confianza (`BaseSystem.applyMissionReview`). |
| 7 | Marcadores `TODO_DATO` visibles al jugador (y pruebas que exigían que existieran). | Nada de TODO en contenido visible. Si falta un dato, usa uno verificado o etiqueta `SIMULADO`/`CALCULADO`. Hay una prueba que lo revisa. |
| 8 | Paneles empalmados por coordenadas absolutas sin mirar el HUD. | Respeta las zonas de la sección 1 y toma una captura de cada pantalla que cambies. |
| 9 | Un saludo de Corvi llevaba el sello "DATO REAL NASA". | El sello sólo va en datos con fuente real. |
| 10 | Una subclase redeclaraba `private activeDialog`, que ya existe en la base (error TS2415). | Antes de agregar un campo a un minijuego, revisa `MinigameBase`. Reutiliza `activeDialog`, `strikes`, `finished`. |
| 11 | Se cambió el ancho de una barra (120) pero `update()` seguía usando 162. | Al mover o redimensionar UI, busca con grep todos los números que dependen de ese tamaño. |
| 12 | Se llamaba a `scene.start('Titulo')` sin que la escena existiera. | Toda escena nueva se registra en `src/main.ts`. |
| 13 | Se escribía `"\\n"` en JSON (salía una barra invertida visible). | En JSON el salto de línea es `\n` (una sola barra). |
| 14 | Textos con género ("Bienvenida", "Tranquila"). | Español neutro. |
| 15 | Se presentaba el clima de InSight como dato en vivo (la misión terminó en 2022). | Los datos de misiones terminadas se etiquetan como archivo, nunca "EN VIVO". |

## 3. Pendientes conocidos (con instrucciones)
1. **Licencia del soundtrack** (sólo Sergio puede resolverlo): poner autor y licencia en `CREDITS.md` y en `TEAM_AND_AUDIO_LIST` de `src/scenes/Creditos.ts`.
2. **Animación de caminar en 4 direcciones** (cuando Karmin entregue los cuadros):
   - Cargar el spritesheet en `Preload` con `this.load.spritesheet('astro_walk', 'assets/sprites/astro_walk.png', { frameWidth, frameHeight })`.
   - Crear 4 animaciones (`walk_down/up/left/right`) y en `Mundo.update()` y `Base.update()` elegir la animación según `vx`/`vy`. Quitar el "bob" de `setDisplayOrigin`.
   - Mantener los tintes del traje (`AstronautAppearance`).
3. **Textura de suelo "MARU"**: confirmar que `public/assets/sprites/ground_placeholder.png` no es la textura con marca "MARU". Si lo es, o si su licencia no está clara, reemplazarla por los tiles de Karmin. `ground_var` (procedural) puede quedarse encima como variación.
4. **ID real de DONKI** para la llamarada X12 del 20-may-2024. Ahora `public/data/events.json` dice `"FLR X12 · 2024-05-20"`. Busca el `flrID` exacto en la web de DONKI (kauai.ccmc.gsfc.nasa.gov/DONKI) y ponlo. No lo inventes. `npm run data` descarga CME recientes cuando hay red.
5. **Despegue**: el candado del premio se encima sobre los iconos de los accesorios. Muévelo a una esquina (un badge pequeño) o baja su opacidad.
6. **Mapa (M)**: la línea de leyenda de abajo se acerca a la barra de herramientas. Súbela unos 10 px o ponla dentro del recuadro del mapa.
7. **Tormenta de falsa alarma (día 5)**: `Tormenta.ts` anuncia siempre con `corviAlertHit`. Revisa si en el día 5 debe abrir primero con un texto de "posible impacto". Ajústalo en `ui_text.json → storm`.
8. **Ajuste de dificultad**: jugar los días 1, 3 y 6 y afinar.
   - Generales: `content/balance.json` (`o2.drainPerSec`, `minigame.o2DrainMultiplier`, `mission.*`).
   - Por minijuego: los arreglos `[d1, d2, d3]` dentro de cada archivo de `src/minigames`.
   - Meta: el día 1 debe ser fácil de ganar y el día 6 debe exigir planear el O₂.
9. **Móvil**: probar los minijuegos con toque (ya funcionan con el puntero). Revisar que los botones midan 30 px o más.
10. **Tamaño del bundle** (aviso de Vite >500 kB): opcional. En `vite.config.ts` agrega `build.rollupOptions.output.manualChunks = { phaser: ['phaser'] }`.

## 4. Cómo agregar cosas sin romper nada
- **Pregunta de trivia**: agrega un objeto en `content/trivia.json` con `id` único, 4 `options`, `answer` (0–3), `explain` de más de 30 caracteres y `source`. Las pruebas validan el formato.
- **Dato de la bitácora**: agrégalo en `content/facts.json` (`id, icon, text, label, source`). El `icon` debe existir como `icon_<icon>` en `public/assets/ui`. Un minijuego lo agrega con `this.succeed('<id>', texto, fuente)`.
- **Sonido**:
  - Agrega el mp3 en `public/assets/audio/sfx/` y la entrada en `SFX_FILES` de `src/systems/Audio.ts`.
  - Reprodúcelo con `AudioSystem.play('nombre')`. Para un sonido en bucle: `startLoop(id, nombre, vol)` / `stopLoop(id)`. Detén los bucles en `SHUTDOWN`.
  - Agrega el crédito en `CREDITS.md`.
- **Minijuego nuevo**:
  - Extiende `MinigameBase`. Llama a `drawHeader(titulo, pasos, instrucción)` en `create()` y termina con `succeed(...)` o `addStrike(...)`/`failWithExplanation(...)`.
  - Regístralo en `main.ts` y en `MINIGAME_KEYS` de `Mundo.ts`.

## 5. Datos NASA ya verificados (úsalos tal cual)
- Tormenta del 20-may-2024: llamarada X12; Curiosity RAD midió 8 100 µGy (≈30 radiografías de tórax); MAVEN vio auroras del 14 al 20 de mayo. Fuente: nasa.gov, "NASA Watches Mars Light Up During Epic Solar Storm".
- Temperatura del aire que mide MEDA en Jezero: de −83 °C a −23 °C. Atmósfera: ~95 % CO₂, ~6 mbar.
- RAD: ~0.64 mSv/día en la superficie (Hassler et al., 2014). Límite de carrera de la NASA: 600 mSv (NASA-STD-3001).
- MOXIE: 122 g de O₂ entre 2021 y 2023, a ~800 °C, hasta 12 g/h. Cheyava Falls: "manchas de leopardo" (julio 2024; posible biofirma, 2025).
- La distancia y el retraso de la luz se **calculan** (`Ephemeris.ts`, elementos de JPL). Validado: 12-ene-2025 → 0.642 UA (5.3 min).

## 6. Verificación obligatoria antes de entregar
```bash
npm ci
npx tsc --noEmit          # 0 errores
npx vitest run            # todas las pruebas pasan (hoy son 42)
npm run build             # compila
npm run dev               # abre http://localhost:5173/AlertaHeliosfera/
```
En la consola del navegador puedes saltar a cualquier escena:
```js
const g = window.__game; g.scene.getScenes(true).forEach(s => s.scene.stop()); g.scene.start('Base');
g.scene.getScene('Mundo').scene.launch('MinijuegoRoca', { day: 6, difficulty: 3, type: 'roca' });
```
Toma captura de cada pantalla que cambiaste y revisa:
- Que nada se encime con las zonas del HUD.
- Que el texto se lea nítido.
- Que no aparezca "TODO" ni "undefined".
- Que todo funcione con teclado y con mouse.
- Que el audio no se quede sonando al cambiar de escena.

Haz commits pequeños con mensajes en español que digan qué cambió y por qué.
