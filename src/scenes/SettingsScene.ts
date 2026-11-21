import * as Phaser from 'phaser';

import {
  CALM_BACKGROUNDS,
  calmStyleStore,
  getCalmBackgroundDefinition,
  setCalmBackgroundStyle
} from '../game/calmStyles';
import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { DEFAULT_SETTINGS } from '../game/settings';
import { SCENE_KEYS, type CpuDifficulty } from '../game/types';
import { createTextButton, type TextButton } from '../game/ui';
import { BaseScene } from './BaseScene';

const ROW_COUNT = 7;
const DIFFICULTY_ORDER: CpuDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABELS: Record<CpuDifficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard'
};

export class SettingsScene extends BaseScene {
  private sfxValue!: Phaser.GameObjects.Text;
  private musicValue!: Phaser.GameObjects.Text;
  private muteValue!: Phaser.GameObjects.Text;
  private difficultyValue!: Phaser.GameObjects.Text;

  private sfxDownButton!: TextButton;
  private sfxUpButton!: TextButton;
  private musicDownButton!: TextButton;
  private musicUpButton!: TextButton;
  private muteButton!: TextButton;
  private difficultyButton!: TextButton;
  private resetButton!: TextButton;
  private backButton!: TextButton;

  private dojoTriggerBg!: Phaser.GameObjects.Rectangle;
  private dojoTriggerDot!: Phaser.GameObjects.Arc;
  private dojoTriggerLabel!: Phaser.GameObjects.Text;
  private dojoTriggerChevron!: Phaser.GameObjects.Text;
  private dojoSubtitle!: Phaser.GameObjects.Text;

  private dropdownOpen = false;
  private dropdownContainer!: Phaser.GameObjects.Container;
  private dropdownBackdrop!: Phaser.GameObjects.Zone;
  private dropdownItems: Array<{
    id: string;
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    check: Phaser.GameObjects.Text;
  }> = [];

  private selectedRow = 0;

  constructor() {
    super(SCENE_KEYS.Settings);
  }

  create(): void {
    this.dropdownOpen = false;
    this.dropdownItems = [];
    this.selectedRow = 0;

    this.markActiveScene(SCENE_KEYS.Settings);
    this.cameras.main.setBackgroundColor(0x0b1220);
    this.mountCalmBackdrop(undefined, 0.34);
    this.createHeading('Settings', 'Audio, Difficulty & Dojo Background');

    const { centerX, centerY, width, height } = this.cameras.main;
    const panel = this.add.image(centerX, centerY + 14, 'ui-panel');
    panel.setDisplaySize(660, 560);

    const leftX = centerX - 275;
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#e2e8f0',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      fontSize: '20px'
    };

    const rowY = [164, 222, 280, 338, 404, 488, 548];
    const halfBtnW = 128;
    const smallBtnH = 44;

    this.sfxValue = this.add.text(leftX, rowY[0], '', labelStyle).setOrigin(0, 0.5);
    this.musicValue = this.add.text(leftX, rowY[1], '', labelStyle).setOrigin(0, 0.5);
    this.muteValue = this.add.text(leftX, rowY[2], '', labelStyle).setOrigin(0, 0.5);
    this.difficultyValue = this.add.text(leftX, rowY[3], '', labelStyle).setOrigin(0, 0.5);

    this.add.text(leftX, rowY[4] - 9, 'Dojo Setting', labelStyle).setOrigin(0, 0.5);
    this.dojoSubtitle = this.add
      .text(leftX, rowY[4] + 15, '', {
        color: '#94a3b8',
        fontFamily: 'monospace',
        fontSize: '12px'
      })
      .setOrigin(0, 0.5);

    this.sfxDownButton = createTextButton(this, {
      x: centerX + 52,
      y: rowY[0],
      width: halfBtnW,
      height: smallBtnH,
      label: 'SFX -',
      onClick: () => this.changeVolume('sfx', -0.1),
      onHover: () => this.setSelection(0)
    });

