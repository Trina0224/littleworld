"""Render every character into the scene at its anchor, as a sanity check.

    python3 docs/specs/characters/preview.py

Sprites come straight from the reference sheets' own alpha channel. The sheets
are RGBA and already carry a clean matte; the black vignette is only what they
look like flattened onto black, so no cut-out algorithm is needed or wanted.
"""
import json

import numpy as np
from PIL import Image

R = '/home/user/littleworld/assets/characters'
SPEC = json.load(open('/home/user/littleworld/docs/specs/world/world.json'))
A = json.load(open('/home/user/littleworld/docs/specs/world/anchors.json'))
K = SPEC['characterHeightRamp']['unitsPerMetrePerY']
H0 = SPEC['characterHeightRamp']['horizonY']
W, HH, S = 640, 360, 2

FOUR = {'brother-01', 'brother-02', 'dog-01'}
from PIL import Image, ImageFilter
import numpy as np
from collections import deque

def _label(m):
    lab = np.zeros(m.shape, np.int32); n = 0
    H, W = m.shape
    for sy, sx in zip(*np.nonzero(m)):
        if lab[sy, sx]: continue
        n += 1; q = deque([(sy, sx)]); lab[sy, sx] = n
        while q:
            y, x = q.popleft()
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
    return lab, n

def split_views(path, want, break_px=9, min_px=3000):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)[..., 3]
    mask = a > 16
    # erode to snap the thin bridges where two figures touch
    core = np.asarray(Image.fromarray((mask*255).astype(np.uint8))
                      .filter(ImageFilter.MinFilter(break_px))) > 127
    lab, n = _label(core)
    keep = [i for i in range(1, n+1) if (lab == i).sum() >= min_px]
    keep.sort(key=lambda i: np.nonzero(lab == i)[1].mean())
    if len(keep) != want:
        raise SystemExit(f'{path}: found {len(keep)} components, wanted {want}')

    # grow each core back over the full mask, so every pixel joins its own figure
    own = np.zeros(mask.shape, np.int32)
    for k, i in enumerate(keep, 1): own[lab == i] = k
    for _ in range(break_px * 3):
        for d, ax in ((1,0),(-1,0),(1,1),(-1,1)):
            cand = np.roll(own, d, ax)
            fill = (own == 0) & mask & (cand > 0)
            own[fill] = cand[fill]
        if not ((own == 0) & mask).any(): break

    out = []
    for k in range(1, want+1):
        m = own == k
        ys, xs = np.nonzero(m)
        box = (xs.min(), ys.min(), xs.max()+1, ys.max()+1)
        rgba = np.asarray(im).copy()
        rgba[..., 3] = np.where(m, rgba[..., 3], 0)
        out.append(Image.fromarray(rgba, 'RGBA').crop(box))
    return out

_cache = {}
def views(cid, pose):
    """(front, back) RGBA crops for a character and pose."""
    if cid in FOUR:
        if cid not in _cache:
            _cache[cid] = split_views(f'{R}/{cid}/{cid}.png', 4)
        v = _cache[cid]
        return (v[0], v[1]) if pose == 'stand' else (v[2], v[3])
    stem = {'boy-01': 'boy-01-trousers'}.get(cid, cid)
    key = (cid, pose)
    if key not in _cache:
        _cache[key] = split_views(f'{R}/{cid}/{stem}-{pose}.png', 2)
    return tuple(_cache[key])

def trim(im):
    return im

def sprite(cid, pose, deg):
    f, b = views(cid, pose)
    d = deg % 360
    im = trim(f if d < 180 else b)
    return im.transpose(Image.FLIP_LEFT_RIGHT) if 90 <= d < 270 else im

CHILD = {'boy-01', 'girl-01', 'brother-01', 'brother-02'}
def metres(cid):
    return 0.55 if cid == 'dog-01' else (1.35 if cid in CHILD else 1.65)

# Measuring this off the art does not work: the stand and sit sheets are each
# framed to fill their canvas, so their pixel heights carry no shared scale.
# Seated height is anatomical instead — about 1.25 m for a 1.65 m adult.
SIT_RATIO = 0.75
def sit_ratio(cid):
    return 1.0 if cid == 'dog-01' else SIT_RATIO

# Anchors near the horizon render very small — a seated child at table-far is
# only about 20 world units — so the characters whose detail matters most sit
# near the camera. See the legibility note in README.md.
CAST = {'cafe-counter': 'shopkeeper-01',
        'counter-stool-1': 'girl-01', 'counter-stool-2': 'man-01', 'counter-stool-3': 'woman-01',
        'table-near-1': 'gentleman-01', 'table-near-2': 'pastor-01',
        'table-near-3': 'grandma-01', 'table-near-4': 'grandpa-01',
        'table-far-1': 'boy-01',
        'bench-slot-2': 'brother-01', 'bench-slot-3': 'brother-02'}

PM = json.load(open('/home/user/littleworld/docs/specs/characters/pose-matrix.json'))
SA = PM['seatedAnchoring']
HIP = SA['hipFraction']
SITH = SA['sittingHeightMetres']

def seated_box(cid, sprite_ratio, seat_xy, seat_h):
    """Height and top-left for a seated sprite, anchored by the hip.

    The part of a body above the seat is anatomically stable; the legs below it
    are whatever the drawing chose. So scale by sitting height and hang the
    sprite off its own hip line.
    """
    scale = K * (seat_xy[1] - H0)
    kind = 'dog' if cid == 'dog-01' else ('child' if cid in CHILD else 'adult')
    above = SITH[kind] * scale                      # hip to head, in world units
    f = HIP.get(cid, 0.45)
    h = above / (1.0 - f)
    w = h * sprite_ratio
    bottom = seat_xy[1] + f * h
    return h, w, bottom

place = []
for s in A['seats']:
    cid = CAST.get(s['id'])
    if cid: place.append((cid, 'sit', s['seat'], s['facingDeg']))
for st in A['stations']:
    cid = CAST.get(st['id'])
    if cid: place.append((cid, 'stand', st['anchor'], st['facingDeg']))
place.append(('dog-01', 'stand', [455, 300], 300.0))         # in front of the bench, with the brothers

bg = Image.open('/home/user/littleworld/docs/assets/showa/scene-clean-2560.webp').convert('RGBA')
canvas = bg.resize((W*S, HH*S), Image.LANCZOS)
for cid, pose, at, deg in sorted(place, key=lambda p: p[2][1]):
    sp = sprite(cid, pose, deg)
    if pose == 'sit':
        h, w, bottom = seated_box(cid, sp.width / sp.height, at, 0.42)
    else:
        h = K * (at[1] - H0) * metres(cid); w = h * sp.width / sp.height; bottom = at[1]
    wp = max(2, round(w * S)); hp = max(2, round(h * S))
    sp = sp.resize((wp, hp), Image.LANCZOS)
    canvas.alpha_composite(sp, (round(at[0]*S - wp/2), round(bottom*S - hp)))
    print(f'  {cid:14s} {pose:5s} ({at[0]:5.1f},{at[1]:5.1f}) {deg:5.1f}°  高 {h:5.1f}u  底 {bottom:5.1f}')
# scenery that is drawn in front of characters goes back on top
occ = Image.open('/home/user/littleworld/docs/specs/world/occluder.png').convert('L').resize((W*S, HH*S), Image.LANCZOS)
front = bg.resize((W*S, HH*S), Image.LANCZOS).copy()
front.putalpha(occ)
canvas.alpha_composite(front)

canvas.convert('RGB').save('populated.png')
print('\nsaved populated.png', canvas.size)
