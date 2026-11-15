import * as Phaser from 'phaser';

import {
  CALM_BACKGROUNDS,
  COMBAT_STYLES,
  SUIT_STYLES,
  calmStyleStore,
  getCalmBackgroundDefinition,
  getCombatStyleDefinition,
  getSuitStyleDefinition,
  setCalmBackgroundStyle
} from '../game/calmStyles';
import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { FIGHTER_CHARACTER_DEFINITIONS, type CharacterDefinition } from '../game/hero';
import { getMartialCharacterMeta } from '../game/martialRoster';
import {
  SCENE_KEYS,
  type CalmBackgroundId,
  type CombatStyleId,
  type FighterStyleSelection,
  type MatchMode,
  type SuitStyleId
} from '../game/types';
import { BaseScene } from './BaseScene';

interface CharacterSelectData {
  mode: MatchMode;
  stageId: string;
}

const GRID_COLS = 4;
const CARD_W = 124;
const CARD_H = 152;
const CARD_GAP_X = 12;
const CARD_GAP_Y = 14;

const P1_COLOR = 0x38bdf8;
const P1_CSS = '#38bdf8';
const P2_COLOR = 0xf43f5e;
const P2_CSS = '#f43f5e';

interface RosterCardView {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  accentBar: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  subtitle: Phaser.GameObjects.Text;
  flash: Phaser.GameObjects.Rectangle;
  x: number;
  y: number;
}

interface SpotlightPanelView {
  root: Phaser.GameObjects.Container;
  headerBadge: Phaser.GameObjects.Text;
  statusText: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.Image;
  portraitFrame: Phaser.GameObjects.Rectangle;
  heroName: Phaser.GameObjects.Text;
  aliasTeam: Phaser.GameObjects.Text;
  archetypeText: Phaser.GameObjects.Text;
  specialText: Phaser.GameObjects.Text;
  spdFill: Phaser.GameObjects.Rectangle;
  pwrFill: Phaser.GameObjects.Rectangle;
  vitFill: Phaser.GameObjects.Rectangle;
  spdVal: Phaser.GameObjects.Text;
  pwrVal: Phaser.GameObjects.Text;
  vitVal: Phaser.GameObjects.Text;
  styleDesc: Phaser.GameObjects.Text;
  combatButtons: Map<CombatStyleId, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>;
  suitButtons: Map<SuitStyleId, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>;
  lockBtnBg: Phaser.GameObjects.Rectangle;
  lockBtnText: Phaser.GameObjects.Text;
}

interface PlayerSelectionState {
  index: number;
  locked: boolean;
  style: FighterStyleSelection;
  outline: Phaser.GameObjects.Rectangle;
  badge: Phaser.GameObjects.Text;
}

/**
 * Judo & Taekwondo Champion & Style Select screen:
 * - Calm Background Style switcher bar across the top (live crossfading)
 * - Centered 4x3 roster grid with 12 Olympic Judo & Taekwondo champions
 * - Left (P1) and Right (P2/CPU) Spotlight Panels with Combat Style & Uniform Tone choosers
 */
export class CharacterSelectScene extends BaseScene {
  private mode: MatchMode = '1v1';
  private stageId = '';
  private roster: CharacterDefinition[] = [];

  private cards: RosterCardView[] = [];
  private p1!: PlayerSelectionState;
  private p2!: PlayerSelectionState;
  private p2StyleTouched = false;

  private p1Panel!: SpotlightPanelView;
  private p2Panel!: SpotlightPanelView;

  private bgDropdownTrigger!: Phaser.GameObjects.Rectangle;
  private bgDropdownDot!: Phaser.GameObjects.Arc;
  private bgDropdownLabel!: Phaser.GameObjects.Text;
  private bgDropdownChevron!: Phaser.GameObjects.Text;
  private bgDropdownList!: Phaser.GameObjects.Container;
  private bgDropdownBackdrop!: Phaser.GameObjects.Zone;
  private bgDropdownOpen = false;
  private bgStyleButtons = new Map<
    CalmBackgroundId,
    { bg: Phaser.GameObjects.Rectangle; dot: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text; check: Phaser.GameObjects.Text }
  >();
  private bgSubtitleText!: Phaser.GameObjects.Text;
  private unsubscribeCalm?: () => void;
  private transitioning = false;

  constructor() {
    super(SCENE_KEYS.CharacterSelect);
  }

  init(data: CharacterSelectData): void {
    this.mode = data?.mode ?? '1v1';
    this.stageId = data?.stageId ?? '';
  }

