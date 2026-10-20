import * as Phaser from 'phaser';
import { SPEED, SCROLL, SPAWN_MS, GAP_OFFSET, accelerate, wrapX, bestScore } from './logic.ts';

const FONT = 'Silkscreen, monospace';
const BEST_KEY = 'hiscore'; // same key the Construct 2 version used, so an old best carries over on the same domain

// localStorage can throw (private mode, blocked storage); the game must still run.
const readBest = () => { try { return localStorage.getItem(BEST_KEY); } catch { return null; } };
const writeBest = (n: number) => { try { localStorage.setItem(BEST_KEY, String(n)); } catch { /* not saved */ } };

// Online leaderboard: a Vercel function in api/scores.js. Not available under plain `npm run dev` (use `vercel dev`).
type Row = { name: string; score: number };
const NAME_KEY = 'playerName';
const SENT_KEY = 'sentBest'; // best score already sent online, separate from the local best so old local bests still get uploaded
const readSent = () => { try { return Number(localStorage.getItem(SENT_KEY)) || 0; } catch { return 0; } };
const writeSent = (n: number) => { try { localStorage.setItem(SENT_KEY, String(n)); } catch { /* resend next time */ } };

async function fetchTop(): Promise<Row[]> {
  const res = await fetch('/api/scores');
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()).top;
}

async function submitScore(name: string, score: number): Promise<number> {
  const res = await fetch('/api/scores', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, score }) });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()).rank;
}

/** Saved name, or ask once. Returns null if the player cancels. */
function playerName(): string | null {
  try { const saved = localStorage.getItem(NAME_KEY); if (saved) return saved; } catch { /* ask instead */ }
  const typed = window.prompt('Your name for the online leaderboard (max 12 letters):')?.trim().slice(0, 12);
  if (!typed) return null;
  try { localStorage.setItem(NAME_KEY, typed); } catch { /* ask again next time */ }
  return typed;
}

const COFFEE_URL = 'https://buymeacoffee.com/REPLACE_ME';

/** Pixel-style button in the same look as the original PLAY art: dark fill, 2px border. */
function button(scene: Phaser.Scene, x: number, y: number, w: number, label: string, color: string, onClick: () => void) {
  const fill = 0x14113a;
  const box = scene.add.rectangle(x, y, w, 30, fill).setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(color).color);
  scene.add.text(x, y + 1, label, { fontFamily: FONT, fontSize: '12px', color }).setOrigin(0.5);
  box.setInteractive({ useHandCursor: true })
    .on('pointerover', () => box.setFillStyle(0x2a2470))
    .on('pointerout', () => box.setFillStyle(fill))
    .on('pointerup', onClick); // pointerup, not down: browsers only allow window.open from a click
}

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
    this.add.text(200, 347, `High Score : ${bestScore(0, readBest())}`, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
    this.add.text(200, 388, 'tap / space to turn', { fontFamily: FONT, fontSize: '12px', color: '#9a8fd8' }).setOrigin(0.5);
    this.add.text(8, 482, 'made by syafiq', { fontFamily: FONT, fontSize: '10px', color: '#9a8fd8' }).setOrigin(0, 0.5);
    button(this, 255, 482, 84, 'TOP 10', '#ffffff', () => this.scene.start('leaderboard')); // menu music keeps playing there
    button(this, 348, 482, 88, 'DONATE', '#ffdd00', () => window.open(COFFEE_URL, '_blank', 'noopener'));

    if (!this.sound.get('menumusic')?.isPlaying) this.sound.play('menumusic', { loop: true });
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
    const rankText = this.add.text(60, 866, '', { ...style, fontSize: '14px', color: '#e94bd6' }).setDepth(21);
    panel.push(rankText);
    const targets = [250, 278, 321, 362];
    panel.forEach((o, i) => this.tweens.add({ targets: o, y: targets[i], duration: 500, ease: 'Cubic.Out' }));
    this.tweens.add({ targets: menu, y: 430, duration: 650, ease: 'Cubic.Out' });

    if (this.score > readSent()) {
      // Wait for the panel to slide in; the name prompt pauses the game while it is open.
      this.time.delayedCall(700, () => {
        const name = playerName();
        if (!name) return;
        rankText.setText('Saving online...');
        submitScore(name, this.score)
          .then((rank) => { writeSent(this.score); if (rankText.scene) rankText.setText(`World rank #${rank}`); })
          .catch(() => rankText.scene && rankText.setText('Offline: score not sent'));
      });
    }

    const back = () => this.scene.start('start');
    menu.setInteractive({ useHandCursor: true }).once('pointerdown', back);
    this.time.delayedCall(600, () => this.input.keyboard?.once('keydown-SPACE', back)); // delay so a held space doesn't skip the screen
  }
}

class Leaderboard extends Phaser.Scene {
  constructor() { super('leaderboard'); }

  create() {
    this.add.image(200, 250, 'bg');
    this.add.text(200, 60, 'TOP 10', { fontFamily: FONT, fontSize: '40px', color: '#e94bd6' }).setOrigin(0.5);
    const style = { fontFamily: FONT, fontSize: '18px', color: '#ffffff' };
    const status = this.add.text(200, 220, 'Loading...', style).setOrigin(0.5);

    fetchTop()
      .then((rows) => {
        if (!status.scene) return; // player already left this screen
        status.setText(rows.length ? '' : 'No scores yet. Be the first!');
        let me: string | null = null;
        try { me = localStorage.getItem(NAME_KEY); } catch { /* no highlight */ }
        rows.forEach((r, i) => {
          const y = 110 + i * 28;
          const color = r.name === me ? '#ffd84a' : '#ffffff';
          this.add.text(50, y, `${i + 1}.`, { ...style, color });
          this.add.text(95, y, r.name, { ...style, color });
          this.add.text(350, y, String(r.score), { ...style, color }).setOrigin(1, 0);
        });
      })
      .catch(() => status.scene && status.setText('Leaderboard offline'));

    const back = () => this.scene.start('start');
    this.add.image(200, 430, 'menu').setInteractive({ useHandCursor: true }).once('pointerdown', back);
    this.input.keyboard?.once('keydown-SPACE', back);
    this.input.keyboard?.once('keydown-ESC', back);
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
  scene: [Boot, Start, Game, Leaderboard],
});
