'use strict';

const WORLD_W = 640;
const WORLD_H = 360;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 6.0;
const BACKGROUND_URL = './assets/showa/scene-clean-2560.webp?v=20260820-hires1';
const SPEC_VERSION = '20260823-cast1';
const SPEC = {
  walkable: `./specs/world/walkable.png?v=${SPEC_VERSION}`,
  backstage: `./specs/world/backstage.png?v=${SPEC_VERSION}`,
  occluder: `./specs/world/occluder.png?v=${SPEC_VERSION}`,
  seatbacks: `./specs/world/seatbacks.png?v=${SPEC_VERSION}`,
  tables: `./specs/world/tables.png?v=${SPEC_VERSION}`,
  anchors: `./specs/world/anchors.json?v=${SPEC_VERSION}`
};
const CAST = {
  placements: `./specs/characters/placements.json?v=${SPEC_VERSION}`,
  occdepth: `./specs/world/occdepth.png?v=${SPEC_VERSION}`,
  sprite: (key) => `./assets/characters/${key}.png?v=${SPEC_VERSION}`
};

// The background texture is 2560 x 1440 shown at 640 x 360 world units, so one
// world unit is four texture pixels. Characters are rasterised at the same
// scale: sharper than the background would only look wrong.
const PX_PER_UNIT = 4;

// Debug layers are tinted with ADD, so the black half of each 1-bit mask
// contributes nothing and only the marked cells colour the scene.
const LAYERS = [
  { key: 'walkable', label: '可走', colour: 0x3cff6e, alpha: 0.30 },
  { key: 'backstage', label: '幕後', colour: 0xff1f1f, alpha: 0.55 },
  { key: 'occluder', label: '遮擋', colour: 0x4a7bff, alpha: 0.26 },
  { key: 'seatbacks', label: '椅背', colour: 0xff5ad1, alpha: 0.42 },
  { key: 'tables', label: '桌面', colour: 0xffa03c, alpha: 0.42 }
];

function setStatus(message) {
  const element = document.getElementById('status');
  if (element) element.textContent = message;
}

class ShowaLittleWorld extends Phaser.Scene {
  constructor(config) {
    super(config ?? 'ShowaLittleWorld');
    this.dragging = false;
    this.lastPointer = null;
    this.lastPinchDistance = 0;
  }

  preload() {
    setStatus('正在載入無人物昭和背景…');
    this.load.image('showa-clean-background', BACKGROUND_URL);
    LAYERS.forEach((layer) => this.load.image(`spec-${layer.key}`, SPEC[layer.key]));
    this.load.json('spec-anchors', SPEC.anchors);
    this.load.json('cast-placements', CAST.placements);
    this.load.image('occ-depth', CAST.occdepth);
    this.load.on('filecomplete-json-cast-placements', () => {
      const cast = this.cache.json.get('cast-placements');
      new Set((cast?.placements ?? []).map((p) => p.key))
        .forEach((key) => this.load.image(`cast-${key}`, CAST.sprite(key)));
    });
    this.load.on('loaderror', (file) => {
      setStatus(`載入失敗：${file?.src ?? BACKGROUND_URL}`);
    });
  }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#171a16');
    cam.setBounds(0, 0, WORLD_W, WORLD_H);

    // The texture is 2560 x 1440; display it at world size so world units
    // stay 640 x 360 and the extra pixels are spent on zoom instead.
    this.add
      .image(0, 0, 'showa-clean-background')
      .setOrigin(0, 0)
      .setDisplaySize(WORLD_W, WORLD_H)
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

