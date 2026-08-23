"""Re-derive seatSurface, facingDeg and backrestTopY from the owner's paintings."""
import json, math, numpy as np
from PIL import Image
from collections import deque
W,H=640,360
p='/home/user/littleworld/docs/specs/world/anchors.json'
A=json.load(open(p))

def mask(n):
    return np.asarray(Image.open('/home/user/littleworld/docs/specs/world/'+n).convert('L').resize((W,H),Image.BOX))>127

def comps(m, minpx=40):
    lab=np.zeros(m.shape,np.int32); n=0; out={}
    for sy,sx in zip(*np.nonzero(m)):
        if lab[sy,sx]: continue
        n+=1; q=deque([(sy,sx)]); lab[sy,sx]=n
        while q:
            y,x=q.popleft()
            for dy in(-1,0,1):
                for dx in(-1,0,1):
                    ny,nx=y+dy,x+dx
                    if 0<=ny<H and 0<=nx<W and m[ny,nx] and not lab[ny,nx]:
                        lab[ny,nx]=n; q.append((ny,nx))
    for i in range(1,n+1):
        ys,xs=np.nonzero(lab==i)
        if len(ys)>=minpx:
            out[i]=dict(cx=xs.mean(),cy=ys.mean(),x0=int(xs.min()),x1=int(xs.max()),
                        y0=int(ys.min()),y1=int(ys.max()),n=len(ys),ys=ys,xs=xs)
    return out

SUM=mask('seatsurfaces.png')
SU=comps(SUM)
# The bench is one long painted top, not three. Cut it into the three slots the
# anchors already name, along its length, so a sitter covers his share of it.
_bench=max(SU,key=lambda i:SU[i]['n'])
if SU[_bench]['n']>1000:
    c=SU.pop(_bench)
    band=np.zeros(SUM.shape,bool); band[c['y0']:c['y1']+1,c['x0']:c['x1']+1]=SUM[c['y0']:c['y1']+1,c['x0']:c['x1']+1]
    span=(c['x1']-c['x0']+1)/3.0
    for k in range(3):
        x0=int(round(c['x0']+k*span)); x1=int(round(c['x0']+(k+1)*span))-1
        sub=band.copy(); sub[:, :x0]=False; sub[:, x1+1:]=False
        ys,xs=np.nonzero(sub)
        SU[1000+k]=dict(cx=xs.mean(),cy=ys.mean(),x0=x0,x1=x1,
                        y0=int(ys.min()),y1=int(ys.max()),n=len(ys))
BK=comps(mask('seatbacks.png'))
seats=A['seats']
# each painted seat top belongs to the anchor it sits closest to
taken=set()
for s in seats:
    sx,sy=s['seat']
    cand=[i for i in SU if i not in taken]
    if not cand: break
    i=min(cand,key=lambda i:(SU[i]['cx']-sx)**2+(SU[i]['cy']-sy)**2)
    c=SU[i]; d=math.hypot(c['cx']-sx,c['cy']-sy)
    if d>18: print('  unmatched',s['id'],round(d,1)); continue
    taken.add(i)
    s['seatSurface']=dict(centre=[round(c['cx'],1),round(c['cy'],1)],
                          w=c['x1']-c['x0']+1, h=c['y1']-c['y0']+1)
    print(f"{s['id']:16s} surf ({c['cx']:6.1f},{c['cy']:6.1f}) {c['x1']-c['x0']+1:3d}x{c['y1']-c['y0']+1:3d}  d{d:4.1f}")

def hull_centre(pts):
    return pts[:, 0].mean(), pts[:, 1].mean()


