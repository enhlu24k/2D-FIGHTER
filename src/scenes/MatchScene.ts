import * as Phaser from 'phaser';

import { playAudioCue } from '../game/core/audio';
import { Fighter, NEUTRAL_FIGHTER_INPUT, type FighterInput } from '../game/fighter';
import { getCharacterDefinition } from '../game/hero';
import { MatchHud } from '../game/matchHud';
import { getStageDefinition } from '../game/stageConfig';
import { playSuperCutIn } from '../game/superCutIn';
import { SCENE_KEYS, type CpuDifficulty, type MatchConfig } from '../game/types';
import { spawnHitSpark, type VfxColor } from '../game/vfx';
import { BaseScene } from './BaseScene';

const GROUND_FRACTION = 0.82;
const EDGE_MARGIN = 170;
const DEPTH_FRONT = 8;
const DEPTH_BACK = 5;

// Fraction of the gap from the screen centre each fighter occupies at spawn.
const SPAWN_OFFSET_FRACTION = 0.18;
// How quickly the camera eases toward the fighters' midpoint (0..1 per frame).
const CAMERA_LERP = 0.14;

const ROUNDS_TO_WIN = 2;
// Seconds on the round clock. When it expires the fighter with more health wins
// (a tie is a draw and replays the round).
const ROUND_SECONDS = 60;
const COMBO_WINDOW_MS = 1850;
const MIN_FIGHTER_SEPARATION = 74;
const CROSSUP_AIR_GAP = 95;
const HUD_DEPTH = 100;
const BANNER_DEPTH = 200;
const OVERLAY_DEPTH = 300;

/** The match's high-level state, driving input gating and the HUD. */
type MatchPhase = 'intro' | 'fighting' | 'roundEnd' | 'matchOver';

interface PlayerKeys {
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  crouch: Phaser.Input.Keyboard.Key;
  block: Phaser.Input.Keyboard.Key;
  jump: Phaser.Input.Keyboard.Key;
  light: Phaser.Input.Keyboard.Key;
  heavy: Phaser.Input.Keyboard.Key;
  special: Phaser.Input.Keyboard.Key;
}

/**
 * The versus match: two fighters spawn facing each other and fight a best-of-3
 * (first to {@link ROUNDS_TO_WIN} rounds). Each round runs a "ROUND n / FIGHT!"
 * intro, then live combat — attack boxes vs hurtboxes drive damage, hitstun,
 * knockback, and a knockdown on KO. When the match is decided a game-over
 * overlay offers a rematch or a return to the main menu. P1 is always human;
 * P2 is human in 1v1 or a simple CPU in 1vCPU.
 */
export class MatchScene extends BaseScene {
  private config: MatchConfig = {
    mode: '1v1',
    stageId: 'rooftop-twilight',
    p1CharacterId: '',
    p2CharacterId: ''
  };

  private p1!: Fighter;
  private p2!: Fighter;
  private p1Keys!: PlayerKeys;
  private p2Keys!: PlayerKeys;
  private cpu?: CpuController;

  private phase: MatchPhase = 'intro';
  private roundNumber = 1;
  private p1Wins = 0;
  private p2Wins = 0;

  private spawnX1 = 0;
  private spawnX2 = 0;

  private stageWorldWidth = 0;
  private maxScroll = 0;

  private hud!: MatchHud;
  private banner!: Phaser.GameObjects.Text;
  private roundTimeMs = ROUND_SECONDS * 1000;
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private victoryFx: Phaser.GameObjects.GameObject[] = [];
  private victoryFocusX: number | null = null;
  private p1Combo = { count: 0, damage: 0, expiresAt: 0 };
  private p2Combo = { count: 0, damage: 0, expiresAt: 0 };
  private roundEpoch = 0;
  private superFreezeUntil = 0;
  private superFreezeAttacker: Fighter | null = null;

  constructor() {
    super(SCENE_KEYS.Match);
  }

  init(data: MatchConfig): void {
    if (data) {
      this.config = data;
    }
  }

  create(): void {
    this.cpu = undefined;
    this.phase = 'intro';
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.overlay = [];
    this.victoryFx = [];
    this.victoryFocusX = null;
    this.p1Combo = { count: 0, damage: 0, expiresAt: 0 };
    this.p2Combo = { count: 0, damage: 0, expiresAt: 0 };
    this.roundEpoch = 0;
    this.superFreezeUntil = 0;
    this.superFreezeAttacker = null;

    this.markActiveScene(SCENE_KEYS.Match);
    this.cameras.main.setBackgroundColor(0x05070d);

    this.buildStage();
    this.spawnFighters();
    this.registerKeys();
    this.createControlsLegend();

    this.hud = new MatchHud(this, {
      mode: this.config.mode,
      p1CharacterId: this.config.p1CharacterId,
      p2CharacterId: this.config.p2CharacterId,
      p1Style: this.config.p1Style,
      p2Style: this.config.p2Style,
      roundsToWin: ROUNDS_TO_WIN,
      depth: HUD_DEPTH
    });
    this.hud.slideIn();

    this.banner = this.add
      .text(this.cameras.main.centerX, this.cameras.main.centerY - 40, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '64px',
        stroke: '#020617',
        strokeThickness: 8
      })
      .setOrigin(0.5)
      .setDepth(BANNER_DEPTH)
      .setScrollFactor(0)
      .setAlpha(0);

