const PX_PER_M = 6;
const WORLD_W = 4200;
const WORLD_H = 3000;
const INITIAL_ZOOM = 0.28;
const MIN_ZOOM = 0.16;
const MAX_ZOOM = 2.5;
const m = (meters) => meters * PX_PER_M;

class JerusalemGraybox extends Phaser.Scene {
  constructor() {
    super('JerusalemGraybox');
    this.dragging = false;
    this.lastPointer = null;
    this.pinching = false;
    this.lastPinchDistance = 0;
  }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#a79c7d');
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.centerOn(2150, 1450);
    cam.setZoom(INITIAL_ZOOM);

    this.drawGround();
    this.drawTempleMount();
    this.drawBethesda();
    this.drawMarketAndStreet();
    this.drawCharacter();
    this.drawScaleBar();
    this.drawLabels();
    this.setupCameraControls();
    this.setupZoomButtons();
  }

  drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0xb5aa88, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);
    g.lineStyle(1, 0x756b52, 0.12);
    for (let x = 0; x <= WORLD_W; x += m(10)) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += m(10)) g.lineBetween(0, y, WORLD_W, y);
  }

  makeZone(x, y, w, h, fill, stroke, name, detail) {
    const box = this.add.rectangle(x, y, w, h, fill, 0.32)
      .setStrokeStyle(6, stroke, 0.9)
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => {
      const el = document.getElementById('status');
      if (el) el.textContent = `${name} — ${detail}`;
    });
    return box;
  }

  drawTempleMount() {
    const x = 1050, y = 760, w = m(480), h = m(300);
    this.makeZone(x + w / 2, y + h / 2, w, h, 0xc8b992, 0x665638,
      '聖殿山平台', 'Graybox 按約 480 × 300 公尺尺度呈現；人物與其他物件共用同一比例');

    const g = this.add.graphics();
    g.fillStyle(0xc7b894, 1).fillRect(x, y, w, h);
    g.lineStyle(12, 0x665638, 1).strokeRect(x, y, w, h);
    g.fillStyle(0x8f7c5b, 0.55);
    g.fillRect(x + m(8), y + m(8), w - m(16), m(12));
    g.fillRect(x + m(8), y + h - m(20), w - m(16), m(12));
    g.fillRect(x + m(8), y + m(20), m(12), h - m(40));
    g.fillRect(x + w - m(20), y + m(20), m(12), h - m(40));

    const sanctuaryW = m(85), sanctuaryH = m(145);
    const sx = x + w * 0.56 - sanctuaryW / 2;
    const sy = y + h * 0.42 - sanctuaryH / 2;
    g.fillStyle(0xd8caa6, 1).fillRect(sx, sy, sanctuaryW, sanctuaryH);
    g.lineStyle(8, 0x6c5738, 1).strokeRect(sx, sy, sanctuaryW, sanctuaryH);
    g.lineStyle(6, 0x7f6b49, 0.9)
      .strokeRect(sx - m(28), sy - m(22), sanctuaryW + m(56), sanctuaryH + m(44));
  }

  drawBethesda() {
    const x = 760, y = 150, w = m(46), h = m(92);
    this.makeZone(x + w / 2, y + h / 2, w + m(16), h + m(16), 0x8ca2aa, 0x315b75,
      '畢士大池', '雙池 complex 約 46 × 92 公尺；正式版會以五廊／池階結構重畫');

    const g = this.add.graphics();
    const border = m(3), divider = m(4);
    const innerX = x + border, innerY = y + border;
    const innerW = w - border * 2, innerH = h - border * 2;
    const halfH = (innerH - divider) / 2;
    g.fillStyle(0x6f929d, 1);
    g.fillRect(innerX, innerY, innerW, halfH);
    g.fillRect(innerX, innerY + halfH + divider, innerW, halfH);
    g.lineStyle(border, 0xd1c5a5, 1).strokeRect(x, y, w, h);
    g.fillStyle(0xd1c5a5, 1).fillRect(x, innerY + halfH, w, divider);
    g.lineStyle(m(2), 0xb9aa87, 0.9);
    g.strokeRect(x - m(5), y - m(5), w + m(10), h + m(10));
    g.lineBetween(x - m(5), y + h / 2, x + w + m(5), y + h / 2);
  }

  drawMarketAndStreet() {
    const g = this.add.graphics();
    const streetX = 520, streetY = 1120;
    g.fillStyle(0xc7bb98, 1).fillRoundedRect(streetX, streetY, m(70), m(220), m(3));

    const stalls = [[470,1190],[470,1260],[470,1330],[960,1220],[960,1300],[960,1380]];
    stalls.forEach(([x, y], i) => {
      const sw = m(i % 2 ? 3.5 : 3), sh = m(2.2);
      g.fillStyle(i % 2 ? 0x765333 : 0x86603b, 1).fillRect(x, y, sw, sh);
    });
    g.lineStyle(4, 0x715638, 1).strokeRect(930, 1490, m(12), m(8));
    this.makeZone(760, 1370, m(95), m(115), 0xa38459, 0x8b5b2f,
      '市場 / 街道', '第一版只保留可互動的生活區；不再畫尚未製作的遠方道路預留');
  }

  drawCharacter() {
    const pxHeight = m(1.7);
    const group = this.add.container(760, 1315);
    const shadow = this.add.ellipse(0, pxHeight * 0.44, m(0.55), m(0.18), 0x2d2a23, 0.28);
    const body = this.add.ellipse(0, 0, m(0.48), pxHeight * 0.72, 0xb24d3e, 1);
    const head = this.add.circle(0, -pxHeight * 0.46, m(0.16), 0xc8996b, 1);
    group.add([shadow, body, head]).setDepth(999);
    this.tweens.add({ targets: group, x: group.x + m(10), duration: 6500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  drawScaleBar() {
    const g = this.add.graphics().setDepth(1100).setScrollFactor(0);
    const x = 28, y = 80, length = m(50) * INITIAL_ZOOM;
    g.lineStyle(4, 0x2e2920, 1);
    g.lineBetween(x, y, x + length, y);
    g.lineBetween(x, y - 7, x, y + 7);
    g.lineBetween(x + length, y - 7, x + length, y + 7);
    this.add.text(x, y + 10, '50 m', {
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '15px', color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.82)', padding: { x: 6, y: 3 }
    }).setDepth(1101).setScrollFactor(0);
  }

  drawLabels() {
    const style = {
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '24px', color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.82)', padding: { x: 9, y: 5 }
    };
    this.add.text(2140, 820, '聖殿山平台  ≈ 480 × 300 m', style).setDepth(1000);
    this.add.text(690, 90, '畢士大池  ≈ 46 × 92 m', style).setDepth(1000);
    this.add.text(560, 1670, '市場 / 城內街道', style).setDepth(1000);
    this.add.text(25, 20, 'Graybox v0.2 · 1 m = 6 px · 支援雙指縮放與 ± 按鈕', {
      ...style, fontSize: '17px', color: '#4c4233'
    }).setDepth(1200).setScrollFactor(0);
  }

  zoomAt(screenX, screenY, targetZoom) {
    const cam = this.cameras.main;
    const newZoom = Phaser.Math.Clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const worldBefore = cam.getWorldPoint(screenX, screenY);
    cam.setZoom(newZoom);
    const worldAfter = cam.getWorldPoint(screenX, screenY);
    cam.scrollX += worldBefore.x - worldAfter.x;
    cam.scrollY += worldBefore.y - worldAfter.y;
  }

  setupCameraControls() {
    const cam = this.cameras.main;
    this.input.addPointer(2);

    this.input.on('pointerdown', (pointer) => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length >= 2) {
        this.pinching = true;
        this.dragging = false;
        this.lastPinchDistance = Phaser.Math.Distance.Between(active[0].x, active[0].y, active[1].x, active[1].y);
        return;
      }
      this.dragging = true;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    this.input.on('pointerup', () => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length < 2) {
        this.pinching = false;
        this.lastPinchDistance = 0;
      }
      if (active.length === 0) {
        this.dragging = false;
        this.lastPointer = null;
      }
    });

    this.input.on('pointermove', (pointer) => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length >= 2) {
        const p1 = active[0], p2 = active[1];
        const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        if (this.lastPinchDistance > 0) {
          const ratio = distance / this.lastPinchDistance;
          this.zoomAt(midX, midY, cam.zoom * ratio);
        }
        this.lastPinchDistance = distance;
        this.pinching = true;
        this.dragging = false;
        return;
      }

      if (!this.dragging || !this.lastPointer) return;
      const dx = pointer.x - this.lastPointer.x;
      const dy = pointer.y - this.lastPointer.y;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      this.zoomAt(pointer.x, pointer.y, cam.zoom - deltaY * 0.0008);
    });
  }

  setupZoomButtons() {
    const cam = this.cameras.main;
    const centerX = () => this.scale.width / 2;
    const centerY = () => this.scale.height / 2;
    document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomAt(centerX(), centerY(), cam.zoom * 1.35));
    document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomAt(centerX(), centerY(), cam.zoom / 1.35));
    document.getElementById('zoom-reset')?.addEventListener('click', () => {
      cam.setZoom(INITIAL_ZOOM);
      cam.centerOn(2150, 1450);
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
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false }
});

window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));
