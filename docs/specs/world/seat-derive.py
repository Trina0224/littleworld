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

BKM=mask('seatbacks.png')

def back_foot(b, x0, x1):
    """Centre of a chair back's BOTTOM edge, over the columns a seat occupies.

    Not its centroid. A back is a panel standing upright, so its pixels run far
    up the screen from wherever it stands and its centroid always lands above
    its seat - which made every chair in the scene look like it faced the
    camera. The bottom edge is where the back meets the seat, and that is the
    side the occupant's spine is on.

    The columns matter too. The bench has one painted back across all three
    slots, so its whole bottom edge points along the bench rather than across
    it; restricting to a slot's own columns asks the right question.
    """
    ys, xs = b['ys'], b['xs']
    sel = (xs >= x0) & (xs <= x1)
    if sel.sum() < 20:
        sel = np.ones(len(xs), bool)
    pts = [(x, ys[sel][xs[sel] == x].max()) for x in np.unique(xs[sel])]
    p = np.array(pts, float)
    return p[:, 0].mean(), p[:, 1].mean()


def face(bx,by,cx,cy): return round(math.degrees(math.atan2(cy-by,cx-bx))%360,1)
for s in seats:
    if 'seatSurface' not in s: continue
    cx,cy=s['seatSurface']['centre']; w=s['seatSurface']['w']
    i=min(BK,key=lambda i:(BK[i]['cx']-cx)**2+(BK[i]['cy']-cy)**2)
    b=BK[i]
    bx,by=back_foot(b, cx-w/2, cx+w/2)
    s['facingDeg']=face(bx,by,cx,cy)
    s['backrestTopY']=b['y0']
    s.pop('facing',None)
A['facingNote']=("facingDeg is measured, not chosen: it is the direction from the "
  "painted chair back to the painted seat top, which is where the occupant looks. "
  "Every chair in this art turns out to have its back up-screen, so every sitter "
  "is a front view. backrestTopY is the top row of that painted back; the renderer "
  "gives the back that depth so a chair never covers its own occupant.")
json.dump(A,open(p,'w'),indent=2,ensure_ascii=False)
print()
for s in seats:
    if 'seatSurface' in s: print(f"{s['id']:16s} face {s['facingDeg']:6.1f}  backTop {s['backrestTopY']}")
