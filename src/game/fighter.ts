import * as Phaser from 'phaser';

import type { AppContext } from './context';
import {
  getCombatStyleDefinition,
  type CombatStyleDefinition
} from './calmStyles';
import { FIGHTER_BOUNDS_FIELDS, getAttackProfile, getFighterCombat, getFighterStats } from './fighterConfig';
import {
  findCharacterAnimationKeyByAction,
  getCharacterAnimationDefinition,
  getCharacterDefinition,
  resolveHeroBoundsFrame,
  type CharacterDefinition,
  type HeroAnimationDefinition,
  type HeroBoundsFrame
} from './hero';
import { getMartialCharacterMeta, type MartialDiscipline } from './martialRoster';
import { ensureUniformCharacterAnimations } from './martialSprites';
import { spawnChargeAura, spawnDisciplineSpecialFx, spawnDustPuff, spawnVictoryBurst } from './vfx';
import type {
  AttackKind,
  AttackProfile,
  FighterBoundsVisibility,
  FighterCombat,
  FighterStats,
  FighterStyleSelection,
  Rect
} from './types';

/** Deceleration applied to knockback velocity, in px/s^2. */
const KNOCKBACK_FRICTION = 720;
/** Athletic ground acceleration/deceleration for realistic footwork inertia. */
const GROUND_ACCEL = 2900;
const GROUND_DECEL = 3300;
/** Blockstun duration when an attack is guarded, in seconds. */
const BLOCKSTUN_SECONDS = 0.14;

/** Full meter value; a special requires (and consumes) a full bar. */
const METER_MAX = 100;
/** Meter gained by the attacker when a normal attack lands. */
const METER_GAIN_ON_HIT = 25;
/** Meter gained by the defender when taking a hit. */
const METER_GAIN_ON_TAKE = 16;
/** Meter gained by both sides on a blocked hit. */
const METER_GAIN_ON_BLOCK = 9;
/**
 * Brief pause after the charge wind-up so the super cut-in peaks cleanly
 * before the move launches.
 */
const SUPER_FREEZE_MS = 180;

/**
 * A live attack from a fighter on its current animation frame: the world-space
 * attack rectangle, the resolved damage/knockback/hitstun profile, and a
 * per-swing signature so a single swing only connects once.
 */
export interface ActiveAttack {
  rect: Phaser.Geom.Rectangle;
  profile: AttackProfile;
  signature: number;
  /** True when this is the final hit window of a special (the combo finisher). */
  finisher: boolean;
}

const BOUNDS_ALPHA_ACTIVE = 0.95;
const BOUNDS_ALPHA_INACTIVE = 0.28;

// Frame pixels between the anchor baseline (frame bottom, ~255) and the visible
// feet. Used to seat the ground shadow under the feet rather than the padded
// frame bottom, so fighters don't appear to float above their shadow.
const SHADOW_FOOT_OFFSET = 26;

const BOUNDS_COLORS: Record<keyof FighterBoundsVisibility, number> = Object.fromEntries(
  FIGHTER_BOUNDS_FIELDS.map((field) => [field.id, Number.parseInt(field.color.slice(1), 16)])
) as Record<keyof FighterBoundsVisibility, number>;

/**
 * A per-frame snapshot of a fighter's intent. Held inputs (`left`, `right`,
 * `crouch`, `block`) describe the current key state; edge inputs (`jump`,
 * `light`, `heavy`) are true only on the frame the action was triggered.
 */
export interface FighterInput {
  left: boolean;
  right: boolean;
  crouch: boolean;
  block: boolean;
  jump: boolean;
  light: boolean;
  heavy: boolean;
  special: boolean;
}

/** A neutral (no-op) input snapshot. */
export const NEUTRAL_FIGHTER_INPUT: FighterInput = {
  left: false,
  right: false,
  crouch: false,
  block: false,
  jump: false,
  light: false,
  heavy: false,
  special: false
};

interface FighterActionKeys {
  idle: string;
  walkForward: string;
  walkBackward: string;
  crouch: string;
  jump: string;
  blockHigh: string;
  blockLow: string;
  hitHigh: string;
  lightPunch: string;
  heavy: string;
  specialCharge: string;
  special: string;
  knockdown: string;
  victory: string;
}

/**
 * Construction options for a {@link Fighter}: which scene/character to build,
 * where it stands, which way it faces, and its horizontal movement bounds.
 */
export interface FighterOptions {
  scene: Phaser.Scene;
  app: AppContext;
  characterId: string;
  x: number;
  groundY: number;
  facing: 1 | -1;
  minX: number;
  maxX: number;
  depth?: number;
  /** Chosen Combat Style & Suit Style for this fighter. */
  style?: FighterStyleSelection;
  /**
   * Invoked the moment a meter special begins (the charge wind-up). Hosts use it
   * to trigger the super cut-in cinematic and brief super-freeze.
   */
  onSpecialStart?: (fighter: Fighter) => void;
  /** Invoked when special is pressed before meter reaches 100%. */
  onSpecialDenied?: (fighter: Fighter) => void;
  /** Optional resolver returning opponent X so special gap-closers track cleanly. */
  getOpponentX?: () => number;
}

/**
 * A self-contained, input-driven fighter actor: sprite + ground shadow + a
 * grounded/airborne state machine. The host scene feeds it a {@link FighterInput}
 * each frame, so the same entity backs both human and CPU opponents. Movement
 * and physics stats are read from the persisted fighter balance.
 */
export class Fighter {
  private readonly scene: Phaser.Scene;
  private readonly app: AppContext;
  private readonly character: CharacterDefinition;
  private readonly actionKeys: FighterActionKeys;
  private facing: 1 | -1;
  private minX: number;
  private maxX: number;
  private readonly groundY: number;

  private sprite!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private boundsGraphics!: Phaser.GameObjects.Graphics;
  private depthBase = 5;
  private posX: number;
  private velocityX = 0;
  private velocityY = 0;
  private grounded = true;
  private locked = false;
  private frozen = true;
  private currentAnimKey = '';
  private currentReverse = false;

