import type * as Phaser from 'phaser';

import spriteShoheiOnoUrl from '../assets/images/sprite_shohei_ono_1795229957346.jpg';
import spriteZelymKotsoievUrl from '../assets/images/sprite_zelym_kotsoiev_1795229959986.jpg';
import spriteClarisseAgbegnenouUrl from '../assets/images/sprite_clarisse_agbegnenou_1795229957586.jpg';
import spriteUshangiKokauriUrl from '../assets/images/sprite_ushangi_kokauri_1795229958757.jpg';
import spriteKoseiInoueUrl from '../assets/images/sprite_kosei_inoue_1795229957556.jpg';
import spriteOrkhanSafarovUrl from '../assets/images/sprite_orkhan_safarov_1795229957630.jpg';
import spriteAhmadAbughaushUrl from '../assets/images/sprite_ahmad_abughaush_1795229957884.jpg';
import spriteLeeDaeHoonUrl from '../assets/images/sprite_lee_dae_hoon_1795229960927.jpg';
import spritePanipakWongUrl from '../assets/images/sprite_panipak_wong_1795229959175.jpg';
import spriteServetTazegulUrl from '../assets/images/sprite_servet_tazegul_1795229958116.jpg';
import spriteLutaloMuhammadUrl from '../assets/images/sprite_lutalo_muhammad_1795229959050.jpg';
import spriteMilicaMandicUrl from '../assets/images/sprite_milica_mandic_1795229957213.jpg';
import spriteGuestChallengerUrl from '../assets/images/sprite_custom_challenger_1795231946609.jpg';

import { getSuitStyleDefinition } from './calmStyles';
import { collisionBounds, hitBounds } from './fighterCharacter';
import type { CharacterDefinition } from './hero';
import {
  MARTIAL_CHARACTERS,
  MARTIAL_ROSTER_META,
  type MartialCharacterMeta
} from './martialRoster';
import type { Rect, SuitStyleId } from './types';

const CELL = 256;
const COLS = 5;
const GROUND_Y = 229;
const CANONICAL_HEIGHT = 172;

const CHARACTER_SHEET_URLS: Record<string, string> = {
  'shohei-ono': spriteShoheiOnoUrl,
  'zelym-kotsoiev': spriteZelymKotsoievUrl,
  'clarisse-agbegnenou': spriteClarisseAgbegnenouUrl,
  'ushangi-kokauri': spriteUshangiKokauriUrl,
  'kosei-inoue': spriteKoseiInoueUrl,
  'orkhan-safarov': spriteOrkhanSafarovUrl,
  'ahmad-abughaush': spriteAhmadAbughaushUrl,
  'lee-dae-hoon': spriteLeeDaeHoonUrl,
  'panipak-wong': spritePanipakWongUrl,
  'servet-tazegul': spriteServetTazegulUrl,
  'lutalo-muhammad': spriteLutaloMuhammadUrl,
  'milica-mandic': spriteMilicaMandicUrl,
  'guest-challenger': spriteGuestChallengerUrl
};

interface PoseCutout {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Horizontal center of the grounded feet in the flipped (left-facing) cutout, 0..1 */
  footCenterRatio: number;
}

interface PixelPosePack {
  poses: PoseCutout[]; // [0: stance, 1: step, 2: punch, 3: kick, 4: block, 5: recoil]
  baseScale: number;
}

const posePackCache = new Map<string, PixelPosePack>();

export async function prepareMartialCharacters(scene: Phaser.Scene): Promise<void> {
  const [loadedSheets, loadedPortraits] = await Promise.all([
    Promise.all(
      MARTIAL_ROSTER_META.map((meta) => {
        const url = CHARACTER_SHEET_URLS[meta.id];
        return url ? loadHtmlImage(url).catch(() => null) : Promise.resolve(null);
      })
    ),
    Promise.all(MARTIAL_ROSTER_META.map((meta) => loadHtmlImage(meta.portraitUrl).catch(() => null)))
  ]);

  MARTIAL_CHARACTERS.forEach((character, idx) => {
    const meta = MARTIAL_ROSTER_META[idx];
    if (!meta) {
      return;
    }

    const sheetImg = loadedSheets[idx];
    if (sheetImg && !posePackCache.has(meta.id)) {
      const pack = extractPixelPosePack(sheetImg);
      if (pack) {
        posePackCache.set(meta.id, pack);
      }
    }

    const pack = posePackCache.get(meta.id) ?? null;
    buildCharacterTextures(scene, character, meta, loadedPortraits[idx], pack);
  });
}

/**
 * Generates and registers dedicated cloth-recolored spritesheets and Phaser
 * animations for any non-classic uniform color (e.g. pink, orange, black, grey)
 * while preserving natural skin, face, hair, and black belt pixels.
 * Returns the animation suffix to use on the fighter sprite ('' for classic).
 */
export function ensureUniformCharacterAnimations(
  scene: Phaser.Scene,
  characterId: string,
  suitId: SuitStyleId | undefined
): string {
  if (!suitId || suitId === 'classic') {
    return '';
  }

  const suffix = `__suit_${suitId}`;
  const character = MARTIAL_CHARACTERS.find((c) => c.id === characterId);
  const pack = posePackCache.get(characterId);
  if (!character || !pack) {
    return '';
  }

  const probeAnimKey = `${character.animations[0]?.key ?? `${characterId}-idle`}${suffix}`;
  if (scene.anims.exists(probeAnimKey)) {
    return suffix;
  }

  const meta = MARTIAL_ROSTER_META.find((m) => m.id === characterId);
  if (!meta) {
    return '';
  }

  const suitDef = getSuitStyleDefinition(suitId);
  const recoloredPack = recolorPosePack(pack, suitDef.clothRgb);
  const bulkWidthMult = meta.build === 'heavy' ? 1.07 : meta.build === 'lean' ? 0.96 : 1.0;

  character.animations.forEach((anim) => {
    const sheetKey = `${anim.sheet.key}${suffix}`;
    const animKey = `${anim.key}${suffix}`;
    const frames = anim.sheet.frames;
    const rows = Math.ceil(frames / COLS);
    const canvas = makeCanvas(COLS * CELL, rows * CELL);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      for (let f = 0; f < frames; f += 1) {
        const col = f % COLS;
        const row = Math.floor(f / COLS);
        ctx.save();
        ctx.translate(col * CELL, row * CELL);
        ctx.beginPath();
        ctx.rect(0, 0, CELL, CELL);
        ctx.clip();
        drawPixelAnimatedFrame(ctx, meta, recoloredPack, anim.action, f, frames, bulkWidthMult);
        ctx.restore();
      }
    }

    if (scene.textures.exists(sheetKey)) {
      scene.textures.remove(sheetKey);
    }
    scene.textures.addSpriteSheet(sheetKey, canvas as unknown as HTMLImageElement, {
      frameWidth: CELL,
      frameHeight: CELL,
      startFrame: 0,
      endFrame: frames - 1
    });

    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          start: 0,
          end: frames - 1
        }),
        frameRate: anim.frameRate,
        repeat: anim.repeat
      });
    }
  });

  return suffix;
}

