const PX_PER_M = 5.2;
const WORLD_W = 4600;
const WORLD_H = 3600;
const INITIAL_ZOOM = 0.28;
const MIN_ZOOM = 0.14;
const MAX_ZOOM = 2.5;

// Oblique 2.5D projection.
// World axes stay intuitive: north is up, east is right.
// Southward distance also shifts left, creating the 2.5D slant.
const ORIGIN_X = 1250;
const ORIGIN_Y = 280;
const SOUTH_SKEW = 0.34;
const SOUTH_COMPRESS = 0.58;

class Jerusalem25D extends Phaser.Scene {
  constructor() {
    super('Jerusalem25D');
    this.dragging = false;
    this.lastPointer = null;
    this.lastPinchDistance = 0;
  }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#b5aa88');
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.centerOn(2200, 1700);
    cam.setZoom(INITIAL_ZOOM);

    this.drawGround();
    this.drawKidron();
    this.drawCityFabric();
    this.drawTempleMount();
    this.drawAntonia();
    this.drawPoolOfIsrael();
    this.drawBethesda();
    this.drawCharacter();
    this.drawLabels();
    this.setupCameraControls();
    this.setupZoomButtons();
  }

  p(eastM, southM, zM = 0) {
    return new Phaser.Math.Vector2(
      ORIGIN_X + eastM * PX_PER_M - southM * PX_PER_M * SOUTH_SKEW,
      ORIGIN_Y + southM * PX_PER_M * SOUTH_COMPRESS - zM * PX_PER_M
    );
  }

  quad(eastM, southM, widthM, depthM) {
    return [
      this.p(eastM, southM),
      this.p(eastM + widthM, southM),
      this.p(eastM + widthM, southM + depthM),
      this.p(eastM, southM + depthM)
    ];
  }

  polygon(points, fill, alpha = 1, stroke = null, strokeAlpha = 1, strokeWidth = 3, depth = 0) {
    const g = this.add.graphics().setDepth(depth);
    g.fillStyle(fill, alpha);
    g.fillPoints(points, true);
    if (stroke !== null) {
      g.lineStyle(strokeWidth, stroke, strokeAlpha);
      g.strokePoints(points, true);
    }
    return g;
  }

  worldRect(e, s, w, d, fill, alpha = 1, stroke = null, depth = 0) {
    return this.polygon(this.quad(e, s, w, d), fill, alpha, stroke, 1, 4, depth);
  }

  drawGround() {
    const g = this.add.graphics();
    g.fillStyle(0xb5aa88, 1).fillRect(0, 0, WORLD_W, WORLD_H);

    // 25 m planning grid, projected through the same transform.
    g.lineStyle(1, 0x746951, 0.11);
    for (let e = 0; e <= 650; e += 25) {
      const a = this.p(e, 0);
      const b = this.p(e, 760);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let s = 0; s <= 760; s += 25) {
      const a = this.p(0, s);
      const b = this.p(650, s);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  drawKidron() {
    this.worldRect(535, 90, 78, 650, 0x87956c, 0.38, 0x657457, 2);
    const a = this.p(575, 105);
    const b = this.p(575, 720);
    const g = this.add.graphics().setDepth(3);
    g.lineStyle(5, 0x647255, 0.55).lineBetween(a.x, a.y, b.x, b.y);
  }

  drawCityFabric() {
    this.worldRect(15, 285, 135, 425, 0xc2b794, 0.65, 0x8c8068, 4);
    const g = this.add.graphics().setDepth(5);
    g.lineStyle(3, 0x81755d, 0.28);
    for (let s = 320; s <= 680; s += 55) {
      const a = this.p(25, s);
      const b = this.p(140, s + 12);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  drawTempleMount() {
    // ~304 m east-west x 472 m north-south.
    const e = 195, s = 245, w = 304, d = 472;
    const platform = this.quad(e, s, w, d);
    this.polygon(platform, 0xc7b894, 1, 0x665638, 1, 8, 10);

    // Inner courts, same world projection.
    this.worldRect(e + 72, s + 145, 168, 158, 0xd2c39d, 0.5, 0x7f6b49, 12);

    // Temple sanctuary, east-west axis.
    this.worldRect(e + 102, s + 196, 90, 44, 0xd9cba8, 1, 0x6c5738, 14);

    // Royal Stoa massing along southern edge.
    this.worldRect(e + 18, s + d - 43, w - 36, 24, 0x968363, 0.76, null, 13);
  }

  drawAntonia() {
    // Northwest of Temple Mount.
    this.worldRect(151, 212, 48, 55, 0x8f8069, 1, 0x51483d, 15);
  }

  drawPoolOfIsrael() {
    this.worldRect(388, 205, 82, 24, 0x789aa6, 1, 0xd0c5a8, 9);
  }

  drawBethesda() {
    // Double-pool complex. Geometry is real world-space; only its rendering is projected.
    const e = 418;
    const s = 78;
    const w = 46;
    const totalD = 92;
    const divider = 6.5;
    const eachD = (totalD - divider) / 2;

    // Stone apron around complex.
    this.worldRect(e - 7, s - 7, w + 14, totalD + 14, 0xcdbf9d, 1, 0x9f8d6d, 18);

    // North pool.
    this.worldRect(e, s, w, eachD, 0x6f929d, 1, 0x315b75, 19);

    // Central dividing wall / fifth portico footprint.
    this.worldRect(e, s + eachD, w, divider, 0xb7a783, 1, 0x7f6e52, 21);

    // South pool.
    this.worldRect(e, s + eachD + divider, w, eachD, 0x7198a3, 1, 0x315b75, 19);

    // Wide stepped landing in southern pool.
    for (let i = 0; i < 6; i++) {
      this.worldRect(
        e + 4 + i * 0.8,
        s + totalD - 13 + i * 1.5,
        w - 8 - i * 1.6,
        1.5,
        i % 2 ? 0xb7aa88 : 0xc8ba97,
        1,
        null,
        22 + i
      );
    }

    // Programmatic shadow: SE sun -> NW cast shadow.
    // This is deliberately simple and independent of asset textures.
    const p1 = this.p(e + w + 2, s + 7);
    const p2 = this.p(e + w + 5, s + 7);
    const p3 = new Phaser.Math.Vector2(p2.x - 52, p2.y - 34);
    const p4 = new Phaser.Math.Vector2(p1.x - 52, p1.y - 34);
    this.polygon([p1, p2, p3, p4], 0x000000, 0.16, null, 20);

    // Click hit area uses the projected polygon itself.
    const zone = this.add.polygon(0, 0, this.quad(e - 7, s - 7, w + 14, totalD + 14), 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive(new Phaser.Geom.Polygon(this.quad(e - 7, s - 7, w + 14, totalD + 14)), Phaser.Geom.Polygon.Contains)
      .setDepth(100);
    zone.on('pointerdown', () => {
      const el = document.getElementById('status');
      if (el) el.textContent = '畢士大池 — 2.5D projection test：46 × 92m 世界座標已投影成斜四邊形';
    });
  }

  drawCharacter() {
    const base = this.p(92, 480);
    const h = 1.7 * PX_PER_M;
    const group = this.add.container(base.x, base.y).setDepth(80);
    group.add([
      this.add.ellipse(0, 3, 11, 4, 0x000000, 0.18),
      this.add.ellipse(0, -h * 0.35, 5, h * 0.72, 0xb24d3e, 1),
      this.add.circle(0, -h * 0.86, 2.2, 0xc8996b, 1)
    ]);
  }

  labelAt(text, e, s, size = 20, depth = 120) {
    const p = this.p(e, s);
    this.add.text(p.x, p.y, text, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${size}px`,
      color: '#2c251b',
      backgroundColor: 'rgba(242,232,207,.86)',
      padding: { x: 7, y: 4 }
    }).setDepth(depth);
  }

  drawLabels() {
    this.labelAt('畢士大池', 410, 64, 18);
    this.labelAt('以色列池', 380, 195, 18);
    this.labelAt('安東尼亞堡', 142, 198, 18);
    this.labelAt('聖殿山平台', 260, 270, 20);
    this.labelAt('汲淪谷', 555, 360, 18);

    this.add.text(18, 16, 'v0.7 · 全場景統一 oblique 2.5D projection · 北朝上', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '15px',
      color: '#4c4233',
      backgroundColor: 'rgba(242,232,207,.86)',
      padding: { x: 8, y: 5 }
    }).setDepth(1000).setScrollFactor(0);
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
      if (active.length === 0) {
        this.dragging = false;
        this.lastPointer = null;
      }
    });

    this.input.on('pointermove', pointer => {
      const active = this.input.manager.pointers.filter(p => p.isDown);
      if (active.length >= 2) {
        const [a, b] = active;
        const d = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.lastPinchDistance > 0) {
          this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, cam.zoom * d / this.lastPinchDistance);
        }
        this.lastPinchDistance = d;
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

    this.input.on('wheel', (pointer, objs, dx, dy) => {
      this.zoomAt(pointer.x, pointer.y, cam.zoom - dy * 0.0008);
    });
  }

  setupZoomButtons() {
    const cam = this.cameras.main;
    const cx = () => this.scale.width / 2;
    const cy = () => this.scale.height / 2;

    document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomAt(cx(), cy(), cam.zoom * 1.35));
    document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomAt(cx(), cy(), cam.zoom / 1.35));
    document.getElementById('zoom-reset')?.addEventListener('click', () => {
      cam.setZoom(INITIAL_ZOOM);
      cam.centerOn(2200, 1700);
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#b5aa88',
  scene: Jerusalem25D,
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false }
});

window.addEventListener('resize', () => game.scale.resize(window.innerWidth, window.innerHeight));