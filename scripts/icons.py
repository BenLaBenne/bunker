#!/usr/bin/env python3
# scripts/icons.py — Génère les icônes PWA de BUNKER (pixel-art radium).
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

BG = (11, 15, 12)
GREEN = (127, 255, 106)
AMBER = (255, 179, 71)
DARK = (26, 36, 28)
MID = (58, 74, 60)


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    s = size
    # fond radial simple : deux disques concentriques
    d.ellipse([s*0.05, s*0.05, s*0.95, s*0.95], fill=DARK)
    d.ellipse([s*0.16, s*0.16, s*0.84, s*0.84], fill=(20, 28, 22))

    # bunker : porte en béton
    d.rounded_rectangle([s*0.34, s*0.42, s*0.66, s*0.74], radius=s*0.04, fill=MID)
    d.rectangle([s*0.44, s*0.5, s*0.56, s*0.74], fill=(14, 19, 15))
    d.rectangle([s*0.48, s*0.56, s*0.52, s*0.74], fill=(127, 255, 106, 255))

    # trèfle nucléaire (3 lobes + centre)
    cx, cy = s*0.5, s*0.36
    r_out = s*0.16
    r_in = s*0.05
    for ang in (90, 210, 330):
        import math
        a = math.radians(ang)
        lx = cx + math.cos(a) * s*0.1
        ly = cy - math.sin(a) * s*0.1
        # lobe = secteurs simplifiés par disques
        d.ellipse([lx - r_out*0.55, ly - r_out*0.55, lx + r_out*0.55, ly + r_out*0.55], fill=AMBER)
    d.ellipse([cx - s*0.045, cy - s*0.045, cx + s*0.045, cy + s*0.045], fill=AMBER)

    if maskable:
        # zone de sécurité : rien d'important dans les 20% extérieurs
        pass
    return img


for name, size, maskable in [
    ("icon-64.png", 64, False),
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("maskable-512.png", 512, True),
]:
    img = draw_icon(size, maskable)
    img.save(os.path.join(OUT, name))
    print("✓", name)
print("Icônes générées dans", OUT)