function recolorPosePack(pack: PixelPosePack, clothRgb: [number, number, number]): PixelPosePack {
  const [tr, tg, tb] = clothRgb;
  const recoloredPoses: PoseCutout[] = pack.poses.map((pose) => {
    const c = makeCanvas(pose.width, pose.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return pose;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pose.canvas, 0, 0);

    const img = ctx.getImageData(0, 0, pose.width, pose.height);
    const d = img.data;
    const w = pose.width;
    const h = pose.height;

    for (let y = 0; y < h; y += 1) {
      const inHeadBand = y < h * 0.25;
      const inBeltBand = y >= h * 0.37 && y <= h * 0.56;
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        if (d[i + 3] < 40) {
          continue;
        }
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        const sat = maxC - minC;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Protect warm skin, hair in head region, red hogu/trim, and dark belts
        const isWarmSkin = r - b > 18 && r >= g - 4;
        const isDarkHairOrEye = inHeadBand && lum < 72;
        const isBlackBelt = inBeltBand && lum < 52 && sat < 28;
        const isRedTrim = r - b > 42 && r > g + 22;

        if (isWarmSkin || isDarkHairOrEye || isBlackBelt || isRedTrim) {
          continue;
        }

        const isNeutralGi = sat <= 36 && lum >= (!inHeadBand && !inBeltBand ? 58 : 78);
        const isBlueJudogi = b - r >= 18 && b >= g + 4 && lum >= 42;

        if (!isNeutralGi && !isBlueJudogi) {
          continue;
        }

        // Preserve pixel-art fabric folds & shadows when mapping onto target cloth color
        const shade = isBlueJudogi
          ? Math.min(1.08, Math.max(0.32, (lum / 255) * 1.42))
          : Math.min(1.04, Math.max(0.34, lum / 245));

        d[i] = Math.min(255, Math.round(tr * shade));
        d[i + 1] = Math.min(255, Math.round(tg * shade));
        d[i + 2] = Math.min(255, Math.round(tb * shade));
      }
    }

    ctx.putImageData(img, 0, 0);
    return {
      canvas: c,
      width: pose.width,
      height: pose.height,
      footCenterRatio: pose.footCenterRatio
    };
  });

  return {
    poses: recoloredPoses,
    baseScale: pack.baseScale
  };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Removes the flat #00FF00 chroma green studio background cleanly with sharp
 * pixel edges and green de-spill, slices the 2x3 pose grid along empty green
 * valleys, and mirrors each pose horizontally so sprites face LEFT canonically.
 */
function extractPixelPosePack(img: HTMLImageElement): PixelPosePack | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w < 64 || h < 64) {
    return null;
  }

  const sheetCanvas = makeCanvas(w, h);
  const ctx = sheetCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const alphaMask = new Uint8Array(w * h);

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxRB = Math.max(r, b);
    const greenExcess = g - maxRB;
    const sum = r + g + b + 1;
    const greenRatio = g / sum;

    if (greenExcess > 40 && g > 100 && greenRatio > 0.38) {
      data[i + 3] = 0;
      alphaMask[p] = 0;
    } else if (greenExcess > 14 && g > 70 && greenRatio > 0.36) {
      // Crisp pixel-art edge cutoff + green de-spill
      const a = greenExcess > 26 ? 0 : 255;
      data[i + 3] = a;
      data[i + 1] = Math.round(maxRB + (g - maxRB) * 0.08);
      alphaMask[p] = a;
    } else {
      if (greenExcess > 6 && greenRatio > 0.35) {
        data[i + 1] = Math.round(maxRB + (g - maxRB) * 0.35);
      }
      alphaMask[p] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const rowCounts = new Int32Array(h);
  for (let y = 0; y < h; y += 1) {
    let count = 0;
    const rowOff = y * w;
    for (let x = 0; x < w; x += 1) {
      if (alphaMask[rowOff + x] > 40) {
        count += 1;
      }
    }
    rowCounts[y] = count;
  }

  const splitY = findMinIndex(rowCounts, Math.floor(h * 0.36), Math.floor(h * 0.64));

  const poses: PoseCutout[] = [];
  const rowRanges: Array<[number, number]> = [
    [0, splitY],
    [splitY, h]
  ];

  for (const [y0, y1] of rowRanges) {
    const colCounts = new Int32Array(w);
    for (let x = 0; x < w; x += 1) {
      let count = 0;
      for (let y = y0; y < y1; y += 1) {
        if (alphaMask[y * w + x] > 40) {
          count += 1;
        }
      }
      colCounts[x] = count;
    }

    const splitX1 = findMinIndex(colCounts, Math.floor(w * 0.24), Math.floor(w * 0.44));
    const splitX2 = findMinIndex(colCounts, Math.floor(w * 0.56), Math.floor(w * 0.76));
    const colRanges: Array<[number, number]> = [
      [0, splitX1],
      [splitX1, splitX2],
      [splitX2, w]
    ];

    for (const [x0, x1] of colRanges) {
      const cutout = sliceMirroredPose(sheetCanvas, alphaMask, w, x0, y0, x1, y1);
      if (cutout) {
        poses.push(cutout);
      }
    }
  }

  if (poses.length < 6) {
    return null;
  }

  const baseScale = CANONICAL_HEIGHT / Math.max(1, poses[0].height);
  return { poses, baseScale };
}