  private maxHealth: number;
  private health: number;
  private hitstunTimer = 0;
  private stunIsBlock = false;
  private stunBlockLow = false;
  private knockbackVel = 0;
  private defeated = false;
  private victorious = false;
  private attackId = 0;
  private attackConnected = true;
  // Multi-hit: each contiguous run of attack-active frames is one hit window.
  // When the attack box turns on after being off, a new window opens so the
  // swing can connect again — this is how a special lands several hits.
  private attackActiveLast = false;
  private meter = 0;
  private appliedScale = 0;
  private actionEpoch = 0;
  private specialFreezeTimer?: Phaser.Time.TimerEvent;
  private flashTimer?: Phaser.Time.TimerEvent;
  private readonly hasSpecial: boolean;
  private readonly discipline: MartialDiscipline;
  private readonly combatStyle: CombatStyleDefinition;
  private readonly animSuffix: string;
  private readonly onSpecialStart?: (fighter: Fighter) => void;
  private readonly onSpecialDenied?: (fighter: Fighter) => void;
  private readonly getOpponentX?: () => number;
  private specialArmor = false;
  private lastSpecialDeniedAt = -1000;

  constructor(options: FighterOptions) {
    this.scene = options.scene;
    this.app = options.app;
    this.onSpecialStart = options.onSpecialStart;
    this.onSpecialDenied = options.onSpecialDenied;
    this.getOpponentX = options.getOpponentX;
    this.combatStyle = getCombatStyleDefinition(options.style?.combat);
    this.character = getCharacterDefinition(options.characterId);
    this.discipline = getMartialCharacterMeta(this.character.id).discipline;
    this.animSuffix = ensureUniformCharacterAnimations(this.scene, this.character.id, options.style?.suit);
    this.facing = options.facing;
    this.minX = options.minX;
    this.maxX = options.maxX;
    this.groundY = options.groundY;
    this.posX = Phaser.Math.Clamp(options.x, options.minX, options.maxX);
    this.actionKeys = this.resolveActionKeys();
    this.hasSpecial = findCharacterAnimationKeyByAction(this.character.id, 'special') !== null;
    this.maxHealth = this.combat().maxHealth;
    this.health = this.maxHealth;
    this.build(options.depth ?? 5);
  }

  /** Whether this fighter competes in Judo (grappling throws & sweeps). */
  get isJudo(): boolean {
    return this.discipline === 'judo';
  }

  /** Whether this fighter is currently invulnerable inside a special attack. */
  get isSpecialInvulnerable(): boolean {
    return this.specialArmor;
  }

  /** The fighter's id. */
  get characterId(): string {
    return this.character.id;
  }

  /** The fighter's display label. */
  get label(): string {
    return this.character.label;
  }

  /** The fighter's current horizontal centre in world pixels. */
  get x(): number {
    return this.posX;
  }

  /** The fighter's current vertical ground/air position in world pixels. */
  get y(): number {
    return this.sprite?.y ?? this.groundY;
  }

  /** The direction the fighter is facing (+1 right, -1 left). */
  get facingDirection(): 1 | -1 {
    return this.facing;
  }

  /** The fighter's current health. */
  get health01(): number {
    return this.maxHealth > 0 ? Phaser.Math.Clamp(this.health / this.maxHealth, 0, 1) : 0;
  }

  /** Whether the fighter has been knocked out this round. */
  get isDefeated(): boolean {
    return this.defeated;
  }

  /** The fighter's special meter charge (0..1). */
  get meter01(): number {
    return METER_MAX > 0 ? Phaser.Math.Clamp(this.meter / METER_MAX, 0, 1) : 0;
  }

  /** Whether the special meter is full and a special can be performed. */
  get isMeterReady(): boolean {
    return this.hasSpecial && this.meter >= METER_MAX;
  }

  /**
   * Adds charge to the special meter (clamped to full). Called by the match when
   * this fighter deals, blocks, or takes a hit.
   * @param amount - Meter points to add.
   */
  gainMeter(amount: number): void {
    if (this.defeated) {
      return;
    }

    this.meter = Phaser.Math.Clamp(this.meter + amount * this.combatStyle.meterMult, 0, METER_MAX);
  }

  /**
   * Awards meter for landing an attack. Special moves grant no meter (so they
   * can't refill themselves); normal hits grant more than guarded ones.
   * @param blocked - Whether the attack was guarded by the defender.
   * @param isSpecial - Whether the attack was a special move.
   */
  registerOffense(blocked: boolean, isSpecial: boolean): void {
    if (isSpecial) {
      return;
    }

    this.gainMeter(blocked ? METER_GAIN_ON_BLOCK : METER_GAIN_ON_HIT);
  }

  /**
   * Awards meter for being struck. Taking a clean hit builds more than blocking.
   * @param blocked - Whether the incoming attack was guarded.
   */
  registerDefense(blocked: boolean): void {
    this.gainMeter(blocked ? METER_GAIN_ON_BLOCK : METER_GAIN_ON_TAKE);
  }

  /** Tops the special meter to full (used by the playground's debug fill toggle). */
  fillMeter(): void {
    this.meter = METER_MAX;
  }

  /**
   * Gradually restores health toward full without clearing hitstun/knockback,
   * so a training dummy visibly takes damage and then recovers between hits.
   * @param amount - Health points to restore this tick.
   */
  regenHealth(amount: number): void {
    if (!this.defeated) {
      this.health = Math.min(this.maxHealth, this.health + amount);
    }
  }

  /**
   * Live-updates the display scale (sprite + ground shadow) so playground scale
   * tuning is reflected without rebuilding the fighter.
   * @param scale - The desired display scale.
   */
  setVisualScale(scale: number): void {
    if (this.appliedScale === scale) {
      return;
    }

    this.appliedScale = scale;
    this.sprite.setScale(scale);
    this.shadow.setSize(Math.round(84 * scale), Math.round(18 * scale));
    this.shadow.y = this.groundY - SHADOW_FOOT_OFFSET * scale;
    this.updateShadow();
  }

  /**
   * Sets the base render depth, restacking the sprite, shadow, and bounds
   * overlay together. Used to bring the most recently active fighter in front.
   * @param base - The base depth for the sprite.
   */
  setDepthBase(base: number): void {
    if (this.depthBase === base) {
      return;
    }

    this.depthBase = base;
    this.applyDepths();
  }

