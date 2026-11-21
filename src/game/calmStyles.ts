import * as Phaser from 'phaser';

import dojoTatamiUrl from '../assets/images/pixel_dojo_tatami_1794715737504.jpg';
import dojoWoodenUrl from '../assets/images/pixel_dojo_wooden_1794715737835.jpg';
import dojoBambooUrl from '../assets/images/pixel_dojo_bamboo_1794715739349.jpg';
import calmZenSanctuaryUrl from '../assets/images/calm_zen_sanctuary_1794714332264.jpg';
import calmAstralHorizonUrl from '../assets/images/calm_astral_horizon_1794714332161.jpg';
import calmMistyPeaksUrl from '../assets/images/calm_misty_peaks_1794714332190.jpg';
import calmCoastalDuskUrl from '../assets/images/calm_coastal_dusk_1794714332877.jpg';
import { createStore } from './store';
import type { CalmBackgroundId, CombatStyleId, SuitStyleId } from './types';

const STYLE_STORAGE_KEY = 'vibe-fighter-calm-style';

export interface CalmBackgroundDefinition {
  id: CalmBackgroundId;
  label: string;
  subtitle: string;
  textureKey: string | null;
  url: string | null;
  baseColor: number;
  accentHex: number;
  accentCss: string;
  particleColor: number;
  scrimAlpha: number;
}

export const CALM_BACKGROUNDS: CalmBackgroundDefinition[] = [
  {
    id: 'dojo-tatami',
    label: 'Tatami Mat Dojo',
    subtitle: 'Woven straw tatami mats, hinoki beams & shoji daylight',
    textureKey: 'calm-bg-dojo-tatami',
    url: dojoTatamiUrl,
    baseColor: 0x161b14,
    accentHex: 0x86efac,
    accentCss: '#86efac',
    particleColor: 0xfef3c7,
    scrimAlpha: 0.28
  },
  {
    id: 'dojo-wooden',
    label: 'Wooden Floor Dojang',
    subtitle: 'Polished oak floor, warm lanterns & mountain scroll',
    textureKey: 'calm-bg-dojo-wooden',
    url: dojoWoodenUrl,
    baseColor: 0x1c140e,
    accentHex: 0xfdba74,
    accentCss: '#fdba74',
    particleColor: 0xfde68a,
    scrimAlpha: 0.28
  },
  {
    id: 'dojo-bamboo',
    label: 'Bamboo Forest Clearing',
    subtitle: 'Mossy stone sparring ground in sunlit morning mist',
    textureKey: 'calm-bg-dojo-bamboo',
    url: dojoBambooUrl,
    baseColor: 0x0e1913,
    accentHex: 0x6ee7b7,
    accentCss: '#6ee7b7',
    particleColor: 0xd9f99d,
    scrimAlpha: 0.26
  },
  {
    id: 'zen-sanctuary',
    label: 'Zen Sanctuary',
    subtitle: 'Misty bamboo courtyard & drifting blossoms',
    textureKey: 'calm-bg-zen-sanctuary',
    url: calmZenSanctuaryUrl,
    baseColor: 0x0f1f1c,
    accentHex: 0x6ee7b7,
    accentCss: '#6ee7b7',
    particleColor: 0xfbcfe8,
    scrimAlpha: 0.48
  },
  {
    id: 'astral-horizon',
    label: 'Astral Horizon',
    subtitle: 'Quiet aurora ribbons over twilight clouds',
    textureKey: 'calm-bg-astral-horizon',
    url: calmAstralHorizonUrl,
    baseColor: 0x0b1628,
    accentHex: 0x5eead4,
    accentCss: '#5eead4',
    particleColor: 0x99f6e4,
    scrimAlpha: 0.45
  },
  {
    id: 'misty-peaks',
    label: 'Misty Peaks',
    subtitle: 'Soft golden dusk above rolling mountain clouds',
    textureKey: 'calm-bg-misty-peaks',
    url: calmMistyPeaksUrl,
    baseColor: 0x161c29,
    accentHex: 0xfdba74,
    accentCss: '#fdba74',
    particleColor: 0xfde68a,
    scrimAlpha: 0.46
  },
  {
    id: 'coastal-dusk',
    label: 'Coastal Dusk',
    subtitle: 'Glassy ocean horizon & lavender sky',
    textureKey: 'calm-bg-coastal-dusk',
    url: calmCoastalDuskUrl,
    baseColor: 0x131a2b,
    accentHex: 0xa5b4fc,
    accentCss: '#a5b4fc',
    particleColor: 0xe0e7ff,
    scrimAlpha: 0.46
  },
  {
    id: 'minimal-slate',
    label: 'Minimal Slate',
    subtitle: 'Distraction-free soft charcoal studio',
    textureKey: null,
    url: null,
    baseColor: 0x111827,
    accentHex: 0x93c5fd,
    accentCss: '#93c5fd',
    particleColor: 0xcbd5e1,
    scrimAlpha: 0.25
  }
];

