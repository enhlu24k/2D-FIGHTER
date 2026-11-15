import { AUDIO_KEYS, playAudioCue } from '../game/core/audio';
import { GAME_TAGLINE, GAME_TITLE } from '../game/constants';
import { SCENE_KEYS } from '../game/types';
import { BaseScene } from './BaseScene';

export class SplashScene extends BaseScene {
  private hasAdvanced = false;

  constructor() {
    super(SCENE_KEYS.Splash);
  }

  create(): void {
    this.markActiveScene(SCENE_KEYS.Splash);

    const camera = this.cameras.main;
    camera.setBackgroundColor(0x0b1220);
    this.mountCalmBackdrop();

    this.add
      .text(camera.centerX, 240, GAME_TITLE.toUpperCase(), {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '54px',
        stroke: '#090d16',
        strokeThickness: 8
      })
      .setOrigin(0.5)
      .setDepth(2);

    if (GAME_TAGLINE) {
      this.add
        .text(camera.centerX, 300, GAME_TAGLINE, {
          color: '#e2e8f0',
          fontFamily: 'monospace',
          fontSize: '19px',
          stroke: '#090d16',
          strokeThickness: 5
        })
        .setOrigin(0.5)
        .setDepth(2);
    }

    this.createFooterHint(this.app.isMobileShell ? 'Tap screen to begin' : 'Press any key to begin');

    const advanceToMenu = (): void => {
      if (this.hasAdvanced) {
        return;
      }

      this.hasAdvanced = true;
      playAudioCue(this, AUDIO_KEYS.uiConfirm, this.app.settingsStore.getState());
      this.scene.start(SCENE_KEYS.MainMenu);
    };

    this.input.once('pointerup', advanceToMenu);
    this.input.keyboard?.once('keydown', advanceToMenu);
  }
}
