(() => {
  function waitForArt() {
    if (typeof game === 'undefined') {
      setTimeout(waitForArt, 80);
      return;
    }

    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) {
      setTimeout(waitForArt, 80);
      return;
    }

    const hasPortico = scene.children.list.some(child => child.texture?.key === 'bethesdaV2-portico');
    if (!hasPortico) {
      setTimeout(waitForArt, 100);
      return;
    }

    applySideFix(scene);
  }

  function removeWrongSideAssets(scene) {
    for (const child of [...scene.children.list]) {
      const key = child.texture?.key;
      if (key === 'bethesdaV2-wallNS' || key === 'bethesdaV2-column') {
        child.destroy();
      }
    }
  }

  function prism(scene, east, south, widthM, depthM, heightM, colors, baseDepth) {
    const b0 = scene.p(east, south, 0);
    const b1 = scene.p(east + widthM, south, 0);
    const b2 = scene.p(east + widthM, south + depthM, 0);
    const b3 = scene.p(east, south + depthM, 0);
    const t0 = scene.p(east, south, heightM);
    const t1 = scene.p(east + widthM, south, heightM);
    const t2 = scene.p(east + widthM, south + depthM, heightM);
    const t3 = scene.p(east, south + depthM, heightM);

    scene.polygon([b3, b2, t2, t3], colors.south, 1, null, 1, 0, baseDepth + 1);
    scene.polygon([b0, b3, t3, t0], colors.west, 1, null, 1, 0, baseDepth + 2);
    scene.polygon([b1, b2, t2, t1], colors.east, 1, null, 1, 0, baseDepth + 2);
    scene.polygon([t0, t1, t2, t3], colors.top, 1, colors.stroke, 0.65, 1.5, baseDepth + 3);
  }

  function shiftedShadow(scene, east, south, widthM, depthM, heightM, depth, alpha) {
    const quad = scene.quad(east, south, widthM, depthM);
    const length = heightM * PX_PER_M * 0.48;
    const dx = -length * 0.84;
    const dy = -length * 0.54;
    const shifted = quad.map(point => new Phaser.Math.Vector2(point.x + dx, point.y + dy));
    scene.polygon(shifted, 0x000000, alpha, null, 1, 0, depth);
  }

  function roofTileLines(scene, east, south, widthM, depthM, heightM, depth) {
    const graphics = scene.add.graphics().setDepth(depth);
    graphics.lineStyle(1.1, 0x70442f, 0.58);
    for (let offset = 2.5; offset < depthM; offset += 4.2) {
      const a = scene.p(east, south + offset, heightM + 0.02);
      const b = scene.p(east + widthM, south + offset, heightM + 0.02);
      graphics.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function placeColumn(scene, east, south, heightM, depthOffset) {
    const point = scene.p(east, south);
    const shadowLength = heightM * PX_PER_M * 0.72;
    const shadowWidth = 2.1 * PX_PER_M;
    scene.polygon([
      new Phaser.Math.Vector2(point.x - shadowWidth * 0.45, point.y),
      new Phaser.Math.Vector2(point.x + shadowWidth * 0.45, point.y),
      new Phaser.Math.Vector2(point.x + shadowWidth * 0.45 - shadowLength * 0.82, point.y - shadowLength * 0.52),
      new Phaser.Math.Vector2(point.x - shadowWidth * 0.45 - shadowLength * 0.82, point.y - shadowLength * 0.52)
    ], 0x000000, 0.1, null, 1, 0, point.y + depthOffset - 4);

    scene.add.image(point.x, point.y, 'bethesdaV2-column')
      .setOrigin(0.5, 0.98)
      .setDisplaySize(2.1 * PX_PER_M, heightM * PX_PER_M)
      .setDepth(point.y + depthOffset);
  }

  function drawSidePortico(scene, east, south, widthM, depthM, innerEast) {
    shiftedShadow(scene, east, south, widthM, depthM, 6.2, 219, 0.09);

    scene.worldRect(east, south, widthM, depthM, 0xc7b894, 0.96, 0x9b896a, 221);

    prism(
      scene,
      east,
      south,
      widthM,
      depthM,
      6.2,
      {
        top: 0xa85f3f,
        south: 0x77523c,
        west: 0x6d4b38,
        east: 0x805a42,
        stroke: 0x704733
      },
      260
    );
    roofTileLines(scene, east, south, widthM, depthM, 6.2, 264);

    for (let offset = 5; offset <= depthM - 4; offset += 11.5) {
      placeColumn(scene, innerEast, south + offset, 5.9, 285);
    }
  }

  function drawSidePoolWall(scene, east, south, widthM, depthM) {
    prism(
      scene,
      east,
      south,
      widthM,
      depthM,
      1.05,
      {
        top: 0xe3d5b6,
        south: 0xa08d6c,
        west: 0x8f7b5d,
        east: 0xae9a77,
        stroke: 0x75644d
      },
      236
    );
  }

  function applySideFix(scene) {
    if (scene.__bethesdaV09Applied) return;
    scene.__bethesdaV09Applied = true;

    removeWrongSideAssets(scene);

    const e = 418;
    const s = 78;
    const w = 46;
    const totalDepth = 92;

    drawSidePoolWall(scene, e - 0.7, s, 1.45, totalDepth);
    drawSidePoolWall(scene, e + w - 0.75, s, 1.45, totalDepth);

    drawSidePortico(scene, e - 7.0, s - 1.5, 4.8, totalDepth + 3, e - 3.0);
    drawSidePortico(scene, e + w + 2.2, s - 1.5, 4.8, totalDepth + 3, e + w + 3.0);

    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text.includes('Art Pass 02')) child.setVisible(false);
      if (text.startsWith('v0.8')) {
        child.setText('v0.9 · Bethesda side porticoes corrected in world-space geometry');
      }
    }

    scene.labelAt('畢士大池 · Art Pass 03', 404, 60, 18, 950);

    const status = document.getElementById('status');
    if (status) status.textContent = 'Bethesda Art Pass 03 · 兩側廊柱與池壁已依同一 2.5D 投影重建';
    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.9';
  }

  window.addEventListener('load', waitForArt, { once: true });
})();