function findMinIndex(arr: Int32Array, start: number, end: number): number {
  let bestIdx = Math.floor((start + end) / 2);
  let bestVal = Number.POSITIVE_INFINITY;
  for (let i = start; i <= end; i += 1) {
    if (arr[i] < bestVal) {
      bestVal = arr[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

function sliceMirroredPose(
  sheetCanvas: HTMLCanvasElement,
  alphaMask: Uint8Array,
  sheetW: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): PoseCutout | null {
  let minX = x1;
  let maxX = x0;
  let minY = y1;
  let maxY = y0;

  for (let y = y0; y < y1; y += 1) {
    const rowOff = y * sheetW;
    for (let x = x0; x < x1; x += 1) {
      if (alphaMask[rowOff + x] > 48) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw < 16 || ch < 16) {
    return null;
  }

  // Foot centroid for grounded pivots
  const footBandY = Math.max(minY, maxY - Math.round(ch * 0.1));
  let footSumX = 0;
  let footCount = 0;
  for (let y = footBandY; y <= maxY; y += 1) {
    const rowOff = y * sheetW;
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaMask[rowOff + x] > 48) {
        footSumX += x - minX;
        footCount += 1;
      }
    }
  }
  const origFootRatio = footCount > 0 ? footSumX / (footCount * cw) : 0.5;

  const out = makeCanvas(cw, ch);
  const octx = out.getContext('2d');
  if (!octx) {
    return null;
  }

  octx.imageSmoothingEnabled = false;
  octx.save();
  octx.translate(cw, 0);
  octx.scale(-1, 1);
  octx.drawImage(sheetCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
  octx.restore();

  return {
    canvas: out,
    width: cw,
    height: ch,
    footCenterRatio: 1 - origFootRatio
  };
}

function buildCharacterTextures(
  scene: Phaser.Scene,
  character: CharacterDefinition,
  meta: MartialCharacterMeta,
  photo: HTMLImageElement | null,
  pack: PixelPosePack | null
): void {
  const bulkWidthMult = meta.build === 'heavy' ? 1.07 : meta.build === 'lean' ? 0.96 : 1.0;
  const poseScratch = pack ? makeCanvas(CELL, CELL) : undefined;
  const measuredByAction = new Map<string, Rect[]>();

  character.animations.forEach((anim) => {
    const frames = anim.sheet.frames;
    const rows = Math.ceil(frames / COLS);
    const canvas = makeCanvas(COLS * CELL, rows * CELL);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;
    const frameBoxes: Rect[] = [];

    for (let f = 0; f < frames; f += 1) {
      const col = f % COLS;
      const row = Math.floor(f / COLS);
      ctx.save();
      ctx.translate(col * CELL, row * CELL);
      ctx.beginPath();
      ctx.rect(0, 0, CELL, CELL);
      ctx.clip();
      if (pack) {
        const box = drawPixelAnimatedFrame(
          ctx,
          meta,
          pack,
          anim.action,
          f,
          frames,
          bulkWidthMult,
          poseScratch
        );
        if (box) {
          frameBoxes.push(box);
        }
      } else {
        drawFallbackSilhouette(ctx, meta);
      }
      ctx.restore();
    }

    if (frameBoxes.length === frames) {
      measuredByAction.set(anim.action, frameBoxes);
    }

    if (scene.textures.exists(anim.sheet.key)) {
      scene.textures.remove(anim.sheet.key);
    }

    scene.textures.addSpriteSheet(anim.sheet.key, canvas as unknown as HTMLImageElement, {
      frameWidth: CELL,
      frameHeight: CELL,
      startFrame: 0,
      endFrame: frames - 1
    });
  });

  if (pack) {
    fitAnimationBoundsToMeasuredPixels(character, meta, measuredByAction);
  }

  // High-craft pixel-realistic portrait (512x512 quantized with crisp ordered dither)
  const portraitCanvas = makeCanvas(512, 512);
  const pCtx = portraitCanvas.getContext('2d');
  if (pCtx) {
    drawPixelRealisticPortrait(pCtx, meta, photo, pack);
  }

  if (scene.textures.exists(character.portrait.key)) {
    scene.textures.remove(character.portrait.key);
  }
  scene.textures.addCanvas(character.portrait.key, portraitCanvas);

  // Anchor image (single idle frame)
  const anchorCanvas = makeCanvas(CELL, CELL);
  const aCtx = anchorCanvas.getContext('2d');
  if (aCtx) {
    aCtx.imageSmoothingEnabled = false;
    if (pack) {
      drawPixelAnimatedFrame(aCtx, meta, pack, 'idle', 0, 6, bulkWidthMult);
    } else {
      drawFallbackSilhouette(aCtx, meta);
    }
  }
  if (scene.textures.exists(character.anchorAsset.key)) {
    scene.textures.remove(character.anchorAsset.key);
  }
  scene.textures.addCanvas(character.anchorAsset.key, anchorCanvas);
}

interface FramePoseSpec {
  poseIndex: number;
  dx: number;
  dy: number;
  lean: number;
  scaleX: number;
  scaleY: number;
  shadowScale: number;
  flipPose?: boolean;
  afterimage?: number;
  guardArc?: boolean;
  strikeTrail?: 'light' | 'heavy' | 'special';
  strikeProgress?: number;
  chargeAura?: number;
}

/**
 * Crisp pixel-realistic keyframe synthesis (zero ghosting/alpha-blending blur)
 * driven by the 6 32-bit arcade sprite poses + biomechanical stride/strike timing.
 */
function computePixelMotionSpec(
  meta: MartialCharacterMeta,
  action: string,
  frame: number,
  total: number
): FramePoseSpec {
  const t = total > 1 ? frame / (total - 1) : 0;
  const wave = Math.sin(t * Math.PI * 2);
  const isTkd = meta.discipline === 'taekwondo';

  switch (action) {
    case 'idle': {
      if (isTkd) {
        const bounce = Math.abs(Math.sin(t * Math.PI * 2));
        return {
          poseIndex: 0,
          dx: Math.round(Math.cos(t * Math.PI * 2) * 2.5),
          dy: Math.round(-bounce * 4),
          lean: -0.015 + wave * 0.02,
          scaleX: 1 - bounce * 0.012,
          scaleY: 1 + bounce * 0.016,
          shadowScale: 1 - bounce * 0.05
        };
      }

      // Judo: rooted kumikata grappling stance with forward posture & steady breathing
      const breath = (Math.sin(t * Math.PI * 2) + 1) * 0.5;
      return {
        poseIndex: frame === 2 || frame === 3 ? 4 : 0,
        dx: Math.round(-2 + wave * 1.5),
        dy: Math.round(3 + breath * 1.5),
        lean: -0.065 + wave * 0.015,
        scaleX: 1.03 - breath * 0.01,
        scaleY: 0.98 + breath * 0.012,
        shadowScale: 1.06
      };
    }

    case 'walk-forward': {
      const poses = isTkd ? [0, 1, 1, 0, 0, 1, 1, 0] : [0, 1, 4, 1, 0, 1, 4, 1];
      const phase = t * Math.PI * 2;
      const hipLift = Math.abs(Math.sin(phase));
      if (!isTkd) {
        // Judo Tsugi-Ashi sliding grappling footwork (low hips, forward grip posture)
        return {
          poseIndex: poses[frame % poses.length],
          dx: Math.round(-5 * Math.sin(phase) - 2),
          dy: Math.round(3 - hipLift * 2),
          lean: -0.085 - hipLift * 0.02,
          scaleX: 1.03,
          scaleY: 0.97,
          shadowScale: 1.08
        };
      }
      return {
        poseIndex: poses[frame % poses.length],
        dx: Math.round(-4 * Math.sin(phase)),
        dy: Math.round(-hipLift * 5),
        lean: -0.045 - hipLift * 0.025,
        scaleX: 1 + hipLift * 0.014,
        scaleY: 1 - (1 - hipLift) * 0.014,
        shadowScale: 1 - hipLift * 0.08
      };
    }

    case 'walk-backward': {
      const poses = [0, 1, 0, 0, 1, 1, 0, 0];
      const phase = t * Math.PI * 2;
      const hipLift = Math.abs(Math.sin(phase));
      if (!isTkd) {
        return {
          poseIndex: poses[frame % poses.length],
          dx: Math.round(3 * Math.sin(phase)),
          dy: Math.round(2 - hipLift * 2),
          lean: -0.02 + hipLift * 0.015,
          scaleX: 1.02,
          scaleY: 0.98,
          shadowScale: 1.05
        };
      }
      return {
        poseIndex: poses[frame % poses.length],
        dx: Math.round(3 * Math.sin(phase)),
        dy: Math.round(-hipLift * 4),
        lean: 0.03 + hipLift * 0.02,
        scaleX: 1,
        scaleY: 1 - (1 - hipLift) * 0.012,
        shadowScale: 1 - hipLift * 0.06
      };
    }

    case 'crouch': {
      const drop = Math.min(1, 0.4 + t * 0.6);
      return {
        poseIndex: frame === 0 ? 0 : 4,
        dx: Math.round(-2 * drop),
        dy: Math.round(4 * drop),
        lean: -0.06 * drop,
        scaleX: 1 + 0.08 * drop,
        scaleY: 1 - 0.2 * drop,
        shadowScale: 1 + 0.14 * drop
      };
    }

    case 'jump': {
      const arc = Math.sin(t * Math.PI);
      const takeoff = frame === 0 ? 1 : 0;
      return {
        poseIndex: frame === 0 ? 4 : frame === total - 1 ? 0 : 1,
        dx: Math.round(-4 * arc),
        dy: Math.round(takeoff * 4 - arc * 26),
        lean: -0.05 * arc,
        scaleX: 1 + takeoff * 0.06 - arc * 0.03,
        scaleY: 1 - takeoff * 0.09 + arc * 0.03,
        shadowScale: Math.max(0.55, 1 - arc * 0.35)
      };
    }

    case 'block-high': {
      return {
        poseIndex: 4,
        dx: frame === 1 ? 3 : 2,
        dy: 2,
        lean: 0.025,
        scaleX: frame === 1 ? 0.98 : 1,
        scaleY: frame === 1 ? 0.98 : 1,
        shadowScale: 1,
        guardArc: true
      };
    }

    case 'block-low': {
      return {
        poseIndex: 4,
        dx: 2,
        dy: 4,
        lean: -0.04,
        scaleX: 1.07,
        scaleY: 0.81,
        shadowScale: 1.12,
        guardArc: true
      };
    }

    case 'hit-high': {
      const snap = Math.sin(t * Math.PI);
      return {
        poseIndex: frame === total - 1 ? 0 : 5,
        dx: Math.round(-16 + 10 * snap),
        dy: Math.round(2 * snap),
        lean: 0.05 * snap,
        scaleX: 0.99,
        scaleY: 0.99,
        shadowScale: 1
      };
    }

    case 'light-punch': {
      if (isTkd) {
        // Taekwondo: crisp upright snap jab / knife-hand check with quick spring
        if (frame === 0) {
          return { poseIndex: 0, dx: 4, dy: -2, lean: 0.03, scaleX: 0.98, scaleY: 1.01, shadowScale: 0.98 };
        }
        if (frame === 1) {
          return { poseIndex: 1, dx: -5, dy: -3, lean: -0.04, scaleX: 1.01, scaleY: 1.01, shadowScale: 0.98 };
        }
        if (frame === 2 || frame === 3) {
          const peak = frame === 2 ? 1 : 0.9;
          return {
            poseIndex: 2,
            dx: Math.round(-15 * peak),
            dy: -3,
            lean: -0.05 * peak,
            scaleX: 1.02,
            scaleY: 1,
            shadowScale: 1.02,
            strikeTrail: 'light',
            strikeProgress: frame === 2 ? 0.45 : 0.75
          };
        }
        return { poseIndex: frame === 4 ? 1 : 0, dx: frame === 4 ? -3 : 0, dy: -1, lean: 0, scaleX: 1, scaleY: 1, shadowScale: 1 };
      }

      // Judo: Kumikata lapel-grip shoot -> sharp Kuzushi pull-back yank
      if (frame === 0) {
        return { poseIndex: 4, dx: 4, dy: 4, lean: -0.04, scaleX: 1.03, scaleY: 0.96, shadowScale: 1.06 };
      }
      if (frame === 1) {
        return { poseIndex: 1, dx: -10, dy: 4, lean: -0.13, scaleX: 1.05, scaleY: 0.96, shadowScale: 1.1 };
      }
      if (frame === 2) {
        return {
          poseIndex: 2,
          dx: -20,
          dy: 3,
          lean: -0.16,
          scaleX: 1.07,
          scaleY: 0.95,
          shadowScale: 1.14,
          afterimage: 0.3,
          strikeTrail: 'light',
          strikeProgress: 0.45
        };
      }
      if (frame === 3) {
        // Sharp Kuzushi pull-back breaking opponent balance
        return {
          poseIndex: 4,
          dx: -10,
          dy: 4,
          lean: 0.07,
          scaleX: 1.05,
          scaleY: 0.96,
          shadowScale: 1.12,
          afterimage: 0.25,
          strikeTrail: 'light',
          strikeProgress: 0.85
        };
      }
      return {
        poseIndex: frame === 4 ? 1 : 0,
        dx: frame === 4 ? -4 : -2,
        dy: 3,
        lean: -0.05,
        scaleX: 1.02,
        scaleY: 0.98,
        shadowScale: 1.05
      };
    }

    case 'heavy-kick': {
      if (isTkd) {
        // Taekwondo: explosive airborne roundhouse / high axe kick
        if (frame === 0) {
          return { poseIndex: 4, dx: 5, dy: -1, lean: 0.04, scaleX: 0.97, scaleY: 0.98, shadowScale: 0.96 };
        }
        if (frame === 1) {
          return { poseIndex: 1, dx: -6, dy: -8, lean: 0.05, scaleX: 1, scaleY: 1.02, shadowScale: 0.86 };
        }
        if (frame >= 2 && frame <= 4) {
          const apex = frame === 3 ? 1 : 0.88;
          return {
            poseIndex: 3,
            dx: Math.round(-16 * apex),
            dy: Math.round(-14 * apex),
            lean: 0.08 * apex,
            scaleX: 1.04,
            scaleY: 1.02,
            shadowScale: 0.78,
            afterimage: 0.34,
            strikeTrail: 'heavy',
            strikeProgress: (frame - 1) / 3
          };
        }
        return {
          poseIndex: frame === 5 ? 1 : 0,
          dx: frame === 5 ? -4 : 0,
          dy: frame === 5 ? -3 : 0,
          lean: 0,
          scaleX: 1,
          scaleY: 1,
          shadowScale: 1
        };
      }

      // Judo: Osoto-Gari / Harai-Goshi hip-pivot entry + low leg reap throw
      if (frame === 0) {
        return { poseIndex: 4, dx: 4, dy: 5, lean: -0.06, scaleX: 1.04, scaleY: 0.94, shadowScale: 1.1 };
      }
      if (frame === 1) {
        return { poseIndex: 2, dx: -12, dy: 5, lean: -0.18, scaleX: 1.06, scaleY: 0.95, shadowScale: 1.14 };
      }
      if (frame >= 2 && frame <= 4) {
        const isReapApex = frame === 3;
        return {
          poseIndex: 3,
          dx: Math.round(isReapApex ? -20 : -16),
          dy: frame === 4 ? 6 : 2,
          lean: frame === 2 ? -0.26 : isReapApex ? -0.36 : -0.18,
          scaleX: 1.07,
          scaleY: 0.95,
          shadowScale: 1.18,
          afterimage: 0.34,
          strikeTrail: 'heavy',
          strikeProgress: (frame - 1) / 3
        };
      }
      return {
        poseIndex: frame === 5 ? 4 : 0,
        dx: frame === 5 ? -6 : -2,
        dy: 3,
        lean: -0.08,
        scaleX: 1.03,
        scaleY: 0.98,
        shadowScale: 1.06
      };
    }

    case 'special-charge': {
      const charge = 0.35 + 0.65 * t;
      if (isTkd) {
        // Taekwondo: rising spiral chamber coil on lead foot
        return {
          poseIndex: 4,
          dx: 3,
          dy: Math.round(-8 * t),
          lean: 0.05 * t,
          scaleX: 0.95,
          scaleY: 1 + 0.05 * t,
          shadowScale: 0.88,
          chargeAura: charge
        };
      }
      // Judo: deep rooted Tai-Sabaki hip-throw coil
      return {
        poseIndex: 4,
        dx: -4,
        dy: Math.round(12 * t),
        lean: -0.2 * t,
        scaleX: 1 + 0.1 * t,
        scaleY: 1 - 0.12 * t,
        shadowScale: 1.22,
        chargeAura: charge
      };
    }

    case 'special': {
      if (isTkd) {
        // Taekwondo: 540 Tornado / Axe Kick Barrage — leaping mid-air spin kick combo
        const sequence = [1, 3, 3, 3, 2, 3, 3, 3, 0];
        const poseIndex = sequence[Math.min(sequence.length - 1, frame)];
        const leapArc = Math.sin(t * Math.PI);
        const isSpinFrame = frame === 3;
        const isFinisher = frame === 6 || frame === 7;
        return {
          poseIndex,
          dx: Math.round(-18 * leapArc),
          dy: Math.round(-26 * leapArc + (isFinisher ? 8 : 0)),
          lean: isSpinFrame ? -0.08 : isFinisher ? 0.12 : 0.04,
          scaleX: isSpinFrame ? 0.92 : 1.05,
          scaleY: isSpinFrame ? 1.03 : 1.01,
          shadowScale: Math.max(0.55, 1 - 0.38 * leapArc),
          flipPose: isSpinFrame,
          afterimage: frame >= 1 && frame <= 7 ? 0.44 : 0,
          strikeTrail: 'special',
          strikeProgress: t,
          chargeAura: 0.78
        };
      }

      // Judo: Authentic Ippon Throw Sequence (Clinch Dash -> Seoi-Nage Pivot -> Uchi-Mata Lever -> Mat Slam!)
      if (frame === 0 || frame === 1) {
        return {
          poseIndex: frame === 0 ? 1 : 2,
          dx: frame === 0 ? -12 : -22,
          dy: 5,
          lean: -0.18,
          scaleX: 1.06,
          scaleY: 0.95,
          shadowScale: 1.14,
          afterimage: 0.35,
          strikeTrail: 'special',
          strikeProgress: t,
          chargeAura: 0.75
        };
      }
      if (frame === 2 || frame === 3) {
        // Seoi-Nage / Tsukuri hip tuck pivot under opponent center of gravity
        return {
          poseIndex: 4,
          dx: -18,
          dy: 11,
          lean: -0.34,
          scaleX: 1.08,
          scaleY: 0.91,
          shadowScale: 1.2,
          afterimage: 0.38,
          strikeTrail: 'special',
          strikeProgress: t,
          chargeAura: 0.85
        };
      }
      if (frame === 4 || frame === 5) {
        // Uchi-Mata / Harai-Goshi high hip-throw lever (steep forward torso pitch!)
        return {
          poseIndex: 3,
          dx: -20,
          dy: -6,
          lean: -0.52,
          scaleX: 1.05,
          scaleY: 0.98,
          shadowScale: 1.1,
          afterimage: 0.44,
          strikeTrail: 'special',
          strikeProgress: t,
          chargeAura: 0.95
        };
      }
      if (frame === 6 || frame === 7) {
        // Ippon Mat Slam (Kake) follow-through
        return {
          poseIndex: frame === 6 ? 2 : 4,
          dx: -24,
          dy: 9,
          lean: -0.28,
          scaleX: 1.1,
          scaleY: 0.91,
          shadowScale: 1.28,
          afterimage: 0.36,
          strikeTrail: 'special',
          strikeProgress: t,
          chargeAura: 1.0
        };
      }
      return {
        poseIndex: 0,
        dx: -4,
        dy: 3,
        lean: -0.06,
        scaleX: 1.02,
        scaleY: 0.98,
        shadowScale: 1.05
      };
    }

    case 'knockdown': {
      const fall = Math.min(1, t * 1.15);
      const bounce = frame === 4 ? -5 : 0;
      return {
        poseIndex: 5,
        dx: Math.round(-36 * fall),
        dy: Math.round(8 * fall + bounce),
        lean: 0.48 * fall,
        scaleX: 1,
        scaleY: 1,
        shadowScale: 1 + 0.35 * fall
      };
    }

    case 'victory': {
      if (isTkd) {
        // Taekwondo: celebratory high kick salute into upright twin-fist triumph
        const poses = [0, 4, 3, 3, 2, 0];
        const poseIndex = poses[frame % poses.length];
        const lift = Math.abs(Math.sin(t * Math.PI * 2));
        return {
          poseIndex,
          dx: poseIndex === 3 ? -6 : 0,
          dy: Math.round(-lift * 12),
          lean: poseIndex === 3 ? 0.06 : -0.02,
          scaleX: 1.02,
          scaleY: 1 + lift * 0.04,
          shadowScale: 1 - lift * 0.18,
          chargeAura: 0.6 + lift * 0.4
        };
      }

      // Judo: respectful deep Rei bow then proud Ippon raised fist stance
      const poses = [0, 4, 4, 2, 2, 0];
      const poseIndex = poses[frame % poses.length];
      const bow = frame === 1 || frame === 2 ? 1 : 0;
      const salute = frame === 3 || frame === 4 ? 1 : 0;
      return {
        poseIndex,
        dx: salute ? -4 : 2,
        dy: bow ? 6 : salute ? -6 : 2,
        lean: bow ? -0.24 : salute ? -0.05 : -0.04,
        scaleX: 1 + (salute ? 0.04 : 0),
        scaleY: 1 + (salute ? 0.03 : bow ? -0.04 : 0),
        shadowScale: 1.08 - salute * 0.1,
        chargeAura: 0.55 + salute * 0.45
      };
    }

    default:
      return { poseIndex: 0, dx: 0, dy: 0, lean: 0, scaleX: 1, scaleY: 1, shadowScale: 1 };
  }
}

function fitAnimationBoundsToMeasuredPixels(
  character: CharacterDefinition,
  meta: MartialCharacterMeta,
  measuredByAction: Map<string, Rect[]>
): void {
  const standingBox = measuredByAction.get('idle')?.[0];
  if (!standingBox) {
    return;
  }

  character.animations.forEach((anim) => {
    const boxes = measuredByAction.get(anim.action);
    if (!boxes || boxes.length !== anim.bounds.length) {
      return;
    }

    const isAttackAction =
      anim.action === 'light-punch' || anim.action === 'heavy-kick' || anim.action === 'special';

    anim.bounds.forEach((bound, f) => {
      const charBox = boxes[f];
      if (!charBox) {
        return;
      }

      bound.visual = { ...charBox };
      bound.collision = collisionBounds(
        anim.action === 'crouch' || anim.action === 'block-low' ? charBox : standingBox,
        CELL,
        CELL
      );

      // Fit hurtbox closely to the visible character body (on extended attacks, keep
      // the leading hurtbox edge at body + forearm/shin depth so fist tips don't catch phantom hits).
      const hurtSource: Rect = isAttackAction
        ? (() => {
            const leadLimit = Math.max(charBox.x, standingBox.x - 22);
            const rightEdge = Math.max(leadLimit + 40, charBox.x + charBox.width);
            return {
              x: leadLimit,
              y: charBox.y,
              width: rightEdge - leadLimit,
              height: charBox.height
            };
          })()
        : charBox;
      bound.hit = hitBounds(hurtSource, CELL, CELL);

      if (bound.guard) {
        if (anim.action === 'block-low') {
          const gy = charBox.y + Math.round(charBox.height * 0.22);
          bound.guard = {
            x: Math.max(8, charBox.x - 6),
            y: gy,
            width: Math.min(CELL - 12, charBox.width + 12),
            height: Math.max(64, charBox.y + charBox.height - gy)
          };
        } else {
          bound.guard = {
            x: Math.max(8, charBox.x - 6),
            y: Math.max(8, charBox.y - 4),
            width: Math.min(CELL - 12, charBox.width + 12),
            height: Math.round(charBox.height * 0.86)
          };
        }
      }

      if (bound.attack) {
        if (anim.action === 'light-punch') {
          const ax = Math.max(4, charBox.x - 2);
          const rightEdge = Math.max(ax + 72, Math.round(CELL / 2 - 4));
          bound.attack = {
            x: ax,
            y: charBox.y + Math.round(charBox.height * 0.14),
            width: rightEdge - ax,
            height: Math.round(charBox.height * 0.36)
          };
        } else if (anim.action === 'heavy-kick') {
          const ax = Math.max(4, charBox.x - 4);
          const rightEdge = Math.max(ax + 86, Math.round(CELL / 2 + 4));
          if (meta.discipline === 'judo') {
            bound.attack = {
              x: ax,
              y: charBox.y + Math.round(charBox.height * 0.22),
              width: rightEdge - ax,
              height: Math.round(charBox.height * 0.68)
            };
          } else {
            bound.attack = {
              x: ax,
              y: charBox.y + Math.round(charBox.height * 0.04),
              width: rightEdge - ax,
              height: Math.round(charBox.height * 0.56)
            };
          }
        } else if (anim.action === 'special') {
          const ax = Math.max(4, charBox.x - 8);
          const rightEdge = Math.max(ax + 104, Math.round(CELL / 2 + 8));
          const ay = Math.max(12, charBox.y - 6);
          bound.attack = {
            x: ax,
            y: ay,
            width: rightEdge - ax,
            height: Math.min(CELL - 12 - ay, Math.round(charBox.height * 0.9))
          };
        }
      }
    });
  });
}

function measureCanvasBounds(canvas: HTMLCanvasElement): Rect | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return null;
  }
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y += 2) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 2) {
      if (data[(rowOff + x) * 4 + 3] > 40) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: Math.max(0, minX - 1),
    y: Math.max(0, minY - 1),
    width: Math.min(width, maxX + 2) - Math.max(0, minX - 1),
    height: Math.min(height, maxY + 2) - Math.max(0, minY - 1)
  };
}

