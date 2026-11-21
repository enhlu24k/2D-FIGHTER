import * as Phaser from 'phaser';

import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { createSelectionCard, type SelectionCard } from '../game/ui';
import { SCENE_KEYS, type CpuDifficulty, type MatchMode } from '../game/types';
import { BaseScene } from './BaseScene';

interface ModeOption {
  mode: MatchMode;
  title: string;
  subtitle: string;
  texture: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { mode: '1v1', title: '1 VS 1', subtitle: 'Two players, one keyboard', texture: 'mode-card-1v1' },
  { mode: '1vcpu', title: '1 VS CPU', subtitle: 'You pick, the CPU answers', texture: 'mode-card-1vcpu' }
];

const DIFFICULTIES: Array<{
  id: CpuDifficulty;
  label: string;
  hint: string;
  colorHex: number;
  colorCss: string;
}> = [
  { id: 'easy', label: 'EASY', hint: 'Relaxed pace & light pressure', colorHex: 0x34d399, colorCss: '#34d399' },
  { id: 'normal', label: 'NORMAL', hint: 'Balanced footwork & counters', colorHex: 0x38bdf8, colorCss: '#38bdf8' },
  { id: 'hard', label: 'HARD', hint: 'Fast reactions & combo aggression', colorHex: 0xfb7185, colorCss: '#fb7185' }
];

const ACCENT = 0x38bdf8;

/**
 * First step of the Play flow: choose a local two-player match or a single
 * player versus CPU match. Includes a live Difficulty toggle persisted to
 * settings and forwards the chosen mode to the level select screen.
 */
export class ModeSelectScene extends BaseScene {
  private cards: SelectionCard[] = [];
  private selectedIndex = 0;