    if (this.config.mode === '1vcpu') {
      this.cpu = new CpuController(this.app.settingsStore.getState().difficulty);
    }

    this.startRound(true);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearVictoryFx();
      this.overlay = [];
      this.p1?.destroy();
      this.p2?.destroy();
      this.hud?.destroy();
    });
  }

  /**
   * Per-frame loop: feeds both fighters their input (only while fighting),
   * keeps them facing each other, resolves hits, checks for a KO, and redraws
   * the HUD. Pauses defender & round timer briefly during super cut-in freeze.
   * @param time - Phaser clock time in ms.
   * @param delta - Milliseconds since the previous frame.
   */
  update(time: number, delta: number): void {
    const seconds = delta / 1000;
    const fighting = this.phase === 'fighting';

    if (this.app.debugStore.getState().fighterPlayground.fillSpecial) {
      this.p1.fillMeter();
      this.p2.fillMeter();
    }

    if (this.superFreezeAttacker && time >= this.superFreezeUntil) {
      this.superFreezeAttacker = null;
    }

    const inSuperFreeze = fighting && this.superFreezeAttacker !== null && time < this.superFreezeUntil;

    if (inSuperFreeze) {
      const attacker = this.superFreezeAttacker!;
      attacker.update(seconds, { ...NEUTRAL_FIGHTER_INPUT });
      this.updateCamera(false);
      this.hud.applyHealth(this.p1.health01, this.p2.health01);
      this.hud.setMeter(this.p1.meter01, this.p2.meter01);
      return;
    }

    const p1Input = fighting ? this.readKeys(this.p1Keys) : { ...NEUTRAL_FIGHTER_INPUT };
    const p2Input = fighting
      ? this.cpu
        ? this.cpu.update(time, this.p2.x, this.p1.x, this.p2.isMeterReady)
        : this.readKeys(this.p2Keys)
      : { ...NEUTRAL_FIGHTER_INPUT };

    // Crouching (and crouch-block) is disabled for now: defense is simply
    // block-or-not. The geometric guard-box model still resolves blocks via the
    // standing guard box; the crouch/low path stays in the code but unused.
    p1Input.crouch = false;
    p2Input.crouch = false;

    this.p1.faceToward(this.p2.x);
    this.p2.faceToward(this.p1.x);

    if (fighting) {
      if (isActing(p1Input)) {
        this.p1.setDepthBase(DEPTH_FRONT);
        this.p2.setDepthBase(DEPTH_BACK);
      } else if (isActing(p2Input)) {
        this.p2.setDepthBase(DEPTH_FRONT);
        this.p1.setDepthBase(DEPTH_BACK);
      }
    }

    this.p1.update(seconds, p1Input);
    this.p2.update(seconds, p2Input);

    if (fighting) {
      this.resolvePushboxes();
    }

    this.updateCamera(false);

    if (fighting) {
      this.resolveCombat();
      this.checkForKnockout();
      this.tickCombos(time);

      if (this.phase === 'fighting') {
        this.tickRoundTimer(delta);
      }
    }

    this.hud.applyHealth(this.p1.health01, this.p2.health01);
    this.hud.setMeter(this.p1.meter01, this.p2.meter01);
    this.hud.setTime(Math.ceil(this.roundTimeMs / 1000));
    this.hud.updateWins(this.p1Wins, this.p2Wins);
  }

  /**
   * Prevents grounded fighters from walking directly through each other while
   * allowing high jumping cross-ups over the opponent's head.
   */
  private resolvePushboxes(): void {
    if (this.p1.isDefeated || this.p2.isDefeated) {
      return;
    }
    if (Math.abs(this.p1.y - this.p2.y) >= CROSSUP_AIR_GAP) {
      return;
    }

    const dx = this.p2.x - this.p1.x;
    const dist = Math.abs(dx);
    if (dist >= MIN_FIGHTER_SEPARATION) {
      return;
    }

    const overlap = MIN_FIGHTER_SEPARATION - dist;
    const half = overlap / 2;
    const p1LeftOfP2 = dx > 0 || (dx === 0 && this.p1.facingDirection >= 0);
    const leftFighter = p1LeftOfP2 ? this.p1 : this.p2;
    const rightFighter = p1LeftOfP2 ? this.p2 : this.p1;

    const movedLeft = leftFighter.nudgeX(-half);
    const leftShortfall = Math.max(0, half + movedLeft);
    const movedRight = rightFighter.nudgeX(half + leftShortfall);
    const rightShortfall = Math.max(0, half + leftShortfall - movedRight);
    if (rightShortfall > 0) {
      leftFighter.nudgeX(-rightShortfall);
    }
  }

  /**
   * Checks both directions for a connecting hit and applies damage/block this
   * frame. A swing only lands once thanks to the attacker's connect flag.
   */
  private resolveCombat(): void {
    this.tryHit(this.p1, this.p2);
    this.tryHit(this.p2, this.p1);
  }

  /**
   * Resolves a single attacker -> defender interaction for the current frame.
   * Blocking is purely geometric: the hit is guarded when the attack box
   * overlaps the defender's active guard box (from its block pose).
   * @param attacker - The fighter whose attack box is tested.
   * @param defender - The fighter whose hurtbox is tested.
   */
  private tryHit(attacker: Fighter, defender: Fighter): void {
    if (attacker.isDefeated || defender.isDefeated || defender.isSpecialInvulnerable) {
      return;
    }

    const attack = attacker.getActiveAttack();
    if (!attack) {
      return;
    }

    const hurt = defender.getHurtRect();
    if (!hurt || !Phaser.Geom.Intersects.RectangleToRectangle(attack.rect, hurt)) {
      return;
    }

    const guard = defender.getGuardRect();
    const blocked = guard !== null && Phaser.Geom.Intersects.RectangleToRectangle(attack.rect, guard);
    const isSpecial = attack.profile.kind === 'special';
    const finisher = attack.finisher && !blocked;
    const isThrow = attacker.isJudo && (attack.profile.kind === 'low' || attack.profile.kind === 'special');

    // Non-finisher hits of a special use low knockback so the defender stays
    // in front of the attacker for the full 3-hit combo; the finisher launches hard.
    const profile = finisher
      ? { ...attack.profile, knockback: attack.profile.knockback * 2.0, hitstun: attack.profile.hitstun * 1.45 }
      : isSpecial && !blocked
        ? { ...attack.profile, knockback: Math.round(attack.profile.knockback * 0.2), hitstun: Math.max(320, attack.profile.hitstun) }
        : attack.profile;

    defender.applyHit(profile, attacker.facingDirection, blocked, isThrow, finisher);
    defender.flashHit(blocked);
    attacker.markAttackConnected();
    attacker.registerOffense(blocked, isSpecial);
    defender.registerDefense(blocked);

    if (!blocked) {
      this.recordComboHit(attacker === this.p1 ? 1 : 2, profile.damage);
    }

    this.spawnHitFx(attack.rect, hurt, blocked, isSpecial, finisher);
  }

  private recordComboHit(attackerSide: 1 | 2, damage: number): void {
    const now = this.time.now;
    const attackerCombo = attackerSide === 1 ? this.p1Combo : this.p2Combo;
    const defenderCombo = attackerSide === 1 ? this.p2Combo : this.p1Combo;
    const attackerHudSide = attackerSide === 1 ? 'left' : 'right';
    const defenderHudSide = attackerSide === 1 ? 'right' : 'left';

    attackerCombo.count += 1;
    attackerCombo.damage += damage;
    attackerCombo.expiresAt = now + COMBO_WINDOW_MS;

    // Taking a clean hit breaks the defender's active combo chain
    defenderCombo.count = 0;
    defenderCombo.damage = 0;
    defenderCombo.expiresAt = 0;
    this.hud.setCombo(defenderHudSide, 0, 0, 0);

    if (attackerCombo.count >= 2) {
      this.hud.setCombo(attackerHudSide, attackerCombo.count, attackerCombo.damage, 1);
    }
  }

  private tickCombos(now: number): void {
    if (this.p1Combo.count > 0) {
      const rem = this.p1Combo.expiresAt - now;
      if (rem <= 0) {
        this.p1Combo.count = 0;
        this.p1Combo.damage = 0;
        this.hud.setCombo('left', 0, 0, 0);
      } else if (this.p1Combo.count >= 2) {
        this.hud.setCombo('left', this.p1Combo.count, this.p1Combo.damage, rem / COMBO_WINDOW_MS);
      }
    }

    if (this.p2Combo.count > 0) {
      const rem = this.p2Combo.expiresAt - now;
      if (rem <= 0) {
        this.p2Combo.count = 0;
        this.p2Combo.damage = 0;
        this.hud.setCombo('right', 0, 0, 0);
      } else if (this.p2Combo.count >= 2) {
        this.hud.setCombo('right', this.p2Combo.count, this.p2Combo.damage, rem / COMBO_WINDOW_MS);
      }
    }
  }

  private resetCombos(): void {
    this.p1Combo = { count: 0, damage: 0, expiresAt: 0 };
    this.p2Combo = { count: 0, damage: 0, expiresAt: 0 };
    this.hud.resetCombos();
  }

  /**
   * Spawns the impact spark and camera shake for a connecting hit, scaled up for
   * special hits and the combo finisher.
   * @param attackRect - The attacker's attack box (world space).
   * @param hurtRect - The defender's hurtbox (world space).
   * @param blocked - Whether the hit was guarded.
   * @param isSpecial - Whether the attack was a special move.
   * @param finisher - Whether this is the special's finishing hit.
   */
  private spawnHitFx(
    attackRect: Phaser.Geom.Rectangle,
    hurtRect: Phaser.Geom.Rectangle,
    blocked: boolean,
    isSpecial: boolean,
    finisher: boolean
  ): void {
    const sparkX = (Phaser.Geom.Rectangle.GetCenter(attackRect).x + Phaser.Geom.Rectangle.GetCenter(hurtRect).x) / 2;
    const sparkY = (Phaser.Geom.Rectangle.GetCenter(attackRect).y + Phaser.Geom.Rectangle.GetCenter(hurtRect).y) / 2;

    const color: VfxColor = blocked ? 'blue' : finisher ? 'gold' : 'red';
    const sparkScale = finisher ? 1.7 : isSpecial ? 1.1 : 0.9;
    spawnHitSpark(this, sparkX, sparkY, color, sparkScale);

    if (finisher) {
      this.cameras.main.shake(220, 0.012);
    } else if (isSpecial) {
      this.cameras.main.shake(blocked ? 60 : 90, blocked ? 0.003 : 0.005);
    } else {
      this.cameras.main.shake(blocked ? 60 : 120, blocked ? 0.003 : 0.006);
    }
  }

  /** Ends the round when either fighter is knocked out. */
  private checkForKnockout(): void {
    if (this.p1.isDefeated) {
      this.endRound(2);
    } else if (this.p2.isDefeated) {
      this.endRound(1);
    }
  }

  /**
   * Counts the round clock down while fighting. When it reaches zero the round
   * is decided on remaining health (a tie replays the round as a draw).
   * @param delta - Milliseconds since the previous frame.
   */
  private tickRoundTimer(delta: number): void {
    this.roundTimeMs = Math.max(0, this.roundTimeMs - delta);

    if (this.roundTimeMs <= 0) {
      this.resolveTimeOut();
    }
  }

  /** Decides a timed-out round by comparing remaining health. */
  private resolveTimeOut(): void {
    const p1 = this.p1.health01;
    const p2 = this.p2.health01;

    if (p1 > p2) {
      this.endRound(1, 'TIME UP', '#facc15');
    } else if (p2 > p1) {
      this.endRound(2, 'TIME UP', '#facc15');
    } else {
      this.drawRound();
    }
  }

  /** Handles a drawn round (timeout with equal health): replays the round. */
  private drawRound(): void {
    if (this.phase !== 'fighting') {
      return;
    }

    const epoch = this.roundEpoch;
    this.phase = 'roundEnd';
    this.p1.setFrozen(true);
    this.p2.setFrozen(true);
    this.showBanner('DRAW', '#e2e8f0', 1.1);
    this.time.delayedCall(1100, () => {
      if (epoch === this.roundEpoch && this.scene.isActive()) {
        this.startRound();
      }
    });
  }

  /**
   * Places the chosen stage fit to the viewport height, anchored at world x=0,
   * and sets up the scrollable world. The stage's on-screen width becomes the
   * world width; the camera is bounded to it so it can scroll horizontally and
   * stop at the stage ends (producing corners).
   */
  private buildStage(): void {
    const cam = this.cameras.main;
    const stage = getStageDefinition(this.config.stageId);
    const hasTexture = this.textures.exists(stage.key);
    const source = hasTexture ? this.textures.get(stage.key).getSourceImage() : null;
    const srcW = source?.width || stage.width;
    const srcH = source?.height || stage.height;
    const scale = Math.max(cam.height / srcH, cam.width / srcW);
    this.stageWorldWidth = Math.max(cam.width, srcW * scale);
    this.maxScroll = Math.max(0, this.stageWorldWidth - cam.width);

    if (hasTexture) {
      const imgY = Math.round((cam.height - srcH * scale) / 2);
      this.add.image(0, imgY, stage.key).setOrigin(0, 0).setScale(scale).setDepth(0);
    }

    if (stage.key.startsWith('calm-bg-') && !stage.key.startsWith('calm-bg-dojo-')) {
      const groundY = Math.round(cam.height * GROUND_FRACTION);
      this.add
        .rectangle(0, groundY - 4, this.stageWorldWidth, cam.height - groundY + 4, 0x090d16, 0.36)
        .setOrigin(0, 0)
        .setDepth(1);
      this.add
        .rectangle(0, groundY - 4, this.stageWorldWidth, 2, 0x94a3b8, 0.24)
        .setOrigin(0, 0)
        .setDepth(1);
    }

    cam.setBounds(0, 0, this.stageWorldWidth, cam.height);
  }

  /** Spawns P1 (left, facing right) and P2 (right, facing left). */
  private spawnFighters(): void {
    const cam = this.cameras.main;
    const groundY = Math.round(cam.height * GROUND_FRACTION);
    const minX = EDGE_MARGIN;
    const maxX = this.stageWorldWidth - EDGE_MARGIN;
    const center = this.stageWorldWidth / 2;
    this.spawnX1 = Math.round(center - cam.width * SPAWN_OFFSET_FRACTION);
    this.spawnX2 = Math.round(center + cam.width * SPAWN_OFFSET_FRACTION);

    this.p1 = new Fighter({
      scene: this,
      app: this.app,
      characterId: this.config.p1CharacterId,
      x: this.spawnX1,
      groundY,
      facing: 1,
      minX,
      maxX,
      depth: DEPTH_FRONT,
      style: this.config.p1Style,
      getOpponentX: () => this.p2.x,
      onSpecialStart: (fighter) => this.handleSpecialStart(fighter, 'left'),
      onSpecialDenied: () => this.handleSpecialDenied('left')
    });

    this.p2 = new Fighter({
      scene: this,
      app: this.app,
      characterId: this.config.p2CharacterId,
      x: this.spawnX2,
      groundY,
      facing: -1,
      minX,
      maxX,
      depth: DEPTH_BACK,
      style: this.config.p2Style,
      getOpponentX: () => this.p1.x,
      onSpecialStart: (fighter) => this.handleSpecialStart(fighter, 'right'),
      onSpecialDenied: () => this.handleSpecialDenied('right')
    });
  }

  private handleSpecialStart(fighter: Fighter, side: 'left' | 'right'): void {
    this.superFreezeAttacker = fighter;
    this.superFreezeUntil = this.time.now + 520;
    fighter.setDepthBase(DEPTH_FRONT + 2);
    const other = fighter === this.p1 ? this.p2 : this.p1;
    other.setDepthBase(DEPTH_BACK);
    playSuperCutIn(this, { characterId: fighter.characterId, side });
  }

  private handleSpecialDenied(side: 'left' | 'right'): void {
    this.hud.flashMeterInsufficient(side);
    playAudioCue(this, 'starter-deny', this.app.settingsStore.getState());
  }

  /**
   * Group-camera tracking: scrolls horizontally to keep both fighters framed
   * around their midpoint, clamped to the stage ends (so it stops at corners),
   * then turns the visible screen edges into movement walls for both fighters.
   * This is what produces the "camera locks until one fighter relents" feel —
   * neither fighter can walk off-screen, so they can only separate as far as the
   * screen is wide.
   * @param snap - When true, jumps to the target scroll instantly (round start)
   *   instead of easing toward it.
   */
  private updateCamera(snap: boolean): void {
    const cam = this.cameras.main;
    const viewWidth = cam.width;
    const midpoint = this.victoryFocusX !== null ? this.victoryFocusX : (this.p1.x + this.p2.x) / 2;
    const targetScroll = Phaser.Math.Clamp(midpoint - viewWidth / 2, 0, this.maxScroll);
    const scrollX = snap ? targetScroll : Phaser.Math.Linear(cam.scrollX, targetScroll, CAMERA_LERP);

    cam.setScroll(scrollX, 0);

    const leftWall = scrollX + EDGE_MARGIN;
    const rightWall = scrollX + viewWidth - EDGE_MARGIN;
    this.p1.setHorizontalBounds(leftWall, rightWall);
    this.p2.setHorizontalBounds(leftWall, rightWall);
  }

  /** Registers the two keyboard control schemes plus the menu shortcut. */
  private registerKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      throw new Error('MatchScene requires keyboard input');
    }

    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.p1Keys = {
      left: keyboard.addKey(codes.A),
      right: keyboard.addKey(codes.D),
      crouch: keyboard.addKey(codes.S),
      block: keyboard.addKey(codes.C),
      jump: keyboard.addKey(codes.W),
      light: keyboard.addKey(codes.F),
      heavy: keyboard.addKey(codes.G),
      special: keyboard.addKey(codes.V)
    };

    this.p2Keys = {
      left: keyboard.addKey(codes.LEFT),
      right: keyboard.addKey(codes.RIGHT),
      crouch: keyboard.addKey(codes.DOWN),
      block: keyboard.addKey(codes.FORWARD_SLASH),
      jump: keyboard.addKey(codes.UP),
      light: keyboard.addKey(codes.COMMA),
      heavy: keyboard.addKey(codes.PERIOD),
      special: keyboard.addKey(codes.L)
    };

    keyboard.on('keydown-ESC', () => this.goToMenu());
    keyboard.on('keydown-BACKSPACE', () => this.goToMenu());
    keyboard.on('keydown-R', () => {
      if (this.phase === 'matchOver') {
        this.rematch();
      }
    });
  }

  /**
   * Reads a control scheme into a fighter input snapshot. Held keys map to held
   * inputs; jump/light/heavy use edge detection so they fire once per press.
   * @param keys - The player's resolved keys.
   */
  private readKeys(keys: PlayerKeys): FighterInput {
    return {
      left: keys.left.isDown,
      right: keys.right.isDown,
      crouch: keys.crouch.isDown,
      block: keys.block.isDown,
      jump: Phaser.Input.Keyboard.JustDown(keys.jump),
      light: Phaser.Input.Keyboard.JustDown(keys.light),
      heavy: Phaser.Input.Keyboard.JustDown(keys.heavy),
      special: Phaser.Input.Keyboard.JustDown(keys.special)
    };
  }

  /** Draws the control legend at the bottom of the screen. */
  private createControlsLegend(): void {
    const { centerX, height } = this.cameras.main;
    const p1 = 'P1: WASD • F light • G heavy • C block • V special';
    const diffLabel = this.app.settingsStore.getState().difficulty.toUpperCase();
    const p2 =
      this.config.mode === '1vcpu'
        ? `P2: CPU (${diffLabel})`
        : 'P2: Arrows • , light • . heavy • / block • L special';

    this.add
      .text(centerX, height - 22, `${p1}      ${p2}      Esc Menu`, {
        color: '#cbd5f5',
        fontFamily: 'monospace',
        fontSize: '12px',
        backgroundColor: 'rgba(2, 6, 23, 0.6)',
        padding: { x: 10, y: 5 }
      })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH)
      .setScrollFactor(0);
  }

  /** Resets both fighters to their corners and runs the round intro. */
  private startRound(resetMeters = false): void {
    const epoch = ++this.roundEpoch;
    this.phase = 'intro';
    this.roundTimeMs = ROUND_SECONDS * 1000;
    this.superFreezeUntil = 0;
    this.superFreezeAttacker = null;
    this.victoryFocusX = null;
    this.clearVictoryFx();
    this.resetCombos();

    const fullMin = EDGE_MARGIN;
    const fullMax = this.stageWorldWidth - EDGE_MARGIN;
    this.p1.setHorizontalBounds(fullMin, fullMax);
    this.p2.setHorizontalBounds(fullMin, fullMax);

    this.p1.resetForRound(this.spawnX1, 1, resetMeters);
    this.p2.resetForRound(this.spawnX2, -1, resetMeters);
    this.p1.setDepthBase(DEPTH_FRONT);
    this.p2.setDepthBase(DEPTH_BACK);
    this.updateCamera(true);
    this.hud.animateFill();
    this.hud.updateWins(this.p1Wins, this.p2Wins);

    this.showBanner(`ROUND ${this.roundNumber}`, '#f8fafc');

    this.time.delayedCall(900, () => {
      if (epoch !== this.roundEpoch || this.phase !== 'intro' || !this.scene.isActive()) {
        return;
      }

      this.showBanner('FIGHT!', '#facc15', 1.15);
      this.phase = 'fighting';
      this.p1.setFrozen(false);
      this.p2.setFrozen(false);

      this.time.delayedCall(650, () => {
        if (epoch === this.roundEpoch && this.phase === 'fighting' && this.scene.isActive()) {
          this.hideBanner();
        }
      });
    });
  }

  /**
   * Concludes the current round, tallies the win, and either advances to the
   * next round or ends the match.
   * @param winner - Which player won (1 or 2).
   * @param bannerText - The banner to show (defaults to a knockout).
   * @param bannerColor - The banner colour.
   */
  private endRound(winner: 1 | 2, bannerText = 'K.O.', bannerColor = '#f43f5e'): void {
    if (this.phase !== 'fighting') {
      return;
    }

    const epoch = this.roundEpoch;
    this.phase = 'roundEnd';
    this.p1.setFrozen(true);
    this.p2.setFrozen(true);

    if (winner === 1) {
      this.p1Wins += 1;
    } else {
      this.p2Wins += 1;
    }

    const winnerName =
      winner === 1
        ? `P1 ${getCharacterDefinition(this.config.p1CharacterId).label}`
        : `${this.config.mode === '1vcpu' ? 'CPU' : 'P2'} ${getCharacterDefinition(this.config.p2CharacterId).label}`;
    this.showBanner(bannerText, bannerColor, 1.2);

    this.time.delayedCall(1000, () => {
      if (epoch !== this.roundEpoch || !this.scene.isActive()) {
        return;
      }

      const matchOver = this.p1Wins >= ROUNDS_TO_WIN || this.p2Wins >= ROUNDS_TO_WIN;

      if (matchOver) {
        this.playMatchVictorySequence(winner, winnerName, epoch);
      } else {
        this.roundNumber += 1;
        this.startRound();
      }
    });
  }

  /**
   * Plays a dedicated post-match victory celebration: centers the camera gently
   * on the winner, illuminates them with a golden dojo spotlight, runs their
   * celebratory victory loop & confetti burst, and calls "VICTORY!" before
   * revealing the match summary panel.
   */
  private playMatchVictorySequence(winner: 1 | 2, winnerName: string, epoch: number): void {
    const winnerFighter = winner === 1 ? this.p1 : this.p2;
    const loserFighter = winner === 1 ? this.p2 : this.p1;
    const groundY = Math.round(this.cameras.main.height * GROUND_FRACTION);

    winnerFighter.setDepthBase(DEPTH_FRONT + 4);
    loserFighter.setDepthBase(DEPTH_BACK);
    this.victoryFocusX = winnerFighter.x;

    // Radiant golden spotlight beam behind the victorious fighter
    const beam = this.add
      .rectangle(winnerFighter.x, groundY - 220, 180, 460, 0xfacc15, 0)
      .setDepth(DEPTH_FRONT - 2);
    const floorGlow = this.add
      .ellipse(winnerFighter.x, groundY - 12, 190, 44, 0xfacc15, 0)
      .setDepth(DEPTH_FRONT - 2);
    this.victoryFx.push(beam, floorGlow);

    this.tweens.add({ targets: beam, alpha: 0.16, duration: 360, ease: 'Cubic.Out' });
    this.tweens.add({ targets: floorGlow, alpha: 0.36, duration: 360, ease: 'Cubic.Out' });

    winnerFighter.playVictory(winner === 1 ? 0x38bdf8 : 0xfacc15);
    this.showBanner('VICTORY!', '#facc15', 1.25);

    this.time.delayedCall(1500, () => {
      if (epoch === this.roundEpoch && this.scene.isActive()) {
        this.endMatch(winnerName);
      }
    });
  }

  private clearVictoryFx(): void {
    this.victoryFx.forEach((obj) => obj.destroy());
    this.victoryFx = [];
  }

  /**
   * Shows the game-over overlay with the match winner and rematch / menu options,
   * leaving the victorious fighter visible celebrating beside/behind the card.
   * @param winnerName - The display name of the match winner.
   */
  private endMatch(winnerName: string): void {
    this.phase = 'matchOver';
    this.hideBanner();

    const { centerX, centerY, width, height } = this.cameras.main;

    const dim = this.add
      .rectangle(centerX, centerY, width, height, 0x020617, 0.38)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const panel = this.add
      .rectangle(centerX, centerY + 12, 540, 290, 0x090f1d, 0.84)
      .setStrokeStyle(3, 0xfacc15, 0.9)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const badge = this.add
      .text(centerX, centerY - 104, 'CHAMPION VICTORY', {
        color: '#38bdf8',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '14px'
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const title = this.add
      .text(centerX, centerY - 64, `${winnerName} WINS!`, {
        color: '#facc15',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '36px',
        stroke: '#020617',
        strokeThickness: 6,
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const score = this.add
      .text(centerX, centerY - 14, `Final Score: ${this.p1Wins} - ${this.p2Wins}`, {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '22px'
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0);

    const rematch = this.makeOverlayButton(centerX, centerY + 48, 'Rematch  (R)', () => this.rematch());
    const menu = this.makeOverlayButton(centerX, centerY + 104, 'Main Menu  (Esc)', () => this.goToMenu());

    this.overlay = [dim, panel, badge, title, score, rematch, menu];
  }

  /**
   * Builds a clickable overlay button with hover feedback.
   * @param x - Centre x.
   * @param y - Centre y.
   * @param label - Button text.
   * @param onClick - Click handler.
   */
  private makeOverlayButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '22px',
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        padding: { x: 18, y: 10 }
      })
      .setOrigin(0.5)
      .setDepth(OVERLAY_DEPTH)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    button.on('pointerover', () => button.setColor('#facc15'));
    button.on('pointerout', () => button.setColor('#e2e8f0'));
    button.on('pointerdown', onClick);

    return button;
  }

  /** Restarts the match from round 1 with the same configuration. */
  private rematch(): void {
    this.overlay.forEach((object) => object.destroy());
    this.overlay = [];
    this.clearVictoryFx();
    this.victoryFocusX = null;
    this.roundNumber = 1;
    this.p1Wins = 0;
    this.p2Wins = 0;
    this.cpu =
      this.config.mode === '1vcpu'
        ? new CpuController(this.app.settingsStore.getState().difficulty)
        : undefined;
    this.startRound(true);
  }

  /**
   * Shows the centre banner with a short pop-in tween.
   * @param text - The banner text.
   * @param color - The text colour.
   * @param peakScale - The scale to settle at (default 1).
   */
  private showBanner(text: string, color: string, peakScale = 1): void {
    this.banner.setText(text).setColor(color).setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: this.banner, alpha: 1, scale: peakScale, duration: 260, ease: 'Back.Out' });
  }

  /** Fades the centre banner out. */
  private hideBanner(): void {
    this.tweens.add({ targets: this.banner, alpha: 0, duration: 300 });
  }
}

