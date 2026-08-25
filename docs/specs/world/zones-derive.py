#!/usr/bin/env python3
"""Author docs/specs/world/zones.json, the canonical semantic-area geometry.

Phase 3C needs one source that answers "which semantic area is this position in?"
(phase-3c-implementation-clarifications.md section 3). Zone membership drives
perception - who is in the same area as whom - and the LLM-visible destination
vocabulary. It is world data, not engine constants, so it lives here.

Three things this script does that hand-authoring a JSON file would not:

BACKSTAGE IS NOT DRAWN, IT IS TAKEN. The backstage region already exists as paint
in backstage.png and is already packed into navgrid.json. Drawing a polygon over
the same region by hand would give two sources that drift apart the first time
the paint changes. Backstage is read from the mask and always wins.

COVERAGE IS ASSERTED, NOT ASSUMED. Every walkable cell must land in exactly one
zone. An unassigned cell would be a position an agent can stand in and perception
cannot describe, which is the bug this file exists to prevent - so the script
fails rather than shipping a hole.

THE ANCHORS CHECK THE POLYGONS. Every seat and station in anchors.json has an
expected zone. If a polygon is drawn slightly wrong, a seat lands in the wrong
area and the script says which one, instead of the mistake surfacing later as a
character who cannot see the person opposite them.

    python3 docs/specs/world/zones-derive.py

Writes zones.json and a zones-check.png showing the result.
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
W, H = 640, 360

# Polygons in world units, listed in priority order. Overlap is permitted and
# resolved by this order - clarifications section 3.4 asks for explicit priority
# rather than accidental array order, so the order is the rule, and the script
# reports how much overlap it actually resolved.
#
# backstage is absent on purpose: it comes from the painted mask below and takes
# precedence over every polygon here.
ZONES = [
    {
        "id": "cafe-counter",
        "zh": "吧台",
        "en": "the cafe counter",
        "points": [[143, 156], [292, 143], [303, 199], [152, 214]],
    },
    {
        "id": "near-table",
        "zh": "近桌",
        "en": "the near table",
        "points": [[147, 199], [303, 193], [309, 268], [150, 279]],
    },
    {
        "id": "far-table",
        "zh": "遠桌",
        "en": "the far table",
        "points": [[286, 140], [381, 133], [386, 201], [292, 207]],
    },
    {
        "id": "street-edge",
        "zh": "街邊",
        "en": "the street edge",
        "points": [[0, 60], [160, 60], [160, 236], [150, 279], [309, 268],
                   [300, 360], [0, 360]],
    },
    {
        "id": "park-open",
        "zh": "公園空地",
        "en": "the open ground",
        "points": [[225, 60], [640, 60], [640, 360], [286, 360], [280, 240],
                   [281, 130]],
    },
]

# Adjacency is a design statement about who can plausibly notice whom across a
# boundary, not something to be computed from touching pixels: two areas can
# share an edge that nobody would look across.
NEIGHBORS = {
    "cafe-counter": ["near-table", "far-table", "backstage"],
    "near-table":   ["cafe-counter", "street-edge", "park-open", "far-table"],
    "far-table":    ["cafe-counter", "park-open", "near-table"],
    "park-open":    ["far-table", "near-table", "street-edge"],
    "street-edge":  ["near-table", "park-open"],
    "backstage":    ["cafe-counter"],
}

# Where each anchor group is expected to land. This is the check, not the source.
EXPECTED = {
    "counter-stool": "cafe-counter",
    "table-near": "near-table",
    "table-far": "far-table",
    "bench": "park-open",
    "work": "cafe-counter",
}


def inside(poly, x, y):
    """Even-odd point in polygon, sampling cell centres."""
    px, py = x + 0.5, y + 0.5
    hit = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > py) != (y2 > py):
            xx = x1 + (py - y1) * (x2 - x1) / (y2 - y1)
            if px < xx:
                hit = not hit
    return hit


def main():
    walk = Image.open(HERE / "walkable.png").convert("L").resize((W, H), Image.BOX).load()
    back = Image.open(HERE / "backstage.png").convert("L").load()

    zone_of = [[None] * W for _ in range(H)]
    counts = {z["id"]: 0 for z in ZONES}
    counts["backstage"] = 0
    walkable = 0
    overlap = 0
    unassigned = []

    for y in range(H):
        for x in range(W):
            if walk[x, y] <= 127:
                continue
            walkable += 1
            if back[x, y] > 127:
                zone_of[y][x] = "backstage"
                counts["backstage"] += 1
                continue
            hits = [z["id"] for z in ZONES if inside(z["points"], x, y)]
            if not hits:
                unassigned.append((x, y))
                continue
            if len(hits) > 1:
                overlap += 1
            zone_of[y][x] = hits[0]
            counts[hits[0]] += 1

    # --- the anchors check the polygons ---
    anchors = json.loads((HERE / "anchors.json").read_text())
    problems = []
    placed = []
    for s in anchors.get("seats", []):
        c = (s.get("seatSurface") or {}).get("centre")
        if not c:
            continue
        placed.append((s["id"], s.get("group"), c))
    for s in anchors.get("stations", []):
        placed.append((s["id"], s.get("type"), s.get("anchor")))

    for aid, group, c in placed:
        x, y = int(c[0]), int(c[1])
        got = zone_of[y][x] if 0 <= x < W and 0 <= y < H else None
        if got is None:                       # a seat surface can sit on furniture
            got = next((z["id"] for z in ZONES if inside(z["points"], x, y)), None)
        want = EXPECTED.get(group)
        mark = "" if got == want else f"   <<< expected {want}"
        print(f"  {aid:<16} {str(c):<18} -> {got}{mark}")
        if got != want:
            problems.append(f"{aid} landed in {got}, expected {want}")

    print()
    print(f"  walkable cells      {walkable}")
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {k:<14} {v:>6}  {100*v/walkable:5.1f}%")
    print(f"  resolved by priority {overlap}")
    print(f"  unassigned           {len(unassigned)}")

    if unassigned:
        xs = [p[0] for p in unassigned]
        ys = [p[1] for p in unassigned]
        print(f"    bbox x {min(xs)}..{max(xs)}  y {min(ys)}..{max(ys)}")
        problems.append(f"{len(unassigned)} walkable cells belong to no zone")

    # --- picture of the result ---
    colour = {
        "cafe-counter": (255, 170, 40), "near-table": (80, 150, 255),
        "far-table": (255, 90, 90), "park-open": (90, 220, 120),
        "street-edge": (200, 130, 255), "backstage": (60, 60, 200),
    }
    scene = Image.open(HERE.parent.parent / "assets" / "showa" / "scene-clean-2560.webp")
    img = scene.convert("RGB").resize((W, H), Image.LANCZOS)
    px = img.load()
    for y in range(H):
        for x in range(W):
            z = zone_of[y][x]
            if z:
                r, g, b = px[x, y]
                cr, cg, cb = colour[z]
                px[x, y] = ((r + cr * 2) // 3, (g + cg * 2) // 3, (b + cb * 2) // 3)
            elif walk[x, y] > 127:
                px[x, y] = (255, 0, 0)        # unassigned walkable: loud on purpose
    S = 3
    big = img.resize((W * S, H * S), Image.NEAREST)
    d = ImageDraw.Draw(big)
    for aid, group, c in placed:
        d.ellipse([c[0]*S-4, c[1]*S-4, c[0]*S+4, c[1]*S+4], fill=(255, 255, 255), outline=(0, 0, 0))
    big.save(HERE / "zones-check.png")

    out = {
        "coordinateSystem": {"width": W, "height": H, "note": "same world units as world.json"},
        "containment": {
            "test": "even-odd point in polygon, sampled at cell centres (x+0.5, y+0.5)",
            "priority": "backstage from backstage.png wins; then the first polygon "
                        "in `zones` order that contains the point",
            "tieBreak": "a point exactly on an edge resolves by the even-odd test above, "
                        "which is deterministic; no separate rule is needed",
            "walkability": "containment is purely geometric. A seat surface sits on "
                           "furniture and is not a walkable cell, so a seated agent "
                           "still has a zone. Coverage is asserted over walkable cells "
                           "because those are the positions an agent can stand in; it "
                           "is not a precondition of lookup.",
        },
        "zones": [
            {
                "id": z["id"], "shape": "polygon", "points": z["points"],
                "label": {"zh": z["zh"], "en": z["en"]},
                "neighbors": NEIGHBORS[z["id"]], "cells": counts[z["id"]],
            } for z in ZONES
        ] + [{
            "id": "backstage", "shape": "mask", "source": "backstage.png",
            "label": {"zh": "後臺", "en": "out of sight"},
            "neighbors": NEIGHBORS["backstage"], "cells": counts["backstage"],
            "note": "not a polygon on purpose - the region is painted, and drawing it "
                    "twice is how two sources of truth drift apart",
        }],
    }
    (HERE / "zones.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")

    print()
    if problems:
        print("FAILED\n  " + "\n  ".join(problems))
        raise SystemExit(1)
    print("OK  every walkable cell has exactly one zone; every anchor is where it should be")
    print("    wrote zones.json and zones-check.png")


if __name__ == "__main__":
    main()
