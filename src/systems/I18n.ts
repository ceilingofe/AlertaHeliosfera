import corviQaEs from '../../content/corvi_qa.json';
import daysEs from '../../content/days.json';
import factsEs from '../../content/facts.json';
import minigamesEs from '../../content/minigames.json';
import triviaEs from '../../content/trivia.json';
import uiTextEs from '../../content/ui_text.json';
import corviQaEn from '../../content/en/corvi_qa.json';
import daysEn from '../../content/en/days.json';
import factsEn from '../../content/en/facts.json';
import minigamesEn from '../../content/en/minigames.json';
import triviaEn from '../../content/en/trivia.json';
import uiTextEn from '../../content/en/ui_text.json';
import type { Label, SampleType, SuitColor } from '../types';

export type Lang = 'en' | 'es';

const LANG_STORAGE_KEY = 'alerta-heliosfera:lang';

function readStoredLang(): Lang {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'es' || saved === 'en') {
        return saved;
      }
    }
  } catch {
    // Sin localStorage (tests / modo privado)
  }
  return 'en';
}

function writeStoredLang(lang: Lang): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    }
  } catch {
    // Ignorar
  }
}

export interface CreditEntry {
  title: string;
  detail: string;
  tag: string;
}

export class I18n {
  private static currentLang: Lang = readStoredLang();

  static getLang(): Lang {
    return I18n.currentLang;
  }

  static setLang(lang: Lang): void {
    I18n.currentLang = lang;
    writeStoredLang(lang);
    if (typeof document !== 'undefined') {
      document.title = lang === 'en' ? 'Heliosphere Alert' : 'Alerta Heliosfera';
    }
  }

  static ui(): typeof uiTextEn {
    return (I18n.currentLang === 'es' ? uiTextEs : uiTextEn) as typeof uiTextEn;
  }

  static mg(): typeof minigamesEn {
    return (I18n.currentLang === 'es' ? minigamesEs : minigamesEn) as typeof minigamesEn;
  }

  static facts(): typeof factsEn {
    return I18n.currentLang === 'es' ? factsEs : factsEn;
  }

  static days(): typeof daysEn {
    return I18n.currentLang === 'es' ? daysEs : daysEn;
  }

  static corviQa(): typeof corviQaEn {
    return I18n.currentLang === 'es' ? corviQaEs : corviQaEn;
  }

  static trivia(): typeof triviaEn {
    return I18n.currentLang === 'es' ? triviaEs : triviaEn;
  }

  static formatLabel(label: Label | string): string {
    if (I18n.currentLang === 'es') return label;
    switch (label) {
      case 'ARCHIVO REAL':
        return 'REAL ARCHIVE';
      case 'SIMULADO':
        return 'SIMULATED';
      case 'EN VIVO':
        return 'LIVE';
      case 'CALCULADO':
        return 'COMPUTED';
      default:
        return label;
    }
  }

  static sampleName(type: SampleType): string {
    if (I18n.currentLang === 'es') {
      const map: Record<SampleType, string> = {
        roca: 'Roca',
        suelo: 'Suelo',
        minerales: 'Minerales',
        aire: 'Aire',
      };
      return map[type];
    }
    const map: Record<SampleType, string> = {
      roca: 'Rock',
      suelo: 'Soil',
      minerales: 'Minerals',
      aire: 'Air',
    };
    return map[type];
  }

  static suitColorName(color: SuitColor): string {
    if (I18n.currentLang === 'es') {
      const esMap: Record<SuitColor, string> = {
        blanco: 'Blanco',
        naranja: 'Naranja',
        azul: 'Azul',
        verde: 'Verde',
        rosa: 'Rosa',
      };
      return esMap[color];
    }
    const enMap: Record<SuitColor, string> = {
      blanco: 'White',
      naranja: 'Orange',
      azul: 'Blue',
      verde: 'Green',
      rosa: 'Pink',
    };
    return enMap[color];
  }

