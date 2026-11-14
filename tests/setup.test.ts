import { describe, expect, it } from 'vitest';
import balance from '../content/balance.json';
import uiText from '../content/ui_text.json';

describe('Fase 0 · Configuración de balance y textos', () => {
  it('carga los parámetros de reloj, oxígeno, calefactor y radiación desde content/balance.json', () => {
    expect(balance.dayClock.startMin).toBe(540);
    expect(balance.dayClock.curfewMin).toBe(1020);
    expect(balance.dayClock.endMin).toBe(1200);
    expect(balance.dayClock.day1Sec).toBe(150);
    expect(balance.dayClock.daySec).toBe(300);
    expect(balance.radiation.doseLimit).toBe(150);
    expect(balance.player.speed).toBe(70);
  });

  it('mantiene los textos visibles en español de México en content/ui_text.json', () => {
    expect(uiText.gameTitle).toBe('ALERTA HELIOSFERA');
    expect(uiText.loading.length).toBeGreaterThan(0);
    expect(uiText.honestyNotice).toContain('NASA');
  });
});
