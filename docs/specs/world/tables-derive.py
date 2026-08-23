"""Extract the owner's painted tabletops into tables.png.

    python3 docs/specs/world/tables-derive.py <painting.png>

The owner paints the two cafe tables magenta straight onto the scene. Two things
matter in reading it back. The threshold has to be a hue test rather than a
brightness one - the paint over the tables' dark wood comes back as low as
(107, 32, 83), and asking for r > 150 drops it and leaves the mask full of
speckle holes, which show up in the render as the sitter behind the table
ghosting through it. And interior holes get filled: a tabletop is solid, so
anything the paint missed inside its own outline belongs to it.
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else 'painting.png'
out = '/home/user/littleworld/docs/specs/world/tables.png'

a = np.asarray(Image.open(src).convert('RGB').resize((2560, 1440), Image.LANCZOS)).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
m = (r > g + 35) & (b > g + 35) & (r > 70) & (b > 70)
print(f'magenta {m.sum()} px')

# fill interior holes: flood the background in from the border, keep the rest
H, W = m.shape
outside = np.zeros((H, W), bool)
q = deque()
for x in range(W):
    for y in (0, H-1):
        if not m[y, x] and not outside[y, x]:
            outside[y, x] = True; q.append((y, x))
for y in range(H):
    for x in (0, W-1):
        if not m[y, x] and not outside[y, x]:
            outside[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny, nx = y+dy, x+dx
        if 0 <= ny < H and 0 <= nx < W and not m[ny, nx] and not outside[ny, nx]:
            outside[ny, nx] = True; q.append((ny, nx))
filled = m | ~outside
print(f'filled  {filled.sum()} px  (+{filled.sum()-m.sum()})')
Image.fromarray((filled * 255).astype(np.uint8)).save(out)
print('wrote', out)
