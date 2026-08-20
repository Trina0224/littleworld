'use strict';

const WORLD_W = 1536;
const WORLD_H = 864;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3.0;
const EXPECTED_BASE64_LENGTH = 86776;
const PART_FILES = [
  'part-00.txt',
  'part-01.txt',
  'fix-02-0.txt',
  'fix-02-1a.txt',
  'fix-02-1b0.txt',
  'fix-02-1b1.txt',
  'fix-02-1b2.txt',
  'fix-02-1b3c.txt',
  'fix-02-1b4.txt',
  'fix-02-2.txt',
  'fix-02-3.txt',
  'part-03.txt',
  'part-04.txt',
  'part-05.txt',
  'part-06.txt',
  'fix-07-0.txt',
  'fix-07-1.txt',
  'fix-07-2.txt',
  'fix-07-3.txt'
];
const EXPECTED_PART_LENGTHS = [
  11000, 11000, 2750, 1375, 275, 275, 275, 275, 275,
  2750, 2750, 11000, 11000, 11000, 11000, 2444, 2444, 2444, 2444
];
const PART_URLS = PART_FILES.map(
  (file) => `./assets/showa/master/${file}?v=20260819-1937`
);

function setStatus(message) {
  const element = document.getElementById('status');
  if (element) element.textContent = message;
}

async function loadSceneDataUrl() {
  setStatus(`正在載入完整昭和場景… 0/${PART_URLS.length}`);

  const parts = [];
  for (let index = 0; index < PART_URLS.length; index += 1) {
    const response = await fetch(PART_URLS[index], { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`背景分段 ${index + 1}/${PART_URLS.length} 載入失敗（HTTP ${response.status}）`);
    }

    const part = (await response.text()).replace(/\s+/g, '');
    if (part.length !== EXPECTED_PART_LENGTHS[index]) {
      throw new Error(`背景分段 ${index + 1} 長度錯誤（${part.length}/${EXPECTED_PART_LENGTHS[index]}）`);
    }
    parts.push(part);
    setStatus(`正在載入完整昭和場景… ${index + 1}/${PART_URLS.length}`);
  }

  const base64 = parts.join('');
  if (base64.length !== EXPECTED_BASE64_LENGTH) {
    throw new Error(`背景資料不完整（${base64.length}/${EXPECTED_BASE64_LENGTH}）`);
  }
  if (!base64.startsWith('UklGR')) {
    throw new Error('背景資料格式錯誤');
  }

  return `data:image/webp;base64,${base64}`;
}

function bootGame(backgroundDataUrl) {
  class ShowaLittleWorld extends Phaser.Scene {
    constructor() {
      super('ShowaLittleWorld');
      this.dragging = false;
      this.lastPointer = null;
      this.lastPinchDistance = 0;
    }

    preload() {
      this.load.on('loaderror', () => {
        setStatus('場景圖片解碼失敗，請重新整理頁面');
      });
      this.load.image('showa-master', backgroundDataUrl);
    }

    create() {
      const camera = this.cameras.main;
      camera.setBackgroundColor('#171a16');
      camera.setBounds(0, 0, WORLD_W, WORLD_H, true);

      const sourceImage = this.textures.get('showa-master').getSourceImage();
      if (sourceImage.width !== 1024 || sourceImage.height !== 576) {
        setStatus(`場景圖片尺寸錯誤（${sourceImage.width}×${sourceImage.height}）`);
        return;
      }

      this.add.image(0, 0, 'showa-master')
        .setOrigin(0, 0)
        .setDisplaySize(WORLD_W, WORLD_H)
        .setDepth(0);

      this.hotspots = [
        { name: '喫茶店吧檯', x: 430, y: 400 },
        { name: '戶外桌位', x: 550, y: 590 },
        { name: '公園長椅', x: 1240, y: 655 },
        { name: '大樹下', x: 970, y: 430 }
      ];

      this.hotspots.forEach((hotspot) => {
        const zone = this.add.zone(hotspot.x, hotspot.y, 160, 115)
          .setInteractive()
          .setDepth(20);
        zone.on('pointerdown', () => {
          setStatus(`${hotspot.name} · 未來 Agent social hotspot`);
        });
      });

      this.setupCameraControls();
      this.setupZoomButtons();
      this.fitScene();
      setStatus('完整昭和 render · 1536×864 · Agent layer 尚未加入');
    }

    fitScene() {
      const camera = this.cameras.main;
      const viewportWidth = this.scale.gameSize.width || window.innerWidth;
      const viewportHeight = this.scale.gameSize.height || window.innerHeight;
      const fitZoom = Math.min(viewportWidth / WORLD_W, viewportHeight / WORLD_H) * 0.995;
      camera.setZoom(Phaser.Math.Clamp(fitZoom, MIN_ZOOM, MAX_ZOOM));
      camera.centerOn(WORLD_W / 2, WORLD_H / 2);
    }

    zoomAt(screenX, screenY, targetZoom) {
      const camera = this.cameras.main;
      const zoom = Phaser.Math.Clamp(targetZoom, MIN_ZOOM, MAX_ZOOM);
      const before = camera.getWorldPoint(screenX, screenY);
      camera.setZoom(zoom);
      const after = camera.getWorldPoint(screenX, screenY);
      camera.scrollX += before.x - after.x;
      camera.scrollY += before.y - after.y;
    }

    setupCameraControls() {
      const camera = this.cameras.main;
      this.input.addPointer(2);

      this.input.on('pointerdown', (pointer) => {
        const active = this.input.manager.pointers.filter((item) => item.isDown);
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
        const active = this.input.manager.pointers.filter((item) => item.isDown);
        if (active.length < 2) this.lastPinchDistance = 0;
        if (active.length === 0) {
          this.dragging = false;
          this.lastPointer = null;
        }
      });

      this.input.on('pointermove', (pointer) => {
        const active = this.input.manager.pointers.filter((item) => item.isDown);
        if (active.length >= 2) {
          const [first, second] = active;
          const distance = Phaser.Math.Distance.Between(
            first.x,
            first.y,
            second.x,
            second.y
          );
          if (this.lastPinchDistance > 0) {
            this.zoomAt(
              (first.x + second.x) / 2,
              (first.y + second.y) / 2,
              camera.zoom * distance / this.lastPinchDistance
            );
          }
          this.lastPinchDistance = distance;
          this.dragging = false;
          return;
        }

        if (!this.dragging || !this.lastPointer) return;
        const deltaX = pointer.x - this.lastPointer.x;
        const deltaY = pointer.y - this.lastPointer.y;
        camera.scrollX -= deltaX / camera.zoom;
        camera.scrollY -= deltaY / camera.zoom;
        this.lastPointer = { x: pointer.x, y: pointer.y };
      });

      this.input.on('wheel', (pointer, objects, deltaX, deltaY) => {
        this.zoomAt(pointer.x, pointer.y, camera.zoom - deltaY * 0.0008);
      });
    }

    setupZoomButtons() {
      const camera = this.cameras.main;
      const centerX = () => this.scale.width / 2;
      const centerY = () => this.scale.height / 2;

      document.getElementById('zoom-in')?.addEventListener('click', () => {
        this.zoomAt(centerX(), centerY(), camera.zoom * 1.25);
      });
      document.getElementById('zoom-out')?.addEventListener('click', () => {
        this.zoomAt(centerX(), centerY(), camera.zoom / 1.25);
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
}

loadSceneDataUrl()
  .then(bootGame)
  .catch((error) => {
    console.error(error);
    setStatus(`場景載入失敗：${error.message}`);
  });
