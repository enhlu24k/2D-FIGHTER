import type { CharacterDefinition } from './hero';
import { buildFighterCharacter, rect, type FighterActionSpec } from './fighterCharacter';
import type { FighterCombat, FighterStats } from './types';

import shoheiOnoUrl from '../assets/images/fighters/shohei_ono.jpg';
import zelymKotsoievUrl from '../assets/images/fighters/zelym_kotsoiev.jpg';
import clarisseAgbegnenouUrl from '../assets/images/fighters/clarisse_agbegnenou.jpg';
import ushangiKokauriUrl from '../assets/images/fighters/ushangi_kokauri.jpg';
import koseiInoueUrl from '../assets/images/fighters/kosei_inoue.jpg';
import orkhanSafarovUrl from '../assets/images/fighters/orkhan_safarov.jpg';
import ahmadAbughaushUrl from '../assets/images/fighters/ahmad_abughaush.jpg';
import leeDaeHoonUrl from '../assets/images/fighters/lee_dae_hoon.jpg';
import panipakUrl from '../assets/images/fighters/panipak_wongpattanakit.jpg';
import servetTazegulUrl from '../assets/images/fighters/servet_tazegul.jpg';
import lutaloMuhammadUrl from '../assets/images/fighters/lutalo_muhammad.jpg';
import milicaMandicUrl from '../assets/images/fighters/milica_mandic.jpg';

export type MartialDiscipline = 'judo' | 'taekwondo';
export type MartialBodyBuild = 'lean' | 'athletic' | 'heavy';
export type HairStyle = 'short' | 'fade' | 'buzz' | 'ponytail' | 'bun' | 'curly';

export interface MartialAppearance {
  giColor: string;
  giShade: string;
  trimColor: string;
  beltColor: string;
  hoguColor?: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: HairStyle;
  facialHair?: 'none' | 'stubble' | 'beard';
  wristTape?: boolean;
}

export interface PortraitCrop {
  cx: number;
  cy: number;
  scale: number;
  flipX?: boolean;
}

export interface MartialCharacterMeta {
  id: string;
  label: string;
  country: string;
  division: string;
  discipline: MartialDiscipline;
  archetype: string;
  specialName: string;
  build: MartialBodyBuild;
  accentHex: string;
  portraitUrl: string;
  portraitCrop: PortraitCrop;
  appearance: MartialAppearance;
  statBars: { speed: number; power: number; vitality: number };
  stats: Partial<FighterStats>;
  combat: Partial<FighterCombat>;
}

const FRAME_W = 256;
const FRAME_H = 256;

