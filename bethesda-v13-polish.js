(() => {
  const later = (fn) => setTimeout(fn, 80);

  function waitForPortico() {
    if (typeof game === 'undefined') return later(waitForPortico);
    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) return later(waitForPortico);
    if (!scene.__bethesdaV12Applied) return later(waitForPortico);
    if (scene.__bethesdaV13Applied) return;
    scene.__bethesdaV13Applied = true;
    polish(scene);
  }

  const qz = (scene, e, s, w, d, z = 0) => [
    scene.p(e, s, z),
    scene.p(e + w, s, z),
    scene.p(e + w, s + d, z),
    scene.p(e, s + d, z),
  ];

  const maxY = (points) => Math.max(...points.map((point) => point.y));

  function water(scene, e, s, w, d, baseColor, innerColor) {
    const base = qz(scene, e, s, w, d, 0.035);
    scene.polygon(base, baseColor, 1, 0x285c69, 0.92, 2.2, 210);

    const inset = 1.15;
    const inner = qz(scene, e + inset, s + inset, w - inset * 2, d - inset * 2, 0.055);
    scene.polygon(inner, innerColor, 0.22, null, 1, 0, 211);

    const edge = scene.add.graphics().setDepth(215);
    edge.lineStyle(1.2, 0xbad8d2, 0.27);
    edge.strokePoints(inner, true);
  }

  function floorShade(scene, e, s, w, d, alpha = 0.055) {
    scene.polygon(qz(scene, e, s, w, d, 0.065), 0x000000, alpha, null, 1, 0, 215);
  }

  function darkenFaces(scene, e, s, w, d, z, h) {
    const bottom = qz(scene, e, s, w, d, z);
    const top = qz(scene, e, s, w, d, z + h);
    const depth = maxY(bottom) + 305;

    scene.polygon([bottom[3], bottom[2], top[2], top[3]], 0x5f503d, 0.2, null, 1, 0, depth + 1);
    scene.polygon([bottom[0], bottom[3], top[3], top[0]], 0x473b2f, 0.25, null, 1, 0, depth + 2);
    scene.polygon([bottom[1], bottom[2], top[2], top[1]], 0x7f6c51, 0.11, null, 1, 0, depth + 2);
  }

  function largerPerson(scene, e, s, robe, scarf = 0xd8c59d) {
    const heightM = 1.82;
    const base = scene.p(e, s, 0);
    const shoulder = scene.p(e, s, 1.25);
    const head = scene.p(e, s, heightM);
    const depth = base.y + 635;

    const shadowLength = heightM * PX_PER_M * 0.56;
    scene.polygon([
      new Phaser.Math.Vector2(base.x - 2.4, base.y),
      new Phaser.Math.Vector2(base.x + 2.4, base.y),
      new Phaser.Math.Vector2(base.x + 2.4 - shadowLength * 0.82, base.y - shadowLength * 0.53),
      new Phaser.Math.Vector2(base.x - 2.4 - shadowLength * 0.82, base.y - shadowLength * 0.53),
    ], 0x000000, 0.115, null, 1, 0, 220);

    const g = scene.add.graphics().setDepth(depth);
    g.fillStyle(0x4e4035, 0.72);
    g.fillTriangle(base.x - 4.1, base.y + 0.4, base.x + 4.1, base.y + 0.4, shoulder.x, shoulder.y - 0.5);
    g.fillStyle(robe, 1);
    g.fillTriangle(base.x - 3.45, base.y, base.x + 3.45, base.y, shoulder.x, shoulder.y);
    g.fillStyle(scarf, 1);
    g.fillRect(shoulder.x - 2.9, shoulder.y - 1.1, 5.8, 2.2);
    g.fillStyle(0xc9996d, 1);
    g.fillCircle(head.x, head.y + 2.25, 2.55);
    g.lineStyle(0.85, 0x503d31, 0.8);
    g.strokeCircle(head.x, head.y + 2.25, 2.55);
  }

  function hideLargeLabels(scene) {
    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text === '畢士大池' || text.includes('Geometry Art Pass')) child.setVisible(false);
    }
  }

  function polish(scene) {
    hideLargeLabels(scene);

    const e = 418;
    const s = 78;
    const w = 46;
    const totalD = 92;
    const divider = 6.5;
    const poolD = (totalD - divider) / 2;
    const southS = s + poolD + divider;

    // Restore opaque water above paving and below ripples, walls and stairs.
    water(scene, e + 1.05, s + 1.05, w - 2.1, poolD - 2.1, 0x367786, 0x77aeb1);
    water(scene, e + 1.05, southS + 1.05, w - 2.1, poolD - 2.1, 0x3c7d89, 0x7bb3b3);

    // Continuous ambient shade directly under every roof.
    const oe = e - 7;
    const os = s - 7;
    const ow = w + 14;
    const od = totalD + 14;
    const cw = 4.4;
    floorShade(scene, oe, os, ow, cw, 0.057);
    floorShade(scene, oe, os + od - cw, ow, cw, 0.063);
    floorShade(scene, oe, os + cw, cw, od - cw * 2, 0.06);
    floorShade(scene, oe + ow - cw, os + cw, cw, od - cw * 2, 0.05);
    floorShade(scene, e - 0.45, s + poolD + 0.7, w + 0.9, divider - 1.4, 0.065);

    // Increase vertical contrast while keeping all light-colored top surfaces intact.
    darkenFaces(scene, e - 0.75, s - 0.75, w + 1.5, 1.15, 0, 0.9);
    darkenFaces(scene, e - 0.75, s + totalD - 0.4, w + 1.5, 1.15, 0, 0.9);
    darkenFaces(scene, e - 0.75, s, 1.15, totalD, 0, 0.9);
    darkenFaces(scene, e + w - 0.4, s, 1.15, totalD, 0, 0.9);
    darkenFaces(scene, e - 0.45, s + poolD, w + 0.9, divider, 0, 1.0);

    // Slightly enlarged, outlined people so they remain readable at overview zoom.
    largerPerson(scene, e - 4.1, s + 18.5, 0x8e5c43);
    largerPerson(scene, e + w + 4.05, s + 31.5, 0x4c7180, 0xe4d3ae);
    largerPerson(scene, e - 3.8, s + 67.5, 0xa67b47);
    largerPerson(scene, e + w + 3.75, s + 76.5, 0x76546f, 0xd6c29b);
    largerPerson(scene, e + 8.2, s + poolD + divider / 2 + 0.2, 0x687b4a);

    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.13';
    const status = document.getElementById('status');
    if (status) status.textContent = 'Bethesda v0.13 · water restored, stronger stone depth, portico shade and readable people';
  }

  window.addEventListener('load', waitForPortico, { once: true });
})();
