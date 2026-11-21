import * as Phaser from 'phaser';

import { FIGHTING_UI_ATLAS_TEXTURE_KEY } from './fightingUiAtlas';

/** Render depth for combat VFX: above fighters, below the HUD. */
const VFX_DEPTH = 90;

/** Tint/spark colour keyed to the kind of impact. */
export type VfxColor = 'red' | 'gold' | 'blue';

const SPARK_FRAME: Record<VfxColor, string> = {
  red: 'icon-hit-red',
  gold: 'icon-hit-gold',
  blue: 'icon-hit-blue'
};

const FLASH_TINT: Record<VfxColor, number> = {
  red: 0xff5a5a,
  gold: 0xffd24a,
  blue: 0x7ec8ff
};

/**
 * Spawns a short-lived hit spark (an atlas impact icon) at a contact point that
 * pops in, scales up, and fades out. Used when an attack connects.
 * @param scene - The owning scene.
 * @param x - World x of the contact point.
 * @param y - World y of the contact point.
 * @param color - Spark colour (red clean hit, blue blocked, gold finisher).
 * @param scale - Peak display scale of the spark (default 1).
 */
export function spawnHitSpark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: VfxColor = 'red',
  scale = 1
): void {
  const frame = SPARK_FRAME[color];
  if (!scene.textures.exists(FIGHTING_UI_ATLAS_TEXTURE_KEY)) {
    spawnImpactFlash(scene, x, y, color, 40 * scale);
    return;
  }

  const spark = scene.add
    .image(x, y, FIGHTING_UI_ATLAS_TEXTURE_KEY, frame)
    .setDepth(VFX_DEPTH)
    .setScrollFactor(1)
    .setScale(0.2 * scale)
    .setAngle(Phaser.Math.Between(-30, 30))
    .setAlpha(1);

  scene.tweens.add({
    targets: spark,
    scale: scale,
    alpha: 0,
    duration: 220,
    ease: 'Cubic.Out',
    onComplete: () => spark.destroy()
  });

  spawnImpactFlash(scene, x, y, color, 34 * scale);
}

/**
 * Spawns an expanding ring flash at a point that fades as it grows.
 * @param scene - The owning scene.
 * @param x - World x of the flash centre.
 * @param y - World y of the flash centre.
 * @param color - Flash tint.
 * @param radius - Peak radius in world pixels.
 */
export function spawnImpactFlash(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: VfxColor,
  radius = 40
): void {
  const ring = scene.add
    .circle(x, y, radius * 0.3, FLASH_TINT[color], 0.55)
    .setDepth(VFX_DEPTH - 1)
    .setScrollFactor(1);

  scene.tweens.add({
    targets: ring,
    scale: 2.4,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.Out',
    onComplete: () => ring.destroy()
  });
}

/**
 * Spawns a special-move charge burst around a fighter: concentric rings that
 * expand outward and fade, telegraphing the wind-up before the move executes.
 * @param scene - The owning scene.
 * @param x - World x of the fighter's centre.
 * @param y - World y of the fighter's centre (roughly mid-body).
 * @param color - Aura colour.
 */
export function spawnChargeAura(scene: Phaser.Scene, x: number, y: number, color: VfxColor = 'gold'): void {
  for (let index = 0; index < 3; index += 1) {
    const ring = scene.add
      .circle(x, y, 18, FLASH_TINT[color], 0)
      .setStrokeStyle(4, FLASH_TINT[color], 0.9)
      .setDepth(VFX_DEPTH - 1)
      .setScrollFactor(1)
      .setScale(1.6);

    scene.tweens.add({
      targets: ring,
      scale: 0.2,
      alpha: 0,
      delay: index * 120,
      duration: 420,
      ease: 'Sine.In',
      onComplete: () => ring.destroy()
    });
  }
}

/**
 * Spawns discipline-authentic special move visual effects:
 * - Judo: heavy floor tatami slam shockwave ellipses, rising dust, and throw burst.
 * - Taekwondo: spinning tornado wind rings and high angled kick streaks.
 */
