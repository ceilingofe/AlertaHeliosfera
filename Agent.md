# Guía para agentes de IA - Alerta Heliosfera

## Objetivo del proyecto

Alerta Heliosfera es un juego 2D hecho con Phaser, TypeScript y Vite. El jugador controla a la astronauta LUNA-7 en Marte, recoge muestras, mantiene la base, gestiona O2, batería, temperatura y radiación, y se protege de tormentas solares.

La interfaz y los comentarios están principalmente en español. Las etiquetas científicas distinguen entre `ARCHIVO REAL`, `SIMULADO` y `EN VIVO`.

## Comandos

```bash
npm install
npm run dev
npm test
npm run build
```

`npm test` ejecuta Vitest. `npm run build` ejecuta `tsc --noEmit` y `vite build`.
No hay script de lint actualmente.

## Estado conocido de validación

- Última auditoría: `npm test` pasa con 25 pruebas.
- El build pasa, pero Vite avisa sobre resolución de fuentes y tamaño del bundle.
- No hay pruebas de navegador, integración de escenas ni pruebas automáticas de minijuegos.
- El archivo `leet.py` está sin rastrear y no debe modificarse ni incluirse sin confirmación.

## Arquitectura

### Entrada

- `src/main.ts`: crea el juego Phaser y registra las escenas.
- `src/scenes/Boot.ts`: espera fuentes.
- `src/scenes/Preload.ts`: carga sprites/datos y decide la escena inicial.
- `index.html`: canvas, fuentes y punto de montaje `#game`.

### Escenas principales

- `Despegue.ts`: bienvenida del día 1.
- `Transmision.ts`: resumen del día, cuota y alerta solar.
- `Mundo.ts`: movimiento exterior, muestras, paneles, MOXIE, antena, refugio y tormentas.
- `Base.ts`: movimiento interior, O2, calefactor, muestras, refugio, Corvi y sueño.
- `Noche.ts`: resumen, guardado y paso al siguiente día.
- `Rescate.ts`: consecuencia de O2 o radiación agotados.
- `HUD.ts`: reloj, misiones, signos vitales, tubos, herramientas y joystick.
- `Dialogo.ts`: escena paralela que escucha diálogos.
- `Tormenta.ts`: escena paralela de alerta y efectos de CME.

### Sistemas puros

- `src/state/GameState.ts`: estado inicial y store global.
- `src/state/Save.ts`: persistencia en `localStorage`.
- `src/state/bus.ts`: bus tipado entre escenas.
- `src/systems/Clock.ts`: reloj y curfew.
- `src/systems/Vitals.ts`: O2, temperatura, batería y radiación.
- `src/systems/Events.ts`: eventos diarios y tormentas.
- `src/systems/BaseSystem.ts`: energía, MOXIE, recarga, muestras y sueño.
- `src/systems/Quota.ts`: cuota diaria.
- `src/systems/Data.ts`: datos de contenido y fallback científico.

### Contenido

- `content/balance.json`: números de balance.
- `content/days.json`: cuota/eventos de días 1-5.
- `content/ui_text.json`: textos de interfaz.
- `content/facts.json`: datos científicos.
- `content/corvi_qa.json`: preguntas y respuestas.
- `public/data/*.json`: datos NASA o marcadores `TODO_DATO`.
- `public/assets`: sprites, iconos y fuentes.

## Flujo del juego

1. `Boot` -> `Preload`.
2. Sin partida: `Despegue` -> `Transmision` -> `Mundo`.
3. Desde `Mundo`: muestras, reparaciones, base o refugio.
4. Desde `Base`: recarga, entrega, Corvi, refugio, salida o dormir.
5. Dormir: `Noche` aplica cuota y avanza el día -> `Transmision`.
6. O2 en cero o radiación total en el límite: `Rescate`.

## Reglas importantes de estado

- `gameStore.state` es mutable y compartido entre escenas.
- `state.location` puede ser `mundo`, `base` o `refugio`.
- El reloj usa minutos del día: 09:00 = 540, curfew 17:00 = 1020, fin 20:00 = 1200.
- Día 1 dura 150 s; los siguientes usan 300 s desde `balance.json`.
- Las escenas de minijuego pausan `state.clock`.
- `Events` también mantiene estado estático (`activeStorm`, `firedToday`, `currentDayTracked`); cualquier cambio al guardado debe resolver explícitamente cómo persistir/restaurar ese estado.
- El guardado actual usa la clave `alerta-heliosfera:v1`.

## Riesgos confirmados que deben revisarse primero

1. `Preload` abre `Transmision` para cualquier guardado que no esté en `base`/`refugio`, incluso si estaba en `mundo`.
2. `Transmision.create()` llama `Events.initDay()` y puede borrar progreso de eventos al reanudar.
3. Muestras y reparaciones terminadas en `Mundo` no siempre se guardan.
4. `Save.isValidGameState()` valida muy pocos campos.
5. `MinijuegoMinerales` permite saltar la extracción con Espacio/E.
6. `MinijuegoRoca` permite saltar el escaneo con el botón de perforación.
7. Paneles limpios y MOXIE reparado todavía abren minijuegos.
8. `batteryBonus` está configurado pero nunca se usa.
9. Recarga de O2/calefactor no consume energía.
10. No existe todavía un trade-off jugable claro.

El inventario completo está en `ERRORES_DETECTADOS.txt`.

## Convenciones para cambios

- Actualizar `ERRORES_DETECTADOS.txt` después de cada cambio: marcar el hallazgo
  como RESUELTO, indicar cómo se verificó y ajustar el estado de validación.
- Hacer cambios quirúrgicos y conservar el comportamiento no relacionado.
- Revisar primero los datos y helpers existentes antes de duplicar reglas.
- Mantener tipos estrictos; evitar `as any` y `as unknown as`.
- Mantener los textos en `content/ui_text.json` cuando sean visibles para el jugador.
- Mantener las reglas numéricas en `content/balance.json`, no dispersarlas por escenas.
- Guardar estado después de cualquier acción irreversible o relevante.
- No ocultar fallos con `catch` amplio ni usar defaults que aparenten éxito.
- Si se cambia una regla de estado, agregar una prueba unitaria al sistema afectado.
- Si se cambia una transición o minijuego, agregar una prueba de integración o una prueba de lógica extraída de Phaser.
- No modificar ni borrar `leet.py` sin revisar su origen.
- No ejecutar comandos destructivos ni revertir cambios ajenos.

## Checklist antes de terminar

1. Revisar `git status --short --branch`.
2. Confirmar que no hay conflictos ni marcadores `<<<<<<<`.
3. Ejecutar `npm test`.
4. Ejecutar `npm run build`.
5. Revisar `git diff --check`.
6. Confirmar que los archivos de datos y textos necesarios están incluidos.
7. Verificar que el guardado, las transiciones y los eventos sigan siendo coherentes.
8. Informar por separado cualquier advertencia de Vite o limitación no resuelta.

## Preferencias de implementación

- Extraer lógica de escenas a sistemas puros cuando sea posible.
- Centralizar transición de escenas y guardado.
- Modelar explícitamente el estado de eventos/tormentas si debe sobrevivir a recargas.
- Reutilizar helpers para movimiento, prompts, mantenimiento y persistencia.
- Evitar que los clics directos bypassen las mismas reglas de distancia y estado que teclado/joystick.