/**
 * Whether an input represents the fighter actively doing something (moving,
 * jumping, or attacking) this frame — used to decide who draws in front.
 * @param input - The fighter input snapshot to test.
 */
function isActing(input: FighterInput): boolean {
  return input.left || input.right || input.jump || input.light || input.heavy || input.special;
}

/**
 * A placeholder CPU opponent: mostly idle, occasionally performing a short
 * random action (a strike, a hop, or a brief walk/crouch/block). Produces a
 * {@link FighterInput} each frame for the second fighter in 1vCPU matches.
 */
interface CpuDifficultyProfile {
  minDecisionMs: number;
  maxDecisionMs: number;
  approachChance: number;
  blockChance: number;
  lightChance: number;
  heavyChance: number;
  jumpChance: number;
  specialPerFrameDivisor: number;
}

const CPU_PROFILES: Record<CpuDifficulty, CpuDifficultyProfile> = {
  easy: {
    minDecisionMs: 820,
    maxDecisionMs: 1480,
    approachChance: 0.48,
    blockChance: 0.14,
    lightChance: 0.28,
    heavyChance: 0.14,
    jumpChance: 0.08,
    specialPerFrameDivisor: 220
  },
  normal: {
    minDecisionMs: 400,
    maxDecisionMs: 820,
    approachChance: 0.72,
    blockChance: 0.34,
    lightChance: 0.42,
    heavyChance: 0.28,
    jumpChance: 0.12,
    specialPerFrameDivisor: 90
  },
  hard: {
    minDecisionMs: 170,
    maxDecisionMs: 360,
    approachChance: 0.9,
    blockChance: 0.56,
    lightChance: 0.48,
    heavyChance: 0.34,
    jumpChance: 0.12,
    specialPerFrameDivisor: 20
  }
};

