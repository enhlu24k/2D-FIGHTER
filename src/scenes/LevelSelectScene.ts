import * as Phaser from 'phaser';

import { calmStyleStore } from '../game/calmStyles';
import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { STAGE_DEFINITIONS } from '../game/stageConfig';
import { createSelectionCard, type SelectionCard } from '../game/ui';
import { SCENE_KEYS, type MatchMode } from '../game/types';
import { BaseScene } from './BaseScene';

interface LevelSelectData {
  mode: MatchMode;
}

const ACCENT = 0xfacc15;

/**
 * Second step of the Play flow: pick the stage for the match. Shows each stage
 * as a thumbnail card and forwards the selection to character select.
 */
export class LevelSelectScene extends BaseScene {
  private mode: MatchMode = '1v1';
  private cards: SelectionCard[] = [];
  private selectedIndex = 0;

  constructor() {
    super(SCENE_KEYS.LevelSelect);
  }

  init(data: LevelSelectData): void {
    this.mode = data?.mode ?? '1v1';
  }

  create(): void {
    this.cards = [];
    const activeBg = calmStyleStore.getState().backgroundId;
    const matchingIndex = STAGE_DEFINITIONS.findIndex((s) => s.id === activeBg);
    this.selectedIndex = matchingIndex >= 0 ? matchingIndex : 0;

    this.markActiveScene(SCENE_KEYS.LevelSelect);
    this.cameras.main.setBackgroundColor(0x0b1220);
    this.mountCalmBackdrop();
    this.createHeading('Select Arena', this.mode === '1v1' ? '1 vs 1' : '1 vs CPU');

    this.buildCards();
    this.registerInput();
    this.setSelection(this.selectedIndex);

    this.createFooterHint('WASD / Arrows to choose • Enter / Space to confirm • Esc to go back');

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cards.forEach((card) => card.destroy());
      this.cards = [];
    });
  }

  private buildCards(): void {
    const { centerX, centerY } = this.cameras.main;
    const cols = 3;
    const cardWidth = 296;
    const cardHeight = 160;
    const gapX = 26;
    const gapY = 16;
    const rows = Math.ceil(STAGE_DEFINITIONS.length / cols);
    const totalWidth = cardWidth * cols + gapX * (cols - 1);
    const totalHeight = cardHeight * rows + gapY * (rows - 1);
    const startX = centerX - totalWidth / 2 + cardWidth / 2;
    const startY = centerY + 18 - totalHeight / 2 + cardHeight / 2;

    STAGE_DEFINITIONS.forEach((stage, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const card = createSelectionCard(this, {
        x: startX + col * (cardWidth + gapX),
        y: startY + row * (cardHeight + gapY),
        width: cardWidth,
        height: cardHeight,
        title: stage.label,
        texture: this.textures.exists(stage.key) ? stage.key : undefined,
        imageMaxSize: cardWidth - 44,
        imageOffsetY: -18,
        onHover: () => this.setSelection(index),
        onClick: () => this.confirm(index)
      });

      this.cards.push(card);
    });
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
    keyboard.on('keydown-UP', () => this.moveSelection(-3));
    keyboard.on('keydown-W', () => this.moveSelection(-3));
    keyboard.on('keydown-DOWN', () => this.moveSelection(3));
    keyboard.on('keydown-S', () => this.moveSelection(3));
    keyboard.on('keydown-ENTER', () => this.confirm(this.selectedIndex));
    keyboard.on('keydown-SPACE', () => this.confirm(this.selectedIndex));
    keyboard.on('keydown-ESC', () => this.scene.start(SCENE_KEYS.ModeSelect));
    keyboard.on('keydown-BACKSPACE', () => this.scene.start(SCENE_KEYS.ModeSelect));
  }

  private moveSelection(direction: number): void {
    const next = Phaser.Math.Wrap(this.selectedIndex + direction, 0, this.cards.length);
    this.setSelection(next);
  }

  private setSelection(index: number): void {
    this.selectedIndex = index;
    this.cards.forEach((card, cardIndex) => card.setSelected(cardIndex === index, ACCENT));
  }

  private confirm(index: number): void {
    this.setSelection(index);
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
    this.scene.start(SCENE_KEYS.CharacterSelect, {
      mode: this.mode,
      stageId: STAGE_DEFINITIONS[index].id
    });
  }
}
