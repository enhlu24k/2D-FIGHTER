import * as Phaser from 'phaser';

import {
  calmStyleStore,
  createCalmBackdrop,
  type CalmBackdropHandle
} from '../game/calmStyles';
import { getAppContext } from '../game/context';
import type { AppContext } from '../game/context';
import { SCENE_KEYS, type CalmBackgroundId, type SceneKey } from '../game/types';

export abstract class BaseScene extends Phaser.Scene {
  protected get app(): AppContext {
    return getAppContext();
  }

  protected markActiveScene(sceneKey: SceneKey): void {
    this.app.debugStore.patchState({ activeScene: sceneKey });
  }

  protected mountCalmBackdrop(
    initialStyleId?: CalmBackgroundId,
    scrimAlpha?: number
  ): CalmBackdropHandle {
    const backdrop = createCalmBackdrop(this, initialStyleId, scrimAlpha);
    const unsubscribe = calmStyleStore.subscribe((state) => {
      backdrop.setStyle(state.backgroundId, true);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unsubscribe();
      backdrop.destroy();
    });

    return backdrop;
  }

  protected createHeading(title: string, subtitle: string, titleY = 48): void {
    const { centerX } = this.cameras.main;

    this.add
      .text(centerX, titleY, title, {
        color: '#f8fafc',
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '32px',
        stroke: '#090d16',
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(50);

    if (subtitle) {
      this.add
        .text(centerX, titleY + 34, subtitle, {
          color: '#cbd5e1',
          fontFamily: 'monospace',
          fontSize: '15px',
          stroke: '#090d16',
          strokeThickness: 4
        })
        .setOrigin(0.5)
        .setDepth(50);
    }
  }

  protected createFooterHint(text: string): void {
    const { centerX, height } = this.cameras.main;

    this.add
      .text(centerX, height - 24, text, {
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: '13px',
        backgroundColor: 'rgba(9, 13, 22, 0.55)',
        padding: { x: 14, y: 5 }
      })
      .setOrigin(0.5)
      .setDepth(100);
  }

  protected goToMenu(): void {
    this.scene.start(SCENE_KEYS.MainMenu);
  }
}
