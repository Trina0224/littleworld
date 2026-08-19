(() => {
  const later = (fn) => setTimeout(fn, 90);

  function waitForPolish() {
    if (typeof game === 'undefined') return later(waitForPolish);
    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) return later(waitForPolish);
    if (!scene.__bethesdaV13Applied) return later(waitForPolish);
    if (scene.__bethesdaV14Applied) return;
    scene.__bethesdaV14Applied = true;
    beautify(scene);
  }

  const qz = (scene, e, s, w, d, z = 0) => [
    scene.p(e, s, z),
    scene.p(e + w, s, z),
    scene.p(e + w, s + d, z),
    scene.p(e, s + d, z),
  ];

  const maxY = (points) => Math.max(...points.map((point) => point.y));

  function rng(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function prism(scene, e, s, w, d, z, h, colors, depthOffset = 300) {
    const bottom = qz(scene, e, s, w, d, z);
    const top = qz(scene, e, s, w, d, z + h);
    const depth = maxY(bottom) + depthOffset;

    scene.polygon([bottom[3], bottom[2], top[2], top[3]], colors.south, 1, colors.stroke, 0.34, 0.9, depth + 1);
    scene.polygon([bottom[0], bottom[3], top[3], top[0]], colors.west, 1, colors.stroke, 0.34, 0.9, depth + 2);
    scene.polygon([bottom[1], bottom[2], top[2], top[1]], colors.east, 1, colors.stroke, 0.34, 0.9, depth + 2);
    scene.polygon(top, colors.top, 1, colors.stroke, 0.65, 1.1, depth + 3);
  }

  function softColumnShadow(scene, e, s, heightM = 4.65, strength = 0.15) {
    const base = scene.p(e, s, 0.04);
    const width = 0.95 * PX_PER_M;
    const length = heightM * PX_PER_M * 0.8;
    const dx = -length * 0.83;
    const dy = -length * 0.53;

    for (let layer = 0; layer < 3; layer += 1) {
      const spread = layer * 1.5;
      const drift = layer * 1.2;
      scene.polygon([
        new Phaser.Math.Vector2(base.x - width * 0.42 - spread, base.y + spread * 0.15),
        new Phaser.Math.Vector2(base.x + width * 0.42 + spread, base.y + spread * 0.15),
        new Phaser.Math.Vector2(base.x + width * 0.42 + dx - drift, base.y + dy - drift * 0.55),
        new Phaser.Math.Vector2(base.x - width * 0.42 + dx - drift, base.y + dy - drift * 0.55),
      ], 0x000000, strength / (layer + 1.55), null, 1, 0, 222 + layer * 0.01);
    }
  }

  function enhanceColumn(scene, e, s, heightM = 4.65) {
    const base = scene.p(e, s, 0);
    const top = scene.p(e, s, heightM);
    const depth = base.y + 548;
    const g = scene.add.graphics().setDepth(depth);

    g.lineStyle(1.15, 0x76664e, 0.52);
    g.lineBetween(base.x + 1.45, base.y - 2.7, top.x + 1.05, top.y + 2.2);
    g.lineStyle(0.85, 0xfff3dc, 0.7);
    g.lineBetween(base.x - 1.2, base.y - 2.7, top.x - 0.85, top.y + 2.2);
    g.fillStyle(0x6c5b45, 0.2);
    g.fillEllipse(base.x + 0.7, base.y - 0.4, 6.7, 1.8);
  }

  function allColumns() {
    const e = 418;
    const s = 78;
    const w = 46;
    const totalD = 92;
    const divider = 6.5;
    const poolD = (totalD - divider) / 2;
    const oe = e - 7;
    const os = s - 7;
    const ow = w + 14;
    const od = totalD + 14;
    const cw = 4.4;
    const result = [];

    for (let x = oe + 3.5; x <= oe + ow - 3.5 + 0.01; x += 7.4) {
      result.push([x, os + cw - 0.35, false]);
      result.push([x, os + od - cw + 0.35, false]);
    }
    for (let y = os + cw + 3.4; y <= os + od - cw - 3.4 + 0.01; y += 7.6) {
      result.push([oe + cw - 0.35, y, false]);
      result.push([oe + ow - cw + 0.35, y, false]);
    }

    const centralS = s + poolD + 0.7 + (divider - 1.4) / 2;
    for (let x = e + 3.5; x <= e + w - 3.5 + 0.01; x += 7.4) {
      result.push([x, centralS, true]);
    }
    return result;
  }

  function fifthPorticoShadows(scene) {
    for (const [e, s, central] of allColumns()) {
      softColumnShadow(scene, e, s, 4.65, central ? 0.2 : 0.115);
      enhanceColumn(scene, e, s, 4.65);
    }
  }

  function innerWaterBand(scene, e, s, w, d) {
    const z = 0.085;
    scene.polygon(qz(scene, e, s, w, 1.05, z), 0x173f4a, 0.16, null, 1, 0, 216);
    scene.polygon(qz(scene, e, s + d - 0.65, w, 0.65, z), 0xd9eee5, 0.075, null, 1, 0, 216);
    scene.polygon(qz(scene, e, s, 0.75, d, z), 0x173f4a, 0.11, null, 1, 0, 216);
    scene.polygon(qz(scene, e + w - 0.55, s, 0.55, d, z), 0xd8eee6, 0.045, null, 1, 0, 216);
  }

  function waterSparkles(scene, e, s, w, d, seed) {
    const random = rng(seed);
    const g = scene.add.graphics().setDepth(217);
    for (let i = 0; i < 42; i += 1) {
      const east = e + 2 + random() * (w - 4);
      const south = s + 2 + random() * (d - 4);
      const point = scene.p(east, south, 0.1);
      const length = 1.1 + random() * 2.7;
      const alpha = 0.12 + random() * 0.18;
      g.lineStyle(0.75 + random() * 0.55, 0xd8f2e8, alpha);
      g.lineBetween(point.x - length * 0.55, point.y, point.x + length * 0.55, point.y - 0.2);
    }
    scene.tweens.add({
      targets: g,
      alpha: { from: 0.72, to: 1 },
      duration: 2850 + seed * 170,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  function stoneTexture(scene) {
    const random = rng(240819);
    const g = scene.add.graphics().setDepth(205.5);

    for (let i = 0; i < 170; i += 1) {
      const e = 410 + random() * 64;
      const s = 68 + random() * 112;
      const p = scene.p(e, s, 0.045);
      const radius = 0.35 + random() * 1.1;
      const light = random() > 0.45;
      g.fillStyle(light ? 0xf5ead1 : 0x77684f, light ? 0.11 : 0.08);
      g.fillEllipse(p.x, p.y, radius * 1.8, radius * 0.8);
    }

    g.lineStyle(0.7, 0x786950, 0.18);
    for (let i = 0; i < 27; i += 1) {
      const e = 411 + random() * 61;
      const s = 69 + random() * 108;
      const a = scene.p(e, s, 0.05);
      const b = scene.p(e + 1.2 + random() * 2.8, s + (random() - 0.5) * 1.2, 0.05);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function roofAndEaves(scene) {
    const e = 418;
    const s = 78;
    const w = 46;
    const totalD = 92;
    const divider = 6.5;
    const poolD = (totalD - divider) / 2;
    const oe = e - 7;
    const os = s - 7;
    const ow = w + 14;
    const od = totalD + 14;
    const cw = 4.4;
    const z = 5.11;

    const segments = [
      [oe, os + cw, oe + ow, os + cw],
      [oe, os + od - cw, oe + ow, os + od - cw],
      [oe + cw, os + cw, oe + cw, os + od - cw],
      [oe + ow - cw, os + cw, oe + ow - cw, os + od - cw],
      [e - 0.45, s + poolD + 0.7, e + w + 0.45, s + poolD + 0.7],
      [e - 0.45, s + poolD + divider - 0.7, e + w + 0.45, s + poolD + divider - 0.7],
    ];
    for (const [e1, s1, e2, s2] of segments) {
      const a = scene.p(e1, s1, z);
      const b = scene.p(e2, s2, z);
      const edges = scene.add.graphics().setDepth(Math.max(a.y, b.y) + 565);
      edges.lineStyle(2.1, 0x594738, 0.48);
      edges.lineBetween(a.x, a.y, b.x, b.y);

      const ah = scene.p(e1, s1, z + 0.055);
      const bh = scene.p(e2, s2, z + 0.055);
      edges.lineStyle(0.8, 0xfff0d2, 0.58);
      edges.lineBetween(ah.x, ah.y - 0.6, bh.x, bh.y - 0.6);
    }
  }

  function wallCourses(scene, e, s, w, d, heightM, orientation) {
    const g = scene.add.graphics().setDepth(maxY(qz(scene, e, s, w, d)) + 320);
    g.lineStyle(0.8, 0x6f6049, 0.32);
    for (let z = 0.75; z < heightM; z += 0.75) {
      if (orientation === 'ew') {
        const a = scene.p(e, s + d, z);
        const b = scene.p(e + w, s + d, z);
        g.lineBetween(a.x, a.y, b.x, b.y);
      } else {
        const a = scene.p(e, s, z);
        const b = scene.p(e, s + d, z);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
    }
  }

  function backingWalls(scene) {
    const colors = {
      top: 0xd9cbae,
      south: 0xa99572,
      west: 0x75654d,
      east: 0xb6a17f,
      stroke: 0x685943,
    };

    prism(scene, 411.3, 69.7, 59.4, 0.9, 0, 3.2, colors, 315);
    wallCourses(scene, 411.3, 69.7, 59.4, 0.9, 3.2, 'ew');

    prism(scene, 470.0, 71.0, 0.9, 37.5, 0, 2.8, colors, 315);
    prism(scene, 470.0, 125.0, 0.9, 51.5, 0, 2.8, colors, 315);
    wallCourses(scene, 470.0, 71.0, 0.9, 37.5, 2.8, 'ns');
    wallCourses(scene, 470.0, 125.0, 0.9, 51.5, 2.8, 'ns');
  }

  function mat(scene, e, s, w, d, colorA, colorB) {
    const points = qz(scene, e, s, w, d, 0.07);
    scene.polygon(points, colorA, 0.95, 0x5d4837, 0.55, 0.7, 231);
    const lines = scene.add.graphics().setDepth(232);
    lines.lineStyle(0.7, colorB, 0.52);
    for (let x = 0.6; x < w; x += 0.8) {
      const a = scene.p(e + x, s, 0.08);
      const b = scene.p(e + x, s + d, 0.08);
      lines.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function recliningPerson(scene, e, s, robe, headColor = 0xc9986d) {
    const base = scene.p(e, s, 0.12);
    const end = scene.p(e + 2.6, s + 0.4, 0.18);
    const depth = Math.max(base.y, end.y) + 535;
    const g = scene.add.graphics().setDepth(depth);
    g.lineStyle(4.2, robe, 1);
    g.lineBetween(base.x, base.y - 0.8, end.x, end.y - 0.8);
    g.fillStyle(headColor, 1);
    g.fillCircle(end.x + 1.7, end.y - 1.1, 1.8);
    g.fillStyle(0x5b4838, 0.75);
    g.fillEllipse(base.x - 1.5, base.y + 0.7, 4.2, 1.5);
  }

  function jarCluster(scene, e, s) {
    const point = scene.p(e, s, 0.02);
    const g = scene.add.graphics().setDepth(point.y + 535);
    const jars = [
      [0, 0, 0xb26841, 4.2, 6.3],
      [4.2, -1.1, 0x955238, 3.4, 5.2],
      [7.2, 0.4, 0xc07a4e, 2.8, 4.4],
    ];
    for (const [dx, dy, color, width, height] of jars) {
      g.fillStyle(color, 1);
      g.fillEllipse(point.x + dx, point.y + dy - height * 0.42, width, height);
      g.fillStyle(0x6e3f2d, 1);
      g.fillRect(point.x + dx - width * 0.18, point.y + dy - height, width * 0.36, 1.6);
    }
  }

  function shrub(scene, e, s, size, seed) {
    const random = rng(seed);
    const point = scene.p(e, s, 0);
    const g = scene.add.graphics().setDepth(point.y + 580);
    g.fillStyle(0x5d6c3d, 1);
    for (let i = 0; i < 9; i += 1) {
      const angle = random() * Math.PI * 2;
      const radius = random() * size * 0.45;
      g.fillCircle(point.x + Math.cos(angle) * radius, point.y - size * 0.25 + Math.sin(angle) * radius * 0.45, 1.2 + random() * size * 0.17);
    }
    g.fillStyle(0x927953, 0.8);
    g.fillEllipse(point.x, point.y, size * 0.65, size * 0.22);
  }

  function storyProps(scene) {
    mat(scene, 412.4, 108.5, 3.4, 5.4, 0x956246, 0xe0c68d);
    recliningPerson(scene, 412.7, 111.0, 0x735a73);
    mat(scene, 466.4, 139.0, 3.2, 5.1, 0x6b7c74, 0xd7bd82);
    recliningPerson(scene, 466.7, 141.1, 0x7d5b42);
    jarCluster(scene, 414.1, 76.0);
    jarCluster(scene, 466.1, 164.0);

    shrub(scene, 407.5, 72.2, 8, 4);
    shrub(scene, 474.5, 82.5, 6.5, 8);
    shrub(scene, 407.0, 173.5, 7.2, 12);
    shrub(scene, 474.0, 170.5, 6.2, 15);
  }

  function hitArea(scene) {
    const points = qz(scene, 409, 69, 64, 110, 0);
    const zone = scene.add.polygon(0, 0, points, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive(new Phaser.Geom.Polygon(points), Phaser.Geom.Polygon.Contains)
      .setDepth(1200);
    zone.on('pointerdown', () => {
      const status = document.getElementById('status');
      if (status) status.textContent = '畢士大池 · 雙池、五廊、南池階梯；目前進入材質與生活細節美化階段';
    });
  }

  function hideLabels(scene) {
    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text === '畢士大池' || text.includes('Geometry Art Pass')) child.setVisible(false);
    }
  }

  function beautify(scene) {
    hideLabels(scene);

    const e = 418;
    const s = 78;
    const w = 46;
    const totalD = 92;
    const divider = 6.5;
    const poolD = (totalD - divider) / 2;
    const southS = s + poolD + divider;

    innerWaterBand(scene, e + 1.05, s + 1.05, w - 2.1, poolD - 2.1);
    innerWaterBand(scene, e + 1.05, southS + 1.05, w - 2.1, poolD - 2.1);
    waterSparkles(scene, e + 1.05, s + 1.05, w - 2.1, poolD - 2.1, 11);
    waterSparkles(scene, e + 1.05, southS + 1.05, w - 2.1, poolD - 2.1, 17);

    fifthPorticoShadows(scene);
    stoneTexture(scene);
    roofAndEaves(scene);
    backingWalls(scene);
    storyProps(scene);
    hitArea(scene);

    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.14';
    const status = document.getElementById('status');
    if (status) status.textContent = 'Bethesda v0.14 · fifth-portico shadows, richer stone and water, backing walls and daily-life props';
  }

  window.addEventListener('load', waitForPolish, { once: true });
})();
