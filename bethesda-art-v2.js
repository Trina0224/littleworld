(() => {
  const ROOT = './assets/bethesda/v2/';
  const ASSETS = {
    water: 'water-neutral.svg',
    wallEW: 'pool-wall-ew.svg',
    wallNS: 'pool-wall-ns.svg',
    corner: 'pool-corner.svg',
    stairs: 'pool-stairs-wide.svg',
    portico: 'portico-ew.svg',
    porticoCorner: 'portico-corner.svg',
    column: 'column.svg'
  };

  function waitForScene() {
    if (typeof game === 'undefined') {
      setTimeout(waitForScene, 60);
      return;
    }

    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) {
      setTimeout(waitForScene, 60);
      return;
    }

    Object.entries(ASSETS).forEach(([key, file]) => {
      scene.load.svg(`bethesdaV2-${key}`, `${ROOT}${file}`);
    });

    scene.load.once('complete', () => drawBethesdaV2(scene));
    scene.load.start();
  }

  function bounds(points) {
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    };
  }

  function maskedTile(scene, key, points, depth, alpha, offsetX = 0, offsetY = 0) {
    const box = bounds(points);
    const tile = scene.add.tileSprite(
      box.centerX,
      box.centerY,
      Math.max(2, box.width + 8),
      Math.max(2, box.height + 8),
      key
    ).setDepth(depth).setAlpha(alpha);

    tile.tileScaleX = 0.72;
    tile.tileScaleY = 0.72;
    tile.tilePositionX = offsetX;
    tile.tilePositionY = offsetY;

    const maskGraphics = scene.make.graphics({ add: false });
    maskGraphics.fillStyle(0xffffff, 1);
    maskGraphics.fillPoints(points, true);
    tile.setMask(maskGraphics.createGeometryMask());
    return tile;
  }

  function place(scene, key, east, south, width, height, depthOffset, originY = 0.9, flipX = false, alpha = 1) {
    const point = scene.p(east, south);
    return scene.add.image(point.x, point.y, key)
      .setOrigin(0.5, originY)
      .setDisplaySize(width, height)
      .setFlipX(flipX)
      .setAlpha(alpha)
      .setDepth(point.y + depthOffset);
  }

  function castShadow(scene, east, south, widthM, heightM, depth, alpha = 0.12) {
    const base = scene.p(east, south);
    const width = widthM * PX_PER_M;
    const length = heightM * PX_PER_M * 0.82;
    const dx = -length * 0.82;
    const dy = -length * 0.52;
    scene.polygon([
      new Phaser.Math.Vector2(base.x - width / 2, base.y),
      new Phaser.Math.Vector2(base.x + width / 2, base.y),
      new Phaser.Math.Vector2(base.x + width / 2 + dx, base.y + dy),
      new Phaser.Math.Vector2(base.x - width / 2 + dx, base.y + dy)
    ], 0x000000, alpha, null, 1, 0, depth);
  }

  function drawPaving(scene, east, south, width, depthM, layerDepth) {
    scene.worldRect(east, south, width, depthM, 0xcbbd9b, 0.98, 0x9b896a, layerDepth);
    const lines = scene.add.graphics().setDepth(layerDepth + 0.1);
    lines.lineStyle(1, 0x79694f, 0.24);
    for (let x = 0; x <= width; x += 4) {
      const a = scene.p(east + x, south);
      const b = scene.p(east + x, south + depthM);
      lines.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let y = 0; y <= depthM; y += 4) {
      const a = scene.p(east, south + y);
      const b = scene.p(east + width, south + y);
      lines.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function drawBethesdaV2(scene) {
    const e = 418;
    const s = 78;
    const w = 46;
    const totalDepth = 92;
    const divider = 6.5;
    const poolDepth = (totalDepth - divider) / 2;
    const southPoolS = s + poolDepth + divider;

    drawPaving(scene, e - 8, s - 8, w + 16, totalDepth + 16, 205);

    const northWater = scene.quad(e + 2.3, s + 2.4, w - 4.6, poolDepth - 4.8);
    const southWater = scene.quad(e + 2.3, southPoolS + 2.4, w - 4.6, poolDepth - 4.8);
    scene.polygon(northWater, 0x3f7482, 0.98, 0x315b75, 1, 3, 210);
    scene.polygon(southWater, 0x447986, 0.98, 0x315b75, 1, 3, 210);

    const waterA = maskedTile(scene, 'bethesdaV2-water', northWater, 211, 0.5, 15, 0);
    const waterB = maskedTile(scene, 'bethesdaV2-water', southWater, 211, 0.45, 95, 40);
    scene.events.on('update', (_time, delta) => {
      waterA.tilePositionX += delta * 0.0022;
      waterA.tilePositionY -= delta * 0.0011;
      waterB.tilePositionX += delta * 0.0018;
      waterB.tilePositionY -= delta * 0.0009;
    });

    const wallWidth = 42 * PX_PER_M;
    const wallHeight = 4.6 * PX_PER_M;
    for (const wallSouth of [s + 0.8, s + poolDepth + divider / 2, s + totalDepth - 0.4]) {
      const point = scene.p(e + w / 2, wallSouth);
      scene.add.image(point.x, point.y, 'bethesdaV2-wallEW')
        .setOrigin(0.5, 0.84)
        .setDisplaySize(wallWidth, wallHeight)
        .setDepth(point.y + 235)
        .setAlpha(0.84);
    }

    for (const sideEast of [e - 0.8, e + w + 0.8]) {
      for (const sideSouth of [s + 22, s + 69]) {
        const point = scene.p(sideEast, sideSouth);
        scene.add.image(point.x, point.y, 'bethesdaV2-wallNS')
          .setOrigin(0.5, 0.86)
          .setDisplaySize(15 * PX_PER_M, 7.2 * PX_PER_M)
          .setFlipX(sideEast < e)
          .setDepth(point.y + 228)
          .setAlpha(0.68);
      }
    }

    for (const offset of [11.5, 34.5]) {
      for (const porticoSouth of [s - 1.5, s + poolDepth + divider / 2, s + totalDepth + 2.5]) {
        castShadow(scene, e + offset, porticoSouth, 16, 6.5, 218, 0.105);
        place(
          scene,
          'bethesdaV2-portico',
          e + offset,
          porticoSouth,
          18 * PX_PER_M,
          7.3 * PX_PER_M,
          255,
          0.91
        );
      }
    }

    for (const offset of [10, 25, 64, 79]) {
      for (const columnEast of [e - 3.4, e + w + 3.4]) {
        castShadow(scene, columnEast, s + offset, 2.1, 6.2, 219, 0.11);
        place(
          scene,
          'bethesdaV2-column',
          columnEast,
          s + offset,
          2.15 * PX_PER_M,
          6.7 * PX_PER_M,
          265,
          0.98,
          columnEast > e + w
        );
      }
    }

    const stepsPoint = scene.p(e + w / 2, s + totalDepth - 2.5);
    scene.add.image(stepsPoint.x, stepsPoint.y, 'bethesdaV2-stairs')
      .setOrigin(0.5, 0.88)
      .setDisplaySize(34 * PX_PER_M, 11 * PX_PER_M)
      .setDepth(stepsPoint.y + 275)
      .setAlpha(0.96);

    const cornerPoint = scene.p(e - 1, s - 1);
    scene.add.image(cornerPoint.x, cornerPoint.y, 'bethesdaV2-corner')
      .setOrigin(0.53, 0.79)
      .setDisplaySize(12 * PX_PER_M, 9 * PX_PER_M)
      .setDepth(cornerPoint.y + 270)
      .setAlpha(0.9);

    scene.labelAt('畢士大池 · Art Pass 02', 404, 60, 18, 930);

    const status = document.getElementById('status');
    if (status) status.textContent = 'Bethesda Art Pass 02 · 獨立 SVG 素材 · Phaser 統一投影與陰影';
    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.8';
  }

  window.addEventListener('load', waitForScene, { once: true });
})();