export const MARTIAL_ROSTER_META: MartialCharacterMeta[] = [
  // ────────────────────── JUDO CHAMPIONS ──────────────────────
  {
    id: 'shohei-ono',
    label: 'Shohei Ono',
    country: 'JPN',
    division: 'Judo · -73 kg',
    discipline: 'judo',
    archetype: 'Uchi-Mata Maestro',
    specialName: 'Uchi-Mata Ippon',
    build: 'athletic',
    accentHex: '#e2e8f0',
    portraitUrl: shoheiOnoUrl,
    portraitCrop: { cx: 0.5, cy: 0.42, scale: 0.94, flipX: true },
    appearance: {
      giColor: '#f1f5f9',
      giShade: '#cbd5e1',
      trimColor: '#dc2626',
      beltColor: '#111827',
      skin: '#dba57c',
      skinShade: '#b87f57',
      hair: '#111827',
      hairStyle: 'short',
      facialHair: 'none'
    },
    statBars: { speed: 84, power: 92, vitality: 86 },
    stats: { walkSpeed: 248, airDrift: 205, jump: 1010, scale: 1.42 },
    combat: { maxHealth: 112, highDamage: 8, lowDamage: 15, lowKnockback: 380, specialDamage: 8 }
  },
  {
    id: 'zelym-kotsoiev',
    label: 'Zelym Kotsoiev',
    country: 'AZE',
    division: 'Judo · -100 kg',
    discipline: 'judo',
    archetype: 'Power Grappler',
    specialName: 'Harai-Goshi Impact',
    build: 'heavy',
    accentHex: '#3b82f6',
    portraitUrl: zelymKotsoievUrl,
    portraitCrop: { cx: 0.45, cy: 0.34, scale: 0.86, flipX: false },
    appearance: {
      giColor: '#1d4ed8',
      giShade: '#1e3a8a',
      trimColor: '#facc15',
      beltColor: '#0f172a',
      skin: '#e0ad89',
      skinShade: '#bd8863',
      hair: '#1e293b',
      hairStyle: 'fade',
      facialHair: 'beard'
    },
    statBars: { speed: 70, power: 96, vitality: 96 },
    stats: { walkSpeed: 220, airDrift: 175, jump: 970, scale: 1.5 },
    combat: { maxHealth: 126, highDamage: 9, lowDamage: 16, lowKnockback: 410, specialDamage: 9 }
  },
  {
    id: 'clarisse-agbegnenou',
    label: 'C. Agbegnenou',
    country: 'FRA',
    division: 'Judo · -63 kg',
    discipline: 'judo',
    archetype: 'Kuzushi Tactician',
    specialName: 'O-Uchi Rush',
    build: 'athletic',
    accentHex: '#60a5fa',
    portraitUrl: clarisseAgbegnenouUrl,
    portraitCrop: { cx: 0.68, cy: 0.48, scale: 0.82, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#2563eb',
      beltColor: '#0f172a',
      skin: '#7c4c34',
      skinShade: '#5b3421',
      hair: '#111827',
      hairStyle: 'bun',
      facialHair: 'none',
      wristTape: true
    },
    statBars: { speed: 88, power: 86, vitality: 86 },
    stats: { walkSpeed: 262, airDrift: 215, jump: 1040, scale: 1.4 },
    combat: { maxHealth: 108, highDamage: 8, lowDamage: 14, specialDamage: 8 }
  },
  {
    id: 'ushangi-kokauri',
    label: 'Ushangi Kokauri',
    country: 'AZE',
    division: 'Judo · +100 kg',
    discipline: 'judo',
    archetype: 'Heavyweight Titan',
    specialName: 'Tani-Otoshi Crush',
    build: 'heavy',
    accentHex: '#2563eb',
    portraitUrl: ushangiKokauriUrl,
    portraitCrop: { cx: 0.56, cy: 0.44, scale: 0.86, flipX: false },
    appearance: {
      giColor: '#1e40af',
      giShade: '#172554',
      trimColor: '#22c55e',
      beltColor: '#090d16',
      skin: '#deb08e',
      skinShade: '#b88867',
      hair: '#1f2937',
      hairStyle: 'buzz',
      facialHair: 'stubble'
    },
    statBars: { speed: 58, power: 100, vitality: 100 },
    stats: { walkSpeed: 198, airDrift: 155, jump: 940, scale: 1.56 },
    combat: {
      maxHealth: 135,
      highDamage: 10,
      highKnockback: 225,
      lowDamage: 18,
      lowKnockback: 430,
      specialDamage: 10
    }
  },
  {
    id: 'kosei-inoue',
    label: 'Kosei Inoue',
    country: 'JPN',
    division: 'Judo · -100 kg',
    discipline: 'judo',
    archetype: 'Classic Technician',
    specialName: 'Seoi-Nage Zenith',
    build: 'athletic',
    accentHex: '#f1f5f9',
    portraitUrl: koseiInoueUrl,
    portraitCrop: { cx: 0.46, cy: 0.44, scale: 0.92, flipX: false },
    appearance: {
      giColor: '#f1f5f9',
      giShade: '#cbd5e1',
      trimColor: '#0f172a',
      beltColor: '#111827',
      skin: '#dba680',
      skinShade: '#b5805b',
      hair: '#0f172a',
      hairStyle: 'short',
      facialHair: 'stubble'
    },
    statBars: { speed: 78, power: 90, vitality: 90 },
    stats: { walkSpeed: 238, airDrift: 195, jump: 1000, scale: 1.46 },
    combat: { maxHealth: 118, highDamage: 8, lowDamage: 15, specialDamage: 9 }
  },
  {
    id: 'orkhan-safarov',
    label: 'Orkhan Safarov',
    country: 'AZE',
    division: 'Judo · -60 kg',
    discipline: 'judo',
    archetype: 'Tempo Sweeper',
    specialName: 'Tomoe-Nage Blitz',
    build: 'lean',
    accentHex: '#38bdf8',
    portraitUrl: orkhanSafarovUrl,
    portraitCrop: { cx: 0.68, cy: 0.36, scale: 0.78, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#0ea5e9',
      beltColor: '#0f172a',
      skin: '#d9a47e',
      skinShade: '#b37e59',
      hair: '#111827',
      hairStyle: 'short',
      facialHair: 'stubble',
      wristTape: true
    },
    statBars: { speed: 94, power: 76, vitality: 80 },
    stats: { walkSpeed: 282, airDrift: 235, jump: 1080, scale: 1.38 },
    combat: { maxHealth: 100, highDamage: 7, lowDamage: 13, specialDamage: 7 }
  },

  // ──────────────────── TAEKWONDO CHAMPIONS ───────────────────
  {
    id: 'ahmad-abughaush',
    label: 'A. Abughaush',
    country: 'JOR',
    division: 'Taekwondo · -68 kg',
    discipline: 'taekwondo',
    archetype: 'Spinning Kicker',
    specialName: '540 Tornado Barrage',
    build: 'lean',
    accentHex: '#f87171',
    portraitUrl: ahmadAbughaushUrl,
    portraitCrop: { cx: 0.5, cy: 0.25, scale: 0.92, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#111827',
      beltColor: '#111827',
      hoguColor: '#dc2626',
      skin: '#d69f78',
      skinShade: '#b07b55',
      hair: '#111827',
      hairStyle: 'short',
      facialHair: 'stubble',
      wristTape: true
    },
    statBars: { speed: 92, power: 82, vitality: 80 },
    stats: { walkSpeed: 278, airDrift: 240, jump: 1110, scale: 1.4 },
    combat: { maxHealth: 102, highDamage: 8, lowDamage: 13, specialDamage: 8 }
  },
  {
    id: 'lee-dae-hoon',
    label: 'Lee Dae-hoon',
    country: 'KOR',
    division: 'Taekwondo · -68 kg',
    discipline: 'taekwondo',
    archetype: 'Precision Head-Kick',
    specialName: 'Naeryo Axe Cascade',
    build: 'lean',
    accentHex: '#60a5fa',
    portraitUrl: leeDaeHoonUrl,
    portraitCrop: { cx: 0.51, cy: 0.34, scale: 0.84, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#0f172a',
      beltColor: '#0f172a',
      hoguColor: '#2563eb',
      skin: '#ecc2a1',
      skinShade: '#c89b78',
      hair: '#111827',
      hairStyle: 'short',
      facialHair: 'none'
    },
    statBars: { speed: 95, power: 78, vitality: 78 },
    stats: { walkSpeed: 286, airDrift: 245, jump: 1120, scale: 1.4 },
    combat: { maxHealth: 98, highDamage: 7, lowDamage: 13, specialDamage: 8 }
  },
  {
    id: 'panipak-wong',
    label: 'Panipak Wong.',
    country: 'THA',
    division: 'Taekwondo · -49 kg',
    discipline: 'taekwondo',
    archetype: 'Scorpion Blitz',
    specialName: 'Scorpion Crescent',
    build: 'lean',
    accentHex: '#38bdf8',
    portraitUrl: panipakUrl,
    portraitCrop: { cx: 0.5, cy: 0.34, scale: 0.88, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#111827',
      beltColor: '#111827',
      hoguColor: '#2563eb',
      skin: '#e6b692',
      skinShade: '#c2916c',
      hair: '#111827',
      hairStyle: 'ponytail',
      facialHair: 'none'
    },
    statBars: { speed: 98, power: 74, vitality: 76 },
    stats: { walkSpeed: 294, airDrift: 255, jump: 1140, scale: 1.35 },
    combat: { maxHealth: 94, highDamage: 7, lowDamage: 12, specialDamage: 8 }
  },
  {
    id: 'servet-tazegul',
    label: 'Servet Tazegül',
    country: 'TUR',
    division: 'Taekwondo · -68 kg',
    discipline: 'taekwondo',
    archetype: 'Acrobatic Striker',
    specialName: 'Bandal Tornado',
    build: 'athletic',
    accentHex: '#ef4444',
    portraitUrl: servetTazegulUrl,
    portraitCrop: { cx: 0.5, cy: 0.48, scale: 0.9, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#0f172a',
      beltColor: '#0f172a',
      hoguColor: '#dc2626',
      skin: '#dca884',
      skinShade: '#b88460',
      hair: '#1c1917',
      hairStyle: 'curly',
      facialHair: 'stubble'
    },
    statBars: { speed: 90, power: 84, vitality: 82 },
    stats: { walkSpeed: 274, airDrift: 235, jump: 1090, scale: 1.4 },
    combat: { maxHealth: 104, highDamage: 8, lowDamage: 14, specialDamage: 8 }
  },
  {
    id: 'lutalo-muhammad',
    label: 'Lutalo Muhammad',
    country: 'GBR',
    division: 'Taekwondo · -80 kg',
    discipline: 'taekwondo',
    archetype: 'Long-Range Striker',
    specialName: 'Dwit-Chagi Thrust',
    build: 'athletic',
    accentHex: '#60a5fa',
    portraitUrl: lutaloMuhammadUrl,
    portraitCrop: { cx: 0.59, cy: 0.42, scale: 0.84, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#0f172a',
      beltColor: '#111827',
      hoguColor: '#1d4ed8',
      skin: '#6f422b',
      skinShade: '#4f2d1b',
      hair: '#0f172a',
      hairStyle: 'buzz',
      facialHair: 'none'
    },
    statBars: { speed: 84, power: 88, vitality: 88 },
    stats: { walkSpeed: 256, airDrift: 220, jump: 1060, scale: 1.46 },
    combat: { maxHealth: 112, highDamage: 8, lowDamage: 15, specialDamage: 9 }
  },
  {
    id: 'milica-mandic',
    label: 'Milica Mandić',
    country: 'SRB',
    division: 'Taekwondo · +67 kg',
    discipline: 'taekwondo',
    archetype: 'Counter Specialist',
    specialName: 'Yop-Chagi Breaker',
    build: 'athletic',
    accentHex: '#f87171',
    portraitUrl: milicaMandicUrl,
    portraitCrop: { cx: 0.5, cy: 0.45, scale: 0.9, flipX: false },
    appearance: {
      giColor: '#f8fafc',
      giShade: '#cbd5e1',
      trimColor: '#111827',
      beltColor: '#0f172a',
      hoguColor: '#b91c1c',
      skin: '#f0c6ab',
      skinShade: '#cc9d81',
      hair: '#1c1917',
      hairStyle: 'ponytail',
      facialHair: 'none'
    },
    statBars: { speed: 82, power: 90, vitality: 88 },
    stats: { walkSpeed: 248, airDrift: 210, jump: 1040, scale: 1.44 },
    combat: { maxHealth: 114, highDamage: 8, lowDamage: 15, specialDamage: 9 }
  }
];

