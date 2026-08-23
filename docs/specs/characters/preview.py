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

def sprite(cid, pose, deg):
    f, b = views(cid, pose)
    d = deg % 360
    view = VIEW.get(cid) or ('front' if d < 180 else 'back')
    im = f if view == 'front' else b
    # mirroring assumes the sheet is drawn facing screen right; a sheet drawn the
    # other way has to flip on the opposite condition
    drawn_left = DRAWN.get(cid, {}).get(view, DRAWN['default']) == 'left'
    return im.transpose(Image.FLIP_LEFT_RIGHT) if (90 <= d < 270) != drawn_left else im

CHILD = {'boy-01', 'girl-01', 'brother-01', 'brother-02'}
# stature, standing. brother-01 is the elder of the pair and reads bulkier, so he
# is not the same height as his brother.
STATURE = {'dog-01': 0.55, 'brother-01': 1.40, 'brother-02': 1.25}
def metres(cid):
    return STATURE.get(cid, 1.35 if cid in CHILD else 1.65)

# Seated size cannot be measured off the art: the stand and sit sheets are each
# framed to fill their canvas, so their pixel heights carry no shared scale. It
# comes from sitting height instead, hip to head, in pose-matrix.json.

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
HIP_BACK = SA['hipFractionBack']
COVER = SA['seatCoverage']
SITH = SA['sittingHeightMetres']
MARKS = SA.get('sitMarks', {})
DROP = SA.get('dropUnits', 0.0)
SCALE = SA.get('sizeScale', 1.0)
VIEW = PM.get('poseView', {})
DRAWN = PM.get('drawnFacing', {'default': 'right'})
WHOLE = set(SA.get('wholeOnSeat', []))

SEAT_TOP = np.asarray(Image.open('/home/user/littleworld/docs/specs/world/seatsurfaces.png')
                      .convert('L').resize((W, HH), Image.BOX)) > 127

def seat_band(cx, cy, h):
    """The painted seat's near and far edge in the column the sitter occupies.

    The quad's bounding box is no good for this: these seats run diagonally, so
    most of the box height is the seat's length, not its depth. One column of it
    is the depth, which is the thing a hip and a knee have to fit between."""
    col = np.nonzero(SEAT_TOP[:, int(round(cx))] & (np.abs(np.arange(HH) - cy) <= h))[0]
    return (col.min(), col.max()) if len(col) else (cy - 1, cy + 1)


HIP_INTO_SEAT = 0.30      # how far back on the seat the buttocks land


def seated_box(cid, sprite, seat, facing):
    """Size and placement for a seated sprite.

    Where: the owner marked, on every sit sheet, the line where the buttocks
    meet the seat and where the knee is. That line goes on the painted seat,
    a third of the way back from its front edge, and the sprite hangs from it.
    The knee then falls where the drawing puts it, and the check that matters
    is whether it still lands on the painted seat.

    How big: from the ramp and sitting height, hip to head, which is the one
    body measure that survives the difference between the stand and sit sheets.
    Sizing off the painted seat instead does not work: that quad lies on the
    ground plane and the projection stretches it sideways to roughly 1.8x the
    chair's real width, while shoulders stand upright and get no such stretch.
    Matching the two made a 1.65 m man read 2.4 m tall.
    """
    surf = seat['seatSurface']
    cx, cy = surf['centre']
    d = facing % 360
    view = VIEW.get(cid) or ('front' if d < 180 else 'back')
    mirror = 90 <= d < 270
    m = MARKS.get(cid, {}).get(view, {})
    back = view == 'back'
    hip = m.get('hip') or (HIP_BACK if back else HIP).get(cid, 0.30 if back else 0.45)
    hip_x = m.get('hipX', 0.5)
    if mirror:
        hip_x = 1.0 - hip_x

    if cid == 'dog-01':
        sit_m = SITH['dog']
    elif cid in CHILD:
        # the brothers are not the same size, and sitting must not hide that
        sit_m = SITH['child'] * metres(cid) / 1.35
    else:
        sit_m = SITH.get(cid, SITH['default'])
    h = sit_m * K * (cy - H0) / (1.0 - hip) * COVER.get(cid, COVER['default']) * SCALE
    w = h * sprite.width / sprite.height

    far, near = seat_band(cx, cy, surf['h'])
    if cid in WHOLE:
        # small enough to sit on the seat entire, feet and all, so the sprite's
        # own bottom goes on the seat's front edge and nothing needs aligning
        bottom = near + DROP
        left = cx - w / 2
        hip_y = bottom - hip * h
    else:
        hip_y = far + HIP_INTO_SEAT * (near - far) + DROP
        left = cx - hip_x * w
        bottom = hip_y + hip * h
    knee = m.get('knee')
    knee_y = bottom - knee * h if knee is not None else None
    return h, w, left, bottom, None, (hip_y, knee_y, far, near)


place = []
for s in A['seats']:
    cid = CAST.get(s['id'])
    if cid: place.append((cid, 'sit', s, s['facingDeg']))
for st in A['stations']:
    cid = CAST.get(st['id'])
    if cid: place.append((cid, 'stand', st['anchor'], st['facingDeg']))
place.append(('dog-01', 'stand', [462, 262], 300.0))         # on the sand beside the bench, with the brothers

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

    # Chair backs are the one thing the run rule gets wrong. A back is painted
    # down to the seat, not to the floor, so its lowest pixel reads as a depth
    # in front of its own occupant and the chair swallows whoever sits in it.
    # Every back in this art stands up-screen of its seat, so the honest depth
    # is the back's own top row: the occupant is nearer than that and draws over
    # it, anyone further away is behind it and gets covered.
    backs = load_mask('seatbacks.png', full=True)
    for s in A['seats']:
        if 'backrestTopY' not in s:
            continue
        cx, cy = s['seatSurface']['centre']
        near = backs & (np.abs(np.arange(FW)[None, :] - cx*4) < 60) \
                     & (np.abs(np.arange(FH)[:, None] - cy*4) < 60)
        mask |= near
        base[near] = s['backrestTopY'] * 4
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
for cid, pose, at, deg in sorted(place, key=lambda p: (p[2]['seatSurface']['centre'][1] if p[1]=='sit' else p[2][1])):
    sp = sprite(cid, pose, deg)
    if pose == 'sit':
        h, w, left, bottom, clip, chk = seated_box(cid, sp, at, deg)
        hy, ky, far, near = chk
        ok = lambda y: '' if y is None else ('OK' if far - 0.5 <= y <= near + 0.5 else '離開椅面')
        note = f'  臀 {hy:5.1f} {ok(hy):4s}' + (f'  膝 {ky:5.1f} {ok(ky)}' if ky is not None else '')
        # facing away puts the chair back in front of the sitter, facing the
        # camera puts the sitter in front of it
        depth = at['seatSurface']['centre'][1]
    else:
        h = K * (at[1] - H0) * metres(cid) * SCALE; w = h * sp.width / sp.height
        left = at[0] - w/2; bottom = at[1] + DROP; depth = at[1]; clip = None; note = ''
    drawn.append((depth, cid, pose, at, deg, h, w, left, bottom, clip, sp, note))

last = -1
for depth, cid, pose, at, deg, h, w, left, bottom, clip, sp, note in drawn:
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
    print(f'  {cid:14s} {pose:5s} {deg:5.1f}°  高 {h:5.1f}u  左 {left:5.1f}  底 {bottom:5.1f}{note}')
draw_occluders(last, HH)
canvas.convert('RGB').save('populated.png')
print('\nsaved populated.png', canvas.size)