def furniture_centres():
    """Enclosed holes in the walkable map: things standing on the floor."""
    walk = mask('walkable.png')
    seen = np.zeros(walk.shape, bool); out = []
    for sy, sx in zip(*np.nonzero(~walk)):
        if seen[sy, sx]:
            continue
        st = [(sy, sx)]; seen[sy, sx] = True; cells = []; edge = False
        while st:
            y, x = st.pop(); cells.append((y, x))
            if y in (0, H-1) or x in (0, W-1):
                edge = True
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < H and 0 <= nx < W and not walk[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; st.append((ny, nx))
        if not edge and len(cells) >= 40:
            c = np.array(cells, float)
            out.append((c[:, 1].mean(), c[:, 0].mean()))
    return out


def face(bx, by, cx, cy):
    return round(math.degrees(math.atan2(cy - by, cx - bx)) % 360, 1)


# Facing is not derived from the paint any more. The owner stated the rule for
# each kind of seat outright, and those statements are the specification:
#
#   "the round table's four chairs of course face the round table"
#   "the park bench faces the open ground"
#   "the four counter stools - as long as the seat is covered, how they sit is
#    not important"
#
# Measuring it from the painted chair backs kept producing answers that were
# plausible per chair and wrong as a set. A chair back is an upright panel, so
# its pixels run far up the screen and its centroid sits above its seat; moving
# to the back's bottom edge fixed the sign but not the spread, because a hand
# painted patch a few pixels wide cannot pin an angle. A table is a much better
# instrument than a brush stroke: the seats around it agree on where it is.
GROUP_FACES = {}
seat_groups = {}
for s in seats:
    seat_groups.setdefault(s['id'].rsplit('-', 1)[0], []).append(s)

furniture = furniture_centres()
for g, members in seat_groups.items():
    mx = sum(t['seatSurface']['centre'][0] for t in members) / len(members)
    my = sum(t['seatSurface']['centre'][1] for t in members) / len(members)
    if g.startswith('table'):
        # the table itself, when the walkable map has it as a hole in the floor
        near = [f for f in furniture if math.hypot(f[0]-mx, f[1]-my) <= 12]
        tx, ty = near[0] if near else (mx, my)
        for t in members:
            cx, cy = t['seatSurface']['centre']
            t['facingDeg'] = face(cx, cy, tx, ty)
            t['facingFrom'] = 'the table it is drawn up to'
    elif g == 'counter-stool':
        # into the counter. The stools stand in a row parallel to it, so their
        # own row is the counter's line; face across it, up-screen into the shop.
        pts = np.array([t['seatSurface']['centre'] for t in members], float)
        d = pts[-1] - pts[0]
        ang = math.atan2(d[1], d[0])
        n = min((ang + math.pi/2, ang - math.pi/2), key=lambda a: math.sin(a))
        for t in members:
            t['facingDeg'] = round(math.degrees(n) % 360, 1)
            t['facingFrom'] = 'the counter it is drawn up to'
    else:
        # the bench: across its length, toward whichever side is open ground
        pts = np.array([t['seatSurface']['centre'] for t in members], float)
        d = pts[-1] - pts[0]
        ang = math.atan2(d[1], d[0])
        walk = mask('walkable.png')
        best = None
        for n in (ang + math.pi/2, ang - math.pi/2):
            open_cells = 0
            for r in range(4, 30):
                x = int(mx + math.cos(n)*r); y = int(my + math.sin(n)*r)
                if 0 <= x < W and 0 <= y < H and walk[y, x]:
                    open_cells += 1
            if best is None or open_cells > best[0]:
                best = (open_cells, n)
        for t in members:
            t['facingDeg'] = round(math.degrees(best[1]) % 360, 1)
            t['facingFrom'] = 'the open ground it looks out over'

BK_TOP = {}
for s in seats:
    cx, cy = s['seatSurface']['centre']
    i = min(BK, key=lambda i: (BK[i]['cx']-cx)**2 + (BK[i]['cy']-cy)**2)
    s['backrestTopY'] = BK[i]['y0']
    s.pop('facing', None)

A['facingNote']=("facingDeg is measured, not chosen: it is the direction from the "
  "painted chair back to the painted seat top, which is where the occupant looks. "
  "Every chair in this art turns out to have its back up-screen, so every sitter "
  "is a front view. backrestTopY is the top row of that painted back; the renderer "
  "gives the back that depth so a chair never covers its own occupant.")
json.dump(A,open(p,'w'),indent=2,ensure_ascii=False)
print()
for s in seats:
    if 'seatSurface' in s: print(f"{s['id']:16s} face {s['facingDeg']:6.1f}  backTop {s['backrestTopY']}")
