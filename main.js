const TILE_W = 512;
const TILE_H = 360;
const COLS = 3;
const ROWS = 2;
const WORLD_W = TILE_W * COLS;
const WORLD_H = TILE_H * ROWS;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 3.0;

const TILE_URLS = [
  './assets/showa/tile-00.svg',
  './assets/showa/tile-01.svg',
  './assets/showa/tile-02.svg',
  './assets/showa/tile-10.svg',
  './assets/showa/tile-11.svg',
  './assets/showa/tile-12.svg'
];

class ShowaLittleWorld extends Phaser.Scene {
  constructor() {
    super('ShowaLittleWorld');
    this.dragging = false;
    this.lastPointer = null;
    this.lastPinchDistance = 0;
  }

  preload() {
    TILE_URLS.forEach((url, i) => this.load.image(`showa-${i}`, url));
  }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#1d261c');
    cam.setBounds(0, 0, WORLD_W, WORLD_H);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        this.add.image(c * TILE_W, r * TILE_H, `showa-${i}`)
          .setOrigin(0, 0)
          .setDepth(0);
      }
    }

    this.hotspots = [
      { name: '喫茶店吧檯', x: 300, y: 250 },
      { name: '戶外桌位', x: 360, y: 500 },
      { name: '公園長椅', x: 1330, y: 500 },
      { name: '大樹下', x: 780, y: 420 }
    ];

    this.hotspots.forEach(h => {
      const zone = this.add.zone(h.x, h.y, 130, 100).setInteractive().setDepth(20);
      zone.on('pointerdown', () => {
        const el = document.getElementById('status');
        if (el) el.textContent = `${h.name} · 未來 Agent social hotspot`;
      });
    });

    this.setupCameraControls();
    this.setupZoomButtons();
    this.fitScene();
  }

  fitScene() {
    const cam = this.cameras.main;
    const fit = Math.min(this.scale.width / WORLD_W, this.scale.height / WORLD_H);
    cam.setZoom(Phaser.Math.Clamp(fit, MIN_ZOOM, 1.5));
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
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

    document.getElementById('zoom-in')?.addEventListener('click', () => this.zoomAt(cx(), cy(), cam.zoom * 1.25));
    document.getElementById('zoom-out')?.addEventListener('click', () => this.zoomAt(cx(), cy(), cam.zoom / 1.25));
    document.getElementById('zoom-reset')?.addEventListener('click', () => this.fitScene());
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#1d261c',
  scene: ShowaLittleWorld,
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false }
});

window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
  const scene = game.scene.getScene('ShowaLittleWorld');
  if (scene?.scene?.isActive()) scene.fitScene();
});