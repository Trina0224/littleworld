"""Export what the live scene needs: cut sprites, placements, and a depth map.

    python3 docs/specs/characters/export-web.py

preview.py already decides everything - which sheet, which way round, how big,
where the buttocks land, what order to draw in. This writes that decision out so
the browser does not have to redo any of it:

  docs/assets/characters/<key>.png   one trimmed sprite per placed character
  docs/specs/characters/placements.json
  docs/specs/world/occdepth.png      the occluder's floor line, per pixel

The depth map is how occlusion crosses into the browser. Red and green carry the
row where that pixel's occluder meets the floor, high byte and low byte; zero
means no occluder there. A character erases its own pixels wherever that row is
below its own, which is the same rule preview.py draws with, and it keeps working
when the characters start moving.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import preview as pv                                    # noqa: E402  (renders on import)

ROOT = '/home/user/littleworld'
SPRITE_DIR = f'{ROOT}/docs/assets/characters'
MAX_SPRITE_H = 512
os.makedirs(SPRITE_DIR, exist_ok=True)

placements = []
for depth, cid, pose, at, deg, h, w, left, bottom, clip, sp, note in pv.drawn:
    d = deg % 360
    view = pv.VIEW.get(cid) or ('front' if d < 180 else 'back')
    if clip is not None:
        # Bake the counter's cut into the sprite. The page then needs no rule for
        # it, and the exported box shrinks to what is actually drawn.
        top = bottom - h
        frac = min(1.0, max(0.02, (clip - top) / h))
        sp = sp.crop((0, 0, sp.width, max(1, round(sp.height * frac))))
        h *= frac
        bottom = top + h                       # the crop keeps the head, not the feet
    key = f'{cid}-{pose}-{view}'
    mirrored = (90 <= d < 270) != (pv.DRAWN.get(cid, {}).get(view, pv.DRAWN['default']) == 'left')
    if mirrored:
        key += '-m'
    im = sp
    if im.height > MAX_SPRITE_H:
        im = im.resize((max(1, round(im.width * MAX_SPRITE_H / im.height)), MAX_SPRITE_H),
                       Image.LANCZOS)
    im.save(f'{SPRITE_DIR}/{key}.png')          # always rewritten: a clip or a
                                                # mirror change must not be skipped
    placements.append({'id': cid, 'key': key, 'pose': pose,
                       'x': round(left, 2), 'y': round(bottom - h, 2),
                       'w': round(w, 2), 'h': round(h, 2),
                       'depth': round(depth, 2)})
placements.sort(key=lambda p: p['depth'])
json.dump({'note': ('Written by export-web.py. x, y is the sprite box top-left in world '
                    'units, w and h its size; depth is the row the character sorts at. '
                    'The browser draws these in order and erases whatever occdepth.png '
                    'says stands in front.'),
           'placements': placements},
          open(f'{HERE}/placements.json', 'w'), indent=2, ensure_ascii=False)

base = np.where(pv.OCC_MASK, pv.OCC_BASE, 0).astype(np.uint16)
rgb = np.zeros(base.shape + (3,), np.uint8)
rgb[..., 0] = (base >> 8).astype(np.uint8)
rgb[..., 1] = (base & 0xFF).astype(np.uint8)
Image.fromarray(rgb, 'RGB').save(f'{ROOT}/docs/specs/world/occdepth.png')

print(f'{len(placements)} placements, '
      f'{len(set(p["key"] for p in placements))} sprites')
for p in placements:
    print(f'  {p["key"]:28s} x {p["x"]:6.1f} y {p["y"]:6.1f} '
          f'{p["w"]:5.1f}x{p["h"]:5.1f}  depth {p["depth"]:6.1f}')