  /**
   * Turns the fighter to face a target x (e.g. the opponent), flipping the
   * sprite and — via the shared transform — its bounds. Skipped while mid
   * one-shot action and within a small deadzone to avoid jitter on overlap.
   * @param targetX - The world x the fighter should face toward.
   */
  faceToward(targetX: number): void {
    if (this.locked) {
      return;
    }

    const delta = targetX - this.posX;
    if (Math.abs(delta) < 12) {
      return;
    }

    const desired: 1 | -1 = delta >= 0 ? 1 : -1;
    if (desired !== this.facing) {
      this.facing = desired;
      this.sprite.setFlipX(this.facing === 1);
    }
  }

  /**
   * Freezes or unfreezes the fighter. While frozen it holds the idle pose and
   * ignores all input (used during the round intro).
   * @param frozen - Whether the fighter should be frozen.
   */
  setFrozen(frozen: boolean): void {
    this.frozen = frozen;
  }

  /**
   * Updates the fighter's horizontal movement limits and immediately re-clamps
   * the current position into the new range. Used by the match camera to turn
   * the visible screen edges into walls (and the stage ends into corners).
   * @param minX - The leftmost centre the fighter may occupy, in world pixels.
   * @param maxX - The rightmost centre the fighter may occupy, in world pixels.
   */
  setHorizontalBounds(minX: number, maxX: number): void {
    this.minX = minX;
    this.maxX = Math.max(minX, maxX);
    this.posX = Phaser.Math.Clamp(this.posX, this.minX, this.maxX);
    this.sprite.x = this.posX;
    this.shadow.x = this.posX;
  }

  /**
   * Shifts the fighter horizontally within its current stage/camera walls and
   * returns the actual delta applied (used for body-to-body pushbox separation).
   */
  nudgeX(dx: number): number {
    const prev = this.posX;
    this.posX = Phaser.Math.Clamp(prev + dx, this.minX, this.maxX);
    this.sprite.x = this.posX;
    this.shadow.x = this.posX;
    return this.posX - prev;
  }

  /**
   * The fighter's currently active attack (if any): present only while a strike
   * animation is on an attack-active frame and the swing hasn't connected yet.
   */
  getActiveAttack(): ActiveAttack | null {
    if (this.attackConnected || this.defeated) {
      return null;
    }

    const kind = this.currentAttackKind();
    if (kind === null) {
      return null;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);
    if (!frame?.attack) {
      return null;
    }

    const frameIndex = this.currentFrameIndex(animation);
    const finisher = kind === 'special' && !this.hasAttackFrameAfter(animation, frameIndex);

    return {
      rect: this.frameRectToWorld(animation, frame.attack),
      profile: getAttackProfile(this.combat(), kind),
      signature: this.attackId,
      finisher
    };
  }

  /** Marks the current swing as having connected so it can't hit again. */
  markAttackConnected(): void {
    this.attackConnected = true;
  }

  /**
   * Briefly tints the sprite to telegraph an impact (red for a clean hit, blue
   * for a guarded one).
   * @param blocked - Whether the hit was blocked.
   */
  flashHit(blocked: boolean): void {
    this.flashTimer?.remove(false);
    this.sprite.setTint(blocked ? 0x93c5fd : 0xff7a7a);
    this.flashTimer = this.scene.time.delayedCall(100, () => {
      this.flashTimer = undefined;
      if (!this.sprite || !this.sprite.scene) {
        return;
      }
      this.restoreBaseTint();
    });
  }

  /**
   * The fighter's current hurtbox in world space (the active frame's hit box,
   * falling back to its visual box), or null when unavailable.
   */
  getHurtRect(): Phaser.Geom.Rectangle | null {
    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);
    const rect = frame?.hit ?? frame?.visual;

