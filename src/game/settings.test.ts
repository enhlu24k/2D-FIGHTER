import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('normalizes valid persisted settings', () => {
    expect(
      sanitizeSettings({
        sfxVolume: 0.4,
        musicVolume: 0.2,
        muted: true,
        difficulty: 'hard'
      })
    ).toEqual({
      sfxVolume: 0.4,
      musicVolume: 0.2,
      muted: true,
      difficulty: 'hard'
    });
  });

  it('normalizes legacy single-volume persisted settings', () => {
    expect(
      sanitizeSettings({
        volume: 0.35,
        muted: false
      })
    ).toEqual({
      sfxVolume: 0.35,
      musicVolume: 0.35,
      muted: false,
      difficulty: 'normal'
    });
  });

  it('falls back when persisted settings are invalid', () => {
    expect(
      sanitizeSettings({
        sfxVolume: 99,
        musicVolume: -1,
        difficulty: 'impossible'
      })
    ).toEqual(DEFAULT_SETTINGS);
  });
});
