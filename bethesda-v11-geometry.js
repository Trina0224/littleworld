(() => {
  const COLORS = {
    paving: 0xcdbf9f,
    pavingEdge: 0x9f8d6d,
    stoneTop: 0xe2d5b9,
    stoneLight: 0xc9b895,
    stoneMid: 0xa89572,
    stoneDark: 0x78684f,
    stoneStroke: 0x6e5f48,
    timberTop: 0x8a6b4b,
    timberSide: 0x604a38,
    waterNorth: 0x397987,
    waterSouth: 0x427f8b,
    waterDark: 0x285e6c,
    waterLight: 0xb4d7d1,
    shadow: 0x000000
  };

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
    if (scene.__bethesdaV11Applied) return;
    drawBethesda(scene);
  }

  function qz(scene, east, south, widthM, depthM, zM = 0) {
    return [
      scene.p(east, south, zM),
      scene.p(east + widthM, south, zM),
      scene.p(east + widthM, south + depthM, zM),
      scene.p(east, south + depthM, zM)
    ];
  }

  function maxY(points) {
    return Math.max(...points.map(point => point.y));
  }

  function prism(scene, east, south, widthM, depthM, baseZM, heightM, colors, depthOffset = 260) {
    const bottom = qz(scene, east, south, widthM, depthM, baseZM);
    const top = qz(scene, east, south, widthM, depthM, baseZM + heightM);
    const depth = maxY(bottom) + depthOffset;

    scene.polygon([bottom[3], bottom[2], top[2], top[3]], colors.south, 1, colors.stroke, 0.42, 1, depth + 1);
    scene.polygon([bottom[0], bottom[3], top[3], top[0]], colors.west, 1, colors.stroke, 0.42, 1, depth + 2);
    scene.polygon([bottom[1], bottom[2], top[2], top[1]], colors.east, 1, colors.stroke, 0.42, 1, depth + 2);
    scene.polygon(top, colors.top, 1, colors.stroke, 0.72, 1.5, depth + 3);
  }

  function shiftedShadow(scene, east, south, widthM, depthM, heightM, alpha = 0.1, depth = 214) {
    const base = qz(scene, east, south, widthM, depthM, 0);
    const length = heightM * PX_PER_M * 0.72;
    const dx = -length * 0.84;
    const dy = -length * 0.53;
    const shifted = base.map(point => new Phaser.Math.Vector2(point.x + dx, point.y + dy));
    scene.polygon(shifted, COLORS.shadow, alpha, null, 1, 0, depth);
  }

  function drawPaving(scene, east, south, widthM, depthM) {
    scene.worldRect(east, south, widthM, depthM, COLORS.paving, 1, COLORS.pavingEdge, 202);
    const grid = scene.add.graphics().setDepth(203);
    grid.lineStyle(0.9, 0x78694f, 0.22);

    for (let x = 0; x <= widthM; x += 3.5) {
      const a = scene.p(east + x, south);
      const b = scene.p(east + x, south + depthM);
      grid.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let y = 0; y <= depthM; y += 3.5) {
      const a = scene.p(east, south + y);
      const b = scene.p(east + widthM, south + y);
      grid.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function drawWater(scene, east, south, widthM, depthM, fill, seed) {
    const water = qz(scene, east, south, widthM, depthM, 0.03);
    scene.polygon(water, fill, 1, COLORS.waterDark, 0.95, 2.2, 211);

    const inner = qz(scene, east + 1.4, south + 1.4, widthM - 2.8, depthM - 2.8, 0.05);
    scene.polygon(inner, 0x6aa0a5, 0.14, null, 1, 0, 212);

    const ripplesA = scene.add.graphics().setDepth(213);
    const ripplesB = scene.add.graphics().setDepth(213);
    ripplesA.lineStyle(1.15, COLORS.waterLight, 0.24);
    ripplesB.lineStyle(1.05, 0x1f5261, 0.2);

    let row = 0;
    for (let y = 4; y < depthM - 2; y += 5.2) {
      const stagger = ((row + seed) % 2) * 2.2;
      for (let x = 3 + stagger; x < widthM - 4; x += 7.2) {
        const length = 2.5 + ((x + y + seed) % 3) * 0.65;
        const a = scene.p(east + x, south + y, 0.08);
        const b = scene.p(Math.min(east + widthM - 2, east + x + length), south + y, 0.08);
        (row % 2 ? ripplesA : ripplesB).lineBetween(a.x, a.y, b.x, b.y);
      }
      row += 1;
    }

    scene.tweens.add({
      targets: [ripplesA, ripplesB],
      alpha: { from: 0.68, to: 1 },
      duration: 2300 + seed * 130,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut'
    });
  }

  function drawColumn(scene, east, south, heightM = 5.4, tint = COLORS.stoneLight) {
    const base = scene.p(east, south, 0);
    const top = scene.p(east, south, heightM);
    const depth = base.y + 520;
    const shadowLength = heightM * PX_PER_M * 0.72;
    const baseWidth = 0.95 * PX_PER_M;

    scene.polygon([
      new Phaser.Math.Vector2(base.x - baseWidth * 0.5, base.y),
      new Phaser.Math.Vector2(base.x + baseWidth * 0.5, base.y),
      new Phaser.Math.Vector2(base.x + baseWidth * 0.5 - shadowLength * 0.82, base.y - shadowLength * 0.53),
      new Phaser.Math.Vector2(base.x - baseWidth * 0.5 - shadowLength * 0.82, base.y - shadowLength * 0.53)
    ], COLORS.shadow, 0.105, null, 1, 0, 218);

    const g = scene.add.graphics().setDepth(depth);
    const shaftBottom = 0.66 * PX_PER_M;
    const shaftTop = 0.52 * PX_PER_M;
    const baseW = 1.35 * PX_PER_M;
    const capW = 1.25 * PX_PER_M;

    g.fillStyle(0x9d8b6d, 1);
    g.fillRect(base.x - baseW / 2, base.y - 0.22 * PX_PER_M, baseW, 0.34 * PX_PER_M);
    g.fillStyle(0xd4c5a5, 1);
    g.fillRect(base.x - 0.95 * PX_PER_M / 2, base.y - 0.55 * PX_PER_M, 0.95 * PX_PER_M, 0.34 * PX_PER_M);

    g.fillStyle(tint, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(base.x - shaftBottom / 2, base.y - 0.5 * PX_PER_M),
      new Phaser.Math.Vector2(base.x + shaftBottom / 2, base.y - 0.5 * PX_PER_M),
      new Phaser.Math.Vector2(top.x + shaftTop / 2, top.y + 0.52 * PX_PER_M),
      new Phaser.Math.Vector2(top.x - shaftTop / 2, top.y + 0.52 * PX_PER_M)
    ], true);

    g.fillStyle(0xf0e5ce, 0.52);
    g.fillPoints([
      new Phaser.Math.Vector2(base.x - shaftBottom * 0.16, base.y - 0.5 * PX_PER_M),
      new Phaser.Math.Vector2(base.x + shaftBottom * 0.04, base.y - 0.5 * PX_PER_M),
      new Phaser.Math.Vector2(top.x + shaftTop * 0.04, top.y + 0.52 * PX_PER_M),
      new Phaser.Math.Vector2(top.x - shaftTop * 0.18, top.y + 0.52 * PX_PER_M)
    ], true);

    g.fillStyle(0xb6a17f, 1);
    g.fillRect(top.x - capW / 2, top.y + 0.18 * PX_PER_M, capW, 0.34 * PX_PER_M);
    g.fillStyle(0xdfd1b4, 1);
    g.fillPoints([
      new Phaser.Math.Vector2(top.x - 0.78 * PX_PER_M, top.y + 0.18 * PX_PER_M),
      new Phaser.Math.Vector2(top.x + 0.78 * PX_PER_M, top.y + 0.18 * PX_PER_M),
      new Phaser.Math.Vector2(top.x + 0.55 * PX_PER_M, top.y - 0.18 * PX_PER_M),
      new Phaser.Math.Vector2(top.x - 0.55 * PX_PER_M, top.y - 0.18 * PX_PER_M)
    ], true);
    g.lineStyle(0.7, COLORS.stoneStroke, 0.7);
    g.lineBetween(base.x - shaftBottom / 2, base.y - 0.5 * PX_PER_M, top.x - shaftTop / 2, top.y + 0.52 * PX_PER_M);
    g.lineBetween(base.x + shaftBottom / 2, base.y - 0.5 * PX_PER_M, top.x + shaftTop / 2, top.y + 0.52 * PX_PER_M);
  }

  function drawPortico(scene, east, south, widthM, depthM, orientation, columnLine, columnStart, columnEnd, spacingM = 7.5) {
    const roofZ = 5.25;
    const roofHeight = 0.42;
    shiftedShadow(scene, east, south, widthM, depthM, roofZ + roofHeight, 0.075, 216);

    prism(scene, east, south, widthM, depthM, roofZ, roofHeight, {
      top: COLORS.timberTop,
      south: COLORS.timberSide,
      west: 0x584334,
      east: 0x6b523d,
      stroke: 0x4d3b2f
    }, 390);

    const beamZ = 4.78;
    prism(scene, east, south, widthM, depthM, beamZ, 0.42, {
      top: COLORS.stoneTop,
      south: COLORS.stoneMid,
      west: COLORS.stoneDark,
      east: COLORS.stoneLight,
      stroke: COLORS.stoneStroke
    }, 380);

    if (orientation === 'ew') {
      for (let x = columnStart; x <= columnEnd + 0.01; x += spacingM) {
        drawColumn(scene, x, columnLine, 4.75);
      }
    } else {
      for (let y = columnStart; y <= columnEnd + 0.01; y += spacingM) {
        drawColumn(scene, columnLine, y, 4.75);
      }
    }
  }

  function drawPoolWalls(scene, e, s, w, totalDepth, poolDepth, divider) {
    const wall = {
      top: COLORS.stoneTop,
      south: COLORS.stoneMid,
      west: COLORS.stoneDark,
      east: COLORS.stoneLight,
      stroke: COLORS.stoneStroke
    };

    prism(scene, e - 0.8, s - 0.8, w + 1.6, 1.25, 0, 1.05, wall, 300);
    prism(scene, e - 0.8, s + totalDepth - 0.45, w + 1.6, 1.25, 0, 1.05, wall, 300);
    prism(scene, e - 0.8, s, 1.25, totalDepth, 0, 1.05, wall, 300);
    prism(scene, e + w - 0.45, s, 1.25, totalDepth, 0, 1.05, wall, 300);
    prism(scene, e - 0.4, s + poolDepth, w + 0.8, divider, 0, 1.15, wall, 310);
  }

  function drawSteps(scene, east, south, widthM, depthM, count) {
    const stepDepth = depthM / count;
    for (let i = 0; i < count; i += 1) {
      const inset = i * 0.55;
      const stepSouth = south - (i + 1) * stepDepth;
      const z = 0.12 + i * 0.13;
      const points = qz(scene, east + inset, stepSouth, widthM - inset * 2, stepDepth + 0.15, z);
      scene.polygon(points, i % 2 ? 0xc8b896 : 0xd8c9aa, 1, COLORS.stoneStroke, 0.55, 1, 345 + i);
    }
  }

  function drawPerson(scene, east, south, robe, heightM = 1.68) {
    const base = scene.p(east, south, 0);
    const top = scene.p(east, south, heightM);
    const depth = base.y + 610;
    const g = scene.add.graphics().setDepth(depth);
    const shadowL = heightM * PX_PER_M * 0.52;

    scene.polygon([
      new Phaser.Math.Vector2(base.x - 1.5, base.y),
      new Phaser.Math.Vector2(base.x + 1.5, base.y),
      new Phaser.Math.Vector2(base.x + 1.5 - shadowL * 0.82, base.y - shadowL * 0.53),
      new Phaser.Math.Vector2(base.x - 1.5 - shadowL * 0.82, base.y - shadowL * 0.53)
    ], COLORS.shadow, 0.11, null, 1, 0, 220);

    g.fillStyle(robe, 1);
    g.fillTriangle(base.x - 2.3, base.y - 0.3, base.x + 2.3, base.y - 0.3, top.x, top.y + 3.6);
    g.fillStyle(0xc8996b, 1);
    g.fillCircle(top.x, top.y + 1.8, 1.75);
    g.lineStyle(0.65, 0x5b4837, 0.65);
    g.strokeCircle(top.x, top.y + 1.8, 1.75);
  }

  function drawBench(scene, east, south, widthM = 4.5) {
    const p0 = scene.p(east, south, 0.6);
    const p1 = scene.p(east + widthM, south, 0.6);
    const depth = Math.max(p0.y, p1.y) + 500;
    const g = scene.add.graphics().setDepth(depth);
    g.lineStyle(2.5, 0x5f4935, 1);
    g.lineBetween(p0.x, p0.y, p1.x, p1.y);
    const l0 = scene.p(east + 0.4, south, 0);
    const l1 = scene.p(east + widthM - 0.4, south, 0);
    g.lineBetween(l0.x, l0.y, p0.x + 2, p0.y);
    g.lineBetween(l1.x, l1.y, p1.x - 2, p1.y);
  }

  function drawJars(scene, east, south) {
    const base = scene.p(east, south, 0);
    const g = scene.add.graphics().setDepth(base.y + 590);
    for (let i = 0; i < 3; i += 1) {
      const x = base.x + i * 5;
      const y = base.y - i * 1.2;
      g.fillStyle(i === 1 ? 0x9d5436 : 0xb56b43, 1);
      g.fillEllipse(x, y - 3.2, 4.2, 7.2);
      g.fillStyle(0x74412d, 1);
      g.fillRect(x - 1.3, y - 7.2, 2.6, 2.2);
    }
  }

  function hideBaselineLabels(scene) {
    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text === '畢士大池' || text.startsWith('v0.7') || text.startsWith('v0.10')) child.setVisible(false);
    }
  }

  function drawBethesda(scene) {
    scene.__bethesdaV11Applied = true;
    hideBaselineLabels(scene);

    const e = 418;
    const s = 78;
    const w = 46;
    const totalDepth = 92;
    const divider = 6.5;
    const poolDepth = (totalDepth - divider) / 2;
    const southPoolS = s + poolDepth + divider;

    drawPaving(scene, e - 9, s - 9, w + 18, totalDepth + 18);
    drawWater(scene, e + 0.8, s + 0.8, w - 1.6, poolDepth - 1.6, COLORS.waterNorth, 1);
    drawWater(scene, e + 0.8, southPoolS + 0.8, w - 1.6, poolDepth - 1.6, COLORS.waterSouth, 2);
    drawPoolWalls(scene, e, s, w, totalDepth, poolDepth, divider);

    drawPortico(scene, e - 7.2, s - 7.4, w + 14.4, 5.7, 'ew', s - 1.6, e - 3.5, e + w + 3.5, 7.4);
    drawPortico(scene, e - 7.2, s + totalDepth + 1.7, w + 14.4, 5.7, 'ew', s + totalDepth + 1.2, e - 3.5, e + w + 3.5, 7.4);
    drawPortico(scene, e - 7.4, s - 1.7, 5.6, totalDepth + 3.4, 'ns', e - 1.8, s + 3, s + totalDepth - 3, 7.6);
    drawPortico(scene, e + w + 1.8, s - 1.7, 5.6, totalDepth + 3.4, 'ns', e + w + 1.8, s + 3, s + totalDepth - 3, 7.6);
    drawPortico(scene, e - 0.7, s + poolDepth + 0.55, w + 1.4, divider - 1.1, 'ew', s + poolDepth + divider * 0.5, e + 3.5, e + w - 3.5, 7.4);

    drawSteps(scene, e + 6, s + totalDepth - 0.2, w - 12, 13.2, 7);

    drawPerson(scene, e - 4.2, s + 18, 0x8c5f45);
    drawPerson(scene, e + w + 4.1, s + 31, 0x486b78);
    drawPerson(scene, e - 3.8, s + 67, 0xa17a48);
    drawPerson(scene, e + w + 3.8, s + 76, 0x79546d);
    drawPerson(scene, e + 7.5, s + poolDepth + divider * 0.5, 0x6d7848);
    drawPerson(scene, e + 34, s + totalDepth + 4.2, 0x9a5542);

    drawBench(scene, e - 5.8, s + 44, 4.2);
    drawBench(scene, e + w + 2.2, s + 56, 4.0);
    drawJars(scene, e - 5.4, s + 8.5);

    scene.labelAt('畢士大池 · Geometry Art Pass', 403, 59, 18, 980);

    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.11';
    const status = document.getElementById('status');
    if (status) status.textContent = 'Bethesda v0.11 · world-space stonework, five porticoes, water, steps and people';
  }

  window.addEventListener('load', waitForScene, { once: true });
})();
