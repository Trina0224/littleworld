const WORLD_W = 1500;
const WORLD_H = 1050;

class JerusalemGraybox extends Phaser.Scene {
  constructor() {
    super('JerusalemGraybox');
    this.dragging = false;
    this.lastPointer = null;
  }

  create() {
    this.cameras.main.setBackgroundColor('#a79c7d');
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.cameras.main.setZoom(0.78);

    this.drawGround();
    this.drawTemple();
    this.drawBethesda();
    this.drawMarket();
    this.drawStreet();
    this.drawCharacter();
    this.drawLabels();
    this.setupCameraControls();
  }

  drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0xb7a779, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    g.fillStyle(0x9d916d, 1);
    for (let y = 0; y < WORLD_H; y += 48) {
      for (let x = 0; x < WORLD_W; x += 64) {
        if (((x / 64) + (y / 48)) % 2 === 0) {
          g.fillRect(x, y, 64, 48);
        }
      }
    }

    g.fillStyle(0x7f7358, 1);
    g.fillRect(0, 840, WORLD_W, 210);

    g.fillStyle(0x8ca06d, 1);
    g.fillRect(1210, 0, 290, WORLD_H);
  }

  makeZone(x, y, w, h, fill, stroke, name, detail) {
    const box = this.add.rectangle(x, y, w, h, fill, 0.88)
      .setStrokeStyle(4, stroke, 0.95)
      .setInteractive({ useHandCursor: true });

    box.on('pointerdown', () => {
      const el = document.getElementById('status');
      if (el) el.textContent = `${name} — ${detail}`;
    });

    return box;
  }

  drawTemple() {
    this.makeZone(795, 245, 720, 360, 0xc5b792, 0x6d5c3d,
      '聖殿外院', '教導、辯論、群眾聚集與潔淨聖殿事件核心區');

    const g = this.add.graphics();

    g.fillStyle(0x776448, 1);
    g.fillRect(445, 95, 700, 40);
    g.fillRect(445, 355, 700, 38);

    for (let x = 475; x <= 1115; x += 80) {
      g.fillStyle(0xd9cfb4, 1);
      g.fillRect(x, 125, 18, 225);
      g.fillStyle(0x5b4a34, 0.25);
      g.fillRect(x + 18, 130, 9, 220);
    }

    g.fillStyle(0xa59065, 1);
    g.fillRect(650, 150, 300, 125);
    g.fillStyle(0xd3c49c, 1);
    g.fillRect(680, 120, 240, 115);
    g.lineStyle(5, 0x6b5736, 1);
    g.strokeRect(680, 120, 240, 115);

    g.fillStyle(0x6e5635, 1);
    g.fillRect(770, 175, 58, 60);

    for (let i = 0; i < 6; i++) {
      g.fillStyle(0xb3a47d, 1);
      g.fillRect(690 + i * 38, 280 + i * 5, 220 - i * 30, 12);
    }
  }

  drawBethesda() {
    this.makeZone(270, 250, 360, 300, 0xa89978, 0x3f6482,
      '畢士大池', '聖殿北側附近；病患聚集與醫治故事區');

    const g = this.add.graphics();
    g.fillStyle(0x496e7e, 1);
    g.fillRect(160, 180, 100, 175);
    g.fillRect(285, 180, 100, 175);

    g.fillStyle(0x7ea6ad, 1);
    g.fillRect(170, 190, 80, 155);
    g.fillRect(295, 190, 80, 155);

    g.lineStyle(8, 0xd0c3a0, 1);
    g.strokeRect(150, 170, 245, 195);
    g.lineBetween(272, 170, 272, 365);

    for (const x of [135, 200, 272, 340, 405]) {
      g.fillStyle(0xd6c9aa, 1);
      g.fillRect(x, 145, 12, 245);
    }
  }

  drawMarket() {
    this.makeZone(660, 650, 680, 300, 0x9d835b, 0x8e5c2d,
      '市場與祭物區', '換錢桌、鴿籠、羊群與高密度日常互動區');

    const g = this.add.graphics();
    const stalls = [
      [420, 565], [540, 565], [660, 565], [780, 565],
      [470, 685], [600, 690], [740, 690], [870, 665]
    ];

    stalls.forEach(([x, y], i) => {
      g.fillStyle(i % 2 ? 0x6d4e2f : 0x7d5c37, 1);
      g.fillRect(x, y, 90, 46);
      g.fillStyle(0xb98d59, 1);
      g.fillRect(x - 5, y - 18, 100, 18);
    });

    // Animal pens
    g.lineStyle(5, 0x725638, 1);
    g.strokeRect(865, 560, 190, 105);
    g.strokeRect(910, 690, 150, 90);

    for (let i = 0; i < 5; i++) {
      this.add.circle(895 + (i % 3) * 42, 590 + Math.floor(i / 3) * 42, 10, 0xe7dfca)
        .setStrokeStyle(2, 0x665845);
    }

    for (let i = 0; i < 3; i++) {
      this.add.ellipse(945 + i * 42, 725, 30, 18, 0xd9d0ba)
        .setStrokeStyle(2, 0x665845);
    }
  }

  drawStreet() {
    const g = this.add.graphics();
    g.fillStyle(0xc5b992, 1);
    g.fillRoundedRect(525, 800, 360, 220, 36);
    g.fillRect(650, 690, 110, 180);

    g.lineStyle(4, 0x7d6d4f, 0.45);
    for (let y = 830; y < 1010; y += 44) {
      g.lineBetween(530, y, 875, y);
    }

    g.fillStyle(0x615744, 1);
    g.fillRect(610, 895, 70, 125);
    g.fillRect(740, 895, 70, 125);
  }

  drawCharacter() {
    const group = this.add.container(710, 755);
    const shadow = this.add.ellipse(0, 18, 34, 14, 0x2d2a23, 0.25);
    const body = this.add.ellipse(0, 0, 24, 38, 0xb24d3e, 1).setStrokeStyle(2, 0x5b2e27);
    const head = this.add.circle(0, -25, 10, 0xc8996b, 1).setStrokeStyle(2, 0x5f4633);
    group.add([shadow, body, head]);
    group.setDepth(999);

    this.tweens.add({
      targets: group,
      x: 790,
      duration: 2800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  drawLabels() {
    const style = {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '26px',
      color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.78)',
      padding: { x: 10, y: 6 }
    };

    this.add.text(720, 85, '聖殿外院', style).setDepth(1000);
    this.add.text(145, 405, '畢士大池', style).setDepth(1000);
    this.add.text(590, 505, '市場 / 換錢 / 祭物', style).setDepth(1000);
    this.add.text(625, 920, '城內街道 / 出入口', style).setDepth(1000);

    const small = { ...style, fontSize: '18px' };
    this.add.text(1218, 710, '→ 東側預留\n汲淪谷 / 客西馬尼', small).setDepth(1000);
    this.add.text(905, 940, '南側預留 →\n西羅亞池方向', small).setDepth(1000);
  }

  setupCameraControls() {
    const cam = this.cameras.main;

    this.input.on('pointerdown', (pointer) => {
      this.dragging = true;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    this.input.on('pointerup', () => {
      this.dragging = false;
      this.lastPointer = null;
    });

    this.input.on('pointermove', (pointer) => {
      if (!this.dragging || !this.lastPointer) return;
      const dx = pointer.x - this.lastPointer.x;
      const dy = pointer.y - this.lastPointer.y;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const oldZoom = cam.zoom;
      const newZoom = Phaser.Math.Clamp(oldZoom - deltaY * 0.001, 0.45, 1.7);
      if (newZoom === oldZoom) return;

      const worldBefore = cam.getWorldPoint(pointer.x, pointer.y);
      cam.setZoom(newZoom);
      const worldAfter = cam.getWorldPoint(pointer.x, pointer.y);
      cam.scrollX += worldBefore.x - worldAfter.x;
      cam.scrollY += worldBefore.y - worldAfter.y;
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#a79c7d',
  scene: JerusalemGraybox,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  render: {
    antialias: true,
    pixelArt: false
  }
});

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
