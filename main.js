const PX_PER_M = 6;
const WORLD_W = 3600;
const WORLD_H = 4200;
const INITIAL_ZOOM = 0.24;
const MIN_ZOOM = 0.13;
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
    cam.centerOn(1850, 2100);
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

    // Kidron Valley east of the Temple Mount. Schematic only.
    g.fillStyle(0x87956c, 0.38);
    g.fillRoundedRect(3000, 300, 420, 3500, 80);
    g.lineStyle(5, 0x647255, 0.65);
    g.lineBetween(3120, 360, 3200, 3700);
  }

  makeZone(x, y, w, h, fill, stroke, name, detail) {
    const box = this.add.rectangle(x, y, w, h, fill, 0.24)
      .setStrokeStyle(5, stroke, 0.9)
      .setInteractive({ useHandCursor: true });

    box.on('pointerdown', () => {
      const el = document.getElementById('status');
      if (el) el.textContent = `${name} — ${detail}`;
    });

    return box;
  }

  drawTempleMount() {
    // Herodian platform: approximately 304 m east-west x 472 m north-south.
    const x = 1120;
    const y = 1020;
    const w = m(304);
    const h = m(472);

    this.makeZone(
      x + w / 2,
      y + h / 2,
      w,
      h,
      0xc8b992,
      0x665638,
      '聖殿山平台',
      'Graybox 依 Herodian Temple Mount 約 304m 東西 × 472m 南北配置；北朝上時平台應南北較長'
    );

    const g = this.add.graphics();
    g.fillStyle(0xc7b894, 1).fillRect(x, y, w, h);
    g.lineStyle(12, 0x665638, 1).strokeRect(x, y, w, h);

    // Perimeter porticoes placeholders.
    g.fillStyle(0x8f7c5b, 0.48);
    g.fillRect(x + m(8), y + m(8), w - m(16), m(11));
    g.fillRect(x + m(8), y + h - m(19), w - m(16), m(11));
    g.fillRect(x + m(8), y + m(19), m(11), h - m(38));
    g.fillRect(x + w - m(19), y + m(19), m(11), h - m(38));

    // Royal Stoa massing along the south edge.
    g.fillStyle(0x9b8969, 0.72);
    g.fillRect(x + m(20), y + h - m(45), w - m(40), m(25));

    // Temple / inner courts: east-west axis. Entrance faces east (right).
    const innerX = x + m(78);
    const innerY = y + m(145);
    const innerW = m(165);
    const innerH = m(155);

    g.lineStyle(6, 0x7f6b49, 0.9);
    g.strokeRect(innerX, innerY, innerW, innerH);

    // Sanctuary itself intentionally wider east-west than north-south.
    const templeW = m(88);
    const templeH = m(42);
    const templeX = innerX + m(28);
    const templeY = innerY + (innerH - templeH) / 2;

    g.fillStyle(0xd8caa6, 1).fillRect(templeX, templeY, templeW, templeH);
    g.lineStyle(8, 0x6c5738, 1).strokeRect(templeX, templeY, templeW, templeH);

    // East-facing entrance marker.
    g.fillStyle(0x6c5738, 1);
    g.fillRect(templeX + templeW - m(2), templeY + templeH * 0.35, m(6), templeH * 0.3);
  }

  drawAntonia() {
    // Antonia hugs the northwest corner of the Temple Mount.
    const x = 850;
    const y = 930;
    const w = m(48);
    const h = m(55);

    this.makeZone(
      x + w / 2,
      y + h / 2,
      w,
      h,
      0x8d806b,
      0x51483d,
      '安東尼亞堡',
      '位於聖殿山西北角；此版本只固定拓撲位置與大致量體'
    );

    const g = this.add.graphics();
    g.fillStyle(0x8f8069, 1).fillRect(x, y, w, h);
    g.lineStyle(7, 0x51483d, 1).strokeRect(x, y, w, h);

    const tower = m(10);
    [[x, y], [x + w - tower, y], [x, y + h - tower], [x + w - tower, y + h - tower]].forEach(([tx, ty]) => {
      g.fillStyle(0x756957, 1).fillRect(tx, ty, tower, tower);
    });
  }

  drawPoolOfIsrael() {
    // Pool of Israel: immediately north of the Temple Mount, near its northeast sector.
    const x = 2200;
    const y = 845;
    const w = m(82);
    const h = m(24);

    this.makeZone(
      x + w / 2,
      y + h / 2,
      w,
      h,
      0x7393a0,
      0x365f70,
      '以色列池',
      '保留作為聖殿山北側重要地理定位；不是畢士大池'
    );

    const g = this.add.graphics();
    g.fillStyle(0x789aa6, 1).fillRect(x, y, w, h);
    g.lineStyle(5, 0xd0c5a8, 1).strokeRect(x, y, w, h);
  }

  drawBethesda() {
    // Bethesda north of Pool of Israel, slightly east; double-pool complex ~46 x 92 m.
    const x = 2390;
    const y = 235;
    const w = m(46);
    const h = m(92);

    this.makeZone(
      x + w / 2,
      y + h / 2,
      w + m(12),
      h + m(12),
      0x8ca2aa,
      0x315b75,
      '畢士大池',
      '位於聖殿山北側、以色列池更北並略偏東；雙池 complex 約 46 × 92 m'
    );

    const g = this.add.graphics();
    const border = m(3);
    const divider = m(4);
    const innerX = x + border;
    const innerY = y + border;
    const innerW = w - border * 2;
    const innerH = h - border * 2;
    const halfH = (innerH - divider) / 2;

    g.fillStyle(0x6f929d, 1);
    g.fillRect(innerX, innerY, innerW, halfH);
    g.fillRect(innerX, innerY + halfH + divider, innerW, halfH);

    g.lineStyle(border, 0xd1c5a5, 1).strokeRect(x, y, w, h);
    g.fillStyle(0xd1c5a5, 1).fillRect(x, innerY + halfH, w, divider);

    // Five-portico hint: perimeter plus central divider.
    g.lineStyle(m(2), 0xb9aa87, 0.9);
    g.strokeRect(x - m(5), y - m(5), w + m(10), h + m(10));
    g.lineBetween(x - m(5), y + h / 2, x + w + m(5), y + h / 2);
  }

  drawSheepGate() {
    // Schematic Sheep Gate marker on the north / northeast approach.
    const x = 2500;
    const y = 910;
    const g = this.add.graphics();

    g.fillStyle(0x5f5547, 1).fillRect(x, y, m(14), m(4));
    g.fillStyle(0xbfac88, 1).fillRect(x + m(5), y - m(7), m(4), m(11));
  }

  drawCityStreets() {
    const g = this.add.graphics();

    // West-side city fabric for demo interaction only.
    g.fillStyle(0xc1b692, 0.62);
    g.fillRoundedRect(180, 1280, 720, 2350, 44);

    g.lineStyle(5, 0x81755d, 0.34);
    for (let y = 1400; y < 3500; y += 170) g.lineBetween(240, y, 850, y + 45);
    for (let x = 320; x < 850; x += 145) g.lineBetween(x, 1320, x - 80, 3550);

    this.makeZone(
      520,
      2350,
      620,
      2100,
      0xa38459,
      0x8b5b2f,
      '城內街區',
      '目前只作居民、商販與日常活動 graybox；正式道路與建築下一階段再依史料細化'
    );
  }

  drawCharacter() {
    const pxHeight = m(1.7);
    const group = this.add.container(670, 2050);
    const shadow = this.add.ellipse(0, pxHeight * 0.44, m(0.55), m(0.18), 0x2d2a23, 0.28);
    const body = this.add.ellipse(0, 0, m(0.48), pxHeight * 0.72, 0xb24d3e, 1);
    const head = this.add.circle(0, -pxHeight * 0.46, m(0.16), 0xc8996b, 1);

    group.add([shadow, body, head]).setDepth(999);

    this.tweens.add({
      targets: group,
      x: group.x + m(12),
      duration: 7000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  drawScaleBar() {
    const g = this.add.graphics().setDepth(1100).setScrollFactor(0);
    const x = 22;
    const y = 72;
    const length = m(50) * INITIAL_ZOOM;

    g.lineStyle(4, 0x2e2920, 1);
    g.lineBetween(x, y, x + length, y);
    g.lineBetween(x, y - 7, x, y + 7);
    g.lineBetween(x + length, y - 7, x + length, y + 7);

    this.add.text(x, y + 10, '50 m', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '15px',
      color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.82)',
      padding: { x: 6, y: 3 }
    }).setDepth(1101).setScrollFactor(0);
  }

  drawLabels() {
    const style = {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '22px',
      color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.84)',
      padding: { x: 8, y: 5 }
    };

    this.add.text(1500, 1120, '聖殿山平台\n≈304m E–W × 472m N–S', style).setDepth(1000);
    this.add.text(790, 865, '安東尼亞堡', style).setDepth(1000);
    this.add.text(2170, 790, '以色列池', style).setDepth(1000);
    this.add.text(2310, 170, '畢士大池', style).setDepth(1000);
    this.add.text(2450, 940, '羊門附近', { ...style, fontSize: '17px' }).setDepth(1000);
    this.add.text(3050, 1850, '汲淪谷', { ...style, fontSize: '20px' }).setDepth(1000);
    this.add.text(320, 3650, '城內街區', style).setDepth(1000);

    this.add.text(18, 16, 'Graybox v0.5 · Temple Mount 南北向 · Temple 東西向 · Israel Pool / Antonia / Bethesda 拓撲固定', {
      ...style,
      fontSize: '15px',
      color: '#4c4233'
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
        const p1 = active[0];
        const p2 = active[1];
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

    document.getElementById('zoom-in')?.addEventListener('click', () => {
      this.zoomAt(centerX(), centerY(), cam.zoom * 1.35);
    });

    document.getElementById('zoom-out')?.addEventListener('click', () => {
      this.zoomAt(centerX(), centerY(), cam.zoom / 1.35);
    });

    document.getElementById('zoom-reset')?.addEventListener('click', () => {
      cam.setZoom(INITIAL_ZOOM);
      cam.centerOn(1850, 2100);
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