/**
 * Spacing-aware CPU opponent tuned by {@link CpuDifficulty}.
 * Approaches when out of range and mixes strikes, blocks, jumps, and specials
 * faster and more decisively on harder settings.
 */
class CpuController {
  private readonly profile: CpuDifficultyProfile;
  private nextDecisionAt = 0;
  private holdUntil = 0;
  private moveDir = 0;
  private holdBlock = false;

  constructor(difficulty: CpuDifficulty) {
    this.profile = CPU_PROFILES[difficulty];
  }

  update(timeMs: number, selfX: number, opponentX: number, meterReady: boolean): FighterInput {
    const input: FighterInput = { ...NEUTRAL_FIGHTER_INPUT };
    const dist = Math.abs(opponentX - selfX);

    if (meterReady && dist <= 220 && Phaser.Math.Between(0, this.profile.specialPerFrameDivisor) === 0) {
      input.special = true;
      return input;
    }

    if (timeMs >= this.nextDecisionAt) {
      this.decide(timeMs, input, selfX, opponentX, dist);
      this.nextDecisionAt =
        timeMs + Phaser.Math.Between(this.profile.minDecisionMs, this.profile.maxDecisionMs);
    }

    if (timeMs < this.holdUntil) {
      if (this.moveDir < 0) {
        input.left = true;
      } else if (this.moveDir > 0) {
        input.right = true;
      }
      input.block = input.block || this.holdBlock;
    } else {
      this.moveDir = 0;
      this.holdBlock = false;
    }

    return input;
  }