  private diffBg!: Phaser.GameObjects.Rectangle;
  private diffBadge!: Phaser.GameObjects.Rectangle;
  private diffValueText!: Phaser.GameObjects.Text;
  private diffHintText!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENE_KEYS.ModeSelect);
  }

  create(): void {
    this.cards = [];
    this.selectedIndex = 0;

    this.markActiveScene(SCENE_KEYS.ModeSelect);
    this.cameras.main.setBackgroundColor(0x0b1220);
    this.mountCalmBackdrop();
    this.createHeading('Select Mode', 'How do you want to play?');

    this.buildCards();
    this.buildDifficultyButton();
    this.registerInput();
    this.setSelection(0);

    const unsubscribeSettings = this.app.settingsStore.subscribe(() => {
      this.refreshDifficultyButton();
    });

    this.createFooterHint('← → choose mode • ↑ ↓ / Tab / Click Difficulty • Enter confirm • Esc back');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeSettings();
      this.cards.forEach((card) => card.destroy());
      this.cards = [];
    });
  }

  private buildCards(): void {
    const { centerX, centerY } = this.cameras.main;
    const cardWidth = 320;
    const cardHeight = 260;
    const gap = 60;
    const totalWidth = cardWidth * MODE_OPTIONS.length + gap * (MODE_OPTIONS.length - 1);
    const startX = centerX - totalWidth / 2 + cardWidth / 2;

    MODE_OPTIONS.forEach((option, index) => {
      const card = createSelectionCard(this, {
        x: startX + index * (cardWidth + gap),
        y: centerY - 12,
        width: cardWidth,
        height: cardHeight,
        title: option.title,
        subtitle: option.subtitle,
        texture: option.texture,
        imageMaxSize: 168,
        imageOffsetY: -46,
        onHover: () => this.setSelection(index),
        onClick: () => this.confirm(index)
      });

      this.cards.push(card);
    });
  }

  private buildDifficultyButton(): void {
    const { centerX, centerY } = this.cameras.main;
    const y = centerY + 178;
    const btnW = 430;
    const btnH = 56;

    this.diffBg = this.add
      .rectangle(centerX, y, btnW, btnH, 0x0f172a, 0.94)
      .setStrokeStyle(2, ACCENT, 0.85)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(centerX - btnW / 2 + 22, y - 8, 'CPU DIFFICULTY', {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '15px'
      })
      .setOrigin(0, 0.5);

    this.diffHintText = this.add
      .text(centerX - btnW / 2 + 22, y + 12, '', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontSize: '11px'
      })
      .setOrigin(0, 0.5);

    this.diffBadge = this.add
      .rectangle(centerX + btnW / 2 - 72, y, 114, 32, 0x1e293b, 1)
      .setStrokeStyle(2, ACCENT, 1);

    this.diffValueText = this.add
      .text(centerX + btnW / 2 - 72, y, '', {
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '15px'
      })
      .setOrigin(0.5);

    // Keep text cleanly layered
    label.setDepth(5);
    this.diffHintText.setDepth(5);
    this.diffBadge.setDepth(5);
    this.diffValueText.setDepth(6);

    this.diffBg.on('pointerover', () => {
      this.diffBg.setFillStyle(0x16223a, 0.98);
    });
    this.diffBg.on('pointerout', () => {
      this.diffBg.setFillStyle(0x0f172a, 0.94);
    });
    this.diffBg.on('pointerdown', () => {
      this.cycleDifficulty(1);
    });

    this.refreshDifficultyButton();
  }

  private cycleDifficulty(delta: number): void {
    const current = this.app.settingsStore.getState().difficulty;
    const idx = Math.max(
      0,
      DIFFICULTIES.findIndex((d) => d.id === current)
    );
    const next = DIFFICULTIES[Phaser.Math.Wrap(idx + delta, 0, DIFFICULTIES.length)];
    this.app.settingsStore.patchState({ difficulty: next.id });
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private refreshDifficultyButton(): void {
    const current = this.app.settingsStore.getState().difficulty;
    const def = DIFFICULTIES.find((d) => d.id === current) ?? DIFFICULTIES[1];
    const isCpu = MODE_OPTIONS[this.selectedIndex]?.mode === '1vcpu';

    this.diffBg.setStrokeStyle(isCpu ? 2.5 : 1.5, def.colorHex, isCpu ? 1 : 0.65);
    this.diffBadge.setStrokeStyle(2, def.colorHex, 1);
    this.diffValueText.setText(`◀ ${def.label} ▶`).setColor(def.colorCss);
    this.diffHintText.setText(isCpu ? def.hint : `${def.hint} (applies to 1 vs CPU)`);
  }

  private registerInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.on('keydown-LEFT', () => this.moveSelection(-1));
    keyboard.on('keydown-A', () => this.moveSelection(-1));
    keyboard.on('keydown-RIGHT', () => this.moveSelection(1));
    keyboard.on('keydown-D', () => this.moveSelection(1));
    keyboard.on('keydown-UP', () => this.cycleDifficulty(-1));
    keyboard.on('keydown-W', () => this.cycleDifficulty(-1));
    keyboard.on('keydown-DOWN', () => this.cycleDifficulty(1));
    keyboard.on('keydown-S', () => this.cycleDifficulty(1));
    keyboard.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
      this.cycleDifficulty(1);
    });
    keyboard.on('keydown-ENTER', () => this.confirm(this.selectedIndex));
    keyboard.on('keydown-SPACE', () => this.confirm(this.selectedIndex));
    keyboard.on('keydown-ESC', () => this.goToMenu());
    keyboard.on('keydown-BACKSPACE', () => this.goToMenu());
  }

  private moveSelection(direction: number): void {
    const next = Phaser.Math.Wrap(this.selectedIndex + direction, 0, this.cards.length);
    this.setSelection(next);
  }

  private setSelection(index: number): void {
    this.selectedIndex = index;
    this.cards.forEach((card, cardIndex) => card.setSelected(cardIndex === index, ACCENT));
    this.refreshDifficultyButton();
  }

  private confirm(index: number): void {
    this.setSelection(index);
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    this.scene.start(SCENE_KEYS.LevelSelect, { mode: MODE_OPTIONS[index].mode });
  }
}