export interface CombatStyleDefinition {
  id: CombatStyleId;
  label: string;
  shortDesc: string;
  accentHex: number;
  accentCss: string;
  speedMult: number;
  jumpMult: number;
  damageMult: number;
  knockbackMult: number;
  healthMult: number;
  meterMult: number;
}

export const COMBAT_STYLES: CombatStyleDefinition[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    shortDesc: 'Classic all-round stance',
    accentHex: 0x7dd3fc,
    accentCss: '#7dd3fc',
    speedMult: 1,
    jumpMult: 1,
    damageMult: 1,
    knockbackMult: 1,
    healthMult: 1,
    meterMult: 1
  },
  {
    id: 'rushdown',
    label: 'Rushdown',
    shortDesc: '+22% Speed · Agile',
    accentHex: 0x34d399,
    accentCss: '#34d399',
    speedMult: 1.22,
    jumpMult: 1.08,
    damageMult: 0.96,
    knockbackMult: 0.95,
    healthMult: 0.92,
    meterMult: 1.08
  },
  {
    id: 'powerhouse',
    label: 'Powerhouse',
    shortDesc: '+25% DMG · Heavy',
    accentHex: 0xfb923c,
    accentCss: '#fb923c',
    speedMult: 0.9,
    jumpMult: 0.96,
    damageMult: 1.25,
    knockbackMult: 1.18,
    healthMult: 1.05,
    meterMult: 0.95
  },
  {
    id: 'guardian',
    label: 'Guardian',
    shortDesc: '+25% HP · +35% Meter',
    accentHex: 0xc084fc,
    accentCss: '#c084fc',
    speedMult: 0.96,
    jumpMult: 0.98,
    damageMult: 0.94,
    knockbackMult: 1,
    healthMult: 1.25,
    meterMult: 1.35
  }
];

export interface SuitStyleDefinition {
  id: SuitStyleId;
  label: string;
  tint: number;
  accentCss: string;
  clothRgb: [number, number, number];
}

export const SUIT_STYLES: SuitStyleDefinition[] = [
  { id: 'classic', label: 'Classic', tint: 0xffffff, accentCss: '#e2e8f0', clothRgb: [242, 246, 252] },
  { id: 'pink', label: 'Pink', tint: 0xf472b6, accentCss: '#f472b6', clothRgb: [244, 114, 182] },
  { id: 'orange', label: 'Orange', tint: 0xfb923c, accentCss: '#fb923c', clothRgb: [249, 115, 22] },
  { id: 'black', label: 'Black', tint: 0x475569, accentCss: '#64748b', clothRgb: [44, 50, 62] },
  { id: 'grey', label: 'Grey', tint: 0x94a3b8, accentCss: '#94a3b8', clothRgb: [148, 163, 184] },
  { id: 'crimson', label: 'Red', tint: 0xef4444, accentCss: '#f87171', clothRgb: [224, 48, 58] },
  { id: 'royal', label: 'Blue', tint: 0x3b82f6, accentCss: '#60a5fa', clothRgb: [46, 114, 232] },
  { id: 'gold', label: 'Gold', tint: 0xfacc15, accentCss: '#facc15', clothRgb: [234, 179, 8] }
];

export function getCalmBackgroundDefinition(id: string | undefined): CalmBackgroundDefinition {
  return CALM_BACKGROUNDS.find((bg) => bg.id === id) ?? CALM_BACKGROUNDS[0];
}

export function getCombatStyleDefinition(id: string | undefined): CombatStyleDefinition {
  return COMBAT_STYLES.find((style) => style.id === id) ?? COMBAT_STYLES[0];
}

export function getSuitStyleDefinition(id: string | undefined): SuitStyleDefinition {
  return SUIT_STYLES.find((style) => style.id === id) ?? SUIT_STYLES[0];
}

function readStoredBackgroundId(): CalmBackgroundId {
  try {
    const raw = window.localStorage.getItem(STYLE_STORAGE_KEY);
    if (raw && CALM_BACKGROUNDS.some((bg) => bg.id === raw)) {
      return raw as CalmBackgroundId;
    }
  } catch {
    // ignore storage errors
  }
  return 'dojo-tatami';
}

export const calmStyleStore = createStore<{ backgroundId: CalmBackgroundId }>({
  backgroundId: typeof window !== 'undefined' ? readStoredBackgroundId() : 'dojo-tatami'
});