  static credits(): {
    headerTitle: string;
    nasaSources: CreditEntry[];
    teamAndAudio: CreditEntry[];
    teamAudioBtn: string;
    nasaSourcesBtn: string;
    backBtn: string;
  } {
    if (I18n.currentLang === 'es') {
      return {
        headerTitle: 'CRÉDITOS Y FUENTES DE DATOS ABIERTOS NASA',
        nasaSources: [
          {
            title: 'NASA DONKI API & Modelo WSA-Enlil (CCMC)',
            detail: 'Consulta en vivo de eyecciones CME (api.nasa.gov) con respaldo curado de mayo 2024.',
            tag: 'EN VIVO / REAL',
          },
          {
            title: 'Curiosity RAD (Radiation Assessment Detector)',
            detail: 'Dosis de radiación en la superficie marciana (~0,21 mGy/día y pico de 8,1 mGy).',
            tag: 'ARCHIVO REAL',
          },
          {
            title: 'Perseverance MEDA, MOXIE, SHERLOC y PIXL',
            detail: 'Clima del cráter Jezero, producción de O₂ (hasta 12 g/h) y roca Cheyava Falls (2024).',
            tag: 'ARCHIVO REAL',
          },
          {
            title: 'Efemérides JPL (elementos orbitales de Standish)',
            detail: 'Distancia Tierra–Marte real del día y retraso de la luz (3 a 22 minutos).',
            tag: 'CALCULADO',
          },
          {
            title: 'Misiones InSight, Phoenix y MAVEN',
            detail: 'Polvo en paneles solares (2022), percloratos en regolito y auroras marcianas.',
            tag: 'ARCHIVO REAL',
          },
        ],
        teamAndAudio: [
          {
            title: 'Equipo SpaceCrows',
            detail: 'Sergio, Karmin (arte y sprites), David, Héctor, Cristian y Valeria.',
            tag: 'EQUIPO',
          },
          {
            title: 'Música original del juego',
            detail: 'Blueprints for a New World · Sunsets Over Red Soil · Beyond the Starboard Window.',
            tag: 'SOUNDTRACK',
          },
          {
            title: 'Kenney · Interface Sounds',
            detail: 'Sonidos de interfaz (clics, confirmaciones, errores). Licencia CC0, kenney.nl.',
            tag: 'CC0',
          },
          {
            title: 'Efectos de sonido sintetizados',
            detail: 'Pasos, broca, viento, válvulas, sirena y más: creados para este juego (tools/sfx).',
            tag: 'ORIGINAL',
          },
          {
            title: 'Phaser 3 · Pixelify Sans · paleta ENDESGA 32',
            detail: 'Motor del juego (MIT), tipografía (OFL) y paleta de colores de ENDESGA.',
            tag: 'LIBRE',
          },
        ],
        teamAudioBtn: 'Equipo y audio ►',
        nasaSourcesBtn: '◄ Fuentes NASA',
        backBtn: 'Volver (Espacio / Esc)',
      };
    }
    return {
      headerTitle: 'CREDITS & NASA OPEN DATA SOURCES',
      nasaSources: [
        {
          title: 'NASA DONKI API & WSA-Enlil Model (CCMC)',
          detail: 'Live CME telemetry (api.nasa.gov) with May 2024 real-archive fallback.',
          tag: 'LIVE / ARCHIVE',
        },
        {
          title: 'Curiosity RAD (Radiation Assessment Detector)',
          detail: 'Martian surface radiation dose (~0.21 mGy/day baseline and 8.1 mGy flare peak).',
          tag: 'REAL ARCHIVE',
        },
        {
          title: 'Perseverance MEDA, MOXIE, SHERLOC & PIXL',
          detail: 'Jezero Crater weather, O₂ synthesis (up to 12 g/h), and Cheyava Falls rock (2024).',
          tag: 'REAL ARCHIVE',
        },
        {
          title: 'JPL Ephemerides (Standish orbital elements)',
          detail: 'True Earth–Mars distance for today and light-travel delay (3 to 22 minutes).',
          tag: 'COMPUTED',
        },
        {
          title: 'InSight, Phoenix & MAVEN Missions',
          detail: 'Solar panel dust loss (2022), regolith perchlorates, and Martian auroras.',
          tag: 'REAL ARCHIVE',
        },
      ],
      teamAndAudio: [
        {
          title: 'Team SpaceCrows',
          detail: 'Sergio, Karmin (art & sprites), David, Héctor, Cristian, and Valeria.',
          tag: 'TEAM',
        },
        {
          title: 'Original Game Soundtrack',
          detail: 'Blueprints for a New World · Sunsets Over Red Soil · Beyond the Starboard Window.',
          tag: 'SOUNDTRACK',
        },
        {
          title: 'Kenney · Interface Sounds',
          detail: 'Interface audio (clicks, confirms, errors). CC0 license, kenney.nl.',
          tag: 'CC0',
        },
        {
          title: 'Synthesized Sound Effects',
          detail: 'Footsteps, drill, wind, valves, sirens & more: created for this game (tools/sfx).',
          tag: 'ORIGINAL',
        },
        {
          title: 'Phaser 3 · Pixelify Sans · ENDESGA 32 palette',
          detail: 'Game engine (MIT), typeface (OFL), and ENDESGA 32 pixel-art palette.',
          tag: 'OPEN',
        },
      ],
      teamAudioBtn: 'Team & Audio ►',
      nasaSourcesBtn: '◄ NASA Sources',
      backBtn: 'Back (Space / Esc)',
    };
  }
}
