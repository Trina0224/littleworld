"""Pack the walkable and backstage maps into one file the engine can read.

    python3 docs/specs/world/navgrid-derive.py

The painted maps are PNGs, and the engine has no image decoder - it is plain ES
modules with no dependencies, running under Node today and in a browser later.
So the grid is packed here instead: one bit per world cell, base64, about 30 KB
for both layers. Small enough to ship to the browser with the page.
"""
import base64
import json
import os

import numpy as np
from PIL import Image

W, H = 640, 360
HERE = os.path.dirname(os.path.abspath(__file__))


def bits(name):
    m = np.asarray(Image.open(os.path.join(HERE, name)).convert('L').resize((W, H), Image.BOX)) > 127
    return base64.b64encode(np.packbits(m.reshape(-1)).tobytes()).decode('ascii'), int(m.sum())


walk, nwalk = bits('walkable.png')
back, nback = bits('backstage.png')
json.dump({
    'note': ('One bit per world cell, row-major, packed big-endian and base64. '
             'backstageCost is the movement multiplier for a cell that is walkable '
             'but effectively out of sight - agents may cross it and would rather not.'),
    'w': W, 'h': H,
    'backstageCost': 4,
    'walkable': walk,
    'backstage': back
}, open(os.path.join(HERE, 'navgrid.json'), 'w'), indent=0)
print(f'walkable {nwalk} cells, backstage {nback} cells -> navgrid.json')
