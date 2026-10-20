import * as Phaser from 'phaser';
import { SPEED, SCROLL, SPAWN_MS, GAP_OFFSET, accelerate, wrapX, bestScore } from './logic.ts';

const FONT = 'Silkscreen, monospace';
const BEST_KEY = 'hiscore'; // same key the Construct 2 version used, so an old best carries over on the same domain

// localStorage can throw (private mode, blocked storage); the game must still run.
const readBest = () => { try { return localStorage.getItem(BEST_KEY); } catch { return null; } };
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* not saved */ } };

class Boot extends Phaser.Scene {
  constructor() { super('boot'); }

  preload() {
    for (const k of ['title', 'logo0', 'logo1', 'play', 'bg', 'sushi0', 'sushi1', 'pipe-left', 'pipe-right', 'gameover', 'menu'])
      this.load.image(k, `assets/${k}.png`);
    for (const k of ['menumusic', 'bgm', 'metal', 'point']) this.load.audio(k, `assets/${k}.mp3`);
  }

  async create() {
    this.anims.create({ key: 'logo', frames: [{ key: 'logo0' }, { key: 'logo1' }], frameRate: 5, repeat: -1 });
    this.anims.create({ key: 'fly', frames: [{ key: 'sushi0' }, { key: 'sushi1' }], frameRate: 5, repeat: -1 });
    await document.fonts.load(`20px ${FONT}`).catch(() => {}); // text drawn before the font loads stays in the fallback font
    this.scene.start('start');
  }
}

class Start extends Phaser.Scene {
  constructor() { super('start'); }

  create() {
    this.add.image(0, 0, 'title').setOrigin(0);
    this.add.sprite(200, 262, 'logo0').setDisplaySize(113, 113).play('logo');
    this.add.text(200, 367, `High Score : ${bestScore(0, readBest())}`, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(200, 482, 'tap / space to turn', { fontFamily: FONT, fontSize: '12px', color: '#9a8fd8' }).setOrigin(0.5);

    this.sound.play('menumusic', { loop: true });
    const go = () => { this.sound.stopAll(); this.scene.start('game'); };
    this.add.image(200, 437, 'play').setInteractive({ useHandCursor: true }).once('pointerdown', go);
    this.input.keyboard?.once('keydown-SPACE', go);
    this.input.keyboard?.once('keydown-ENTER', go);
  }
}

class Game extends Phaser.Scene {
  private sushi!: Phaser.GameObjects.Sprite;
  private bg!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private bars: Phaser.GameObjects.Image[] = [];
  private vx = 0;
  private score = 0;
  private dead = false;

  constructor() { super('game'); }

  create() {
    this.bars = [];
    this.score = 0;
    this.dead = false;
    this.vx = -SPEED; // starts drifting left, like the original

    this.bg = this.add.image(200, -250, 'bg');
    this.sushi = this.add.sprite(200, 337, 'sushi0').setScale(37.8 / 32).play('fly');
    this.scoreText = this.add.text(200, 94, '0', { fontFamily: FONT, fontSize: '56px', color: '#ffffff' }).setOrigin(0.5, 0).setDepth(10);

    this.sound.play('bgm', { loop: true });
    this.time.addEvent({ delay: SPAWN_MS, loop: true, callback: this.spawn, callbackScope: this });

    const turn = () => { if (!this.dead) this.vx = this.vx < 0 ? SPEED : -SPEED; };
    this.input.on('pointerdown', turn);
    this.input.keyboard?.on('keydown-SPACE', turn);
  }

  private spawn() {
    if (this.dead) return;
    const x = Phaser.Math.FloatBetween(-290, -50);
    const left = this.add.image(x, -100, 'pipe-left').setAngle(90).setData('scored', false);
    const right = this.add.image(x + GAP_OFFSET, -100, 'pipe-right').setAngle(90);
    this.bars.push(left, right);
  }

  update(_: number, deltaMs: number) {
    const dt = deltaMs / 1000;

    if (this.dead) {
      this.sushi.y += 600 * dt; // falls off screen, as before
      return;
    }

    this.vx = accelerate(this.vx, dt);
    this.sushi.x = wrapX(this.sushi.x + this.vx * dt);

    this.bg.y += SCROLL * dt;
    if (this.bg.y >= 750) this.bg.y = -250;

    const me = this.sushi.getBounds();
    for (const bar of this.bars) {
      bar.y += SCROLL * dt;
      if (Phaser.Geom.Intersects.RectangleToRectangle(me, bar.getBounds())) return this.die();
      if (bar.texture.key === 'pipe-left' && !bar.getData('scored') && bar.y >= this.sushi.y - 50) {
        bar.setData('scored', true);
        this.scoreText.setText(String(++this.score));
        this.sound.play('point', { volume: 0.56 }); // -5 dB in the original
      }
    }
    this.bars = this.bars.filter((b) => (b.y > 540 ? (b.destroy(), false) : true));
  }

  private die() {
    this.dead = true;
    this.sound.stopByKey('bgm');
    this.sound.play('metal', { volume: 0.32 }); // -10 dB in the original
    this.sushi.stop();

    const best = bestScore(this.score, readBest());
    writeBest(best);

    // Game-over panel slides up from below the screen.
    const style = { fontFamily: FONT, fontSize: '20px', color: '#ffffff' };
    const panel = [
      this.add.image(200, 754, 'gameover').setDepth(20),
      this.add.text(60, 780, `Score    : ${this.score}`, style).setDepth(21),
      this.add.text(60, 823, `Hi-Score : ${best}${this.score === best && this.score > 0 ? '  NEW!' : ''}`, style).setDepth(21),
    ];
    const menu = this.add.image(200, 882, 'menu').setDepth(21);
    const targets = [250, 278, 321];
    panel.forEach((o, i) => this.tweens.add({ targets: o, y: targets[i], duration: 500, ease: 'Cubic.Out' }));
    this.tweens.add({ targets: menu, y: 430, duration: 650, ease: 'Cubic.Out' });

    const back = () => this.scene.start('start');
    menu.setInteractive({ useHandCursor: true }).once('pointerdown', back);
    this.time.delayedCall(600, () => this.input.keyboard?.once('keydown-SPACE', back)); // delay so a held space doesn't skip the screen
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 400,
  height: 500,
  backgroundColor: '#0b0a24',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot, Start, Game],
});
