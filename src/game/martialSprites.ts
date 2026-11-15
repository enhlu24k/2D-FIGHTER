import type * as Phaser from 'phaser';

import pixelJudoWhiteUrl from '../assets/images/pixel_judo_white_1794715740531.jpg';
import pixelJudoBlueUrl from '../assets/images/pixel_judo_blue_v2_1794715758315.jpg';
import pixelTkdRedUrl from '../assets/images/pixel_tkd_red_1794715741838.jpg';
import pixelTkdBlueUrl from '../assets/images/pixel_tkd_blue_v2_1794715760429.jpg';

import type { CharacterDefinition } from './hero';
import {
  MARTIAL_CHARACTERS,
  MARTIAL_ROSTER_META,
  type MartialCharacterMeta
} from './martialRoster';

const CELL = 256;
const COLS = 5;
const GROUND_Y = 229;
const CANONICAL_HEIGHT = 172;

type PixelSheetKey = 'judo-white' | 'judo-blue' | 'tkd-red' | 'tkd-blue';

const PIXEL_SHEET_URLS: Record<PixelSheetKey, string> = {
  'judo-white': pixelJudoWhiteUrl,
  'judo-blue': pixelJudoBlueUrl,
  'tkd-red': pixelTkdRedUrl,
  'tkd-blue': pixelTkdBlueUrl
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

const posePackCache = new Map<PixelSheetKey, PixelPosePack>();

function pickPixelSheetKey(meta: MartialCharacterMeta): PixelSheetKey {
  if (meta.discipline === 'judo') {
    const isBlue = meta.appearance.giColor.toLowerCase().startsWith('#1');
    return isBlue ? 'judo-blue' : 'judo-white';
  }
  const hogu = (meta.appearance.hoguColor ?? '').toLowerCase();
  const isBlueHogu = hogu.includes('2563eb') || hogu.includes('1d4ed8');
  return isBlueHogu ? 'tkd-blue' : 'tkd-red';
}

export async function prepareMartialCharacters(scene: Phaser.Scene): Promise<void> {
  const sheetEntries = Object.entries(PIXEL_SHEET_URLS) as Array<[PixelSheetKey, string]>;
  const [loadedSheets, loadedPortraits] = await Promise.all([
    Promise.all(sheetEntries.map(([, url]) => loadHtmlImage(url).catch(() => null))),
    Promise.all(MARTIAL_ROSTER_META.map((meta) => loadHtmlImage(meta.portraitUrl).catch(() => null)))
  ]);

  sheetEntries.forEach(([key], idx) => {
    const img = loadedSheets[idx];
    if (img && !posePackCache.has(key)) {
      const pack = extractPixelPosePack(img);
      if (pack) {
        posePackCache.set(key, pack);
      }
    }
  });

  MARTIAL_CHARACTERS.forEach((character, idx) => {
    const meta = MARTIAL_ROSTER_META[idx];
    if (!meta) {
      return;
    }

    const pack = posePackCache.get(pickPixelSheetKey(meta)) ?? null;
    buildCharacterTextures(scene, character, meta, loadedPortraits[idx], pack);
  });
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

  character.animations.forEach((anim) => {
    const frames = anim.sheet.frames;
    const rows = Math.ceil(frames / COLS);
    const canvas = makeCanvas(COLS * CELL, rows * CELL);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;

    for (let f = 0; f < frames; f += 1) {
      const col = f % COLS;
      const row = Math.floor(f / COLS);
      ctx.save();
      ctx.translate(col * CELL, row * CELL);
      if (pack) {
        drawPixelAnimatedFrame(ctx, meta, pack, anim.action, f, frames, bulkWidthMult);
      } else {
        drawFallbackSilhouette(ctx, meta);
      }
      ctx.restore();
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
      const bounce = isTkd ? Math.abs(Math.sin(t * Math.PI * 2)) : (Math.sin(t * Math.PI * 2) + 1) * 0.5;
      return {
        poseIndex: 0,
        dx: Math.round(Math.cos(t * Math.PI * 2) * (isTkd ? 2.5 : 1)),
        dy: Math.round(isTkd ? -bounce * 4 : -bounce * 1.5),
        lean: -0.015 + wave * (isTkd ? 0.02 : 0.01),
        scaleX: 1 - bounce * 0.012,
        scaleY: 1 + bounce * 0.016,
        shadowScale: 1 - bounce * 0.05
      };
    }

    case 'walk-forward': {
      // Crisp 8-frame gait sequence: Stance -> Step -> Step -> Plant -> Stance -> Step -> Step -> Plant
      const poses = [0, 1, 1, 0, 0, 1, 1, 0];
      const phase = t * Math.PI * 2;
      const hipLift = Math.abs(Math.sin(phase));
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
        dx: Math.round(14 * snap),
        dy: Math.round(2 * snap),
        lean: 0.12 * snap,
        scaleX: 0.99,
        scaleY: 0.99,
        shadowScale: 1
      };
    }

    case 'light-punch': {
      if (frame === 0) {
        return { poseIndex: 0, dx: 5, dy: 2, lean: 0.05, scaleX: 0.98, scaleY: 0.97, shadowScale: 1 };
      }
      if (frame === 1) {
        return { poseIndex: 1, dx: -5, dy: 1, lean: -0.05, scaleX: 1.02, scaleY: 0.99, shadowScale: 1.04 };
      }
      if (frame === 2 || frame === 3) {
        const peak = frame === 2 ? 1 : 0.92;
        return {
          poseIndex: 2,
          dx: Math.round(-16 * peak),
          dy: 0,
          lean: -0.06 * peak,
          scaleX: 1.03,
          scaleY: 0.99,
          shadowScale: 1.08,
          strikeTrail: 'light',
          strikeProgress: frame === 2 ? 0.5 : 0.75
        };
      }
      return {
        poseIndex: frame === 4 ? 1 : 0,
        dx: frame === 4 ? -4 : 0,
        dy: 0,
        lean: 0,
        scaleX: 1,
        scaleY: 1,
        shadowScale: 1
      };
    }

    case 'heavy-kick': {
      if (frame === 0) {
        return { poseIndex: 1, dx: 6, dy: 3, lean: 0.06, scaleX: 0.98, scaleY: 0.96, shadowScale: 1 };
      }
      if (frame === 1) {
        return { poseIndex: 1, dx: -4, dy: -2, lean: 0.02, scaleX: 1.01, scaleY: 1.01, shadowScale: 0.95 };
      }
      if (frame >= 2 && frame <= 4) {
        const apex = frame === 3 ? 1 : 0.88;
        return {
          poseIndex: 3,
          dx: Math.round(-15 * apex),
          dy: isTkd ? Math.round(-5 * apex) : 0,
          lean: (frame - 3) * -0.04,
          scaleX: 1.03,
          scaleY: 1.01,
          shadowScale: 0.9,
          strikeTrail: 'heavy',
          strikeProgress: (frame - 1) / 3
        };
      }
      return {
        poseIndex: frame === 5 ? 1 : 0,
        dx: frame === 5 ? -4 : 0,
        dy: 0,
        lean: 0,
        scaleX: 1,
        scaleY: 1,
        shadowScale: 1
      };
    }

    case 'special-charge': {
      const charge = 0.35 + 0.65 * t;
      return {
        poseIndex: 4,
        dx: 2,
        dy: Math.round(4 * t),
        lean: -0.06 * t,
        scaleX: 1 + 0.04 * t,
        scaleY: 1 - 0.06 * t,
        shadowScale: 1.08,
        chargeAura: charge
      };
    }

    case 'special': {
      const sequence = [1, 2, 2, 3, 2, 3, 3, 3, 0];
      const poseIndex = sequence[Math.min(sequence.length - 1, frame)];
      const lunge = Math.sin(t * Math.PI);
      return {
        poseIndex,
        dx: Math.round(-18 * lunge),
        dy: poseIndex === 3 && isTkd ? -6 : 0,
        lean: poseIndex === 2 ? -0.07 : poseIndex === 3 ? -0.04 : 0,
        scaleX: 1.03,
        scaleY: 1,
        shadowScale: 1.05,
        strikeTrail: 'special',
        strikeProgress: t,
        chargeAura: 0.65
      };
    }

    case 'knockdown': {
      const fall = Math.min(1, t * 1.15);
      const bounce = frame === 4 ? -5 : 0;
      return {
        poseIndex: 5,
        dx: Math.round(20 * fall),
        dy: Math.round(10 * fall + bounce),
        lean: 1.24 * fall,
        scaleX: 1,
        scaleY: 1,
        shadowScale: 1 + 0.35 * fall
      };
    }

    default:
      return { poseIndex: 0, dx: 0, dy: 0, lean: 0, scaleX: 1, scaleY: 1, shadowScale: 1 };
  }
}

function drawPixelAnimatedFrame(
  ctx: CanvasRenderingContext2D,
  meta: MartialCharacterMeta,
  pack: PixelPosePack,
  action: string,
  frame: number,
  total: number,
  bulkWidthMult: number
): void {
  const spec = computePixelMotionSpec(meta, action, frame, total);
  const pose = pack.poses[spec.poseIndex] ?? pack.poses[0];
  if (!pose) {
    return;
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
    ctx.strokeStyle = meta.accentHex;
    ctx.globalAlpha = 0.32 * spec.chargeAura;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(124 + spec.dx, GROUND_Y - 84, Math.round(46 * bulkWidthMult), 74, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const drawW = Math.round(pose.width * pack.baseScale * spec.scaleX * bulkWidthMult);
  const drawH = Math.round(pose.height * pack.baseScale * spec.scaleY);
  const footPivotX = Math.round(drawW * pose.footCenterRatio);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(128 + spec.dx, GROUND_Y + spec.dy);
  ctx.rotate(spec.lean);
  ctx.drawImage(pose.canvas, -footPivotX, -drawH, drawW, drawH);
  ctx.restore();

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
}

function drawMartialStrikeTrail(
  ctx: CanvasRenderingContext2D,
  meta: MartialCharacterMeta,
  phase: 'light' | 'heavy' | 'special',
  progress: number
): void {
  ctx.save();
  ctx.strokeStyle = meta.discipline === 'taekwondo' ? meta.appearance.trimColor : '#f1f5f9';
  ctx.globalAlpha = Math.max(0.18, 0.6 * (1 - Math.abs(progress - 0.5)));

  if (phase === 'light') {
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(86, GROUND_Y - 118);
    ctx.lineTo(42, GROUND_Y - 122);
    ctx.stroke();
  } else if (phase === 'heavy') {
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(92, GROUND_Y - 108, 56, Math.PI * 0.82, Math.PI * 1.42);
    ctx.stroke();
  } else {
    ctx.lineWidth = 4;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(88 - i * 8, GROUND_Y - 108, 48 + i * 10, Math.PI * 0.72, Math.PI * 1.48);
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
