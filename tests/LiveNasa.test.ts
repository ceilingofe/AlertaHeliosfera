import { beforeEach, describe, expect, it } from 'vitest';
import { Data } from '../src/systems/Data';
import { LiveNasa, parseDonkiCmeList } from '../src/systems/LiveNasa';

describe('LiveNasa & Data fallback', () => {
  beforeEach(() => {
    LiveNasa.clearCache();
    Data.setLiveCme(null);
  });

  it('parseDonkiCmeList picks the latest valid CME and extracts isMostAccurate analysis', () => {
    const sample = [
      {
        activityID: '2026-01-01T01:00:00-CME-001',
        startTime: '2026-01-01T01:00Z',
        cmeAnalyses: [{ isMostAccurate: true, speed: 520, halfAngle: 24 }],
      },
      {
        activityID: '2026-01-12T14:30:00-CME-002',
        startTime: '2026-01-12T14:30Z',
        note: 'Halo CME observed by LASCO',
        cmeAnalyses: [
          { isMostAccurate: false, speed: 600, halfAngle: 30 },
          { isMostAccurate: true, speed: 940.4, halfAngle: 42.2 },
        ],
      },
    ];
    const parsed = parseDonkiCmeList(sample, 1000);
    expect(parsed).toEqual({
      donkiActivityID: '2026-01-12T14:30:00-CME-002',
      startTime: '2026-01-12T14:30Z',
      speedKmS: 940,
      halfAngleDeg: 42,
      note: 'Halo CME observed by LASCO',
      fetchedAtMs: 1000,
    });
  });

  it('parseDonkiCmeList returns null on empty or malformed payloads', () => {
    expect(parseDonkiCmeList([])).toBeNull();
    expect(parseDonkiCmeList(null)).toBeNull();
    expect(parseDonkiCmeList([{ startTime: 'x' }])).toBeNull();
  });

  it('fetchLatestCme caches results and falls back cleanly on network errors', async () => {
    const failingFetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await LiveNasa.fetchLatestCme(failingFetch, new Date('2026-02-01T00:00:00Z'))).toBeNull();

    let calls = 0;
    const okFetch = (async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => [
          {
            activityID: '2026-01-28T06:15:00-CME-001',
            startTime: '2026-01-28T06:15Z',
            cmeAnalyses: [{ isMostAccurate: true, speed: 1120, halfAngle: 35 }],
          },
        ],
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const first = await LiveNasa.fetchLatestCme(okFetch, new Date('2026-02-01T00:00:00Z'));
    const second = await LiveNasa.fetchLatestCme(okFetch, new Date('2026-02-01T00:05:00Z'));
    expect(calls).toBe(1);
    expect(first?.donkiActivityID).toBe('2026-01-28T06:15:00-CME-001');
    expect(second?.speedKmS).toBe(1120);
  });

  it('Data.getSolarAlert uses live CME with EN VIVO when cached (keeping scripted day 3/5 and archive fallback)', () => {
    expect(Data.getSolarAlert(1).label).toBe('ARCHIVO REAL');
    Data.setLiveCme({
      donkiActivityID: '2026-02-01T10:00:00-CME-003',
      startTime: '2026-02-01T10:00Z',
      speedKmS: 860,
      halfAngleDeg: 32,
      note: 'test',
      fetchedAtMs: Date.now(),
    });
    const d1 = Data.getSolarAlert(1);
    expect(d1.label).toBe('EN VIVO');
    expect(d1.isLive).toBe(true);
    expect(d1.source).toBe('NASA DONKI API');
    expect(d1.speedText).toBe('860 km/s');

    const d3 = Data.getSolarAlert(3);
    expect(d3.label).toBe('ARCHIVO REAL');
    expect(d3.isLive).toBe(false);
  });
});
