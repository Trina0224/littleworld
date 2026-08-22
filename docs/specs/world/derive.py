"""Regenerate backstage.png from walkable.png and occluder.png.

A walkable cell is backstage when a character standing on it would be almost
entirely hidden behind an occluder. Those cells stay traversable so agents can
enter, leave and pass behind scenery, but pathfinding should charge them the
multiplier in world.json so they are not used as a shortcut.

    python3 docs/specs/world/derive.py
"""
import json
import pathlib

import numpy as np
from PIL import Image

HERE = pathlib.Path(__file__).parent
SPEC = json.loads((HERE / 'world.json').read_text())
W = SPEC['coordinateSystem']['width']
H = SPEC['coordinateSystem']['height']
THRESHOLD = SPEC['backstagePolicy']['occlusionThreshold']
RAMP = SPEC['characterHeightRamp']['worldUnitsAtY']

(Y0, H0), (Y1, H1) = sorted((int(k), v) for k, v in RAMP.items())


def character_height(y):
    return H0 + (y - Y0) * (H1 - H0) / (Y1 - Y0)


def load(name):
    """Read a mask and reduce it to world resolution."""
    im = Image.open(HERE / name).convert('L')
    if im.size != (W, H):
        im = im.resize((W, H), Image.BOX)
    return np.asarray(im) > 127


def main():
    walk = load('walkable.png')
    occ = load('occluder.png')

    integral = np.cumsum(np.cumsum(occ.astype(np.int32), 0), 1)

    def occluded_fraction(x0, y0, x1, y1):
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0:
            return 0.0
        total = integral[y1, x1]
        if y0:
            total -= integral[y0 - 1, x1]
        if x0:
            total -= integral[y1, x0 - 1]
        if x0 and y0:
            total += integral[y0 - 1, x0 - 1]
        return total / ((x1 - x0 + 1) * (y1 - y0 + 1))

    backstage = np.zeros((H, W), bool)
    for y, x in zip(*np.nonzero(walk)):
        h = max(character_height(y), 8.0)
        w = max(h * 0.40, 4.0)
        backstage[y, x] = occluded_fraction(int(x - w / 2), int(y - h),
                                            int(x + w / 2), int(y)) > THRESHOLD

    Image.fromarray((backstage * 255).astype(np.uint8)).convert('1').save(
        HERE / 'backstage.png', optimize=True)
    print(f'walkable  {walk.sum():,} cells')
    print(f'backstage {backstage.sum():,} cells '
          f'({100 * backstage.sum() / walk.sum():.1f}% of walkable)')


if __name__ == '__main__':
    main()