function createMartialActions(meta: MartialCharacterMeta): FighterActionSpec[] {
  const isHeavy = meta.build === 'heavy';
  const standingVisual = isHeavy ? rect(58, 20, 140, 212) : rect(72, 28, 112, 204);
  const crouchVisual = isHeavy ? rect(58, 92, 140, 140) : rect(70, 102, 116, 130);

  return [
    {
      action: 'idle',
      label: 'Idle',
      file: 'idle.png',
      frames: 6,
      frameRate: 8,
      repeat: -1,
      defaultVisual: standingVisual
    },
    {
      action: 'walk-forward',
      label: 'Walk Forward',
      file: 'walk-forward.png',
      frames: 8,
      frameRate: 12,
      repeat: -1,
      defaultVisual: standingVisual
    },
    {
      action: 'walk-backward',
      label: 'Walk Backward',
      file: 'walk-backward.png',
      frames: 8,
      frameRate: 11,
      repeat: -1,
      defaultVisual: standingVisual
    },
    {
      action: 'crouch',
      label: 'Crouch',
      file: 'crouch.png',
      frames: 4,
      frameRate: 12,
      repeat: 0,
      defaultVisual: crouchVisual
    },
    {
      action: 'jump',
      label: 'Jump',
      file: 'jump.png',
      frames: 5,
      frameRate: 11,
      repeat: 0,
      defaultVisual: rect(66, 16, 124, 204)
    },
    {
      action: 'block-high',
      label: 'Block High',
      file: 'block-high.png',
      frames: 4,
      frameRate: 12,
      repeat: 0,
      defaultVisual: standingVisual,
      guard: rect(56, 40, 144, 122)
    },
    {
      action: 'block-low',
      label: 'Block Low',
      file: 'block-low.png',
      frames: 4,
      frameRate: 12,
      repeat: 0,
      defaultVisual: crouchVisual,
      guard: rect(56, 108, 144, 122)
    },
    {
      action: 'hit-high',
      label: 'Hit High',
      file: 'hit-high.png',
      frames: 5,
      frameRate: 13,
      repeat: 0,
      defaultVisual: standingVisual
    },
    {
      action: 'light-punch',
      label: meta.discipline === 'judo' ? 'Grip Strike' : 'Snap Strike',
      file: 'light-punch.png',
      frames: 6,
      frameRate: 16,
      repeat: 0,
      defaultVisual: rect(52, 26, 148, 206),
      attack: { frames: [2, 3], bounds: rect(14, 72, 98, 56) }
    },
    {
      action: 'heavy-kick',
      label: meta.discipline === 'judo' ? 'Sweep / Throw' : 'High Kick',
      file: 'heavy-kick.png',
      frames: 7,
      frameRate: 14,
      repeat: 0,
      defaultVisual: rect(40, 24, 168, 208),
      attack: { frames: [2, 3, 4], bounds: rect(6, 56, 120, 88) }
    },
    {
      action: 'special-charge',
      label: 'Kiai Focus',
      file: 'special-charge.png',
      frames: 5,
      frameRate: 12,
      repeat: 0,
      defaultVisual: standingVisual
    },
    {
      action: 'special',
      label: meta.specialName,
      file: 'special.png',
      frames: 9,
      frameRate: 15,
      repeat: 0,
      defaultVisual: rect(20, 18, 208, 214),
      attackSpans: [
        { frames: [1, 2], bounds: rect(8, 60, 126, 118) },
        { frames: [4, 5], bounds: rect(6, 48, 134, 130) },
        { frames: [6, 7], bounds: rect(4, 34, 142, 148) }
      ]
    },
    {
      action: 'knockdown',
      label: 'Knockdown',
      file: 'knockdown.png',
      frames: 6,
      frameRate: 11,
      repeat: 0,
      defaultVisual: rect(38, 144, 180, 88)
    }
  ];
}

