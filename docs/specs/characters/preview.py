"""Render every character into the scene at its anchor, as a sanity check.

    python3 docs/specs/characters/preview.py

Sprites come straight from the reference sheets' own alpha channel. The sheets
are RGBA and already carry a clean matte; the black vignette is only what they
look like flattened onto black, so no cut-out algorithm is needed or wanted.
"""
import json
import math

import numpy as np
from PIL import Image, ImageFilter

R = '/home/user/littleworld/assets/characters'
SPEC = json.load(open('/home/user/littleworld/docs/specs/world/world.json'))
A = json.load(open('/home/user/littleworld/docs/specs/world/anchors.json'))
K = SPEC['characterHeightRamp']['unitsPerMetrePerY']
H0 = SPEC['characterHeightRamp']['horizonY']
W, HH, S = 640, 360, 2

FOUR = {'brother-01', 'brother-02', 'dog-01'}
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
# stature, standing. brother-01 is the elder of the pair and reads bulkier, so he
# is not the same height as his brother.
STATURE = {'dog-01': 0.55, 'brother-01': 1.40, 'brother-02': 1.25}
def metres(cid):
    return STATURE.get(cid, 1.35 if cid in CHILD else 1.65)

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
KNEE = SA['kneeFraction']
SITH = SA['sittingHeightMetres']
SEAT_DEPTH = 0.45          # chair seat front-to-back, metres

def seated_box(cid, sprite_ratio, seat):
    """Size and placement for a seated sprite, anchored by the head.

    The head is the one landmark every sheet agrees on: it is the top of the
    sprite whichever way the character faces, and its world height is fixed —
    seat height plus sitting height above the floor. Knee fractions were
    measured on the front views and do not transfer to the back views, where
    the knee is not even visible, which is what threw the away-facing sitters.
    """
    scale = K * (seat['frontLegY'] - H0)
    kind = 'dog' if cid == 'dog-01' else ('child' if cid in CHILD else 'adult')
    ref = 0.55 if kind == 'dog' else (1.35 if kind == 'child' else 1.65)
    sit_m = SITH[kind] * metres(cid) / ref
    h = sit_m * scale / (1.0 - HIP.get(cid, 0.45))
    w = h * sprite_ratio
    # The hip goes on the seat surface. That is the one contact that is真 in
    # world terms, and it is the only one the projection lets us honour: going
    # up 0.42 m onto the seat and going back 0.45 m onto the floor behind the
    # chair land on nearly the same screen row here, so "hip on the seat" and
    # "feet on the floor beyond" cannot both hold for a drawing that separates
    # them by four tenths of a body.
    hip = HIP.get(cid, 0.45)
    bottom = seat['seatSurfaceY'] + hip * h
    d = math.radians(seat['facingDeg'])
    left = seat['seat'][0] + math.cos(d) * SEAT_DEPTH * scale * 0.35 - w / 2
    # Facing away, the chair back covers everything from the seat up to its own
    # top, which is what you actually see of someone on a park bench from behind
    # and above: head and shoulders, nothing else.
    clip = seat['backTopY'] if 180 <= seat['facingDeg'] % 360 < 360 else None
    return h, w, left, bottom, clip

place = []
for s in A['seats']:
    cid = CAST.get(s['id'])
    if cid: place.append((cid, 'sit', s, s['facingDeg']))
for st in A['stations']:
    cid = CAST.get(st['id'])
    if cid: place.append((cid, 'stand', st['anchor'], st['facingDeg']))
place.append(('dog-01', 'stand', [455, 300], 300.0))         # in front of the bench, with the brothers

FW, FH = W*4, HH*4                                   # the masks' own resolution


def load_mask(name, full=False):
    im = Image.open(f'/home/user/littleworld/docs/specs/world/{name}').convert('L')
    size = (FW, FH) if full else (W, HH)
    return np.asarray(im.resize(size, Image.BOX) if im.size != size else im) > 127


