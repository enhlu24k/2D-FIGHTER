import { preloadStarterAssets, registerStarterAnimations } from '../game/assets';
import { preloadCalmBackgroundAssets } from '../game/calmStyles';
import { registerGeneratedAssets } from '../game/generatedAssets';
import { prepareMartialCharacters } from '../game/martialSprites';
import { prepareMyFighters } from '../game/myFighterLoader';
import { registerTileAtlasFrames } from '../game/tileAtlas';
import { registerQuestUiAtlasFrames } from '../game/uiAtlas';
import { registerFightingUiAtlasFrames } from '../game/fightingUiAtlas';
import { SCENE_KEYS } from '../game/types';
import { BaseScene } from './BaseScene';

export class BootScene extends BaseScene {
  constructor() {
    super(SCENE_KEYS.Boot);
  }

  preload(): void {
    preloadStarterAssets(this);
    preloadCalmBackgroundAssets(this);
  }

  create(): void {
    this.markActiveScene(SCENE_KEYS.Boot);
    registerGeneratedAssets(this);
    registerTileAtlasFrames(this);
    registerQuestUiAtlasFrames(this);
    registerFightingUiAtlasFrames(this);

    // Load online Judo & Taekwondo portraits and build realistic spritesheets.
    void Promise.all([prepareMartialCharacters(this), prepareMyFighters(this)])
      .catch((error) => console.error('[boot] could not prepare fighters', error))
      .then(() => {
        registerStarterAnimations(this);
        this.scene.start(SCENE_KEYS.Splash);
      });
  }
}