    this.sfxUpButton = createTextButton(this, {
      x: centerX + 194,
      y: rowY[0],
      width: halfBtnW,
      height: smallBtnH,
      label: 'SFX +',
      onClick: () => this.changeVolume('sfx', 0.1),
      onHover: () => this.setSelection(0)
    });

    this.musicDownButton = createTextButton(this, {
      x: centerX + 52,
      y: rowY[1],
      width: halfBtnW,
      height: smallBtnH,
      label: 'Music -',
      onClick: () => this.changeVolume('music', -0.1),
      onHover: () => this.setSelection(1)
    });

    this.musicUpButton = createTextButton(this, {
      x: centerX + 194,
      y: rowY[1],
      width: halfBtnW,
      height: smallBtnH,
      label: 'Music +',
      onClick: () => this.changeVolume('music', 0.1),
      onHover: () => this.setSelection(1)
    });

    this.muteButton = createTextButton(this, {
      x: centerX + 123,
      y: rowY[2],
      width: 270,
      height: smallBtnH,
      label: 'Toggle mute',
      onClick: () => this.toggleMute(),
      onHover: () => this.setSelection(2)
    });

    this.difficultyButton = createTextButton(this, {
      x: centerX + 123,
      y: rowY[3],
      width: 270,
      height: smallBtnH,
      label: 'Cycle difficulty',
      onClick: () => this.cycleDifficulty(1),
      onHover: () => this.setSelection(3)
    });

    // Interactive Realistic Dojo Background Dropdown
    const dropX = centerX + 123;
    const dropY = rowY[4];
    const dropW = 290;
    const dropH = 46;

    this.dojoTriggerBg = this.add
      .rectangle(dropX, dropY, dropW, dropH, 0x0f172a, 0.96)
      .setStrokeStyle(2, 0x475569, 1)
      .setInteractive({ useHandCursor: true })
      .setDepth(20);

    this.dojoTriggerDot = this.add
      .circle(dropX - dropW / 2 + 18, dropY, 6, 0x86efac, 1)
      .setDepth(21);

    this.dojoTriggerLabel = this.add
      .text(dropX - dropW / 2 + 34, dropY, '', {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '15px'
      })
      .setOrigin(0, 0.5)
      .setDepth(21);

    this.dojoTriggerChevron = this.add
      .text(dropX + dropW / 2 - 16, dropY, '▾', {
        color: '#cbd5e1',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '18px'
      })
      .setOrigin(0.5)
      .setDepth(21);

    this.dojoTriggerBg.on('pointerover', () => {
      this.setSelection(4);
    });
    this.dojoTriggerBg.on('pointerdown', () => {
      this.setSelection(4);
      this.toggleDropdown();
    });

    // Click-outside catcher and dropdown list
    this.dropdownBackdrop = this.add
      .zone(centerX, centerY, width, height)
      .setInteractive()
      .setDepth(190)
      .setVisible(false);
    this.dropdownBackdrop.on('pointerdown', () => this.closeDropdown());

    this.dropdownContainer = this.add.container(dropX, dropY + dropH / 2 + 4).setDepth(200).setVisible(false);
    const listItemH = 27;
    const listPad = 4;
    const listHeight = CALM_BACKGROUNDS.length * listItemH + listPad * 2;

    const listBg = this.add
      .rectangle(0, listHeight / 2, dropW, listHeight, 0x090f1d, 0.98)
      .setStrokeStyle(2, 0x38bdf8, 0.95);
    this.dropdownContainer.add(listBg);

    CALM_BACKGROUNDS.forEach((bgDef, idx) => {
      const itemY = listPad + idx * listItemH + listItemH / 2;
      const itemBg = this.add
        .rectangle(0, itemY, dropW - 10, listItemH - 2, 0x0f172a, 0.9)
        .setInteractive({ useHandCursor: true });
      const itemDot = this.add.circle(-dropW / 2 + 20, itemY, 4.5, bgDef.accentHex, 1);
      const itemLabel = this.add
        .text(-dropW / 2 + 34, itemY, bgDef.label, {
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: '13px',
          fontStyle: 'bold'
        })
        .setOrigin(0, 0.5);
      const itemCheck = this.add
        .text(dropW / 2 - 18, itemY, '✓', {
          color: '#38bdf8',
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '15px'
        })
        .setOrigin(0.5)
        .setVisible(false);

      itemBg.on('pointerover', () => {
        itemBg.setFillStyle(0x1e293b, 1);
      });
      itemBg.on('pointerout', () => {
        this.refreshDojoDropdown();
      });
      itemBg.on('pointerdown', () => {
        setCalmBackgroundStyle(bgDef.id);
        playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
        this.closeDropdown();
      });

      this.dropdownContainer.add([itemBg, itemDot, itemLabel, itemCheck]);
      this.dropdownItems.push({ id: bgDef.id, bg: itemBg, label: itemLabel, check: itemCheck });
    });

