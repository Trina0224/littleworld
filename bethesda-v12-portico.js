(() => {
  const C = {
    paving: 0xcdbf9f, line: 0x7c6c52,
    top: 0xe0d3b6, light: 0xc9b895, mid: 0xaa9875, dark: 0x78674e, stroke: 0x6d5e47,
    roof: 0xd8c9aa, roofEdge: 0x9b8768, beam: 0x8f7b5f,
    waterLight: 0xb7d9d3, waterDark: 0x285c69,
  };

  const later = (fn) => setTimeout(fn, 80);

  function wait() {
    if (typeof game === 'undefined') return later(wait);
    const scene = game.scene.getScene('Jerusalem25D');
    if (!scene || !scene.sys?.isActive()) return later(wait);
    if (scene.__bethesdaV12Applied) return;
    scene.__bethesdaV12Applied = true;
    draw(scene);
  }

  const qz = (scene, e, s, w, d, z = 0) => [
    scene.p(e, s, z), scene.p(e + w, s, z),
    scene.p(e + w, s + d, z), scene.p(e, s + d, z),
  ];
  const maxY = points => Math.max(...points.map(p => p.y));

  function prism(scene, e, s, w, d, z, h, depthOffset = 280) {
    const b = qz(scene, e, s, w, d, z);
    const t = qz(scene, e, s, w, d, z + h);
    const depth = maxY(b) + depthOffset;
    scene.polygon([b[3], b[2], t[2], t[3]], C.mid, 1, C.stroke, .35, 1, depth + 1);
    scene.polygon([b[0], b[3], t[3], t[0]], C.dark, 1, C.stroke, .35, 1, depth + 2);
    scene.polygon([b[1], b[2], t[2], t[1]], C.light, 1, C.stroke, .35, 1, depth + 2);
    scene.polygon(t, C.top, 1, C.stroke, .7, 1.2, depth + 3);
  }

  function shadow(scene, e, s, w, d, height, alpha = .07) {
    const length = height * PX_PER_M * .68;
    const dx = -length * .84, dy = -length * .53;
    scene.polygon(qz(scene, e, s, w, d).map(p => new Phaser.Math.Vector2(p.x + dx, p.y + dy)),
      0x000000, alpha, null, 1, 0, 216);
  }

  function paving(scene, e, s, w, d) {
    scene.worldRect(e, s, w, d, C.paving, .97, C.line, 202);
    const g = scene.add.graphics().setDepth(204).lineStyle(.85, C.line, .18);
    for (let x = 0; x <= w; x += 4) {
      const a = scene.p(e + x, s, .02), b = scene.p(e + x, s + d, .02);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (let y = 0; y <= d; y += 4) {
      const a = scene.p(e, s + y, .02), b = scene.p(e + w, s + y, .02);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  function ripples(scene, e, s, w, d, seed) {
    const a = scene.add.graphics().setDepth(214).lineStyle(1.05, C.waterLight, .22);
    const b = scene.add.graphics().setDepth(214).lineStyle(.95, C.waterDark, .18);
    let row = 0;
    for (let y = 4; y < d - 2; y += 5.3) {
      const stagger = ((row + seed) % 2) * 2.4;
      for (let x = 3 + stagger; x < w - 4; x += 7.4) {
        const p1 = scene.p(e + x, s + y, .08);
        const p2 = scene.p(Math.min(e + w - 2, e + x + 2.8), s + y, .08);
        (row % 2 ? a : b).lineBetween(p1.x, p1.y, p2.x, p2.y);
      }
      row++;
    }
    scene.tweens.add({ targets: [a, b], alpha: { from: .68, to: 1 }, duration: 2250 + seed * 150, yoyo: true, repeat: -1 });
  }

  function column(scene, e, s, h = 4.65) {
    const base = scene.p(e, s), top = scene.p(e, s, h);
    const depth = base.y + 525;
    const sw = .95 * PX_PER_M, sl = h * PX_PER_M * .68;
    scene.polygon([
      new Phaser.Math.Vector2(base.x - sw / 2, base.y), new Phaser.Math.Vector2(base.x + sw / 2, base.y),
      new Phaser.Math.Vector2(base.x + sw / 2 - sl * .82, base.y - sl * .53),
      new Phaser.Math.Vector2(base.x - sw / 2 - sl * .82, base.y - sl * .53),
    ], 0x000000, .095, null, 1, 0, 218);

    const g = scene.add.graphics().setDepth(depth);
    const bw = 1.3 * PX_PER_M, sb = .68 * PX_PER_M, st = .52 * PX_PER_M, cw = 1.25 * PX_PER_M;
    g.fillStyle(C.mid).fillRect(base.x - bw / 2, base.y - 1.1, bw, 1.8);
    g.fillStyle(C.light).fillRect(base.x - 2.5, base.y - 2.8, 5, 1.8);
    g.fillStyle(C.light).fillPoints([
      { x: base.x - sb / 2, y: base.y - 2.6 }, { x: base.x + sb / 2, y: base.y - 2.6 },
      { x: top.x + st / 2, y: top.y + 2.4 }, { x: top.x - st / 2, y: top.y + 2.4 },
    ], true);
    g.fillStyle(C.mid).fillRect(top.x - cw / 2, top.y + .7, cw, 1.8);
    g.fillStyle(C.top).fillPoints([
      { x: top.x - 3.9, y: top.y + .7 }, { x: top.x + 3.9, y: top.y + .7 },
      { x: top.x + 2.9, y: top.y - .9 }, { x: top.x - 2.9, y: top.y - .9 },
    ], true);
  }

  function canopy(scene, e, s, w, d, orientation) {
    const z = 4.85, h = .24;
    shadow(scene, e, s, w, d, z + h, .065);
    const b = qz(scene, e, s, w, d, z), t = qz(scene, e, s, w, d, z + h);
    const depth = maxY(qz(scene, e, s, w, d)) + 365;
    scene.polygon([b[3], b[2], t[2], t[3]], C.roofEdge, 1, null, 1, 0, depth + 1);
    scene.polygon([b[0], b[3], t[3], t[0]], C.beam, 1, null, 1, 0, depth + 2);
    scene.polygon([b[1], b[2], t[2], t[1]], C.mid, 1, null, 1, 0, depth + 2);
    scene.polygon(t, C.roof, 1, C.roofEdge, .72, 1.3, depth + 3);

    const seams = scene.add.graphics().setDepth(depth + 4).lineStyle(.8, C.roofEdge, .25);
    if (orientation === 'ew') {
      for (let x = 5; x < w; x += 6) {
        const p1 = scene.p(e + x, s, z + h + .02), p2 = scene.p(e + x, s + d, z + h + .02);
        seams.lineBetween(p1.x, p1.y, p2.x, p2.y);
      }
    } else {
      for (let y = 5; y < d; y += 6) {
        const p1 = scene.p(e, s + y, z + h + .02), p2 = scene.p(e + w, s + y, z + h + .02);
        seams.lineBetween(p1.x, p1.y, p2.x, p2.y);
      }
    }
  }

  function beam(scene, e1, s1, e2, s2) {
    const a = scene.p(e1, s1, 4.55), b = scene.p(e2, s2, 4.55);
    const g = scene.add.graphics().setDepth(Math.max(a.y, b.y) + 515);
    g.lineStyle(2.9, C.mid).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(1.1, C.top, .9).lineBetween(a.x, a.y - 1.2, b.x, b.y - 1.2);
  }

  function porticoEW(scene, e, s, w, d, innerS, startE, endE) {
    canopy(scene, e, s, w, d, 'ew');
    for (let x = startE; x <= endE + .01; x += 7.4) column(scene, x, innerS);
    beam(scene, startE - .8, innerS, endE + .8, innerS);
  }

  function porticoNS(scene, e, s, w, d, innerE, startS, endS) {
    canopy(scene, e, s, w, d, 'ns');
    for (let y = startS; y <= endS + .01; y += 7.6) column(scene, innerE, y);
    beam(scene, innerE, startS - .8, innerE, endS + .8);
  }

  function walls(scene, e, s, w, totalD, poolD, divider) {
    prism(scene, e - .75, s - .75, w + 1.5, 1.15, 0, .9, 290);
    prism(scene, e - .75, s + totalD - .4, w + 1.5, 1.15, 0, .9, 290);
    prism(scene, e - .75, s, 1.15, totalD, 0, .9, 290);
    prism(scene, e + w - .4, s, 1.15, totalD, 0, .9, 290);
    prism(scene, e - .45, s + poolD, w + .9, divider, 0, 1, 300);
  }

  function steps(scene, e, s, w, d, count) {
    const sd = d / count;
    for (let i = 0; i < count; i++) {
      const inset = i * .52, south = s - (i + 1) * sd, z = .12 + i * .12;
      scene.polygon(qz(scene, e + inset, south, w - inset * 2, sd + .1, z),
        i % 2 ? 0xc8b896 : 0xd8c9aa, 1, C.stroke, .52, .9, 335 + i);
    }
  }

  function person(scene, e, s, robe) {
    const base = scene.p(e, s), top = scene.p(e, s, 1.68);
    const g = scene.add.graphics().setDepth(base.y + 610);
    const sl = 1.68 * PX_PER_M * .52;
    scene.polygon([
      { x: base.x - 1.4, y: base.y }, { x: base.x + 1.4, y: base.y },
      { x: base.x + 1.4 - sl * .82, y: base.y - sl * .53 }, { x: base.x - 1.4 - sl * .82, y: base.y - sl * .53 },
    ], 0x000000, .1, null, 1, 0, 220);
    g.fillStyle(robe).fillTriangle(base.x - 2.2, base.y - .2, base.x + 2.2, base.y - .2, top.x, top.y + 3.5);
    g.fillStyle(0xc8996b).fillCircle(top.x, top.y + 1.8, 1.7);
  }

  function hideLabels(scene) {
    for (const child of scene.children.list) {
      if (child.type !== 'Text') continue;
      const text = String(child.text || '');
      if (text === '畢士大池' || text.startsWith('v0.7') || text.startsWith('v0.10')) child.setVisible(false);
    }
  }

  function draw(scene) {
    hideLabels(scene);
    const e = 418, s = 78, w = 46, totalD = 92, divider = 6.5;
    const poolD = (totalD - divider) / 2, southS = s + poolD + divider;

    scene.worldRect(e - 8.5, s - 8.5, w + 17, totalD + 17, C.paving, .97, C.line, 202);
    paving(scene, e - 8.5, s - 8.5, w + 17, totalD + 17);
    ripples(scene, e + 1.1, s + 1.1, w - 2.2, poolD - 2.2, 1);
    ripples(scene, e + 1.1, southS + 1.1, w - 2.2, poolD - 2.2, 2);
    walls(scene, e, s, w, totalD, poolD, divider);

    const oe = e - 7, os = s - 7, ow = w + 14, od = totalD + 14, cw = 4.4;
    porticoEW(scene, oe, os, ow, cw, os + cw - .35, oe + 3.5, oe + ow - 3.5);
    porticoEW(scene, oe, os + od - cw, ow, cw, os + od - cw + .35, oe + 3.5, oe + ow - 3.5);
    porticoNS(scene, oe, os + cw, cw, od - cw * 2, oe + cw - .35, os + cw + 3.4, os + od - cw - 3.4);
    porticoNS(scene, oe + ow - cw, os + cw, cw, od - cw * 2, oe + ow - cw + .35, os + cw + 3.4, os + od - cw - 3.4);

    const cs = s + poolD + .7, cd = divider - 1.4;
    porticoEW(scene, e - .45, cs, w + .9, cd, cs + cd / 2, e + 3.5, e + w - 3.5);
    steps(scene, e + 6, s + totalD - .2, w - 12, 13, 7);

    person(scene, e - 4, s + 18, 0x8c5f45);
    person(scene, e + w + 4, s + 31, 0x486b78);
    person(scene, e - 3.7, s + 67, 0xa17a48);
    person(scene, e + w + 3.7, s + 76, 0x79546d);
    person(scene, e + 8, s + poolD + divider / 2, 0x6d7848);

    const title = document.querySelector('#hud .title');
    if (title) title.textContent = 'LittleWorld — Jerusalem 2.5D v0.12';
    const status = document.getElementById('status');
    if (status) status.textContent = 'Bethesda v0.12 · connected pale portico ring, aligned columns and world-space shadows';
  }

  window.addEventListener('load', wait, { once: true });
})();