  create(): void {
    this.cards = [];
    this.bgStyleButtons.clear();
    this.transitioning = false;
    this.p2StyleTouched = false;
    this.roster = FIGHTER_CHARACTER_DEFINITIONS;

    this.markActiveScene(SCENE_KEYS.CharacterSelect);
    this.cameras.main.setBackgroundColor(0x090d16);
    this.mountCalmBackdrop(undefined, 0.5);

    this.createHeaderAndCalmBar();
    this.buildRosterGrid();
    this.buildCursors();

    this.p1Panel = this.createSpotlightPanel(182, 392, 'p1');
    this.p2Panel = this.createSpotlightPanel(1098, 392, 'p2');

    this.refreshCursor(this.p1);
    this.refreshCursor(this.p2);
    this.refreshPanel('p1');
    this.refreshPanel('p2');
    this.refreshCalmBar();

    this.unsubscribeCalm = calmStyleStore.subscribe(() => {
      this.refreshCalmBar();
    });

    this.registerInput();

    const controlsHint =
      this.mode === '1v1'
        ? 'P1: WASD + Space/F   •   P2: Arrows + Enter   •   Q/E: Calm Backdrop   •   1-4: Style   •   Esc: Back'
        : 'WASD / Arrows / Click: Pick Fighter   •   Space / Enter: Lock In   •   Q/E: Calm Backdrop   •   Esc: Back';
    this.createFooterHint(controlsHint);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeCalm?.();
      this.unsubscribeCalm = undefined;
    });
  }

  private createHeaderAndCalmBar(): void {
    const { centerX, centerY, width, height } = this.cameras.main;
    this.bgDropdownOpen = false;

    this.add
      .text(centerX, 24, 'Judo & Taekwondo Champions · Select Fighter & Style', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '26px',
        stroke: '#090d16',
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(50);

    const barWidth = 840;
    const barY = 70;
    this.add
      .rectangle(centerX, barY, barWidth, 50, 0x0b1220, 0.82)
      .setStrokeStyle(1, 0x334155, 0.9)
      .setDepth(40);

    this.add
      .text(centerX - barWidth / 2 + 16, barY - 9, 'DOJO & CALM BACKDROP (Q/E)', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '11px'
      })
      .setOrigin(0, 0.5)
      .setDepth(45);

    this.bgSubtitleText = this.add
      .text(centerX - barWidth / 2 + 16, barY + 10, '', {
        color: '#cbd5e1',
        fontFamily: 'monospace',
        fontSize: '11px'
      })
      .setOrigin(0, 0.5)
      .setDepth(45);

    const dropW = 290;
    const dropH = 34;
    const dropX = centerX + barWidth / 2 - dropW / 2 - 14;

    this.bgDropdownTrigger = this.add
      .rectangle(dropX, barY, dropW, dropH, 0x0f172a, 0.96)
      .setStrokeStyle(1.5, 0x475569, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(46);

    this.bgDropdownDot = this.add
      .circle(dropX - dropW / 2 + 16, barY, 5, 0x86efac, 1)
      .setDepth(47);

    this.bgDropdownLabel = this.add
      .text(dropX - dropW / 2 + 30, barY, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontSize: '13px',
        fontStyle: 'bold'
      })
      .setOrigin(0, 0.5)
      .setDepth(47);

    this.bgDropdownChevron = this.add
      .text(dropX + dropW / 2 - 14, barY, '▾', {
        color: '#cbd5e1',
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setDepth(47);

    this.bgDropdownBackdrop = this.add
      .zone(centerX, centerY, width, height)
      .setInteractive()
      .setDepth(190)
      .setVisible(false);
    this.bgDropdownBackdrop.on('pointerdown', () => this.toggleBgDropdown(false));

    this.bgDropdownList = this.add
      .container(dropX, barY + dropH / 2 + 4)
      .setDepth(200)
      .setVisible(false);

    const itemH = 30;
    const pad = 5;
    const listH = CALM_BACKGROUNDS.length * itemH + pad * 2;
    const listBg = this.add
      .rectangle(0, listH / 2, dropW, listH, 0x090f1d, 0.98)
      .setStrokeStyle(2, 0x38bdf8, 0.95);
    this.bgDropdownList.add(listBg);

    CALM_BACKGROUNDS.forEach((bgDef, idx) => {
      const iy = pad + idx * itemH + itemH / 2;
      const bg = this.add
        .rectangle(0, iy, dropW - 8, itemH - 2, 0x0f172a, 0.9)
        .setInteractive({ useHandCursor: true });
      const dot = this.add.circle(-dropW / 2 + 16, iy, 4, bgDef.accentHex, 1);
      const label = this.add
        .text(-dropW / 2 + 28, iy, bgDef.label, {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontSize: '12px',
          fontStyle: 'bold'
        })
        .setOrigin(0, 0.5);
      const check = this.add
        .text(dropW / 2 - 14, iy, '✓', {
          color: '#38bdf8',
          fontFamily: 'monospace',
          fontSize: '13px',
          fontStyle: 'bold'
        })
        .setOrigin(0.5)
        .setVisible(false);

      bg.on('pointerdown', () => {
        setCalmBackgroundStyle(bgDef.id);
        playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
        this.toggleBgDropdown(false);
      });
      bg.on('pointerover', () => {
        bg.setFillStyle(0x1e293b, 0.98);
      });
      bg.on('pointerout', () => {
        this.refreshCalmBar();
      });

      this.bgDropdownList.add([bg, dot, label, check]);
      this.bgStyleButtons.set(bgDef.id, { bg, dot, label, check });
    });

    this.bgDropdownTrigger.on('pointerdown', () => {
      this.toggleBgDropdown(!this.bgDropdownOpen);
      playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    });
    this.bgDropdownTrigger.on('pointerover', () => {
      this.bgDropdownTrigger.setFillStyle(0x1e293b, 0.98);
    });
    this.bgDropdownTrigger.on('pointerout', () => {
      this.bgDropdownTrigger.setFillStyle(0x0f172a, 0.96);
    });
  }

  private toggleBgDropdown(open: boolean): void {
    this.bgDropdownOpen = open;
    this.bgDropdownBackdrop.setVisible(open);
    this.bgDropdownList.setVisible(open);
    this.bgDropdownChevron.setText(open ? '▴' : '▾');
  }

  private refreshCalmBar(): void {
    const activeId = calmStyleStore.getState().backgroundId;
    const activeDef = getCalmBackgroundDefinition(activeId);
    this.bgSubtitleText.setText(`${activeDef.label} · ${activeDef.subtitle}`);
    this.bgDropdownDot.setFillStyle(activeDef.accentHex, 1);
    this.bgDropdownLabel.setText(activeDef.label);
    this.bgDropdownTrigger.setStrokeStyle(1.5, activeDef.accentHex, 0.95);

    CALM_BACKGROUNDS.forEach((def) => {
      const entry = this.bgStyleButtons.get(def.id);
      if (!entry) {
        return;
      }
      const isSelected = def.id === activeId;
      entry.bg.setFillStyle(isSelected ? 0x172554 : 0x0f172a, isSelected ? 0.98 : 0.88);
      entry.label.setColor(isSelected ? '#ffffff' : '#cbd5e1');
      entry.check.setVisible(isSelected);
    });
  }

  private buildRosterGrid(): void {
    const { centerX } = this.cameras.main;
    const rows = Math.ceil(this.roster.length / GRID_COLS);
    const totalW = GRID_COLS * CARD_W + (GRID_COLS - 1) * CARD_GAP_X;
    const totalH = rows * CARD_H + (rows - 1) * CARD_GAP_Y;
    const startX = centerX - totalW / 2 + CARD_W / 2;
    const startY = 392 - totalH / 2 + CARD_H / 2;

    this.roster.forEach((character, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      const x = startX + col * (CARD_W + CARD_GAP_X);
      const y = startY + row * (CARD_H + CARD_GAP_Y);
      const meta = getMartialCharacterMeta(character.id);
      const accentInt = meta.discipline === 'judo' ? 0x38bdf8 : 0xf87171;

      const bg = this.add
        .rectangle(0, 0, CARD_W, CARD_H, 0x0f172a, 0.88)
        .setStrokeStyle(2, 0x334155, 1);

      const accentBar = this.add.rectangle(0, -CARD_H / 2 + 4, CARD_W - 6, 4, accentInt, 0.9);

      const children: Phaser.GameObjects.GameObject[] = [bg, accentBar];

      if (this.textures.exists(character.portrait.key)) {
        const portrait = this.add.image(0, -18, character.portrait.key).setOrigin(0.5);
        const maxSize = 86;
        const srcSize = Math.max(portrait.width, portrait.height) || maxSize;
        portrait.setScale(maxSize / srcSize);
        children.push(portrait);
      }

      const title = this.add
        .text(0, CARD_H / 2 - 33, character.label, {
          color: '#f8fafc',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '12px',
          align: 'center'
        })
        .setOrigin(0.5);

      const subtitle = this.add
        .text(0, CARD_H / 2 - 15, `${meta.country} · ${meta.discipline === 'judo' ? 'Judo' : 'Taekwondo'}`, {
          color: '#94a3b8',
          fontFamily: 'monospace',
          fontSize: '10px',
          align: 'center'
        })
        .setOrigin(0.5);

      const flash = this.add.rectangle(0, 0, CARD_W, CARD_H, 0xffffff, 0);

      children.push(title, subtitle, flash);

      const container = this.add.container(x, y, children).setDepth(15);

      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => this.hoverCard(index));
      bg.on('pointerdown', () => this.clickCard(index));

      this.cards.push({
        container,
        bg,
        accentBar,
        title,
        subtitle,
        flash,
        x,
        y
      });
    });
  }

  private buildCursors(): void {
    const p2Start = this.mode === '1v1' ? Math.min(1, Math.max(0, this.roster.length - 1)) : Math.min(4, Math.max(0, this.roster.length - 1));

    this.p1 = {
      index: 0,
      locked: false,
      style: { combat: 'balanced', suit: 'classic' },
      outline: this.add
        .rectangle(0, 0, CARD_W + 8, CARD_H + 8, P1_COLOR, 0)
        .setStrokeStyle(3.5, P1_COLOR, 1)
        .setDepth(25),
      badge: this.add
        .text(0, 0, 'P1', {
          color: '#020617',
          backgroundColor: P1_CSS,
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '11px',
          padding: { x: 5, y: 2 }
        })
        .setOrigin(0, 0.5)
        .setDepth(27)
    };

    this.p2 = {
      index: p2Start,
      locked: false,
      style: { combat: 'balanced', suit: 'classic' },
      outline: this.add
        .rectangle(0, 0, CARD_W + 8, CARD_H + 8, P2_COLOR, 0)
        .setStrokeStyle(3.5, P2_COLOR, 1)
        .setDepth(24),
      badge: this.add
        .text(0, 0, this.mode === '1vcpu' ? 'CPU' : 'P2', {
          color: '#ffffff',
          backgroundColor: P2_CSS,
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '11px',
          padding: { x: 5, y: 2 }
        })
        .setOrigin(1, 0.5)
        .setDepth(27)
    };

    if (this.mode === '1vcpu') {
      this.p2.outline.setVisible(false);
      this.p2.badge.setVisible(false);
    }
  }

  private refreshCursor(cursor: PlayerSelectionState): void {
    const card = this.cards[cursor.index];
    if (!card) {
      return;
    }

    const isP1 = cursor === this.p1;
    const color = isP1 ? P1_COLOR : P2_COLOR;
    const inflate = cursor.locked ? 10 : 6;
    cursor.outline.setPosition(card.x, card.y);
    cursor.outline.setSize(CARD_W + inflate, CARD_H + inflate);
    cursor.outline.setStrokeStyle(cursor.locked ? 5 : 3.5, color, 1);

    cursor.badge.setPosition(
      isP1 ? card.x - CARD_W / 2 - 2 : card.x + CARD_W / 2 + 2,
      card.y - CARD_H / 2 - 4
    );
  }

  private createSpotlightPanel(centerX: number, centerY: number, side: 'p1' | 'p2'): SpotlightPanelView {
    const W = 314;
    const H = 540;
    const isP1 = side === 'p1';
    const accent = isP1 ? P1_COLOR : P2_COLOR;
    const accentCss = isP1 ? P1_CSS : P2_CSS;

    const root = this.add.container(centerX, centerY).setDepth(30);

    const frame = this.add
      .rectangle(0, 0, W, H, 0x0b1220, 0.84)
      .setStrokeStyle(2, accent, 0.75);
    root.add(frame);

    const headerBadge = this.add
      .text(-W / 2 + 16, -H / 2 + 20, isP1 ? 'PLAYER 1' : this.mode === '1vcpu' ? 'CPU RIVAL' : 'PLAYER 2', {
        color: accentCss,
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '14px'
      })
      .setOrigin(0, 0.5);

    const statusText = this.add
      .text(W / 2 - 16, -H / 2 + 20, 'SELECTING', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '12px'
      })
      .setOrigin(1, 0.5);

    root.add([headerBadge, statusText]);

    // Portrait box
    const portraitY = -H / 2 + 96;
    const portraitFrame = this.add
      .rectangle(0, portraitY, 122, 122, 0x111827, 0.95)
      .setStrokeStyle(2, 0x334155, 1);
    const portrait = this.add.image(0, portraitY, this.roster[0]?.portrait.key ?? '').setFlipX(isP1);
    root.add([portraitFrame, portrait]);

    // Hero Name + Alias + Special
    const heroName = this.add
      .text(0, -H / 2 + 174, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '20px'
      })
      .setOrigin(0.5);

    const aliasTeam = this.add
      .text(0, -H / 2 + 195, '', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontSize: '11px'
      })
      .setOrigin(0.5);

    const archetypeText = this.add
      .text(0, -H / 2 + 212, '', {
        color: accentCss,
        fontFamily: 'monospace',
        fontSize: '11px'
      })
      .setOrigin(0.5);

    const specialText = this.add
      .text(0, -H / 2 + 229, '', {
        color: '#fde047',
        fontFamily: 'monospace',
        fontSize: '11px'
      })
      .setOrigin(0.5);

    root.add([heroName, aliasTeam, archetypeText, specialText]);

    // Stat Bars
    const statBarW = 176;
    const makeStatRow = (label: string, y: number, color: number) => {
      const lbl = this.add
        .text(-W / 2 + 18, y, label, {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '11px'
        })
        .setOrigin(0, 0.5);
      const track = this.add.rectangle(-W / 2 + 54, y, statBarW, 8, 0x1e293b, 1).setOrigin(0, 0.5);
      const fill = this.add.rectangle(-W / 2 + 54, y, statBarW * 0.5, 8, color, 1).setOrigin(0, 0.5);
      const val = this.add
        .text(W / 2 - 18, y, '80', {
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: '11px'
        })
        .setOrigin(1, 0.5);
      root.add([lbl, track, fill, val]);
      return { fill, val };
    };

    const spd = makeStatRow('SPD', -H / 2 + 258, 0x34d399);
    const pwr = makeStatRow('PWR', -H / 2 + 276, 0xfb923c);
    const vit = makeStatRow('VIT', -H / 2 + 294, 0x60a5fa);

    // Combat Style section
    root.add(
      this.add
        .text(-W / 2 + 18, -H / 2 + 322, 'COMBAT STYLE', {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '11px'
        })
        .setOrigin(0, 0.5)
    );

    const styleDesc = this.add
      .text(W / 2 - 18, -H / 2 + 322, '', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontSize: '10px'
      })
      .setOrigin(1, 0.5);
    root.add(styleDesc);

    const combatButtons = new Map<CombatStyleId, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
    const cbW = 134;
    const cbH = 28;
    COMBAT_STYLES.forEach((st, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const bx = (col === 0 ? -1 : 1) * (cbW / 2 + 6);
      const by = -H / 2 + 350 + row * (cbH + 8);
      const bg = this.add
        .rectangle(bx, by, cbW, cbH, 0x111827, 0.95)
        .setStrokeStyle(1.5, 0x334155, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(bx, by, st.label, {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontSize: '12px',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (this.transitioning) {
          return;
        }
        const target = isP1 ? this.p1 : this.p2;
        if (target.locked) {
          return;
        }
        if (!isP1) {
          this.p2StyleTouched = true;
        }
        target.style.combat = st.id;
        playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
        this.refreshPanel(side);
      });

      root.add([bg, label]);
      combatButtons.set(st.id, { bg, label });
    });

    // Uniform Tone section
    root.add(
      this.add
        .text(-W / 2 + 18, -H / 2 + 422, 'UNIFORM TONE', {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '11px'
        })
        .setOrigin(0, 0.5)
    );

    const suitButtons = new Map<SuitStyleId, { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }>();
    const sbW = 88;
    const sbH = 26;
    SUIT_STYLES.forEach((suit, idx) => {
      const bx = (idx - 1) * (sbW + 8);
      const by = -H / 2 + 448;
      const bg = this.add
        .rectangle(bx, by, sbW, sbH, 0x111827, 0.95)
        .setStrokeStyle(1.5, 0x334155, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(bx, by, suit.label, {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontSize: '11px',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);

      bg.on('pointerdown', () => {
        if (this.transitioning) {
          return;
        }
        const target = isP1 ? this.p1 : this.p2;
        if (target.locked) {
          return;
        }
        if (!isP1) {
          this.p2StyleTouched = true;
        }
        target.style.suit = suit.id;
        playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
        this.refreshPanel(side);
      });

      root.add([bg, label]);
      suitButtons.set(suit.id, { bg, label });
    });

    // Lock In Button
    const lockBtnY = H / 2 - 34;
    const lockBtnBg = this.add
      .rectangle(0, lockBtnY, W - 36, 38, accent, 0.18)
      .setStrokeStyle(2, accent, 1)
      .setInteractive({ useHandCursor: true });
    const lockBtnText = this.add
      .text(0, lockBtnY, isP1 ? 'LOCK IN P1' : this.mode === '1vcpu' ? 'AUTO-PICK CPU' : 'LOCK IN P2', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '14px'
      })
      .setOrigin(0.5);

    lockBtnBg.on('pointerdown', () => {
      if (this.transitioning) {
        return;
      }
      if (isP1) {
        this.confirmPlayer(this.p1);
      } else if (this.mode === '1v1') {
        this.confirmPlayer(this.p2);
      }
    });

    root.add([lockBtnBg, lockBtnText]);

    return {
      root,
      headerBadge,
      statusText,
      portrait,
      portraitFrame,
      heroName,
      aliasTeam,
      archetypeText,
      specialText,
      spdFill: spd.fill,
      pwrFill: pwr.fill,
      vitFill: vit.fill,
      spdVal: spd.val,
      pwrVal: pwr.val,
      vitVal: vit.val,
      styleDesc,
      combatButtons,
      suitButtons,
      lockBtnBg,
      lockBtnText
    };
  }

  private refreshPanel(side: 'p1' | 'p2'): void {
    const isP1 = side === 'p1';
    const cursor = isP1 ? this.p1 : this.p2;
    const panel = isP1 ? this.p1Panel : this.p2Panel;
    const char = this.roster[cursor.index];
    if (!char) {
      return;
    }

    const meta = getMartialCharacterMeta(char.id);
    const combatDef = getCombatStyleDefinition(cursor.style.combat);
    const suitDef = getSuitStyleDefinition(cursor.style.suit);
    const accent = isP1 ? P1_COLOR : P2_COLOR;

    if (this.textures.exists(char.portrait.key)) {
      panel.portrait.setTexture(char.portrait.key).setVisible(true);
      const maxSize = 112;
      const srcSize = Math.max(panel.portrait.width, panel.portrait.height) || maxSize;
      panel.portrait.setScale(maxSize / srcSize);
      panel.portrait.clearTint();
      panel.portraitFrame.setStrokeStyle(2, suitDef.tint, 1);
    } else {
      panel.portrait.setVisible(false);
    }

    const waitingCpu = !isP1 && this.mode === '1vcpu' && !this.p1.locked && !cursor.locked;
    panel.statusText.setText(cursor.locked ? 'LOCKED IN' : waitingCpu ? 'CPU READY' : 'SELECTING');
    panel.statusText.setColor(cursor.locked ? '#4ade80' : '#94a3b8');

    panel.heroName.setText(char.label.toUpperCase());
    panel.aliasTeam.setText(`${meta.country} · ${meta.division}`);
    panel.archetypeText.setText(meta.archetype);
    panel.specialText.setText(`SIGNATURE: ${meta.specialName}`);

    // Compute displayed stat bars adjusted by selected Combat Style
    const spd = Phaser.Math.Clamp(Math.round(meta.statBars.speed * combatDef.speedMult), 25, 100);
    const pwr = Phaser.Math.Clamp(Math.round(meta.statBars.power * combatDef.damageMult), 25, 100);
    const vit = Phaser.Math.Clamp(Math.round(meta.statBars.vitality * combatDef.healthMult), 25, 100);
    const barW = 176;

    panel.spdFill.setSize(Math.round((spd / 100) * barW), 8);
    panel.pwrFill.setSize(Math.round((pwr / 100) * barW), 8);
    panel.vitFill.setSize(Math.round((vit / 100) * barW), 8);
    panel.spdVal.setText(String(spd));
    panel.pwrVal.setText(String(pwr));
    panel.vitVal.setText(String(vit));

    panel.styleDesc.setText(combatDef.shortDesc);
    panel.styleDesc.setColor(combatDef.accentCss);

    COMBAT_STYLES.forEach((st) => {
      const btn = panel.combatButtons.get(st.id);
      if (!btn) {
        return;
      }
      const selected = cursor.style.combat === st.id;
      btn.bg.setFillStyle(selected ? 0x1e293b : 0x111827, 0.96);
      btn.bg.setStrokeStyle(selected ? 2 : 1, selected ? st.accentHex : 0x334155, 1);
      btn.label.setColor(selected ? '#ffffff' : '#94a3b8');
    });

    SUIT_STYLES.forEach((suit) => {
      const btn = panel.suitButtons.get(suit.id);
      if (!btn) {
        return;
      }
      const selected = cursor.style.suit === suit.id;
      btn.bg.setFillStyle(selected ? 0x1e293b : 0x111827, 0.96);
      btn.bg.setStrokeStyle(selected ? 2 : 1, selected ? accent : 0x334155, 1);
      btn.label.setColor(selected ? '#ffffff' : '#94a3b8');
    });

    if (!isP1 && this.mode === '1vcpu') {
      panel.lockBtnBg.setFillStyle(0x1e293b, 0.45).setStrokeStyle(1, 0x334155, 0.8);
      panel.lockBtnText.setText(cursor.locked ? 'CPU LOCKED' : 'CPU AUTO-MATCHES');
      panel.lockBtnText.setColor(cursor.locked ? '#4ade80' : '#94a3b8');
    } else {
      panel.lockBtnBg
        .setFillStyle(cursor.locked ? 0x16a34a : accent, cursor.locked ? 0.32 : 0.18)
        .setStrokeStyle(2, cursor.locked ? 0x4ade80 : accent, 1);
      panel.lockBtnText.setText(cursor.locked ? 'READY!' : isP1 ? 'LOCK IN P1' : 'LOCK IN P2');
    }
  }

  private registerInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    if (this.mode === '1v1') {
      keyboard.on('keydown-A', () => this.moveCursor(this.p1, -1, 0));
      keyboard.on('keydown-D', () => this.moveCursor(this.p1, 1, 0));
      keyboard.on('keydown-W', () => this.moveCursor(this.p1, 0, -1));
      keyboard.on('keydown-S', () => this.moveCursor(this.p1, 0, 1));
      keyboard.on('keydown-SPACE', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-F', () => this.confirmPlayer(this.p1));

      keyboard.on('keydown-LEFT', () => this.moveCursor(this.p2, -1, 0));
      keyboard.on('keydown-RIGHT', () => this.moveCursor(this.p2, 1, 0));
      keyboard.on('keydown-UP', () => this.moveCursor(this.p2, 0, -1));
      keyboard.on('keydown-DOWN', () => this.moveCursor(this.p2, 0, 1));
      keyboard.on('keydown-ENTER', () => this.confirmPlayer(this.p2));
    } else {
      keyboard.on('keydown-A', () => this.moveCursor(this.p1, -1, 0));
      keyboard.on('keydown-LEFT', () => this.moveCursor(this.p1, -1, 0));
      keyboard.on('keydown-D', () => this.moveCursor(this.p1, 1, 0));
      keyboard.on('keydown-RIGHT', () => this.moveCursor(this.p1, 1, 0));
      keyboard.on('keydown-W', () => this.moveCursor(this.p1, 0, -1));
      keyboard.on('keydown-UP', () => this.moveCursor(this.p1, 0, -1));
      keyboard.on('keydown-S', () => this.moveCursor(this.p1, 0, 1));
      keyboard.on('keydown-DOWN', () => this.moveCursor(this.p1, 0, 1));
      keyboard.on('keydown-SPACE', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-F', () => this.confirmPlayer(this.p1));
      keyboard.on('keydown-ENTER', () => this.confirmPlayer(this.p1));
    }

    // Quick style shortcuts
    keyboard.on('keydown-Q', () => this.cycleCalmBackground(-1));
    keyboard.on('keydown-E', () => this.cycleCalmBackground(1));
    keyboard.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
      this.cycleCombatStyle(this.p1, 'p1');
    });
    keyboard.on('keydown-ONE', () => this.setCombatStyleByIndex(this.p1, 'p1', 0));
    keyboard.on('keydown-TWO', () => this.setCombatStyleByIndex(this.p1, 'p1', 1));
    keyboard.on('keydown-THREE', () => this.setCombatStyleByIndex(this.p1, 'p1', 2));
    keyboard.on('keydown-FOUR', () => this.setCombatStyleByIndex(this.p1, 'p1', 3));

    keyboard.on('keydown-ESC', () => this.goBack());
    keyboard.on('keydown-BACKSPACE', () => this.goBack());
  }

  private cycleCalmBackground(delta: number): void {
    const currentId = calmStyleStore.getState().backgroundId;
    const idx = CALM_BACKGROUNDS.findIndex((b) => b.id === currentId);
    const nextIdx = Phaser.Math.Wrap((idx === -1 ? 0 : idx) + delta, 0, CALM_BACKGROUNDS.length);
    setCalmBackgroundStyle(CALM_BACKGROUNDS[nextIdx].id);
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private cycleCombatStyle(cursor: PlayerSelectionState, side: 'p1' | 'p2'): void {
    if (this.transitioning || cursor.locked) {
      return;
    }
    const idx = COMBAT_STYLES.findIndex((s) => s.id === cursor.style.combat);
    const nextIdx = Phaser.Math.Wrap(idx + 1, 0, COMBAT_STYLES.length);
    cursor.style.combat = COMBAT_STYLES[nextIdx].id;
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    this.refreshPanel(side);
  }

  private setCombatStyleByIndex(cursor: PlayerSelectionState, side: 'p1' | 'p2', idx: number): void {
    if (this.transitioning || cursor.locked || !COMBAT_STYLES[idx]) {
      return;
    }
    cursor.style.combat = COMBAT_STYLES[idx].id;
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    this.refreshPanel(side);
  }

  private moveCursor(cursor: PlayerSelectionState, dx: number, dy: number): void {
    if (this.transitioning || cursor.locked || this.roster.length === 0) {
      return;
    }

    const count = this.roster.length;
    const rows = Math.ceil(count / GRID_COLS);
    const curCol = cursor.index % GRID_COLS;
    const curRow = Math.floor(cursor.index / GRID_COLS);

    let nextCol = Phaser.Math.Wrap(curCol + dx, 0, GRID_COLS);
    let nextRow = Phaser.Math.Wrap(curRow + dy, 0, rows);
    let next = nextRow * GRID_COLS + nextCol;

    if (next >= count) {
      next = dy !== 0 ? Math.min(curCol, count - 1) : dx > 0 ? nextRow * GRID_COLS : count - 1;
    }

    const other = cursor === this.p1 ? this.p2 : this.p1;
    if (this.mode === '1v1' && next === other.index) {
      if (dx !== 0) {
        nextCol = Phaser.Math.Wrap(nextCol + dx, 0, GRID_COLS);
        const hop = nextRow * GRID_COLS + nextCol;
        next = hop < count ? hop : Phaser.Math.Wrap(next + dx, 0, count);
      } else if (dy !== 0) {
        nextRow = Phaser.Math.Wrap(nextRow + dy, 0, rows);
        const hop = nextRow * GRID_COLS + nextCol;
        next = hop < count ? hop : Phaser.Math.Wrap(next + 1, 0, count);
      }
      if (next === other.index) {
        next = Phaser.Math.Wrap(next + 1, 0, count);
      }
    }

    cursor.index = next;
    this.refreshCursor(cursor);
    this.refreshPanel(cursor === this.p1 ? 'p1' : 'p2');
  }

  private hoverCard(index: number): void {
    if (this.transitioning) {
      return;
    }
    if (this.mode === '1vcpu') {
      if (this.p1.locked) {
        return;
      }
      this.p1.index = index;
      this.refreshCursor(this.p1);
      this.refreshPanel('p1');
      return;
    }

    // In 1v1, hovering updates whichever unlocked player isn't blocked by the other's card
    if (!this.p1.locked && index !== this.p2.index) {
      this.p1.index = index;
      this.refreshCursor(this.p1);
      this.refreshPanel('p1');
    } else if (this.p1.locked && !this.p2.locked && index !== this.p1.index) {
      this.p2.index = index;
      this.refreshCursor(this.p2);
      this.refreshPanel('p2');
    }
  }

  private clickCard(index: number): void {
    if (this.transitioning) {
      return;
    }
    if (this.mode === '1vcpu') {
      if (this.p1.locked) {
        return;
      }
      this.p1.index = index;
      this.refreshCursor(this.p1);
      this.refreshPanel('p1');
      this.confirmPlayer(this.p1);
      return;
    }

    // In 1v1, allow mouse click to select & lock whichever unlocked side clicked
    if (!this.p1.locked && index !== this.p2.index) {
      this.p1.index = index;
      this.refreshCursor(this.p1);
      this.refreshPanel('p1');
      this.confirmPlayer(this.p1);
    } else if (!this.p2.locked && index !== this.p1.index) {
      this.p2.index = index;
      this.refreshCursor(this.p2);
      this.refreshPanel('p2');
      this.confirmPlayer(this.p2);
    }
  }

  private flashCardLock(index: number, onComplete: () => void): void {
    const card = this.cards[index];
    if (!card) {
      onComplete();
      return;
    }
    this.tweens.add({
      targets: card.flash,
      alpha: { from: 0, to: 0.78 },
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        card.flash.setAlpha(0);
        onComplete();
      }
    });
  }

  private confirmPlayer(cursor: PlayerSelectionState): void {
    if (this.transitioning || cursor.locked) {
      return;
    }

    cursor.locked = true;
    this.refreshCursor(cursor);
    this.refreshPanel(cursor === this.p1 ? 'p1' : 'p2');
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());

    this.flashCardLock(cursor.index, () => {
      if (this.mode === '1vcpu') {
        this.runCpuSelection();
        return;
      }

      if (this.p1.locked && this.p2.locked) {
        this.startMatch();
      }
    });
  }

  private runCpuSelection(): void {
    if (this.transitioning) {
      return;
    }

    this.transitioning = true;

    const choices = this.roster.map((_, index) => index).filter((index) => index !== this.p1.index);
    const cpuIndex = choices.length > 0 ? Phaser.Math.RND.pick(choices) : this.p1.index;

    this.p2.index = cpuIndex;
    if (!this.p2StyleTouched) {
      this.p2.style = {
        combat: Phaser.Math.RND.pick(COMBAT_STYLES).id,
        suit: Phaser.Math.RND.pick(SUIT_STYLES).id
      };
    }

    this.p2.outline.setVisible(true);
    this.p2.badge.setVisible(true);
    this.p2.badge.setText('CPU');
    this.refreshCursor(this.p2);
    this.refreshPanel('p2');

    this.time.delayedCall(450, () => {
      this.p2.locked = true;
      this.refreshCursor(this.p2);
      this.refreshPanel('p2');
      playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
      this.flashCardLock(cpuIndex, () => this.startMatch());
    });
  }

  private startMatch(): void {
    if (this.transitioning && this.mode === '1v1') {
      return;
    }

    this.transitioning = true;

    this.scene.start(SCENE_KEYS.Match, {
      mode: this.mode,
      stageId: this.stageId,
      p1CharacterId: this.roster[this.p1.index].id,
      p2CharacterId: this.roster[this.p2.index].id,
      p1Style: { ...this.p1.style },
      p2Style: { ...this.p2.style },
      calmBackgroundId: calmStyleStore.getState().backgroundId
    });
  }

  private goBack(): void {
    if (this.transitioning) {
      return;
    }

    this.scene.start(SCENE_KEYS.LevelSelect, { mode: this.mode });
  }
}