export function spawnDisciplineSpecialFx(
  scene: Phaser.Scene,
  x: number,
  groundY: number,
  facing: 1 | -1,
  discipline: 'judo' | 'taekwondo',
  phase: 'launch' | 'climax'
): void {
  if (discipline === 'judo') {
    if (phase === 'launch') {
      spawnDustPuff(scene, x, groundY - 10, (-facing) as -1 | 1, 5);
      const dash = scene.add
        .rectangle(x + facing * 18, groundY - 82, 54, 6, 0x38bdf8, 0.8)
        .setDepth(VFX_DEPTH - 2);
      scene.tweens.add({
        targets: dash,
        x: dash.x + facing * 42,
        scaleX: 1.8,
        alpha: 0,
        duration: 240,
        ease: 'Cubic.Out',
        onComplete: () => dash.destroy()
      });
      return;
    }

    // Judo Ippon mat slam shockwave
    spawnDustPuff(scene, x + facing * 34, groundY - 8, facing, 6);
    [0x38bdf8, 0xfacc15].forEach((tint, i) => {
      const shock = scene.add
        .ellipse(x + facing * 32, groundY - 12, 46, 14, tint, 0)
        .setStrokeStyle(4 - i, tint, 0.95)
        .setDepth(VFX_DEPTH);
      scene.tweens.add({
        targets: shock,
        scaleX: 3.1 + i * 0.7,
        scaleY: 2.2 + i * 0.4,
        alpha: 0,
        delay: i * 55,
        duration: 360,
        ease: 'Cubic.Out',
        onComplete: () => shock.destroy()
      });
    });
    return;
  }

  // Taekwondo spinning tornado wind & crimson-sky kick streaks
  if (phase === 'launch') {
    for (let i = 0; i < 3; i += 1) {
      const vortex = scene.add
        .ellipse(x, groundY - 46 - i * 34, 68 + i * 10, 16, i % 2 === 0 ? 0xf87171 : 0x38bdf8, 0)
        .setStrokeStyle(3, i % 2 === 0 ? 0xf87171 : 0xfacc15, 0.9)
        .setAngle(facing * -14)
        .setDepth(VFX_DEPTH);
      scene.tweens.add({
        targets: vortex,
        y: vortex.y - 32,
        scaleX: 1.65,
        alpha: 0,
        delay: i * 70,
        duration: 340,
        ease: 'Quad.Out',
        onComplete: () => vortex.destroy()
      });
    }
    return;
  }

  // Taekwondo finisher crescent flash
  for (let i = 0; i < 2; i += 1) {
    const slash = scene.add
      .rectangle(x + facing * 38, groundY - 118 + i * 18, 86, 7, i === 0 ? 0xfacc15 : 0xf43f5e, 0.92)
      .setAngle(facing * (-28 + i * 44))
      .setDepth(VFX_DEPTH + 1);
    scene.tweens.add({
      targets: slash,
      x: slash.x + facing * 26,
      scaleX: 1.45,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.Out',
      onComplete: () => slash.destroy()
    });
  }
}

/**
 * Spawns subtle tatami/floor dust wisps around the feet on jump takeoff,
 * landing, dash lunges, and knockdowns for grounded physical weight.
 */
export function spawnDustPuff(
  scene: Phaser.Scene,
  x: number,
  y: number,
  direction: -1 | 0 | 1 = 0,
  count = 3
): void {
  for (let i = 0; i < count; i += 1) {
    const offsetX = (i - (count - 1) / 2) * 10;
    const radius = Phaser.Math.FloatBetween(3.5, 6.5);
    const puff = scene.add
      .circle(x + offsetX, y - 4, radius, 0xe2e8f0, 0.28)
      .setDepth(VFX_DEPTH - 10)
      .setScrollFactor(1);

    const driftX = direction !== 0 ? direction * Phaser.Math.Between(14, 28) : (i - 1) * 14;
    scene.tweens.add({
      targets: puff,
      x: puff.x + driftX,
      y: puff.y - Phaser.Math.Between(6, 14),
      scale: 1.8,
      alpha: 0,
      duration: Phaser.Math.Between(220, 320),
      ease: 'Cubic.Out',
      onComplete: () => puff.destroy()
    });
  }
}

/**
 * Spawns celebratory golden shockwave rings and rising confetti sparks around
 * the match winner during the post-match victory animation.
 */
export function spawnVictoryBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  accentColor = 0x38bdf8
): void {
  const ringColors = [0xfacc15, accentColor, 0xfef08a];

  ringColors.forEach((color, idx) => {
    const ring = scene.add
      .circle(x, y, 24, color, 0)
      .setStrokeStyle(4, color, 0.9)
      .setDepth(VFX_DEPTH - 2)
      .setScrollFactor(1)
      .setScale(0.3);

    scene.tweens.add({
      targets: ring,
      scale: 3.2 + idx * 0.45,
      alpha: 0,
      delay: idx * 120,
      duration: 680,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy()
    });
  });

  const sparkColors = [0xfacc15, 0xfef08a, accentColor, 0xffffff, 0xfb7185];
  for (let i = 0; i < 22; i += 1) {
    const angle = Phaser.Math.FloatBetween(-Math.PI * 0.92, -Math.PI * 0.08);
    const speed = Phaser.Math.Between(90, 230);
    const color = sparkColors[i % sparkColors.length];
    const size = Phaser.Math.Between(4, 7);
    const spark = scene.add
      .rectangle(x + Phaser.Math.Between(-24, 24), y + Phaser.Math.Between(-20, 20), size, size, color, 0.95)
      .setDepth(VFX_DEPTH + 1)
      .setScrollFactor(1);

    scene.tweens.add({
      targets: spark,
      x: spark.x + Math.cos(angle) * speed,
      y: spark.y + Math.sin(angle) * speed * 0.9 - Phaser.Math.Between(20, 60),
      angle: Phaser.Math.Between(-260, 260),
      alpha: 0,
      scale: 0.4,
      delay: Phaser.Math.Between(0, 220),
      duration: Phaser.Math.Between(650, 1100),
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy()
    });
  }
}

