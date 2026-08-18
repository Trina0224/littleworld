const PX_PER_M = 6;
const WORLD_W = 4300;
const WORLD_H = 3200;
const INITIAL_ZOOM = 0.27;
const MIN_ZOOM = 0.15;
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
    cam.centerOn(2250, 1550);
    cam.setZoom(INITIAL_ZOOM);

    this.drawGround();
    this.drawTopography();
    this.drawTempleMount();
    this.drawAntonia();
    this.drawPoolOfIsrael();
    this.drawBethesda();
    this.drawSheepGate();
    this.drawCityStreets();
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
    g.lineStyle(1, 0x756b52, 0.1);
    for (let x = 0; x <= WORLD_W; x += m(10)) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += m(10)) g.lineBetween(0, y, WORLD_W, y);
  }

  drawTopography() {
    const g = this.add.graphics();
    // Kidron Valley: only a broad geographic cue, not an exact surveyed boundary.
    g.fillStyle(0x8f9c72, 0.42);
    g.fillRoundedRect(3850, 120, 300, 2940, 80);
    g.lineStyle(4, 0x687657, 0.7);
    g.lineBetween(3920, 160, 4000, 3000);
  }

  makeZone(x, y, w, h, fill, stroke, name, detail) {
    const box = this.add.rectangle(x, y, w, h, fill, 0.28)
      .setStrokeStyle(5, stroke, 0.9)
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => {
      const el = document.getElementById('status');
      if (el) el.textContent = `${name} — ${detail}`;
    });
    return box;
  }

  drawTempleMount() {
    // Approximate Herodian platform footprint for scale only: ~480 x 300 m.
    const x = 850, y = 900, w = m(480), h = m(300);
    this.makeZone(x + w / 2, y + h / 2, w, h, 0xc8b992, 0x665638,
      '聖殿山平台', '以第一世紀耶路撒冷重建圖為拓撲基準；平台約 480 × 300 m 作尺度參考');

    const g = this.add.graphics();
    g.fillStyle(0xc7b894, 1).fillRect(x, y, w, h);
    g.lineStyle(12, 0x665638, 1).strokeRect(x, y, w, h);

    // Placeholder porticoes.
    g.fillStyle(0x8f7c5b, 0.5);
    g.fillRect(x + m(8), y + m(8), w - m(16), m(11));
    g.fillRect(x + m(8), y + h - m(19), w - m(16), m(11));
    g.fillRect(x + m(8), y + m(19), m(11), h - m(38));
    g.fillRect(x + w - m(19), y + m(19), m(11), h - m(38));

    // Sanctuary placeholder, positioned toward the western half as in common reconstructions.
    const sanctuaryW = m(80), sanctuaryH = m(130);
    const sx = x + m(175);
    const sy = y + m(80);
    g.fillStyle(0xd8caa6, 1).fillRect(sx, sy, sanctuaryW, sanctuaryH);
    g.lineStyle(8, 0x6c5738, 1).strokeRect(sx, sy, sanctuaryW, sanctuaryH);
    g.lineStyle(6, 0x7f6b49, 0.9)
      .strokeRect(sx - m(25), sy - m(20), sanctuaryW + m(50), sanctuaryH + m(40));
  }

  drawAntonia() {
    // Antonia Fortress at the northwest corner of the Temple Mount.
    const x = 730, y = 720;
    const w = m(62), h = m(58);
    this.makeZone(x + w / 2, y + h / 2, w, h, 0x8d806b, 0x51483d,
      '安東尼亞堡', '位於聖殿山西北側，俯視／控制聖殿區；此處只做位置與量體 graybox');
    const g = this.add.graphics();
    g.fillStyle(0x8f8069, 1).fillRect(x, y, w, h);
    g.lineStyle(7, 0x51483d, 1).strokeRect(x, y, w, h);
    const tower = m(12);
    [[x, y], [x + w - tower, y], [x, y + h - tower], [x + w - tower, y + h - tower]].forEach(([tx, ty]) => {
      g.fillStyle(0x756957, 1).fillRect(tx, ty, tower, tower);
    });
  }

  drawPoolOfIsrael() {
    // Pool of Israel appears immediately north of the Temple Mount on common first-century maps.
    const x = 2770, y = 760;
    const w = m(70), h = m(22);
    this.makeZone(x + w / 2, y + h / 2, w, h, 0x7393a0, 0x365f70,
      '以色列池', '與畢士大池不同；位於聖殿山北側，作為地理定位的重要水體');
    const g = this.add.graphics();
    g.fillStyle(0x789aa6, 1).fillRect(x, y, w, h);
    g.lineStyle(5, 0xd0c5a8, 1).strokeRect(x, y, w, h);
  }

  drawBethesda() {
    // Bethesda north of Pool of Israel, slightly east; double-pool complex ~46 x 92 m.
    const x = 2920, y = 150, w = m(46), h = m(92);
    this.makeZone(x + w / 2, y + h / 2, w + m(12), h + m(12), 0x8ca2aa, 0x315b75,
      '畢士大池', '依第一世紀重建圖配置：在聖殿山北方、以色列池再往北，略偏東；雙池約 46 × 92 m');

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

  drawSheepGate() {
    // Sheep Gate is represented as a northern access marker between Bethesda/Israel Pool and Temple area.
    // Exact gate geometry differs among reconstructions, so this is intentionally schematic.
    const g = this.add.graphics();
    const x = 3135, y = 835;
    g.fillStyle(0x5f5547, 1);
    g.fillRect(x, y, m(12), m(4));
    g.fillStyle(0xbfac88, 1);
    g.fillRect(x + m(4), y - m(7), m(4), m(11));
  }

  drawCityStreets() {
    const g = this.add.graphics();
    // West-side city texture only; no claim of exact individual street alignments yet.
    g.fillStyle(0xc1b692, 0.62);
    g.fillRoundedRect(220, 1150, 520, 1450, 40);
    g.lineStyle(5, 0x81755d, 0.35);
    for (let y = 1250; y < 2450; y += 150) g.lineBetween(260, y, 700, y + 40);
    for (let x = 330; x < 700; x += 140) g.lineBetween(x, 1180, x - 50, 2550);

    this.makeZone(480, 1850, 460, 1180, 0xa38459, 0x8b5b2f,
      '城內街區', '目前只作人口、商販與日常活動的 graybox；正式道路等下一階段再依史料細化');
  }

  drawCharacter() {
    const pxHeight = m(1.7);
    const group = this.add.container(620, 1740);
    const shadow = this.add.ellipse(0, pxHeight * 0.44, m(0.55), m(0.18), 0x2d2a23, 0.28);
    const body = this.add.ellipse(0, 0, m(0.48), pxHeight * 0.72, 0xb24d3e, 1);
    const head = this.add.circle(0, -pxHeight * 0.46, m(0.16), 0xc8996b, 1);
    group.add([shadow, body, head]).setDepth(999);
    this.tweens.add({ targets: group, x: group.x + m(12), duration: 7000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  drawScaleBar() {
    const g = this.add.graphics().setDepth(1100).setScrollFactor(0);
    const x = 24, y = 74, length = m(50) * INITIAL_ZOOM;
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
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '22px', color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.84)', padding: { x: 8, y: 5 }
    };
    this.add.text(1950, 935, '聖殿山平台', style).setDepth(1000);
    this.add.text(680, 655, '安東尼亞堡', style).setDepth(1000);
    this.add.text(2730, 700, '以色列池', style).setDepth(1000);
    this.add.text(2860, 90, '畢士大池', style).setDepth(1000);
    this.add.text(3060, 855, '羊門附近', { ...style, fontSize: '17px' }).setDepth(1000);
    this.add.text(3870, 1450, '汲淪谷', { ...style, fontSize: '20px' }).setDepth(1000);
    this.add.text(330, 2600, '城內街區', style).setDepth(1000);
    this.add.text(20, 18, 'Graybox v0.4 · 依第一世紀 Jerusalem reference maps 重排主要地標', {
      ...style, fontSize: '16px', color: '#4c4233'
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
      cam.centerOn(2250, 1550);
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