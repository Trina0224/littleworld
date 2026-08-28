'use strict';

/**
 * The Replay player.
 *
 * docs/specs/engine/replay-presentation.md §9. It loads a saved recording and
 * the presentation timeline built from it, and plays that timeline on the
 * audience clock. It reruns nothing: no world, no perception, no Brain, and no
 * network beyond fetching two JSON files off the same origin. That is the point
 * of §11.10 - this page works on GitHub Pages with no credentials at all.
 *
 * It reuses ShowaLittleWorld rather than reimplementing it. Background,
 * occlusion, camera and the debug overlay are the same scene the static page
 * runs; the only difference is that the cast comes from a timeline instead of
 * from fixed placements.
 */

// Named through the namespace, not destructured: both files are classic
// scripts sharing one global scope, and `const WORLD_W` in each is a page that
// does not load at all.
const LW = window.LITTLEWORLD;
const RUN = new URLSearchParams(location.search).get('run') ?? '3f-cafe';
const SOURCE = `./runs/${RUN}.json`;
const TIMELINE = `./runs/${RUN}.timeline.json`;

const el = (id) => document.getElementById(id);
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

class ReplayScene extends window.ShowaLittleWorld {
  constructor() {
    super('Replay');
    this.staticCast = false;          // the timeline draws the cast, not placements.json
    this.sprites = new Map();
    this.ms = 0;
  }

  preload() {
    super.preload();
    this.load.json('replay-source', SOURCE);
    this.load.json('replay-timeline', TIMELINE);
    this.load.on('filecomplete-json-replay-timeline', () => {
      const timeline = this.cache.json.get('replay-timeline');
      new Set((timeline?.cast ?? []).map((c) => c.sprite))
        .forEach((key) => this.load.image(`cast-${key}`, LW.CAST.sprite(key)));
    });
  }

  create() {
    super.create();
    this.recording = this.cache.json.get('replay-source');
    this.timeline = this.cache.json.get('replay-timeline');
    if (!this.timeline) { LW.setStatus(`找不到 ${TIMELINE}`); return; }

    this.box = new Map((this.timeline.cast ?? []).map((c) => [c.id, c]));
    this.marks = this.timeline.marks ?? [];
    this.buildTracks();
    window.replay = new Transport(this);
    const a = this.timeline.ambient;
    this.castStatus = a
      ? `${RUN} · ${a.daypart}・${a.weatherType}・${a.ambientTempC}度`
      : RUN;
    LW.setStatus(this.castStatus);
  }

  /**
   * Where everybody is, in presentation time.
   *
   * Positions come from the recording's own facts - arrivals, walks, sitting
   * down - and every tick in them is converted through the timeline's marks, so
   * a walk that was compressed is still a walk and not a jump. This is the same
   * information view.js reads; it is read here on the other clock.
   */
  buildTracks() {
    const facts = this.recording?.facts ?? [];
    const tracks = new Map();
    const track = (id) => {
      if (!tracks.has(id)) tracks.set(id, { keys: [], gone: null });
      return tracks.get(id);
    };
    const key = (id, ms, at) => track(id).keys.push({ ms, at: [at[0], at[1]] });

    for (const f of facts) {
      switch (f.type) {
        case 'agent_spawned':
        case 'agent_arrived':
          key(f.agent, this.msAt(f.t), f.at);
          break;
        case 'agent_departed':
          track(f.agent).gone = this.msAt(f.t);
          break;
        case 'move_started':
          // Every point of the path gets its own key, spaced by how far along it
          // sits, so the retimed walk keeps its shape as well as its ends.
          {
            const path = f.path ?? [];
            const total = pathLength(path);
            const from = this.msAt(f.t);
            const to = this.msAt(f.arriveTick);
            let run = 0;
            path.forEach((p, i) => {
              if (i > 0) run += dist(path[i - 1], p);
              key(f.agent, from + (total ? (run / total) * (to - from) : 0), p);
            });
          }
          break;
        case 'move_completed':
          key(f.agent, this.msAt(f.t), f.at);
          break;
        case 'resource_occupied':
          key(f.by, this.msAt(f.t), f.at);
          break;
        default:
          break;
      }
    }
    this.tracks = tracks;

    for (const [id, t] of tracks) {
      const box = this.box.get(id);
      if (!box || !this.textures.exists(`cast-${box.sprite}`) || !t.keys.length) continue;
      const image = this.add.image(0, 0, `cast-${box.sprite}`)
        .setOrigin(0.5, 1)
        .setDisplaySize(box.w, box.h);
      this.sprites.set(id, { image, box, cutAt: null });
    }
  }

