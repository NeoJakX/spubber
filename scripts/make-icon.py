#!/usr/bin/env python3
"""Render Spubber's app icons from code.

Outputs (design/):
  icon.png            1024 rounded square (desktop, Tauri `tauri icon` input)
  icon-square.png     1024 full-bleed square (iOS masks the corners itself)
  icon-foreground.png 1024 transparent glyph inside the adaptive-icon safe zone (Android)
Then writes the Android launcher mipmaps and the iOS AppIcon if those projects exist.

Needs a TTF of Literata: scripts convert the bundled woff2 with fontTools.
"""
import os

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "design")
os.makedirs(OUT, exist_ok=True)

TTF = os.path.join(OUT, ".literata.ttf")
if not os.path.exists(TTF):
    f = TTFont(os.path.join(ROOT, "src/assets/fonts/literata-latin-wght-normal.woff2"))
    f.flavor = None
    f.save(TTF)

BG = (20, 22, 27, 255)
CORAL = (255, 107, 93, 255)
GUIDE = (62, 66, 75, 255)
S = 1024
SS = 4


def draw_glyph(d, W, scale=1.0, guides=True):
    """Draw the focus letter, axis notches and guides centred in a W x W canvas."""
    c = W / 2

    def sy(v):  # scale around the centre
        return c + (v * W - c) * scale

    font = ImageFont.truetype(TTF, int(W * 0.56 * scale))
    try:
        font.set_variation_by_axes([680])
    except Exception:
        pass
    bbox = d.textbbox((0, 0), "u", font=font, anchor="ls")
    x = c - (bbox[2] - bbox[0]) / 2 - bbox[0]
    d.text((x, sy(0.64)), "u", font=font, fill=CORAL, anchor="ls")

    nw, nh = W * 0.022 * scale, W * 0.12 * scale
    top_y, bot_y = sy(0.17), sy(0.71)
    if guides:
        gw = W * 0.006 * scale
        for y in (top_y, bot_y + nh):
            d.rectangle([c - W * 0.3 * scale, y - gw / 2, c + W * 0.3 * scale, y + gw / 2], fill=GUIDE)
    for y in (top_y, bot_y):
        d.rounded_rectangle([c - nw / 2, y, c + nw / 2, y + nh], radius=nw / 2, fill=CORAL)


def render(kind):
    W = S * SS
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if kind == "rounded":
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(W * 0.225), fill=BG)
        draw_glyph(d, W)
    elif kind == "square":
        d.rectangle([0, 0, W, W], fill=BG)
        draw_glyph(d, W)
    elif kind == "foreground":
        # Adaptive icons crop to a circle/squircle: keep everything inside the
        # central 66% safe zone and drop the wide guides.
        draw_glyph(d, W, scale=0.62, guides=False)
    return img.resize((S, S), Image.LANCZOS)


icons = {k: render(k) for k in ("rounded", "square", "foreground")}
icons["rounded"].save(os.path.join(OUT, "icon.png"))
icons["square"].convert("RGB").save(os.path.join(OUT, "icon-square.png"))
icons["foreground"].save(os.path.join(OUT, "icon-foreground.png"))

# ---- Android launcher icons ----
res = os.path.join(ROOT, "android/app/src/main/res")
if os.path.isdir(res):
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for name, f in dens.items():
        folder = os.path.join(res, f"mipmap-{name}")
        os.makedirs(folder, exist_ok=True)
        legacy = int(48 * f)
        icons["rounded"].resize((legacy, legacy), Image.LANCZOS).save(os.path.join(folder, "ic_launcher.png"))
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, S - 1, S - 1], fill=255)
        rnd = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        rnd.paste(icons["square"], (0, 0), mask)
        rnd.resize((legacy, legacy), Image.LANCZOS).save(os.path.join(folder, "ic_launcher_round.png"))
        fg = int(108 * f)
        icons["foreground"].resize((fg, fg), Image.LANCZOS).save(os.path.join(folder, "ic_launcher_foreground.png"))
    with open(os.path.join(res, "values/ic_launcher_background.xml"), "w") as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#14161B</color>\n</resources>\n')
    # The template ships a vector foreground that would shadow our PNGs.
    vec = os.path.join(res, "drawable-v24/ic_launcher_foreground.xml")
    if os.path.exists(vec):
        os.remove(vec)
    print("android icons ok")

# ---- iOS app icon (single 1024 universal icon) ----
ios = os.path.join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset")
if os.path.isdir(ios):
    for fn in os.listdir(ios):
        if fn.endswith(".png"):
            icons["square"].convert("RGB").save(os.path.join(ios, fn))
    print("ios icon ok")

print("design icons ok")

# ---- Splash screens: dark ground with the focus glyph ----
def splash(w, h):
    big = Image.new("RGB", (w, h), BG[:3])
    side = int(min(w, h) * 0.42)
    g = icons["foreground"].resize((side, side), Image.LANCZOS)
    big.paste(g, ((w - side) // 2, (h - side) // 2), g)
    return big


for base in (os.path.join(ROOT, "android/app/src/main/res"), os.path.join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset")):
    if not os.path.isdir(base):
        continue
    for dirpath, _, files in os.walk(base):
        for fn in files:
            if fn.startswith("splash") and fn.endswith(".png"):
                p = os.path.join(dirpath, fn)
                with Image.open(p) as im:
                    size = im.size
                splash(*size).save(p)
print("splash ok")
