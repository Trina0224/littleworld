"""Read the owner's magenta sit marks and write them into pose-matrix.json.

    python3 docs/specs/characters/read-marks.py

Each sheet in marks/ is one of the boards handed out for marking: the sit
sprite scaled to 760 px tall at x=40, y=40, front then back with a 60 px gap,
and a percentage grid. The owner draws two magenta strokes per view — a long
one along the buttocks where they meet the seat, and a short one at the knee.
The long stroke is always the leftmost of the two, which is what tells them
apart. Both are recorded as fractions of sprite height above the sprite's
bottom edge, so they survive any later rescaling.
"""
import json
import os
from collections import deque

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET_H, PAD, GAP = 760, 40, 60


def groups(mask, minpx=25, reach=2):
    lab = np.zeros(mask.shape, np.int32); n = 0; out = []
    for sy, sx in zip(*np.nonzero(mask)):
        if lab[sy, sx]:
            continue
        n += 1; q = deque([(sy, sx)]); lab[sy, sx] = n; cells = []
        while q:
            y, x = q.popleft(); cells.append((y, x))
            for dy in range(-reach, reach+1):
                for dx in range(-reach, reach+1):
                    ny, nx = y+dy, x+dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] \
                       and mask[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = n; q.append((ny, nx))
        if len(cells) >= minpx:
            out.append(np.array(cells))
    return out


def read(path, widths):
    """{'front': {...}, 'back': {...}} of marks for one sheet."""
    im = np.asarray(Image.open(path).convert('RGB')).astype(int)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    magenta = (r > 140) & (b > 140) & (g < r - 50) & (g < b - 50)
    out = {}
    x = PAD
    for view, w in zip(('front', 'back'), widths):
        sel = magenta.copy(); sel[:, :x] = False; sel[:, x+w:] = False
        gs = groups(sel)
        if gs:
                # the buttock stroke is the long one; whatever else is drawn is a
            # knee, and where two are drawn the bigger stroke is the near leg
            gs.sort(key=lambda c: -len(c))
            hip = gs[0]
            knee = gs[1] if len(gs) > 1 else None
            frac = lambda ys: float(((PAD + SHEET_H) - ys.mean()) / SHEET_H)
            m = {'hip': round(frac(hip[:, 0]), 3),
                 'hipX': round(float((hip[:, 1].mean() - x) / w), 3)}
            if knee is not None:
                m['knee'] = round(frac(knee[:, 0]), 3)
                m['kneeX'] = round(float((knee[:, 1].mean() - x) / w), 3)
            out[view] = m
        x += w + GAP
    return out


def main():
    import sys
    sys.path.insert(0, HERE)
    import preview                                    # for the sprite crops

    pm_path = f'{HERE}/pose-matrix.json'
    pm = json.load(open(pm_path))
    marks = {}
    for fn in sorted(os.listdir(f'{HERE}/marks')):
        if not fn.endswith('.png'):
            continue
        cid = fn[:-4]
        widths = [round(SHEET_H * v.width / v.height)
                  for v in preview.views(cid, 'sit')]
        marks[cid] = read(f'{HERE}/marks/{cid}.png', widths)
        for view, m in marks[cid].items():
            print(f'{cid:14s} {view:5s} hip {m["hip"]:.3f} @x{m["hipX"]:.2f}'
                  + (f'   knee {m["knee"]:.3f} @x{m["kneeX"]:.2f}' if 'knee' in m else '   knee —'))
    pm['seatedAnchoring']['sitMarks'] = marks
    pm['seatedAnchoring']['sitMarksNote'] = (
        'Measured off the owner-marked sheets in marks/, by read-marks.py. '
        'Fractions of sprite height above the sprite bottom; hipX/kneeX are '
        'fractions of sprite width from its left. hip is where the buttocks '
        'meet the seat and is the anchor; knee is the check that the sitter '
        'is not floating off the front of the chair. Characters with no sheet '
        'yet fall back to hipFraction, which is eyeballed.')
    json.dump(pm, open(pm_path, 'w'), indent=2, ensure_ascii=False)
    print(f'\nwrote {len(marks)} character(s) into pose-matrix.json')


if __name__ == '__main__':
    main()