function buildMartialCharacter(meta: MartialCharacterMeta): CharacterDefinition {
  const def = buildFighterCharacter({
    id: meta.id,
    label: meta.label,
    assetRoot: `/assets/martial/${meta.id}`,
    anchorUsage: `${meta.label} (${meta.division}) ${meta.discipline} fighter spritesheet`,
    defaultFrameWidth: FRAME_W,
    defaultFrameHeight: FRAME_H,
    actions: createMartialActions(meta)
  });

  def.assets.forEach((asset) => {
    asset.auto = true;
  });

  return def;
}

export const MARTIAL_CHARACTERS: CharacterDefinition[] = MARTIAL_ROSTER_META.map(buildMartialCharacter);

export const MARTIAL_STAT_OVERRIDES: Record<string, Partial<FighterStats>> = Object.fromEntries(
  MARTIAL_ROSTER_META.map((m) => [m.id, m.stats])
);

export const MARTIAL_COMBAT_OVERRIDES: Record<string, Partial<FighterCombat>> = Object.fromEntries(
  MARTIAL_ROSTER_META.map((m) => [m.id, m.combat])
);

export function getMartialCharacterMeta(characterId: string): MartialCharacterMeta {
  return MARTIAL_ROSTER_META.find((m) => m.id === characterId) ?? MARTIAL_ROSTER_META[0];
}
