const PX_PER_M = 6;
const WORLD_W = 3600;
const WORLD_H = 4200;
const INITIAL_ZOOM = 0.24;
const MIN_ZOOM = 0.13;
const MAX_ZOOM = 2.5;
const m = v => v * PX_PER_M;

class JerusalemGraybox extends Phaser.Scene {
  constructor() {
    super('JerusalemGraybox');
    this.dragging = false;
    this.lastPointer = null;
    this.lastPinchDistance = 0;
  }

  preload() {
    this.load.image('stoneFloor', './assets/bethesda/stone-floor.png');
    this.load.image('waterTile', './assets/bethesda/water-tile.png');
    this.load.image('poolWall', './assets/bethesda/pool-wall.png');
    this.load.image('poolStairs', './assets/bethesda/pool-stairs.png');
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
    this.drawBethesdaArtPass();
    this.drawCityStreets();
    this.drawCharacter();
    this.drawLabels();
    this.setupCameraControls();
    this.setupZoomButtons();
  }

  drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0xb5aa88, 1).fillRect(0, 0, WORLD_W, WORLD_H);
    g.lineStyle(1, 0x756b52, 0.08);
    for (let x = 0; x <= WORLD_W; x += m(10)) g.lineBetween(x, 0, x, WORLD_H);
    for (let y = 0; y <= WORLD_H; y += m(10)) g.lineBetween(0, y, WORLD_W, y);
  }

  drawTopography() {
    const g = this.add.graphics();
    g.fillStyle(0x87956c, 0.38).fillRoundedRect(3000, 300, 420, 3500, 80);
    this.add.text(3050, 1850, '汲淪谷', this.labelStyle(20)).setDepth(50);
  }

  makeZone(x, y, w, h, fill, stroke, name, detail) {
    const box = this.add.rectangle(x, y, w, h, fill, 0.16)
      .setStrokeStyle(4, stroke, 0.8)
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => {
      const el = document.getElementById('status');
      if (el) el.textContent = `${name} — ${detail}`;
    });
    return box;
  }

  drawTempleMount() {
    const x = 1120, y = 1020, w = m(304), h = m(472);
    this.makeZone(x + w/2, y + h/2, w, h, 0xc8b992, 0x665638,
      '聖殿山平台', '約 304m 東西 × 472m 南北；正式建築素材下一階段處理');
    const g = this.add.graphics();
    g.fillStyle(0xc7b894, 1).fillRect(x, y, w, h);
    g.lineStyle(12, 0x665638, 1).strokeRect(x, y, w, h);
    g.fillStyle(0x9b8969, 0.65).fillRect(x + m(20), y + h - m(45), w - m(40), m(25));

    const innerX = x + m(78), innerY = y + m(145), innerW = m(165), innerH = m(155);
    g.lineStyle(6, 0x7f6b49, 0.9).strokeRect(innerX, innerY, innerW, innerH);
    const templeW = m(88), templeH = m(42);
    const templeX = innerX + m(28), templeY = innerY + (innerH - templeH)/2;
    g.fillStyle(0xd8caa6, 1).fillRect(templeX, templeY, templeW, templeH);
    g.lineStyle(8, 0x6c5738, 1).strokeRect(templeX, templeY, templeW, templeH);
  }

  drawAntonia() {
    const x = 850, y = 930, w = m(48), h = m(55);
    const g = this.add.graphics();
    g.fillStyle(0x8f8069, 1).fillRect(x, y, w, h);
    g.lineStyle(7, 0x51483d, 1).strokeRect(x, y, w, h);
  }

  drawPoolOfIsrael() {
    const x = 2200, y = 845, w = m(82), h = m(24);
    const g = this.add.graphics();
    g.fillStyle(0x789aa6, 1).fillRect(x, y, w, h);
    g.lineStyle(5, 0xd0c5a8, 1).strokeRect(x, y, w, h);
  }

  drawBethesdaArtPass() {
    const x = 2390, y = 235;
    const poolW = m(46), totalH = m(92), gap = m(6.5);
    const eachH = (totalH - gap) / 2;

    // Clickable footprint remains to preserve interaction while art replaces the graybox.
    this.makeZone(x + poolW/2, y + totalH/2, poolW + m(18), totalH + m(18),
      0x000000, 0x315b75, '畢士大池', 'Bethesda Art Pass 01：石板、水、池壁、階梯已換成生成素材');

    // Stone paving around the pools.
    const floor = this.add.tileSprite(x + poolW/2, y + totalH/2, poolW + m(34), totalH + m(34), 'stoneFloor');
    floor.setAlpha(0.92).setDepth(10);

    // North pool + south pool water, using neutral-ish water texture.
    const northWater = this.add.tileSprite(x + poolW/2, y + eachH/2 + m(4), poolW - m(10), eachH - m(8), 'waterTile');
    northWater.setAlpha(0.92).setDepth(11);
    const southY = y + eachH + gap;
    const southWater = this.add.tileSprite(x + poolW/2, southY + eachH/2, poolW - m(10), eachH - m(8), 'waterTile');
    southWater.setAlpha(0.92).setDepth(11);

    // Pool edge/wall sprites repeated around the perimeter.
    const topWall = this.add.tileSprite(x + poolW/2, y - m(2), poolW + m(6), m(9), 'poolWall');
    topWall.setDepth(13);
    const middleWall = this.add.tileSprite(x + poolW/2, y + eachH + gap/2, poolW + m(6), m(10), 'poolWall');
    middleWall.setDepth(13);
    const bottomWall = this.add.tileSprite(x + poolW/2, y + totalH + m(2), poolW + m(6), m(9), 'poolWall');
    bottomWall.setDepth(13);

    // Wide southern steps.
    const stairs = this.add.image(x + poolW/2, y + totalH - m(5), 'poolStairs');
    stairs.setDisplaySize(poolW * 0.78, m(15)).setDepth(14);

    // Programmatic cast shadows: semi-transparent black polygons, NW direction.
    const shadow = this.add.graphics().setDepth(12);
    shadow.fillStyle(0x000000, 0.16);
    const sx = x + poolW + m(2), sy = y + m(8);
    shadow.fillPoints([
      new Phaser.Geom.Point(sx, sy),
      new Phaser.Geom.Point(sx + m(5), sy),
      new Phaser.Geom.Point(sx - m(12), sy - m(12)),
      new Phaser.Geom.Point(sx - m(17), sy - m(12))
    ], true);

    // Small caption near the art-pass area.
    this.add.text(x - m(4), y - m(18), 'Bethesda · Art Pass 01', this.labelStyle(18)).setDepth(30);
  }

  drawCityStreets() {
    const g = this.add.graphics();
    g.fillStyle(0xc1b692, 0.62).fillRoundedRect(180, 1280, 720, 2350, 44);
    g.lineStyle(5, 0x81755d, 0.28);
    for (let y = 1400; y < 3500; y += 170) g.lineBetween(240, y, 850, y + 45);
    for (let x = 320; x < 850; x += 145) g.lineBetween(x, 1320, x - 80, 3550);
  }

  drawCharacter() {
    const h = m(1.7);
    const group = this.add.container(670, 2050);
    group.add([
      this.add.ellipse(0, h*0.44, m(0.55), m(0.18), 0x2d2a23, 0.28),
      this.add.ellipse(0, 0, m(0.48), h*0.72, 0xb24d3e, 1),
      this.add.circle(0, -h*0.46, m(0.16), 0xc8996b, 1)
    ]).setDepth(999);
    this.tweens.add({ targets: group, x: group.x + m(12), duration: 7000, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  labelStyle(size=22) {
    return {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${size}px`, color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.84)', padding: { x: 8, y: 5 }
    };
  }

  drawLabels() {
    this.add.text(1500, 1120, '聖殿山平台', this.labelStyle()).setDepth(40);
    this.add.text(790, 865, '安東尼亞堡', this.labelStyle()).setDepth(40);
    this.add.text(2170, 790, '以色列池', this.labelStyle()).setDepth(40);
    this.add.text(18, 16, 'Graybox v0.6 · Bethesda 第一批生成素材已套用 · shadow 由 Phaser 疊加', this.labelStyle(15))
      .setDepth(1200).setScrollFactor(0);
  }

  zoomAt(screenX, screenY, targetZoom) {
    const cam = this.cameras.main;
    const z = Phaser.Math.Clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const before = cam.getWorldPoint(screenX, screenY);
    cam.setZoom(z);
    const after = cam.getWorldPoint(screenX, screenY);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  setupCameraControls() {
    const cam = this.cameras.main;
    this.input.addPointer(2);
    this.input.on('pointerdown', pointer => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length >= 2) {
        this.dragging = false;
        this.lastPinchDistance = Phaser.Math.Distance.Between(active[0].x, active[0].y, active[1].x, active[1].y);
        return;
      }
      this.dragging = true;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });
    this.input.on('pointerup', () => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length < 2) this.lastPinchDistance = 0;
      if (active.length === 0) { this.dragging = false; this.lastPointer = null; }
    });
    this.input.on('pointermove', pointer => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length >= 2) {
        const [a,b] = active;
        const d = Phaser.Math.Distance.Between(a.x,a.y,b.x,b.y);
        if (this.lastPinchDistance > 0) this.zoomAt((a.x+b.x)/2, (a.y+b.y)/2, cam.zoom * d/this.lastPinchDistance);
        this.lastPinchDistance = d;
        this.dragging = false;
        return;
      }
      if (!this.dragging || !this.lastPointer) return;
      const dx = pointer.x - this.lastPointer.x, dy = pointer.y - this.lastPointer.y;
      cam.scrollX -= dx / cam.zoom; cam.scrollY -= dy / cam.zoom;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });
    this.input.on('wheel', (pointer, objs, dx, dy) => this.zoomAt(pointer.x, pointer.y, cam.zoom - dy * 0.0008));
  }

  setupZoomButtons() {
    const cam = this.cameras.main;
    const cx = () => this.scale.width/2, cy = () => this.scale.height/2;
    document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomAt(cx(), cy(), cam.zoom * 1.35));
    document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomAt(cx(), cy(), cam.zoom / 1.35));
    document.getElementById('zoom-reset')?.addEventListener('click', () => { cam.setZoom(INITIAL_ZOOM); cam.centerOn(1850,2100); });
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