    this.resetButton = createTextButton(this, {
      x: centerX,
      y: rowY[5],
      width: 320,
      height: 48,
      label: 'Reset defaults',
      onClick: () => this.resetAllDefaults(),
      onHover: () => this.setSelection(5)
    });

    this.backButton = createTextButton(this, {
      x: centerX,
      y: rowY[6],
      width: 320,
      height: 48,
      label: 'Back to menu',
      onClick: () => this.goToMenu(),
      onHover: () => this.setSelection(6)
    });

    this.setSelection(0);
    this.refreshDojoDropdown();

    this.input.keyboard?.on('keydown-UP', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-W', () => this.moveSelection(-1));
    this.input.keyboard?.on('keydown-DOWN', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-S', () => this.moveSelection(1));
    this.input.keyboard?.on('keydown-LEFT', () => this.handleLeft());
    this.input.keyboard?.on('keydown-RIGHT', () => this.handleRight());
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.dropdownOpen) {
        this.closeDropdown();
      } else {
        this.goToMenu();
      }
    });
    this.input.keyboard?.on('keydown-BACKSPACE', () => {
      if (this.dropdownOpen) {
        this.closeDropdown();
      } else {
        this.goToMenu();
      }
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.activateSelection());
    this.input.keyboard?.on('keydown-SPACE', () => this.activateSelection());

    const unsubscribeSettings = this.app.settingsStore.subscribe((settings) => {
      this.sfxValue.setText(`SFX Volume: ${Math.round(settings.sfxVolume * 100)}%`);
      this.musicValue.setText(`Music Vol:  ${Math.round(settings.musicVolume * 100)}%`);
      this.muteValue.setText(`Mute Audio: ${settings.muted ? 'On' : 'Off'}`);
      this.difficultyValue.setText(`Difficulty: ${DIFFICULTY_LABELS[settings.difficulty]}`);
    });
    const unsubscribeCalm = calmStyleStore.subscribe(() => {
      this.refreshDojoDropdown();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribeSettings();
      unsubscribeCalm();
    });

    this.createFooterHint(
      'Up/Down select • Left/Right adjust or cycle difficulty/dojo • Click/Enter dropdown • Esc back'
    );
  }

  private toggleDropdown(): void {
    if (this.dropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  private openDropdown(): void {
    this.dropdownOpen = true;
    this.dropdownBackdrop.setVisible(true);
    this.dropdownContainer.setVisible(true);
    this.dojoTriggerChevron.setText('▴');
    this.refreshDojoDropdown();
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private closeDropdown(): void {
    this.dropdownOpen = false;
    this.dropdownBackdrop.setVisible(false);
    this.dropdownContainer.setVisible(false);
    this.dojoTriggerChevron.setText('▾');
  }

  private cycleDifficulty(delta: number): void {
    const current = this.app.settingsStore.getState().difficulty;
    const idx = Math.max(0, DIFFICULTY_ORDER.indexOf(current));
    const next = DIFFICULTY_ORDER[Phaser.Math.Wrap(idx + delta, 0, DIFFICULTY_ORDER.length)];
    this.app.settingsStore.patchState({ difficulty: next });
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private cycleDojoBackground(delta: number): void {
    const currentId = calmStyleStore.getState().backgroundId;
    const currentIndex = Math.max(
      0,
      CALM_BACKGROUNDS.findIndex((bg) => bg.id === currentId)
    );
    const nextIndex = Phaser.Math.Wrap(currentIndex + delta, 0, CALM_BACKGROUNDS.length);
    setCalmBackgroundStyle(CALM_BACKGROUNDS[nextIndex].id);
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private refreshDojoDropdown(): void {
    const active = getCalmBackgroundDefinition(calmStyleStore.getState().backgroundId);
    this.dojoTriggerDot.setFillStyle(active.accentHex, 1);
    this.dojoTriggerLabel.setText(active.label);
    this.dojoSubtitle.setText(active.subtitle);
    this.dojoTriggerBg.setStrokeStyle(
      this.selectedRow === 4 || this.dropdownOpen ? 2 : 1.5,
      this.selectedRow === 4 || this.dropdownOpen ? active.accentHex : 0x475569,
      1
    );

    this.dropdownItems.forEach((item) => {
      const selected = item.id === active.id;
      item.bg.setFillStyle(selected ? 0x172554 : 0x0f172a, selected ? 0.96 : 0.88);
      item.label.setColor(selected ? '#ffffff' : '#cbd5e1');
      item.check.setVisible(selected);
    });
  }

  private resetAllDefaults(): void {
    this.app.settingsStore.setState(DEFAULT_SETTINGS);
    setCalmBackgroundStyle('dojo-tatami');
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private changeVolume(kind: 'sfx' | 'music', delta: number): void {
    const current = this.app.settingsStore.getState();
    const key = kind === 'sfx' ? 'sfxVolume' : 'musicVolume';
    const nextVolume = Math.max(0, Math.min(1, current[key] + delta));

    this.app.settingsStore.patchState({ [key]: Number(nextVolume.toFixed(2)) });
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private toggleMute(): void {
    const settings = this.app.settingsStore.getState();
    this.app.settingsStore.patchState({ muted: !settings.muted });
    playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
  }

  private moveSelection(direction: number): void {
    if (this.dropdownOpen) {
      this.cycleDojoBackground(direction);
      return;
    }
    const nextIndex = Phaser.Math.Wrap(this.selectedRow + direction, 0, ROW_COUNT);
    this.setSelection(nextIndex);
  }

  private setSelection(index: number): void {
    this.selectedRow = index;
    this.sfxDownButton.setSelected(index === 0);
    this.sfxUpButton.setSelected(index === 0);
    this.musicDownButton.setSelected(index === 1);
    this.musicUpButton.setSelected(index === 1);
    this.muteButton.setSelected(index === 2);
    this.difficultyButton.setSelected(index === 3);
    this.resetButton.setSelected(index === 5);
    this.backButton.setSelected(index === 6);
    this.refreshDojoDropdown();
  }

  private activateSelection(): void {
    if (this.selectedRow === 2) {
      this.toggleMute();
      return;
    }
    if (this.selectedRow === 3) {
      this.cycleDifficulty(1);
      return;
    }
    if (this.selectedRow === 4) {
      this.toggleDropdown();
      return;
    }
    if (this.selectedRow === 5) {
      this.resetAllDefaults();
      return;
    }
    if (this.selectedRow === 6) {
      this.goToMenu();
    }
  }

  private handleLeft(): void {
    if (this.selectedRow === 0) {
      this.changeVolume('sfx', -0.1);
      return;
    }
    if (this.selectedRow === 1) {
      this.changeVolume('music', -0.1);
      return;
    }
    if (this.selectedRow === 2) {
      this.toggleMute();
      return;
    }
    if (this.selectedRow === 3) {
      this.cycleDifficulty(-1);
      return;
    }
    if (this.selectedRow === 4) {
      this.cycleDojoBackground(-1);
    }
  }

  private handleRight(): void {
    if (this.selectedRow === 0) {
      this.changeVolume('sfx', 0.1);
      return;
    }
    if (this.selectedRow === 1) {
      this.changeVolume('music', 0.1);
      return;
    }
    if (this.selectedRow === 2) {
      this.toggleMute();
      return;
    }
    if (this.selectedRow === 3) {
      this.cycleDifficulty(1);
      return;
    }
    if (this.selectedRow === 4) {
      this.cycleDojoBackground(1);
    }
  }
}
