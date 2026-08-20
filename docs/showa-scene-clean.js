'use strict';

const WORLD_W = 640;
const WORLD_H = 360;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3.0;
const BACKGROUND_URL = './assets/showa/scene-clean.webp?v=20260819-asset1';

function setStatus(message) {
  const element = document.getElementById('status');
  if (element) element.textContent = message;
}

class ShowaLittleWorld extends Phaser.Scene {
  constructor() {
    super('ShowaLittleWorld');
    this.dragging = false;
    this.lastPointer = null;
    this.lastPinchDistance = 0;
  }

  preload() {
    setStatus('正在載入無人物昭和背景…');
    this.load.image('showa-clean-background', BACKGROUND_URL);
    this.load.on('loaderror', (file) => {
      setStatus(`背景載入失敗：${file?.src ?? BACKGROUND_URL}`);
    });
  }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#171a16');
    cam.setBounds(0, 0, WORLD_W, WORLD_H);

    this.add
      .image(0, 0, 'showa-clean-background')
      .setOrigin(0, 0)
      .setDepth(0);

    this.hotspots = [
      { name: '喫茶店吧檯', x: 206, y: 177 },
      { name: '戶外桌位', x: 250, y: 234 },
      { name: '公園長椅', x: 500, y: 269 },
      { name: '大樹下', x: 411, y: 188 }
    ];

    this.hotspots.forEach((hotspot) => {
      this.add
        .zone(hotspot.x, hotspot.y, 70, 52)
        .setInteractive()
        .setDepth(10)
        .on('pointerdown', () => {
          setStatus(`${hotspot.name} · future Agent social hotspot`);
        });
    });

    this.setupCameraControls();
    this.setupZoomButtons();
    this.fitScene();
    setStatus('Clean WebP background · 無人物 · Agent layer 尚未加入');
  }

  fitScene() {
    const cam = this.cameras.main;
    const fit = Math.min(
      this.scale.width / WORLD_W,
      this.scale.height / WORLD_H
    );
    cam.setZoom(Phaser.Math.Clamp(fit, MIN_ZOOM, MAX_ZOOM));
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
  }

  zoomAt(screenX, screenY, targetZoom) {
    const cam = this.cameras.main;
    const zoom = Phaser.Math.Clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
    const before = cam.getWorldPoint(screenX, screenY);
    cam.setZoom(zoom);
    const after = cam.getWorldPoint(screenX, screenY);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  setupCameraControls() {
    const cam = this.cameras.main;
    this.input.addPointer(2);

    this.input.on('pointerdown', (pointer) => {
      const active = this.input.manager.pointers.filter((p) => p.isDown);
      if (active.length >= 2) {
        this.dragging = false;
        this.lastPinchDistance = Phaser.Math.Distance.Between(
          active[0].x,
          active[0].y,
          active[1].x,
          active[1].y
        );
        return;
      }
      this.dragging = true;
      this.lastPointer = { x: pointer.x, y: pointer.y };
    });

    this.input.on('pointerup', () => {
      const active = this.input.manager.pointers.filter((p) => p.isDown);
      if (active.length < 2) this.lastPinchDistance = 0;
      if (active.length === 0) {
        this.dragging = false;
        this.lastPointer = null;
      }
    });

    this.input.on('pointermove', (pointer) => {
      const active = this.input.manager.pointers.filter((p) => p.isDown);
      if (active.length >= 2) {
        const [a, b] = active;
        const distance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        if (this.lastPinchDistance > 0) {
          this.zoomAt(
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
            cam.zoom * (distance / this.lastPinchDistance)
          );
        }
        this.lastPinchDistance = distance;
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

    this.input.on('wheel', (pointer, objects, dx, dy) => {
      this.zoomAt(pointer.x, pointer.y, cam.zoom - dy * 0.0008);
    });
  }

  setupZoomButtons() {
    const cam = this.cameras.main;
    const centerX = () => this.scale.width / 2;
    const centerY = () => this.scale.height / 2;

    document.getElementById('zoom-in')?.addEventListener('click', () => {
      this.zoomAt(centerX(), centerY(), cam.zoom * 1.25);
    });

    document.getElementById('zoom-out')?.addEventListener('click', () => {
      this.zoomAt(centerX(), centerY(), cam.zoom / 1.25);
    });

    document.getElementById('zoom-reset')?.addEventListener('click', () => {
      this.fitScene();
    });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#171a16',
  scene: ShowaLittleWorld,
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
  const scene = game.scene.getScene('ShowaLittleWorld');
  if (scene?.scene?.isActive()) scene.fitScene();
});