  private decide(
    timeMs: number,
    input: FighterInput,
    selfX: number,
    opponentX: number,
    dist: number
  ): void {
    const towardDir = opponentX >= selfX ? 1 : -1;
    const roll = Math.random();

    if (dist > 142) {
      if (roll < this.profile.approachChance) {
        this.moveDir = towardDir;
        this.holdUntil = timeMs + Phaser.Math.Between(260, 560);
        return;
      }
      if (roll < this.profile.approachChance + this.profile.jumpChance) {
        this.moveDir = towardDir;
        this.holdUntil = timeMs + 340;
        input.jump = true;
        return;
      }
      this.moveDir = -towardDir;
      this.holdUntil = timeMs + 260;
      return;
    }

    if (roll < this.profile.blockChance * 0.65) {
      this.holdBlock = true;
      this.holdUntil = timeMs + Phaser.Math.Between(220, 480);
      return;
    }
    if (roll < this.profile.blockChance * 0.65 + this.profile.lightChance) {
      input.light = true;
      return;
    }
    if (roll < this.profile.blockChance * 0.65 + this.profile.lightChance + this.profile.heavyChance) {
      input.heavy = true;
      return;
    }
    if (roll < 0.88) {
      this.moveDir = Math.random() < 0.65 ? towardDir : -towardDir;
      this.holdUntil = timeMs + Phaser.Math.Between(180, 380);
      return;
    }

    input.jump = true;
    this.moveDir = towardDir;
    this.holdUntil = timeMs + 280;
  }
}