    return rect ? this.frameRectToWorld(animation, rect) : null;
  }

  /**
   * The fighter's active guard box in world space — the current frame's `guard`
   * rect, present only while a block pose is held (and the fighter isn't
   * defeated). An attack is blocked when its hitbox overlaps this rect; null
   * means the fighter isn't guarding and any connecting attack will hit.
   */
  getGuardRect(): Phaser.Geom.Rectangle | null {
    if (this.defeated) {
      return null;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return null;
    }

    const frame = this.resolvedFrame(animation);

    return frame?.guard ? this.frameRectToWorld(animation, frame.guard) : null;
  }

  /**
   * Applies a connected hit: blocked hits deal no damage and apply short
   * blockstun + light pushback; unblocked hits deal damage, hitstun, and
   * knockback, triggering a knockdown when health reaches zero.
   * @param profile - The attack profile that landed.
   * @param attackerFacing - The attacker's facing (push direction).
   * @param blocked - Whether the defender guarded the attack.
   */
  applyHit(
    profile: AttackProfile,
    attackerFacing: 1 | -1,
    blocked: boolean,
    isThrow = false,
    isFinisher = false
  ): void {
    if (this.defeated || this.specialArmor) {
      return;
    }

    if (blocked) {
      this.knockbackVel = attackerFacing * profile.knockback * 0.35;
      this.hitstunTimer = Math.max(this.hitstunTimer, BLOCKSTUN_SECONDS);
      this.stunIsBlock = true;
      this.stunBlockLow = this.currentAnimKey === this.actionKeys.blockLow;
      this.locked = false;
      return;
    }

    this.health = Math.max(0, this.health - profile.damage);
    this.knockbackVel = attackerFacing * profile.knockback;

    if (this.health <= 0) {
      this.actionEpoch += 1;
      this.clearActionTimers();
      this.defeated = true;
      this.locked = true;
      this.grounded = true;
      this.specialArmor = false;
      this.velocityX = 0;
      this.stunIsBlock = false;
      this.hitstunTimer = 0;
      if (isThrow) {
        this.playThrowArc(isFinisher ? 54 : 34, isFinisher ? 170 : 125, isFinisher ? 6 : 5);
      } else {
        spawnDustPuff(this.scene, this.posX, this.groundY - 12, 0, 5);
      }
      this.playState(this.actionKeys.knockdown, false);
      return;
    }

    this.actionEpoch += 1;
    this.clearActionTimers();
    this.stunIsBlock = false;
    this.locked = false;
    this.velocityX = 0;
    const throwArcDur = isFinisher ? 150 : 115;
    this.hitstunTimer = isThrow
      ? Math.max(profile.hitstun / 1000, (throwArcDur * 2 + 40) / 1000)
      : profile.hitstun / 1000;
    this.currentAnimKey = '';
    if (isThrow) {
      this.playThrowArc(isFinisher ? 48 : 28, throwArcDur, isFinisher ? 5 : 3);
    } else if (this.sprite?.scene) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.sprite.y = this.groundY;
      this.updateShadow();
    }
    this.playState(this.actionKeys.hitHigh, false);
  }

  private playThrowArc(lift: number, duration: number, dustCount: number): void {
    if (!this.sprite?.scene) {
      return;
    }
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.y = this.groundY;
    this.scene.tweens.add({
      targets: this.sprite,
      y: this.groundY - lift,
      duration,
      ease: 'Cubic.Out',
      yoyo: true,
      onUpdate: () => this.updateShadow(),
      onComplete: () => {
        if (this.sprite?.scene) {
          this.sprite.y = this.groundY;
          this.updateShadow();
          spawnDustPuff(this.scene, this.posX, this.groundY - 12, 0, dustCount);
        }
      }
    });
  }

  /**
   * Resets the fighter for a new round: restores health, repositions and faces,
   * clears combat state, and re-freezes until the round intro releases it.
   * Special meter carries across rounds unless `resetMeter` is true (rematch).
   * @param x - The spawn x position.
   * @param facing - The spawn facing direction.
   * @param resetMeter - Whether to also zero the special meter.
   */
  resetForRound(x: number, facing: 1 | -1, resetMeter = false): void {
    this.actionEpoch += 1;
    this.clearActionTimers();
    this.flashTimer?.remove(false);
    this.flashTimer = undefined;

    this.posX = Phaser.Math.Clamp(x, this.minX, this.maxX);
    this.facing = facing;
    this.maxHealth = this.combat().maxHealth;
    this.health = this.maxHealth;
    this.velocityX = 0;
    this.velocityY = 0;
    this.grounded = true;
    this.locked = false;
    this.specialArmor = false;
    this.defeated = false;
    this.victorious = false;
    this.frozen = true;
    this.hitstunTimer = 0;
    this.stunIsBlock = false;
    this.stunBlockLow = false;
    this.knockbackVel = 0;
    this.attackConnected = true;
    this.attackActiveLast = false;
    if (resetMeter) {
      this.meter = 0;
    }
    this.currentAnimKey = '';
    this.currentReverse = false;

    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.posX, this.groundY).setScale(this.appliedScale).setFlipX(this.facing === 1);
    this.restoreBaseTint();
    this.playState(this.actionKeys.idle, true);
    this.updateShadow();
  }

  /**
   * Triggers the post-match victory celebration: loops the character's
   * triumphant victory animation, performs a celebratory hop, and emits golden
   * victory rings & confetti sparks.
   */
  playVictory(accentColor = 0xfacc15): void {
    if (this.defeated) {
      return;
    }

    this.actionEpoch += 1;
    this.clearActionTimers();
    this.flashTimer?.remove(false);
    this.flashTimer = undefined;

    this.victorious = true;
    this.frozen = false;
    this.locked = true;
    this.grounded = true;
    this.velocityX = 0;
    this.velocityY = 0;
    this.knockbackVel = 0;
    this.hitstunTimer = 0;
    this.attackConnected = true;
    this.currentAnimKey = '';
    this.currentReverse = false;

    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setPosition(this.posX, this.groundY).setScale(this.appliedScale);
    this.restoreBaseTint();
    this.playState(this.actionKeys.victory, true);

    spawnVictoryBurst(this.scene, this.posX, this.groundY - 96, accentColor);
    spawnDustPuff(this.scene, this.posX, this.groundY - 12, 0, 5);

    this.scene.tweens.add({
      targets: this.sprite,
      y: this.groundY - 22,
      duration: 210,
      ease: 'Cubic.Out',
      yoyo: true,
      repeat: 1,
      onUpdate: () => this.updateShadow(),
      onComplete: () => {
        if (this.sprite && this.sprite.scene) {
          this.sprite.y = this.groundY;
          this.updateShadow();
        }
      }
    });
  }

  /**
   * Advances the fighter one frame.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  update(seconds: number, input: FighterInput): void {
    if (this.defeated) {
      this.playState(this.actionKeys.knockdown, false);
      this.applyKnockback(seconds);
      this.updateShadow();
      this.drawBoundsOverlay();
      return;
    }

    if (this.victorious) {
      this.playState(this.actionKeys.victory, true);
      this.updateShadow();
      this.drawBoundsOverlay();
      return;
    }

    if (this.frozen) {
      if (!this.grounded) {
        this.updateAirborne(seconds, NEUTRAL_FIGHTER_INPUT);
      } else {
        this.playState(this.actionKeys.idle, true);
      }
      this.drawBoundsOverlay();
      return;
    }

    if (this.hitstunTimer > 0) {
      this.hitstunTimer = Math.max(0, this.hitstunTimer - seconds);
      this.applyKnockback(seconds);
      this.playState(
        this.stunIsBlock
          ? this.stunBlockLow
            ? this.actionKeys.blockLow
            : this.actionKeys.blockHigh
          : this.actionKeys.hitHigh,
        false
      );
      this.updateShadow();

      if (this.hitstunTimer === 0) {
        this.currentAnimKey = '';
      }

      this.drawBoundsOverlay();
      return;
    }

    if (!this.grounded) {
      this.updateAirborne(seconds, input);
    } else if (
      input.special &&
      this.isMeterReady &&
      (!this.locked ||
        this.currentAnimKey === this.actionKeys.lightPunch ||
        this.currentAnimKey === this.actionKeys.heavy)
    ) {
      // Allow both neutral special activation and special-canceling out of normals!
      this.velocityX = 0;
      this.startSpecial();
    } else if (!this.locked) {
      this.updateGrounded(seconds, input);
    }

    if (this.grounded && input.special && !this.isMeterReady && !this.specialArmor) {
      const now = this.scene.time.now;
      if (now - this.lastSpecialDeniedAt > 450) {
        this.lastSpecialDeniedAt = now;
        this.onSpecialDenied?.(this);
      }
    }

    this.updateAttackWindow();
    this.drawBoundsOverlay();
  }

  /** Destroys the fighter's display objects and pending timers. */
  destroy(): void {
    this.actionEpoch += 1;
    this.clearActionTimers();
    this.flashTimer?.remove(false);
    this.flashTimer = undefined;
    this.sprite?.removeAllListeners();
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.boundsGraphics?.destroy();
  }

  /**
   * Resolves the per-action animation keys for this character, falling back to
   * the first available animation for any missing action.
   */
  private resolveActionKeys(): FighterActionKeys {
    const key = (action: string): string =>
      findCharacterAnimationKeyByAction(this.character.id, action) ?? this.character.animations[0].key;

    return {
      idle: key('idle'),
      walkForward: key('walk-forward'),
      walkBackward: key('walk-backward'),
      crouch: key('crouch'),
      jump: key('jump'),
      blockHigh: key('block-high'),
      blockLow: findCharacterAnimationKeyByAction(this.character.id, 'block-low') ?? key('block-high'),
      hitHigh: key('hit-high'),
      lightPunch: key('light-punch'),
      heavy:
        findCharacterAnimationKeyByAction(this.character.id, 'heavy-kick') ??
        findCharacterAnimationKeyByAction(this.character.id, 'heavy-punch') ??
        key('light-punch'),
      specialCharge: findCharacterAnimationKeyByAction(this.character.id, 'special-charge') ?? key('crouch'),
      special: findCharacterAnimationKeyByAction(this.character.id, 'special') ?? key('heavy-kick'),
      knockdown: key('knockdown'),
      victory: findCharacterAnimationKeyByAction(this.character.id, 'victory') ?? key('idle')
    };
  }

  /** Current persisted stats for this fighter, tuned by the chosen Combat Style. */
  private stats(): FighterStats {
    const base = getFighterStats(this.app.debugStore.getState().fighterPlayground, this.character.id);
    return {
      ...base,
      walkSpeed: Math.round(base.walkSpeed * this.combatStyle.speedMult),
      airDrift: Math.round(base.airDrift * this.combatStyle.speedMult),
      jump: Math.round(base.jump * this.combatStyle.jumpMult)
    };
  }

  /** Current persisted combat tuning for this fighter, tuned by the chosen Combat Style. */
  private combat(): FighterCombat {
    const base = getFighterCombat(this.app.debugStore.getState().fighterPlayground, this.character.id);
    const dmg = this.combatStyle.damageMult;
    const kb = this.combatStyle.knockbackMult;
    return {
      ...base,
      maxHealth: Math.round(base.maxHealth * this.combatStyle.healthMult),
      highDamage: Math.max(1, Math.round(base.highDamage * dmg)),
      highKnockback: Math.round(base.highKnockback * kb),
      lowDamage: Math.max(1, Math.round(base.lowDamage * dmg)),
      lowKnockback: Math.round(base.lowKnockback * kb),
      specialDamage: Math.max(1, Math.round(base.specialDamage * dmg)),
      specialKnockback: Math.round(base.specialKnockback * kb)
    };
  }

  /**
   * The attack kind currently being thrown (`high` = light, `low` = heavy), or
   * null when the fighter isn't mid-strike.
   */
  private currentAttackKind(): AttackKind | null {
    if (!this.locked) {
      return null;
    }
    if (this.currentAnimKey === this.actionKeys.lightPunch) {
      return 'high';
    }
    if (this.currentAnimKey === this.actionKeys.heavy) {
      return 'low';
    }
    if (this.currentAnimKey === this.actionKeys.special) {
      return 'special';
    }

    return null;
  }

  private resolvedPlayKey(animKey: string): string {
    return this.animSuffix ? `${animKey}${this.animSuffix}` : animKey;
  }

  private canonicalAnimKey(playKey: string): string {
    if (this.animSuffix && playKey.endsWith(this.animSuffix)) {
      return playKey.slice(0, -this.animSuffix.length);
    }
    return playKey;
  }

  /** The fighter's active animation definition, or null when none is playing. */
  private currentAnimation(): HeroAnimationDefinition | null {
    const rawKey = this.sprite.anims.currentAnim?.key ?? this.currentAnimKey;
    const animKey = rawKey ? this.canonicalAnimKey(rawKey) : '';
    if (!animKey) {
      return null;
    }

    return getCharacterAnimationDefinition(this.character.id, animKey);
  }

  /**
   * Advances knockback: slides the fighter by the current knockback velocity and
   * decays it toward zero by friction.
   * @param seconds - Delta time in seconds.
   */
  private applyKnockback(seconds: number): void {
    if (this.knockbackVel === 0) {
      return;
    }

    this.posX = Phaser.Math.Clamp(this.posX + this.knockbackVel * seconds, this.minX, this.maxX);
    this.sprite.x = this.posX;

    const decay = KNOCKBACK_FRICTION * seconds;
    this.knockbackVel =
      this.knockbackVel > 0
        ? Math.max(0, this.knockbackVel - decay)
        : Math.min(0, this.knockbackVel + decay);
  }

  /**
   * Builds the sprite (feet-anchored, facing the opponent) and ground shadow.
   * @param depth - The display depth for the sprite (shadow renders just under).
   */
  private build(depth: number): void {
    const scale = this.stats().scale;
    this.appliedScale = scale;
    this.depthBase = depth;

    this.shadow = this.scene.add
      .ellipse(
        this.posX,
        this.groundY - SHADOW_FOOT_OFFSET * scale,
        Math.round(84 * scale),
        Math.round(18 * scale),
        0x000000,
        1
      )
      .setAlpha(0.24)
      .setDepth(depth - 1);

    this.sprite = this.scene.add
      .sprite(this.posX, this.groundY, this.resolvedPlayKey(this.actionKeys.idle), 0)
      .setOrigin(0.5, this.character.anchor.y)
      .setScale(scale)
      .setFlipX(this.facing === 1)
      .setDepth(depth);

    this.boundsGraphics = this.scene.add.graphics().setDepth(depth + 45);

    this.playState(this.actionKeys.idle, true);
  }

  /** Restacks the sprite, shadow, and bounds overlay around the base depth. */
  private applyDepths(): void {
    this.shadow.setDepth(this.depthBase - 1);
    this.sprite.setDepth(this.depthBase);
    this.boundsGraphics.setDepth(this.depthBase + 45);
  }

  /**
   * Advances the jump arc, allows light air drift, and lands on the ground axis.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  private updateAirborne(seconds: number, input: FighterInput): void {
    const stats = this.stats();
    this.velocityY += stats.gravity * seconds;
    let nextY = this.sprite.y + this.velocityY * seconds;

    const drift = this.horizontalDirection(input);
    if (drift !== 0) {
      this.posX = Phaser.Math.Clamp(this.posX + drift * stats.airDrift * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
    }

    if (nextY >= this.groundY) {
      nextY = this.groundY;
      this.velocityY = 0;
      this.velocityX *= 0.4;
      this.grounded = true;
      this.currentAnimKey = '';
      this.currentReverse = false;
      this.playLandingImpact();
    }

    this.sprite.y = nextY;
    this.updateShadow();
  }

  /**
   * Resolves grounded behaviour: one-shot actions first, then held block/crouch,
   * then smooth-inertia footwork walking, then idle.
   * @param seconds - Delta time in seconds.
   * @param input - The intent snapshot for this frame.
   */
  private updateGrounded(seconds: number, input: FighterInput): void {
    if (input.special && this.isMeterReady) {
      this.velocityX = 0;
      this.startSpecial();
      return;
    }
    if (input.jump) {
      this.startJump();
      return;
    }
    if (input.light) {
      this.velocityX = 0;
      this.startOneShot(this.actionKeys.lightPunch);
      return;
    }
    if (input.heavy) {
      this.velocityX = 0;
      spawnDustPuff(this.scene, this.posX, this.groundY - 14, (-this.facing) as -1 | 1, 2);
      this.startOneShot(this.actionKeys.heavy);
      return;
    }
    if (input.block) {
      this.velocityX = 0;
      this.playState(input.crouch ? this.actionKeys.blockLow : this.actionKeys.blockHigh, false);
      return;
    }
    if (input.crouch) {
      this.velocityX = 0;
      this.playState(this.actionKeys.crouch, false);
      return;
    }

    const stats = this.stats();
    const direction = this.horizontalDirection(input);
    const targetVx = direction * stats.walkSpeed;

    if (direction !== 0) {
      const step = GROUND_ACCEL * seconds;
      if (Math.abs(targetVx - this.velocityX) <= step) {
        this.velocityX = targetVx;
      } else {
        this.velocityX += Math.sign(targetVx - this.velocityX) * step;
      }
    } else {
      const decel = GROUND_DECEL * seconds;
      if (Math.abs(this.velocityX) <= decel) {
        this.velocityX = 0;
      } else {
        this.velocityX -= Math.sign(this.velocityX) * decel;
      }
    }

    if (Math.abs(this.velocityX) > 6) {
      this.posX = Phaser.Math.Clamp(this.posX + this.velocityX * seconds, this.minX, this.maxX);
      this.sprite.x = this.posX;
      this.updateShadow();
      const moveDir = direction !== 0 ? direction : Math.sign(this.velocityX);
      this.playWalk(moveDir === this.facing);
      return;
    }

    this.playState(this.actionKeys.idle, true);
  }

  /**
   * Returns -1 for left, +1 for right, or 0 when neutral/opposed.
   * @param input - The intent snapshot for this frame.
   */
  private horizontalDirection(input: FighterInput): number {
    return (input.right ? 1 : 0) - (input.left ? 1 : 0);
  }

  /**
   * Plays a looping or hold animation, switching only when the state (key or
   * playback direction) changes.
   * @param animKey - The animation key to play.
   * @param loop - Whether the animation should loop.
   * @param reverse - Whether to play the animation in reverse.
   */
  private playState(animKey: string, loop: boolean, reverse = false): void {
    if (this.currentAnimKey === animKey && this.currentReverse === reverse) {
      return;
    }

    this.currentAnimKey = animKey;
    this.currentReverse = reverse;

    // ignoreIfPlaying must be false so a forward->reverse switch on the same
    // key (reverse walk) is applied; the guard above prevents per-frame restarts.
    const config: Phaser.Types.Animations.PlayAnimationConfig = {
      key: this.resolvedPlayKey(animKey),
      repeat: loop ? -1 : 0
    };
    if (reverse) {
      this.sprite.playReverse(config, false);
    } else {
      this.sprite.play(config, false);
    }
  }

  /**
   * Plays the appropriate walk animation. Backward walking uses the dedicated
   * backward animation, or the forward animation played in reverse when the
   * persisted "use reverse walk anims" setting is enabled.
   * @param movingForward - Whether the fighter is walking in its facing direction.
   */
  private playWalk(movingForward: boolean): void {
    if (movingForward) {
      this.playState(this.actionKeys.walkForward, true);
      return;
    }

    const reverseWalk = this.app.debugStore.getState().fighterPlayground.reverseWalk;
    if (reverseWalk) {
      this.playState(this.actionKeys.walkForward, true, true);
      return;
    }

    this.playState(this.actionKeys.walkBackward, true);
  }

  private clearActionTimers(): void {
    this.specialFreezeTimer?.remove(false);
    this.specialFreezeTimer = undefined;
    this.sprite?.removeAllListeners();
  }

  private restoreBaseTint(): void {
    if (!this.sprite || !this.sprite.scene) {
      return;
    }
    this.sprite.clearTint();
  }

  /**
   * Plays a one-shot action that locks input until it completes, then returns
   * to idle.
   * @param animKey - The action animation key to play.
   */
  private startOneShot(animKey: string): void {
    const epoch = ++this.actionEpoch;
    this.clearActionTimers();

    this.locked = true;
    this.currentAnimKey = animKey;
    this.currentReverse = false;
    this.attackId += 1;
    this.attackConnected = false;
    const playKey = this.resolvedPlayKey(animKey);
    this.sprite.play({ key: playKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${playKey}`, () => {
      if (epoch !== this.actionEpoch || this.defeated || this.victorious || !this.sprite?.scene) {
        return;
      }

      this.locked = false;
      this.currentAnimKey = '';

      if (this.grounded && !this.frozen) {
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  /**
   * Performs the meter special: consumes the full meter, plays the charge
   * (wind-up) animation, then chains into the multi-hit execution animation, and
   * finally returns to idle. The execution's attack-active spans each open a new
   * hit window so the move lands a combo.
   */
  private startSpecial(): void {
    const epoch = ++this.actionEpoch;
    this.clearActionTimers();

    this.locked = true;
    this.specialArmor = true;
    this.meter = 0;
    this.currentReverse = false;
    this.attackConnected = true;
    this.attackActiveLast = false;

    // Face opponent on launch so special always fires forward
    const opponentX = this.getOpponentX?.();
    if (opponentX !== undefined && Math.abs(opponentX - this.posX) >= 8) {
      this.facing = opponentX >= this.posX ? 1 : -1;
      this.sprite.setFlipX(this.facing === 1);
    }

    this.onSpecialStart?.(this);
    spawnChargeAura(
      this.scene,
      this.sprite.x,
      this.sprite.y - this.sprite.displayHeight * 0.45,
      this.discipline === 'judo' ? 'blue' : 'red'
    );

    this.currentAnimKey = this.actionKeys.specialCharge;
    const chargePlayKey = this.resolvedPlayKey(this.actionKeys.specialCharge);
    this.sprite.play({ key: chargePlayKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${chargePlayKey}`, () => {
      if (epoch !== this.actionEpoch || this.defeated || this.victorious || !this.sprite?.scene) {
        return;
      }

      // Brief hold before executing so the cut-in flash lands right on impact.
      this.specialFreezeTimer = this.scene.time.delayedCall(SUPER_FREEZE_MS, () => {
        this.specialFreezeTimer = undefined;
        if (epoch !== this.actionEpoch || this.defeated || this.victorious || !this.sprite?.scene) {
          return;
        }
        this.executeSpecial(epoch);
      });
    });
  }

  /**
   * Advances forward toward the opponent without overshooting past them,
   * keeping Judo clinch throws & Taekwondo barrages cleanly in range.
   */
  private advanceTowardOpponent(maxStep: number, stopGap = 62): void {
    const opponentX = this.getOpponentX?.();
    if (opponentX === undefined) {
      this.nudgeX(this.facing * maxStep);
      return;
    }
    const delta = opponentX - this.posX;
    const dist = Math.abs(delta);
    if (dist <= stopGap) {
      return;
    }
    const step = Math.min(maxStep, dist - stopGap);
    this.nudgeX(Math.sign(delta) * step);
  }

  /**
   * Launches the multi-hit special execution animation after the charge/super
   * freeze, then returns to idle. Judo executes a grounded clinch lunge + mat
   * slam; Taekwondo launches a leaping tornado kick barrage.
   */
  private executeSpecial(epoch: number): void {
    this.currentAnimKey = this.actionKeys.special;
    this.attackId += 1;
    this.attackConnected = false;
    this.attackActiveLast = false;

    spawnDisciplineSpecialFx(this.scene, this.posX, this.groundY, this.facing, this.discipline, 'launch');

    if (this.discipline === 'judo') {
      // Judo: explosive entry step into hip-throw drive & ground-slam shockwave
      this.advanceTowardOpponent(95, 62);
      this.scene.time.delayedCall(180, () => {
        if (epoch === this.actionEpoch && !this.defeated && !this.victorious && this.sprite?.scene) {
          this.advanceTowardOpponent(48, 60);
        }
      });
      this.scene.time.delayedCall(340, () => {
        if (epoch === this.actionEpoch && !this.defeated && !this.victorious && this.sprite?.scene) {
          spawnDisciplineSpecialFx(this.scene, this.posX, this.groundY, this.facing, 'judo', 'climax');
        }
      });
    } else {
      // Taekwondo: rising airborne tornado hop while closing distance through the barrage
      this.advanceTowardOpponent(82, 64);
      this.scene.tweens.killTweensOf(this.sprite);
      this.scene.tweens.add({
        targets: this.sprite,
        y: this.groundY - 26,
        duration: 220,
        ease: 'Cubic.Out',
        yoyo: true,
        onUpdate: () => this.updateShadow(),
        onComplete: () => {
          if (this.sprite && this.sprite.scene) {
            this.sprite.y = this.groundY;
            this.updateShadow();
          }
        }
      });
      this.scene.time.delayedCall(320, () => {
        if (epoch === this.actionEpoch && !this.defeated && !this.victorious && this.sprite?.scene) {
          this.advanceTowardOpponent(44, 62);
          spawnDisciplineSpecialFx(this.scene, this.posX, this.groundY, this.facing, 'taekwondo', 'climax');
        }
      });
    }

    const specialPlayKey = this.resolvedPlayKey(this.actionKeys.special);
    this.sprite.play({ key: specialPlayKey, repeat: 0 }, true);
    this.sprite.once(`animationcomplete-${specialPlayKey}`, () => {
      if (epoch !== this.actionEpoch || this.defeated || this.victorious || !this.sprite?.scene) {
        return;
      }

      this.locked = false;
      this.specialArmor = false;
      this.currentAnimKey = '';
      this.sprite.y = this.groundY;
      this.updateShadow();

      if (this.grounded && !this.frozen) {
        this.playState(this.actionKeys.idle, true);
      }
    });
  }

  /**
   * Opens a fresh hit window each time the attack box turns on after being off,
   * so a single animation with several attack-active spans connects once per
   * span (multi-hit specials). Single-span normal attacks are unaffected.
   */
  private updateAttackWindow(): void {
    const active = this.isAttackActiveFrame();

    if (active && !this.attackActiveLast) {
      this.attackConnected = false;
    }

    this.attackActiveLast = active;
  }

  /**
   * Whether the current animation frame has an attack box (independent of
   * whether the current swing has already connected).
   */
  private isAttackActiveFrame(): boolean {
    if (this.currentAttackKind() === null) {
      return false;
    }

    const animation = this.currentAnimation();
    if (!animation) {
      return false;
    }

    return Boolean(this.resolvedFrame(animation).attack);
  }

  /**
   * Whether any frame after the given index in the animation still has an attack
   * box — used to detect the final hit window of a special (the finisher).
   * @param animation - The active animation.
   * @param frameIndex - The current frame index.
   */
  private hasAttackFrameAfter(animation: HeroAnimationDefinition, frameIndex: number): boolean {
    return animation.bounds.some((frame) => frame.frame > frameIndex && frame.attack !== null);
  }

  /** Launches a jump, playing the jump animation while physics drives the arc. */
  private startJump(): void {
    this.grounded = false;
    this.velocityY = -Math.abs(this.stats().jump);
    this.currentAnimKey = this.actionKeys.jump;
    this.currentReverse = false;
    spawnDustPuff(this.scene, this.posX, this.groundY - 12, 0, 3);
    this.sprite.play({ key: this.resolvedPlayKey(this.actionKeys.jump), repeat: 0 }, true);
  }

  /** Realistic landing knee compression and subtle mat dust wisp. */
  private playLandingImpact(): void {
    spawnDustPuff(this.scene, this.posX, this.groundY - 12, 0, 4);
    const base = this.appliedScale || this.stats().scale;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(base * 1.04, base * 0.91);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: base,
      scaleY: base,
      duration: 120,
      ease: 'Cubic.Out'
    });
  }

  /**
   * Redraws the enabled debug bounds (visual/collision/hit/attack) for the
   * fighter's current animation frame, driven by `debugStore.fighterPlayground.
   * bounds`. Boxes active on the current frame draw solid; boxes only active on
   * other frames draw faint using a representative rect.
   */
  private drawBoundsOverlay(): void {
    this.boundsGraphics.clear();

    const bounds = this.app.debugStore.getState().fighterPlayground.bounds;
    if (FIGHTER_BOUNDS_FIELDS.every((field) => !bounds[field.id])) {
      return;
    }

    const rawKey = this.sprite.anims.currentAnim?.key ?? this.currentAnimKey;
    const animKey = rawKey ? this.canonicalAnimKey(rawKey) : '';
    if (!animKey) {
      return;
    }

    const animation = getCharacterAnimationDefinition(this.character.id, animKey);
    if (animation.bounds.length === 0) {
      return;
    }

    const boundsFrame = this.resolvedFrame(animation);

    FIGHTER_BOUNDS_FIELDS.forEach((field) => {
      if (!bounds[field.id]) {
        return;
      }

      const active = boundsFrame[field.id];
      const rect = active ?? this.representativeBoundsRect(animation, field.id);
      if (!rect) {
        return;
      }

      this.strokeBoundsRect(animation, rect, BOUNDS_COLORS[field.id], active ? BOUNDS_ALPHA_ACTIVE : BOUNDS_ALPHA_INACTIVE);
    });
  }

  /**
   * Finds the first frame that defines the given bounds kind, used as a faint
   * placeholder on frames where that kind is inactive.
   * @param animation - The animation whose frames are scanned.
   * @param kind - The bounds kind to look up.
   */
  private representativeBoundsRect(
    animation: HeroAnimationDefinition,
    kind: keyof FighterBoundsVisibility
  ): Rect | null {
    for (const frame of animation.bounds) {
      const rect = frame[kind];
      if (rect) {
        return rect;
      }
    }

    return null;
  }

  /**
   * Strokes (and faintly fills) a frame-local rect in world space, accounting
   * for the fighter's origin, scale, and horizontal flip.
   * @param animation - The active animation (for frame dimensions).
   * @param rect - The frame-local rect to draw.
   * @param color - Stroke/fill colour.
   * @param alpha - Stroke alpha (fill uses a fraction of it).
   */
  private strokeBoundsRect(animation: HeroAnimationDefinition, rect: Rect, color: number, alpha: number): void {
    const world = this.frameRectToWorld(animation, rect);

    this.boundsGraphics.fillStyle(color, alpha * 0.18);
    this.boundsGraphics.fillRect(world.x, world.y, world.width, world.height);
    this.boundsGraphics.lineStyle(2, color, alpha);
    this.boundsGraphics.strokeRect(world.x, world.y, world.width, world.height);
  }

  /**
   * Converts a frame-local rect to a world-space rectangle, accounting for the
   * sprite's origin, scale, and horizontal flip.
   * @param animation - The active animation (for frame dimensions).
   * @param rect - The frame-local rect to convert.
   */
  private frameRectToWorld(animation: HeroAnimationDefinition, rect: Rect): Phaser.Geom.Rectangle {
    const frameWidth = animation.sheet.frameWidth;
    const left = this.sprite.x - this.sprite.displayWidth * this.sprite.originX;
    const top = this.sprite.y - this.sprite.displayHeight * this.sprite.originY;
    const scaleX = this.sprite.displayWidth / frameWidth;
    const scaleY = this.sprite.displayHeight / animation.sheet.frameHeight;
    const localX = this.sprite.flipX ? frameWidth - (rect.x + rect.width) : rect.x;

    return new Phaser.Geom.Rectangle(left + localX * scaleX, top + rect.y * scaleY, rect.width * scaleX, rect.height * scaleY);
  }

  /**
   * Resolves the current frame's bounds with the persisted Character Gym
   * overrides applied, so authored hit/attack/guard boxes drive live combat
   * (not just the gym preview).
   * @param animation - The active animation.
   */
  private resolvedFrame(animation: HeroAnimationDefinition): HeroBoundsFrame {
    const overrides = this.app.debugStore.getState().characterGym.boundsOverrides;

    return resolveHeroBoundsFrame(animation, this.currentFrameIndex(animation), overrides);
  }

  /**
   * Resolves the sprite's current animation frame index, clamped to range.
   * @param animation - The active animation.
   */
  private currentFrameIndex(animation: HeroAnimationDefinition): number {
    const frameName = Number(this.sprite.frame.name);
    const lastFrame = animation.sheet.frames - 1;

    if (Number.isFinite(frameName)) {
      return Phaser.Math.Clamp(frameName, 0, lastFrame);
    }

    return 0;
  }

  /** Keeps the ground shadow under the fighter and shrinks it as they rise. */
  private updateShadow(): void {
    const airborneLift = Phaser.Math.Clamp((this.groundY - this.sprite.y) / 220, 0, 1);

    this.shadow.x = this.posX;
    this.shadow.setScale(1 - airborneLift * 0.45);
    this.shadow.setAlpha(0.24 - airborneLift * 0.14);
  }
}