  msAt(tick) {
    const marks = this.marks;
    if (!marks.length) return 0;
    if (tick <= marks[0].t) return marks[0].ms;
    const last = marks[marks.length - 1];
    if (tick >= last.t) return last.ms;
    let lo = 0, hi = marks.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (marks[mid].t <= tick) lo = mid; else hi = mid;
    }
    const a = marks[lo], b = marks[hi];
    return b.t === a.t ? a.ms : a.ms + ((tick - a.t) / (b.t - a.t)) * (b.ms - a.ms);
  }

  /** Draw the world as it stands at `ms`. Idempotent: scrubbing is just this. */
  seek(ms) {
    this.ms = ms;
    for (const [id, sprite] of this.sprites) {
      const t = this.tracks.get(id);
      const visible = t.keys.length && ms >= t.keys[0].ms && (t.gone === null || ms < t.gone);
      sprite.image.setVisible(visible);
      if (!visible) continue;
      const at = sample(t.keys, ms);
      // The sprite box is anchored at the feet, which is the row it sorts at -
      // the same convention placements.json uses, reused rather than restated.
      sprite.image.setPosition(at[0], at[1]);
      sprite.image.setDepth(1 + at[1] / 1000);
      this.recut(id, sprite, at);
    }
  }

  /**
   * Recut a moving sprite when the row it stands on has actually changed. The
   * static page cuts once because nobody moves; here the same rule is applied
   * again whenever it would produce a different answer, and not otherwise -
   * re-cutting every frame is a canvas read per character per frame.
   */
  recut(id, sprite, at) {
    const row = Math.round(at[1]);
    if (sprite.cutAt === row) return;
    sprite.cutAt = row;
    const box = { x: at[0] - sprite.box.w / 2, y: at[1] - sprite.box.h,
                  w: sprite.box.w, h: sprite.box.h };
    const textureKey = `replay-cut-${id}`;
    try {
      this.cutSprite(`cast-${sprite.box.sprite}`, box, row, textureKey);
      sprite.image.setTexture(textureKey);
      sprite.image.setDisplaySize(sprite.box.w, sprite.box.h);
    } catch (err) {
      void err;                        // an uncuttable sprite is still a sprite
    }
  }
}

const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const pathLength = (path) => path.reduce((n, p, i) => (i ? n + dist(path[i - 1], p) : 0), 0);

/** Where somebody is at `ms`, between the two keys either side. */
function sample(keys, ms) {
  if (ms <= keys[0].ms) return keys[0].at;
  const last = keys[keys.length - 1];
  if (ms >= last.ms) return last.at;
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].ms <= ms) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[hi];
  if (b.ms === a.ms) return a.at;
  const k = (ms - a.ms) / (b.ms - a.ms);
  return [a.at[0] + (b.at[0] - a.at[0]) * k, a.at[1] + (b.at[1] - a.at[1]) * k];
}

/** Play, pause, scrub, restart, speed. The clock the audience is on. */
class Transport {
  constructor(scene) {
    this.scene = scene;
    this.duration = scene.timeline.durationMs ?? 0;
    this.ms = 0;
    this.playing = false;
    this.speed = 1;
    this.last = 0;
    this.events = scene.timeline.events ?? [];
    this.wire();
    this.apply(0);
    scene.game.events.on('step', () => this.tick());
  }

  wire() {
    el('play')?.addEventListener('click', () => this.toggle());
    el('restart')?.addEventListener('click', () => { this.apply(0); this.play(); });
    el('speed')?.addEventListener('change', (e) => { this.speed = Number(e.target.value); });
    el('scrub')?.addEventListener('input', (e) => {
      this.pause();
      this.apply((Number(e.target.value) / 1000) * this.duration);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); this.toggle(); }
    });
  }

  play() { this.playing = true; this.last = performance.now(); el('play').textContent = '❚❚'; }
  pause() { this.playing = false; el('play').textContent = '▶'; }
  toggle() { this.playing ? this.pause() : this.play(); }

  tick() {
    if (!this.playing) return;
    const now = performance.now();
    const step = (now - this.last) * this.speed;
    this.last = now;
    const next = this.ms + step;
    if (next >= this.duration) { this.apply(this.duration); this.pause(); return; }
    this.apply(next);
  }

  /** The whole player, in one function: everything is a pure function of ms. */
  apply(ms) {
    this.ms = ms;
    this.scene.seek(ms);
    const scrub = el('scrub');
    if (scrub && document.activeElement !== scrub) {
      scrub.value = String(this.duration ? Math.round((ms / this.duration) * 1000) : 0);
    }
    el('clock').textContent = `${mmss(ms)} / ${mmss(this.duration)}`;

    // Subtitles and the venue caption. A line is on screen for the reading time
    // the timeline gave it, which is presentation's answer and not a tick count.
    const line = this.events.find((e) => e.kind === 'dialogue'
      && ms >= e.startMs && ms < e.startMs + e.durationMs);
    const order = this.events.find((e) => e.kind === 'order'
      && ms >= e.startMs && ms < e.startMs + e.durationMs);
    const sub = el('subtitle');
    const parts = [];
    if (line) parts.push(`<span class="who">${line.speaker}</span>${escape(line.text)}`);
    if (order) parts.push(`<span class="caption">${escape(orderLine(order, ms))}</span>`);
    sub.innerHTML = parts.join('<br>');
  }
}

/**
 * What the cafe is doing, said from the order fact rather than from anybody's
 * sentence (§8). The spoken line may never have named the item.
 */
function orderLine(order, ms) {
  if (order.clearedMs != null && ms >= order.clearedMs) return `${order.caption} — 片づけ`;
  if (order.servedMs != null && ms >= order.servedMs) return `${order.caption} — お待たせしました`;
  if (order.readyMs != null && ms >= order.readyMs) return `${order.caption} — できあがり`;
  const step = [...(order.steps ?? [])].reverse().find((s) => ms >= s.atMs);
  if (step) return `${order.caption} — ${step.step}`;
  if (order.startedMs != null && ms >= order.startedMs) return `${order.caption} — 用意中`;
  return `${order.caption} — ご注文`;
}

const escape = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#171a16',
  scene: ReplayScene,
  input: { activePointers: 3 },
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false }
});