    // The replay page draws its own cast from a timeline instead of the static
    // placements. Everything else about this scene - background, occlusion,
    // camera, debug layers - is the same scene either way, which is the point.
    if (this.staticCast !== false) this.buildCast();
    this.buildDebugLayers();
    this.setupCameraControls();
    this.setupZoomButtons();
    this.setupDebugToggle();
    this.fitScene();
    setStatus(this.castStatus ?? '2560×1440 clean WebP background');
  }

  /**
   * Cut one sprite to whatever stands in front of it, and hand back a texture
   * key. Split out of buildCast so a moving character can be recut when its
   * depth row changes - the rule is the same one, applied more than once.
   */
  cutSprite(key, box, depthRow, textureKey) {
    const source = this.textures.get(key).getSourceImage();
    const w = Math.max(1, Math.round(box.w * PX_PER_UNIT));
    const h = Math.max(1, Math.round(box.h * PX_PER_UNIT));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, w, h);
    const depth = this.occDepth ?? (this.occDepth = this.readOccluderDepth());
    let erased = 0;
    if (depth) {
      const x0 = Math.round(box.x * PX_PER_UNIT);
      const y0 = Math.round(box.y * PX_PER_UNIT);
      const floor = depthRow * PX_PER_UNIT;
      const img = ctx.getImageData(0, 0, w, h);
      const px = img.data;
      for (let j = 0; j < h; j += 1) {
        const sy = y0 + j;
        if (sy < 0 || sy >= depth.h) continue;
        for (let i = 0; i < w; i += 1) {
          const sx = x0 + i;
          if (sx < 0 || sx >= depth.w) continue;
          if (depth.rows[sy * depth.w + sx] > floor) {
            px[(j * w + i) * 4 + 3] = 0;
            erased += 1;
          }
        }
      }
      if (erased) ctx.putImageData(img, 0, 0);
    }
    if (this.textures.exists(textureKey)) this.textures.remove(textureKey);
    this.textures.addCanvas(textureKey, canvas);
    return erased > 0;
  }

  /** The occluder's floor line per texture pixel, unpacked from occdepth.png. */
  readOccluderDepth() {
    if (!this.textures.exists('occ-depth')) return null;
    const source = this.textures.get('occ-depth').getSourceImage();
    const w = source.width;
    const h = source.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const rows = new Uint16Array(w * h);
    for (let i = 0, p = 0; i < rows.length; i += 1, p += 4) {
      rows[i] = (data[p] << 8) | data[p + 1];
    }
    return { rows, w, h };
  }

  /**
   * Place the cast, each one cut by whatever stands in front of it.
   *
   * Occlusion is the whole reason this is not just twelve `add.image` calls. A
   * character is hidden exactly where an occluder's floor line is below its own
   * - a table hides someone seated behind it and must not hide someone walking
   * in front of it - so each sprite is rasterised once into its own canvas and
   * the covered pixels are erased there. Same rule the offline renderer draws
   * with, and it still holds when the characters start moving: recut the ones
   * whose depth changed.
   */
  buildCast() {
    const cast = this.cache.json.get('cast-placements');
    const placements = cast?.placements ?? [];
    if (!placements.length) {
      this.castStatus = '2560×1440 clean WebP background · 人物尚未載入';
      return;
    }
    let cut = 0;

    placements.forEach((p) => {
      const key = `cast-${p.key}`;
      if (!this.textures.exists(key)) return;
      if (this.cutSprite(key, p, p.depth, `cast-cut-${p.key}`)) cut += 1;
      this.add
        .image(p.x, p.y, `cast-cut-${p.key}`)
        .setOrigin(0, 0)
        .setDisplaySize(p.w, p.h)
        .setDepth(1 + p.depth / 1000);
    });

    this.castStatus = `2560×1440 背景 · ${placements.length} 人在場 · ${cut} 人有遮擋`;
  }

  buildDebugLayers() {
    this.debug = this.add.container(0, 0).setDepth(20).setVisible(false);

    LAYERS.forEach((layer) => {
      if (!this.textures.exists(`spec-${layer.key}`)) return;
      this.debug.add(
        this.add
          .image(0, 0, `spec-${layer.key}`)
          .setOrigin(0, 0)
          .setDisplaySize(WORLD_W, WORLD_H)
          .setTint(layer.colour)
          .setAlpha(layer.alpha)
          .setBlendMode(Phaser.BlendModes.ADD)
      );
    });

    const spec = this.cache.json.get('spec-anchors');
    if (!spec) return;

    const marks = this.add.graphics();
    const draw = (point, facingDeg, colour, radius) => {
      const angle = Phaser.Math.DegToRad(facingDeg);
      marks.lineStyle(1.2, 0x000000, 0.85);
      marks.lineBetween(point[0], point[1],
        point[0] + Math.cos(angle) * 11, point[1] + Math.sin(angle) * 11);
      marks.lineStyle(0.7, colour, 1);
      marks.lineBetween(point[0], point[1],
        point[0] + Math.cos(angle) * 11, point[1] + Math.sin(angle) * 11);
      marks.fillStyle(colour, 1);
      marks.fillCircle(point[0], point[1], radius);
      marks.lineStyle(0.5, 0x000000, 0.9);
      marks.strokeCircle(point[0], point[1], radius);
    };

    (spec.seats ?? []).forEach((seat) => {
      const point = seat.seatSurface?.centre ?? seat.seat;
      if (point) draw(point, seat.facingDeg, 0xffd23c, 1.7);
    });
    (spec.stations ?? []).forEach((station) => draw(station.anchor, station.facingDeg, 0x5ad1ff, 2.4));
    this.debug.add(marks);
  }

  setupDebugToggle() {
    const button = document.getElementById('toggle-debug');
    const apply = () => {
      const on = this.debug.visible;
      button?.setAttribute('aria-pressed', String(on));
      button?.classList.toggle('on', on);
      setStatus(on
        ? 'World spec 疊圖：綠=可走 紅=幕後 藍=遮擋 桃=椅背 橙=桌面 黃點=座位 青點=站位'
        : this.castStatus ?? '2560×1440 clean WebP background');
    };
    const toggle = () => {
      this.debug.setVisible(!this.debug.visible);
      apply();
    };
    button?.addEventListener('click', toggle);
    this.input.keyboard?.on('keydown-D', toggle);
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

// The replay page constructs its own game around the same scene, so this file
// only starts one when nothing else has claimed it.
const game = window.LITTLEWORLD_NO_AUTOSTART ? null : new Phaser.Game({
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

// Handy from the browser console: game.scene.scenes[0].cameras.main.
window.game = game;
window.ShowaLittleWorld = ShowaLittleWorld;
window.LITTLEWORLD = { WORLD_W, WORLD_H, PX_PER_UNIT, SPEC, CAST, setStatus };

if (game) {
  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
    const scene = game.scene.getScene('ShowaLittleWorld');
    if (scene?.scene?.isActive()) scene.fitScene();
  });
}
