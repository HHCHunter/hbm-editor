import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings } from './settingsStore';

const storage = (value: string | null) => ({ getItem: () => value });

describe('settings', () => {
  it('reads saved settings', () => {
    const saved = JSON.stringify({ v: 1, savedAt: '', data: { uiScale: 1.5, density: 'compact' } });
    expect(loadSettings(storage(saved))).toEqual({ uiScale: 1.5, density: 'compact' });
  });

  it('falls back to defaults for missing, corrupt, unknown-version or out-of-range settings', () => {
    expect(loadSettings(storage(null))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storage('{not json'))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storage(JSON.stringify({ v: 99, data: { uiScale: 2 } })))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(storage(JSON.stringify({ v: 1, data: { uiScale: 7, density: 'huge' } })))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