def occluder_baselines():
    """Depth for every occluder pixel: the floor y of the object it belongs to.

    A flat always-on-top layer is wrong for anything standing in the middle of
    the scene. A table hides someone seated behind it and must not hide someone
    walking in front of it, and which of those is true depends on where they are.
    So each vertical run of occluder pixels carries the y where that run meets
    the floor, and a character is behind it exactly when its own ground y is
    smaller.

    Furniture comes free: an enclosed hole in the walkable map is an object
    standing on the floor, which is how both cafe tables get their depth without
    anyone painting them.
    """
    occ = load_mask('occluder.png', full=True)
    walk = load_mask('walkable.png')


    seen = np.zeros(walk.shape, bool)
    holes = np.zeros(walk.shape, bool)
    for sy, sx in zip(*np.nonzero(~walk)):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]; seen[sy, sx] = True; cells = []; touches_edge = False
        while stack:
            y, x = stack.pop(); cells.append((y, x))
            if y in (0, HH-1) or x in (0, W-1):
                touches_edge = True
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < HH and 0 <= nx < W and not walk[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; stack.append((ny, nx))
        if not touches_edge:
            for y, x in cells:
                holes[y, x] = True

    # Baselines are computed at the masks' own resolution so the bands stay
    # clean. The holes are found at world resolution because the flood is cheap
    # there, then snapped back onto the full-resolution walkable boundary so
    # their edges are not blocky.
    grown = Image.fromarray((holes*255).astype(np.uint8)).resize((FW, FH), Image.NEAREST)
    grown = grown.filter(ImageFilter.MaxFilter(9))
    holes_full = (np.asarray(grown) > 127) & ~load_mask('walkable.png', full=True)
    mask = occ | holes_full
    base = np.zeros(mask.shape, np.int16)
    for x in range(FW):
        col = mask[:, x]; y = 0
        while y < FH:
            if col[y]:
                end = y
                while end + 1 < FH and col[end+1]:
                    end += 1
                base[y:end+1, x] = end
                y = end + 1
            else:
                y += 1
    return mask, base


OCC_MASK, OCC_BASE = occluder_baselines()

bg = Image.open('/home/user/littleworld/docs/assets/showa/scene-clean-2560.webp').convert('RGBA')
canvas = bg.resize((W*S, HH*S), Image.LANCZOS)
scene = canvas.copy()
def draw_occluders(lo, hi):
    """Paint back the scenery whose floor line falls in (lo, hi]."""
    band = OCC_MASK & (OCC_BASE > lo*4) & (OCC_BASE <= hi*4)
    if not band.any():
        return
    a = Image.fromarray((band * 255).astype(np.uint8)).resize((W*S, HH*S), Image.LANCZOS)
    front = scene.copy(); front.putalpha(a)
    canvas.alpha_composite(front)


drawn = []
for cid, pose, at, deg in sorted(place, key=lambda p: (p[2]['frontLegY'] if p[1]=='sit' else p[2][1])):
    sp = sprite(cid, pose, deg)
    if pose == 'sit':
        h, w, left, bottom, clip = seated_box(cid, sp.width / sp.height, at)
        # facing away puts the chair back in front of the sitter, facing the
        # camera puts the sitter in front of it
        depth = at['frontLegY'] - 1 if 180 <= at['facingDeg'] % 360 < 360 else at['frontLegY'] + 1
    else:
        h = K * (at[1] - H0) * metres(cid); w = h * sp.width / sp.height
        left = at[0] - w/2; bottom = at[1]; depth = at[1]; clip = None
    drawn.append((depth, cid, pose, at, deg, h, w, left, bottom, clip, sp))

last = -1
for depth, cid, pose, at, deg, h, w, left, bottom, clip, sp in drawn:
    draw_occluders(last, depth)                      # scenery nearer than the last sprite
    last = depth
    wp = max(2, round(w * S)); hp = max(2, round(h * S))
    img = sp.resize((wp, hp), Image.LANCZOS)
    top = round(bottom*S - hp)
    if clip is not None:
        keep = max(0, min(hp, round(clip*S) - top))
        if keep < hp:
            img = img.crop((0, 0, wp, keep))
    canvas.alpha_composite(img, (round(left*S), top))
    print(f'  {cid:14s} {pose:5s} {deg:5.1f}°  高 {h:5.1f}u  左 {left:5.1f}  底 {bottom:5.1f}')
draw_occluders(last, HH)
canvas.convert('RGB').save('populated.png')
print('\nsaved populated.png', canvas.size)
