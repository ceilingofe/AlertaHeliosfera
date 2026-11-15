import { describe, expect, it } from 'vitest';
import corviQaJson from '../content/corvi_qa.json';
import factsJson from '../content/facts.json';
import uiTextJson from '../content/ui_text.json';
import { createInitialGameState } from '../src/state/GameState';
import { AudioSystem } from '../src/systems/Audio';
import { BaseSystem } from '../src/systems/BaseSystem';
import { Customization, SUIT_PALETTES } from '../src/systems/Customization';
import { Events } from '../src/systems/Events';
import { Vitals } from '../src/systems/Vitals';

describe('Fase 5 y 6 · Final, Diploma, Personalización, Audio y Créditos NASA', () => {
  it('alterna y recuerda el estado de silencio (mute) en AudioSystem e incluye el aviso legal NASA en ui_text.json', () => {
    const initialMute = AudioSystem.isMuted();
    const toggled = AudioSystem.toggleMute();
    expect(toggled).toBe(!initialMute);
    expect(AudioSystem.isMuted()).toBe(!initialMute);
    AudioSystem.setMuted(false);
    expect(AudioSystem.isMuted()).toBe(false);

    expect(uiTextJson.honestyNotice).toBe(
      'Este juego usa datos abiertos de la NASA. No está avalado por la NASA.'
    );
  });

  it('alcanzar el límite de radiación (150 DR) dispara rescate con causa radiacion', () => {
    const state = createInitialGameState();
    state.location = 'mundo';
    state.astronaut.doseTotal = 149.999;

    const tickRes = Vitals.tick(state, 5);
    expect(state.astronaut.doseTotal).toBeGreaterThanOrEqual(150);
    expect(tickRes.rescueCause).toBe('radiacion');
  });

  it('nunca aparece la palabra "perdiste" ni "game over" en ningún texto del juego', () => {
    const combinedText = JSON.stringify({
      uiTextJson,
      factsJson,
      corviQaJson,
    }).toLowerCase();

    expect(combinedText).not.toContain('perdiste');
    expect(combinedText).not.toContain('game over');
  });

  it('calcula correctamente las estadísticas del Diploma (días, muestras por tipo, kg de O2 de MOXIE, tormentas y % de dosis)', () => {
    const state = createInitialGameState();
    state.stats.daysSurvived = 7;
    state.stats.samples = { roca: 6, suelo: 4, minerales: 2, aire: 2 };
    state.stats.moxieGrams = 2000; // 2.0 kg
    state.stats.stormsSheltered = 2;
    state.astronaut.doseTotal = 57; // 57 / 150 = 38 %

    const summary = Customization.computeDiplomaSummary(state, 'oxigeno', 'Bright Angel');
    expect(summary.missionCode).toBe('LUNA-7');
    expect(summary.daysSurvived).toBe(7);
    expect(summary.totalSamples).toBe(14);
    expect(summary.samplesByType).toEqual({
      roca: 6,
      suelo: 4,
      minerales: 2,
      aire: 2,
    });
    expect(summary.moxieKg).toBe(2);
    expect(summary.moxieKgFormatted).toBe('2,0');
    expect(summary.stormsSheltered).toBe(2);
    expect(summary.dosePercent).toBe(38);
  });

  it('recolorea únicamente las filas del cuerpo (>= startRow) reemplazando #ffffff y #c0cbdc con la paleta del traje', () => {
    // Simulamos un lienzo de 1×20 donde la fila 5 (casco) es blanca y la fila 18 (cuerpo) tiene #ffffff y fila 19 #c0cbdc
    const width = 1;
    const height = 20;
    const buffer = new Uint8ClampedArray(width * height * 4);

    // Fila 5 (casco): #ffffff
    buffer[5 * 4] = 0xff;
    buffer[5 * 4 + 1] = 0xff;
    buffer[5 * 4 + 2] = 0xff;
    buffer[5 * 4 + 3] = 255;

    // Fila 18 (cuerpo claro): #ffffff
    buffer[18 * 4] = 0xff;
    buffer[18 * 4 + 1] = 0xff;
    buffer[18 * 4 + 2] = 0xff;
    buffer[18 * 4 + 3] = 255;

    // Fila 19 (cuerpo sombra): #c0cbdc
    buffer[19 * 4] = 0xc0;
    buffer[19 * 4 + 1] = 0xcb;
    buffer[19 * 4 + 2] = 0xdc;
    buffer[19 * 4 + 3] = 255;

    Customization.recolorRgbaBuffer(buffer, width, height, 18, 'naranja');

    // El casco en fila 5 permanece blanco (#ffffff)
    expect([buffer[5 * 4], buffer[5 * 4 + 1], buffer[5 * 4 + 2]]).toEqual([0xff, 0xff, 0xff]);

    // El cuerpo en fila 18 pasa a naranja claro (#f77622) y fila 19 a sombra (#be4a2f)
    expect([buffer[18 * 4], buffer[18 * 4 + 1], buffer[18 * 4 + 2]]).toEqual(
      SUIT_PALETTES.naranja.lightRgb
    );
    expect([buffer[19 * 4], buffer[19 * 4 + 1], buffer[19 * 4 + 2]]).toEqual(
      SUIT_PALETTES.naranja.shadowRgb
    );
  });

  it('desbloquea accesorios en días 1, 5, 10 y 15 y genera eventos para días 6 en adelante', () => {
    const state = createInitialGameState();
    // Antes de dormir el día 1 la personalización está bloqueada
    expect(Customization.setSuitColor(state, 'azul')).toBe(false);

    // Dormir hasta el día 15
    for (let d = 1; d <= 14; d++) {
      BaseSystem.sleepToNextDay(state);
    }
    expect(state.day).toBe(15);
    expect(state.unlocks.customization).toBe(true);
    expect(state.unlocks.accessories).toEqual(
      expect.arrayContaining(['diadema', 'mono', 'antena', 'gorrito', 'audifonos'])
    );

    expect(Customization.setSuitColor(state, 'azul')).toBe(true);
    expect(Customization.setHair(state, 2)).toBe(true);
    expect(Customization.setAccessory(state, 'audifonos')).toBe(true);
    expect(Customization.setPatch(state, 'HELIOSFERA')).toBe(true);

    // Día 6 tiene 1 evento programado; día 10+ tiene 2 eventos programados
    expect(Events.getScheduledEventsForDay(6)).toHaveLength(1);
    expect(Events.getScheduledEventsForDay(10)).toHaveLength(2);
  });
});