export function setCalmBackgroundStyle(id: CalmBackgroundId): void {
  calmStyleStore.setState({ backgroundId: id });
  try {
    window.localStorage.setItem(STYLE_STORAGE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export function preloadCalmBackgroundAssets(scene: Phaser.Scene): void {
  CALM_BACKGROUNDS.forEach((bg) => {
    if (bg.textureKey && bg.url && !scene.textures.exists(bg.textureKey)) {
      scene.load.image(bg.textureKey, bg.url);
    }
  });
}

export interface CalmBackdropHandle {
  setStyle(id: CalmBackgroundId, animate?: boolean): void;
  destroy(): void;
}

/**
 * Renders a serene, calm atmospheric backdrop with gentle drifting light motes
 * and smooth crossfades when switching between calm background styles.
 */
export function createCalmBackdrop(
  scene: Phaser.Scene,
  initialStyleId?: CalmBackgroundId,
  scrimOverrideAlpha?: number
): CalmBackdropHandle {
  const { width, height, centerX, centerY } = scene.cameras.main;
  const root = scene.add.container(0, 0).setDepth(-20);

  const solidBase = scene.add.rectangle(centerX, centerY, width, height, 0x0f172a, 1);
  const bgImage = scene.add.image(centerX, centerY, 'calm-bg-zen-sanctuary').setAlpha(0);
  const fadeOverlay = scene.add.image(centerX, centerY, 'calm-bg-zen-sanctuary').setAlpha(0);
  const scrim = scene.add.rectangle(centerX, centerY, width, height, 0x090d16, 0.45);
  const vignetteTop = scene.add.rectangle(centerX, 0, width, 150, 0x070a12, 0.45).setOrigin(0.5, 0);
  const vignetteBottom = scene.add.rectangle(centerX, height, width, 110, 0x070a12, 0.5).setOrigin(0.5, 1);

  root.add([solidBase, bgImage, fadeOverlay, scrim, vignetteTop, vignetteBottom]);

  // Gentle slow-drifting ambient motes for a calm atmosphere
  const motes: Phaser.GameObjects.Arc[] = [];
  const moteTweens: Phaser.Tweens.Tween[] = [];
  for (let i = 0; i < 18; i += 1) {
    const startX = Phaser.Math.Between(40, width - 40);
    const startY = Phaser.Math.Between(40, height - 40);
    const radius = Phaser.Math.FloatBetween(1.8, 3.8);
    const mote = scene.add.circle(startX, startY, radius, 0xffffff, Phaser.Math.FloatBetween(0.12, 0.32));
    root.add(mote);
    motes.push(mote);

    const tween = scene.tweens.add({
      targets: mote,
      y: startY - Phaser.Math.Between(28, 70),
      x: startX + Phaser.Math.Between(-35, 35),
      alpha: { from: mote.alpha, to: 0.04 },
      duration: Phaser.Math.Between(4200, 7600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
      delay: i * 180
    });
    moteTweens.push(tween);
  }

  const fitImage = (img: Phaser.GameObjects.Image, key: string): void => {
    img.setTexture(key);
    const tex = scene.textures.get(key).getSourceImage();
    const scale = Math.max(width / (tex.width || width), height / (tex.height || height));
    img.setScale(scale).setPosition(centerX, centerY);
  };

  let activeStyleId: CalmBackgroundId | null = null;

  const setStyle = (id: CalmBackgroundId, animate = true): void => {
    const def = getCalmBackgroundDefinition(id);
    if (activeStyleId === def.id) {
      return;
    }

    const hadPrevious = activeStyleId !== null;
    activeStyleId = def.id;

    solidBase.setFillStyle(def.baseColor, 1);
    scrim.setFillStyle(def.baseColor, scrimOverrideAlpha ?? def.scrimAlpha);
    motes.forEach((mote) => mote.setFillStyle(def.particleColor, mote.alpha));

    if (def.textureKey && scene.textures.exists(def.textureKey)) {
      if (hadPrevious && animate && bgImage.alpha > 0.05 && bgImage.texture.key) {
        fitImage(fadeOverlay, bgImage.texture.key);
        fadeOverlay.setAlpha(bgImage.alpha);
        scene.tweens.killTweensOf(fadeOverlay);
        scene.tweens.add({
          targets: fadeOverlay,
          alpha: 0,
          duration: 360,
          ease: 'Sine.Out'
        });
      }

      fitImage(bgImage, def.textureKey);
      if (animate && hadPrevious) {
        bgImage.setAlpha(0);
        scene.tweens.killTweensOf(bgImage);
        scene.tweens.add({
          targets: bgImage,
          alpha: 1,
          duration: 360,
          ease: 'Sine.Out'
        });
      } else {
        bgImage.setAlpha(1);
      }
    } else {
      if (hadPrevious && animate && bgImage.alpha > 0.05) {
        scene.tweens.killTweensOf(bgImage);
        scene.tweens.add({
          targets: bgImage,
          alpha: 0,
          duration: 320,
          ease: 'Sine.Out'
        });
      } else {
        bgImage.setAlpha(0);
      }
    }
  };

  setStyle(initialStyleId ?? calmStyleStore.getState().backgroundId, false);

  return {
    setStyle,
    destroy: () => {
      moteTweens.forEach((t) => t.stop());
      root.destroy(true);
    }
  };
}
