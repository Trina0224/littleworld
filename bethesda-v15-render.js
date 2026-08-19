(() => {
  const ASSET_KEY = 'bethesdaFixedRender';
  const ASSET_PATH = './assets/bethesda/render/bethesda-fixed.webp';

  function waitForScene() {
    if (typeof game === 'undefined') {
      setTimeout(waitForScene, 80);
      return;
    }

    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) {
      setTimeout(waitForScene, 80);
      return;
    }

    if (scene.__bethesdaV15Applied) return;

    scene.load.image(ASSET_KEY, ASSET_PATH);
    scene.load.once('complete', () => applyRenderedLandmark(scene));
    scene.load.start();
  }

  function projectedBounds(scene, east, south, widthM, depthM) {
    const points = scene.quad(east, south, widthM, depthM);
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function hideOldBethesdaLabel(scene) {
    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text === '畢士大池' || text.startsWith('v0.7')) child.setVisible(false);
    }
  }

  function applyRenderedLandmark(scene) {
    if (scene.__bethesdaV15Applied) return;
    scene.__bethesdaV15Applied = true;

    hideOldBethesdaLabel(scene);

    // The browser never rotates this camera. A single pre-rendered 2.5D landmark
    // therefore gives us the painterly fidelity of the concept art without
    // pretending that procedural vector geometry can reproduce it.
    const footprint = projectedBounds(scene, 409.5, 69.5, 63, 109);
    const displayWidth = footprint.width * 1.075;
    const displayHeight = displayWidth * (574 / 950);

    const image = scene.add.image(
      footprint.centerX + 1,
      footprint.centerY - 5,
      ASSET_KEY
    )
      .setOrigin(0.5, 0.5)
      .setDisplaySize(displayWidth, displayHeight)
      .setDepth(1900);

    // Preserve the authoritative world footprint as the interaction target.
    const hitPoints = scene.quad(409.5, 69.5, 63, 109);
    const hitArea = scene.add.polygon(0, 0, hitPoints, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive(new Phaser.Geom.Polygon(hitPoints), Phaser.Geom.Polygon.Contains)
      .setDepth(2000);

    hitArea.on('pointerdown', () => {
      const status = document.getElementById('status');
      if (status) {
        status.textContent = '畢士大池 — fixed-camera 2.5D rendered landmark；互動與角色仍使用 46 × 92m 世界座標';
      }
    });

    // Keep a subtle location outline available at close zoom without drawing over the art.
    const outline = scene.add.graphics().setDepth(1899);
    outline.lineStyle(2, 0x5f5140, 0.18);
    outline.strokePoints(hitPoints, true);

    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.15';

    const status = document.getElementById('status');
    if (status) {
      status.textContent = 'Bethesda v0.15 · fixed 2.5D rendered landmark；no camera rotation';
    }

    // Expose for later agent layering and calibration.
    scene.bethesdaRenderedLandmark = {
      image,
      hitArea,
      worldBounds: { east: 418, south: 78, widthM: 46, depthM: 92 },
    };
  }

  window.addEventListener('load', waitForScene, { once: true });
})();