function drawPixelAnimatedFrame(
  ctx: CanvasRenderingContext2D,
  meta: MartialCharacterMeta,
  pack: PixelPosePack,
  action: string,
  frame: number,
  total: number,
  bulkWidthMult: number,
  poseScratch?: HTMLCanvasElement
): Rect | null {
  const spec = computePixelMotionSpec(meta, action, frame, total);
  const pose = pack.poses[spec.poseIndex] ?? pack.poses[0];
  if (!pose) {
    return null;
  }

  // Pixel-crisp ground contact shadow directly under the fighter's mat footprint
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(
    Math.round(128 + spec.dx * 0.5),
    GROUND_Y + 2,
    Math.round(34 * spec.shadowScale * bulkWidthMult),
    6,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();

  if (spec.chargeAura && spec.chargeAura > 0) {
    ctx.save();
    ctx.strokeStyle =
      action === 'victory'
        ? '#facc15'
        : meta.discipline === 'judo'
          ? '#38bdf8'
          : '#f87171';
    ctx.globalAlpha = 0.38 * spec.chargeAura;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (meta.discipline === 'judo' && action !== 'victory') {
      ctx.ellipse(126 + spec.dx, GROUND_Y - 12, Math.round(52 * bulkWidthMult), 16, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(124 + spec.dx, GROUND_Y - 84, Math.round(46 * bulkWidthMult), 74, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  const rawW = Math.round(pose.width * pack.baseScale * spec.scaleX * bulkWidthMult);
  const rawH = Math.round(pose.height * pack.baseScale * spec.scaleY);
  const rawFootPivotX = Math.round(rawW * pose.footCenterRatio);

  // Keep rotated/leaning poses (like hit-high recoil and knockdown) safely inside
  // the 256x256 cell so heads and extremities never clip at the cell edge.
  const lx0 = spec.flipPose ? -(rawW - rawFootPivotX) : -rawFootPivotX;
  const lx1 = lx0 + rawW;
  const ly0 = -rawH;
  const ly1 = 0;
  const cos = Math.cos(spec.lean);
  const sin = Math.sin(spec.lean);
  let minRx = Infinity;
  let maxRx = -Infinity;
  let minRy = Infinity;
  let maxRy = -Infinity;
  const corners: Array<[number, number]> = [
    [lx0, ly0],
    [lx1, ly0],
    [lx0, ly1],
    [lx1, ly1]
  ];
  for (const [cx, cy] of corners) {
    const rx = cx * cos - cy * sin;
    const ry = cx * sin + cy * cos;
    if (rx < minRx) minRx = rx;
    if (rx > maxRx) maxRx = rx;
    if (ry < minRy) minRy = ry;
    if (ry > maxRy) maxRy = ry;
  }

  const maxSpan = CELL - 10;
  const fitScale = Math.min(
    1,
    maxSpan / Math.max(1, maxRx - minRx),
    maxSpan / Math.max(1, maxRy - minRy)
  );
  const drawW = Math.round(rawW * fitScale);
  const drawH = Math.round(rawH * fitScale);
  const footPivotX = Math.round(rawFootPivotX * fitScale);

  let tx = 128 + spec.dx;
  let ty = GROUND_Y + spec.dy;
  const sMinRx = minRx * fitScale;
  const sMaxRx = maxRx * fitScale;
  const sMinRy = minRy * fitScale;
  const sMaxRy = maxRy * fitScale;
  if (tx + sMaxRx > CELL - 5) {
    tx -= tx + sMaxRx - (CELL - 5);
  }
  if (tx + sMinRx < 5) {
    tx += 5 - (tx + sMinRx);
  }
  if (ty + sMaxRy > CELL - 5) {
    ty -= ty + sMaxRy - (CELL - 5);
  }
  if (ty + sMinRy < 5) {
    ty += 5 - (ty + sMinRy);
  }
  tx = Math.round(tx);
  ty = Math.round(ty);

  if (spec.afterimage && spec.afterimage > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = spec.afterimage;
    ctx.translate(tx + 14, ty);
    ctx.rotate(spec.lean * 0.7);
    if (spec.flipPose) {
      ctx.scale(-1, 1);
      ctx.drawImage(pose.canvas, -(drawW - footPivotX), -drawH, drawW, drawH);
    } else {
      ctx.drawImage(pose.canvas, -footPivotX, -drawH, drawW, drawH);
    }
    ctx.restore();
  }

  let measuredBounds: Rect | null = null;
  const sCtx = poseScratch?.getContext('2d', { willReadFrequently: true });
  if (poseScratch && sCtx) {
    sCtx.clearRect(0, 0, poseScratch.width, poseScratch.height);
    sCtx.save();
    sCtx.imageSmoothingEnabled = false;
    sCtx.translate(tx, ty);
    sCtx.rotate(spec.lean);
    if (spec.flipPose) {
      sCtx.scale(-1, 1);
      sCtx.drawImage(pose.canvas, -(drawW - footPivotX), -drawH, drawW, drawH);
    } else {
      sCtx.drawImage(pose.canvas, -footPivotX, -drawH, drawW, drawH);
    }
    sCtx.restore();

    measuredBounds = measureCanvasBounds(poseScratch);
    ctx.drawImage(poseScratch, 0, 0);
  } else {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(tx, ty);
    ctx.rotate(spec.lean);
    if (spec.flipPose) {
      ctx.scale(-1, 1);
      ctx.drawImage(pose.canvas, -(drawW - footPivotX), -drawH, drawW, drawH);
    } else {
      ctx.drawImage(pose.canvas, -footPivotX, -drawH, drawW, drawH);
    }
    ctx.restore();
  }

  if (spec.guardArc) {
    ctx.save();
    ctx.strokeStyle = '#93c5fd';
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(102 + spec.dx, GROUND_Y - 98, 42, Math.PI * 0.65, Math.PI * 1.38);
    ctx.stroke();
    ctx.restore();
  }

  if (spec.strikeTrail && spec.strikeProgress !== undefined) {
    drawMartialStrikeTrail(ctx, meta, spec.strikeTrail, spec.strikeProgress);
  }

  return measuredBounds;
}

function drawMartialStrikeTrail(
  ctx: CanvasRenderingContext2D,
  meta: MartialCharacterMeta,
  phase: 'light' | 'heavy' | 'special',
  progress: number
): void {
  ctx.save();
  const isTkd = meta.discipline === 'taekwondo';
  ctx.strokeStyle = isTkd ? '#fb7185' : '#38bdf8';
  ctx.globalAlpha = Math.max(0.24, 0.72 * (1 - Math.abs(progress - 0.5)));

  if (!isTkd) {
    // Judo: lapel grip flashes, low sweeping leg crescent, and flat mat-slam shockwaves
    if (phase === 'light') {
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(88, GROUND_Y - 122);
      ctx.lineTo(44, GROUND_Y - 124);
      ctx.moveTo(92, GROUND_Y - 108);
      ctx.lineTo(48, GROUND_Y - 108);
      ctx.stroke();
    } else if (phase === 'heavy') {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(96, GROUND_Y - 48, 58, Math.PI * 0.85, Math.PI * 1.28);
      ctx.stroke();
    } else {
      ctx.lineWidth = 4;
      for (let i = 0; i < 3; i += 1) {
        ctx.strokeStyle = i === 1 ? '#facc15' : '#38bdf8';
        ctx.beginPath();
        ctx.ellipse(74, GROUND_Y - 14 - i * 4, 42 + i * 14, 10 + i * 3, 0, Math.PI * 0.65, Math.PI * 1.65);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(92, GROUND_Y - 96, 54, Math.PI * 0.78, Math.PI * 1.32);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Taekwondo: crisp head-height snapping crescent kicks & airborne spinning tornado arcs
  if (phase === 'light') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(88, GROUND_Y - 130);
    ctx.lineTo(42, GROUND_Y - 138);
    ctx.stroke();
  } else if (phase === 'heavy') {
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(92, GROUND_Y - 128, 60, Math.PI * 0.76, Math.PI * 1.46);
    ctx.stroke();
  } else {
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      ctx.strokeStyle = i === 1 ? '#facc15' : '#fb7185';
      ctx.beginPath();
      ctx.arc(88 - i * 8, GROUND_Y - 118, 46 + i * 11, Math.PI * 0.68, Math.PI * 1.54);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFallbackSilhouette(ctx: CanvasRenderingContext2D, meta: MartialCharacterMeta): void {
  ctx.save();
  ctx.translate(128, GROUND_Y);
  ctx.fillStyle = meta.appearance.giColor;
  ctx.fillRect(-18, -135, 36, 85);
  ctx.fillStyle = meta.appearance.skin;
  ctx.beginPath();
  ctx.arc(0, -150, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

/**
 * Renders an authentic 32-bit pixel-realistic fighter portrait by cropping
 * the athlete photo onto a 128x128 pixel grid with ordered Bayer dithering
 * and palette quantization, then nearest-neighbor upscaling to 512x512.
 */
function drawPixelRealisticPortrait(
  ctx: CanvasRenderingContext2D,
  meta: MartialCharacterMeta,
  photo: HTMLImageElement | null,
  pack: PixelPosePack | null
): void {
  const W = 512;
  const H = 512;
  const PIX = 128;

  const low = makeCanvas(PIX, PIX);
  const lctx = low.getContext('2d', { willReadFrequently: true });
  if (lctx) {
    const bg = lctx.createLinearGradient(0, 0, 0, PIX);
    bg.addColorStop(0, '#1e293b');
    bg.addColorStop(1, '#0b1220');
    lctx.fillStyle = bg;
    lctx.fillRect(0, 0, PIX, PIX);

    if (photo && photo.naturalWidth > 0 && photo.naturalHeight > 0) {
      const imgW = photo.naturalWidth;
      const imgH = photo.naturalHeight;
      const { cx, cy, scale, flipX } = meta.portraitCrop;
      const cropSize = Math.min(imgW, imgH) * scale;
      const sx = Math.max(0, Math.min(imgW - cropSize, cx * imgW - cropSize / 2));
      const sy = Math.max(0, Math.min(imgH - cropSize, cy * imgH - cropSize / 2));

      lctx.save();
      if (flipX) {
        lctx.translate(PIX, 0);
        lctx.scale(-1, 1);
      }
      lctx.drawImage(photo, sx, sy, cropSize, cropSize, 0, 0, PIX, PIX);
      lctx.restore();
    } else if (pack?.poses[0]) {
      const p = pack.poses[0];
      const scale = (PIX * 1.55) / p.height;
      lctx.imageSmoothingEnabled = false;
      lctx.drawImage(p.canvas, (PIX - p.width * scale) / 2, 6, p.width * scale, p.height * scale);
    }

    // Crisp 32-bit CPS-3 ordered dither + color quantization pass
    const imgData = lctx.getImageData(0, 0, PIX, PIX);
    const d = imgData.data;
    const step = 18;
    for (let y = 0; y < PIX; y += 1) {
      const bayerRow = BAYER_4X4[y & 3];
      for (let x = 0; x < PIX; x += 1) {
        const idx = (y * PIX + x) * 4;
        const threshold = (bayerRow[x & 3] / 16 - 0.5) * (step * 0.75);
        d[idx] = quantizeChannel(d[idx] + threshold, step);
        d[idx + 1] = quantizeChannel(d[idx + 1] + threshold, step);
        d[idx + 2] = quantizeChannel(d[idx + 2] + threshold, step);
      }
    }
    lctx.putImageData(imgData, 0, 0);
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, W, H);

  const bot = ctx.createLinearGradient(0, H * 0.76, 0, H);
  bot.addColorStop(0, 'rgba(9, 13, 22, 0)');
  bot.addColorStop(1, 'rgba(9, 13, 22, 0.62)');
  ctx.fillStyle = bot;
  ctx.fillRect(0, H * 0.76, W, H * 0.24);

  ctx.strokeStyle = meta.discipline === 'judo' ? '#38bdf8' : '#f87171';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
}

function quantizeChannel(value: number, step: number): number {
  const clamped = Math.max(0, Math.min(255, value));
  return Math.max(0, Math.min(255, Math.round(clamped / step) * step));
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
