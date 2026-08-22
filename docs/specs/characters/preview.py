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

FOUR = {'brother-01': [412, 751, 1156], 'brother-02': [406, 734, 1135], 'dog-01': [502, 819, 1235]}

def views(cid, pose):
    """(front, back) RGBA crops for a character and pose."""
    if cid in FOUR:
        im = Image.open(f'{R}/{cid}/{cid}.png').convert('RGBA')
        c = [0] + FOUR[cid] + [im.width]
        i = 0 if pose == 'stand' else 2
        return im.crop((c[i], 0, c[i+1], im.height)), im.crop((c[i+1], 0, c[i+2], im.height))
    stem = {'boy-01': 'boy-01-trousers'}.get(cid, cid)
    im = Image.open(f'{R}/{cid}/{stem}-{pose}.png').convert('RGBA')
    return im.crop((0, 0, im.width//2, im.height)), im.crop((im.width//2, 0, im.width, im.height))

def trim(im):
    a = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(a > 20)
    return im.crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))

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

CAST = {'cafe-counter': 'shopkeeper-01',
        'counter-stool-1': 'girl-01', 'counter-stool-2': 'man-01', 'counter-stool-3': 'woman-01',
        'table-near-1': 'gentleman-01', 'table-near-2': 'pastor-01',
        'table-near-3': 'boy-01', 'table-near-4': 'girl-01',
        'table-far-1': 'brother-01', 'table-far-2': 'brother-02',
        'bench-slot-1': 'grandma-01', 'bench-slot-2': 'grandpa-01'}
del CAST['table-near-4']

place = []
for s in A['seats']:
    cid = CAST.get(s['id'])
    if cid: place.append((cid, 'sit', s['foot'], s['facingDeg']))
for st in A['stations']:
    cid = CAST.get(st['id'])
    if cid: place.append((cid, 'stand', st['anchor'], st['facingDeg']))
place.append(('dog-01', 'stand', [378, 196], 30.0))          # by the far table, with the brothers

bg = Image.open('/home/user/littleworld/docs/assets/showa/scene-clean-2560.webp').convert('RGBA')
canvas = bg.resize((W*S, HH*S), Image.LANCZOS)
for cid, pose, foot, deg in sorted(place, key=lambda p: p[2][1]):
    h = K * (foot[1] - H0) * metres(cid) * (sit_ratio(cid) if pose == 'sit' else 1.0)
    sp = sprite(cid, pose, deg)
    w = max(2, round(h * sp.width / sp.height * S)); hp = max(2, round(h * S))
    sp = sp.resize((w, hp), Image.LANCZOS)
    canvas.alpha_composite(sp, (round(foot[0]*S - w/2), round(foot[1]*S - hp)))
    r = sit_ratio(cid) if pose == 'sit' else 1.0
    print(f'  {cid:14s} {pose:5s} ({foot[0]:5.1f},{foot[1]:5.1f}) {deg:5.1f}°  坐姿比 {r:.2f}  高 {h:5.1f}u')
canvas.convert('RGB').save('populated.png')
print('\nsaved populated.png', canvas.size)
