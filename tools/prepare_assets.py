"""Prepares runtime assets: aligned sprite strips + tinted trees.

Run from project root:  python tools/prepare_assets.py
"""
from pathlib import Path

from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets"
OUT = SRC / "game"
OUT_SPR = OUT / "sprites"
OUT_BG = OUT / "bg"

ANIMS = {
    # name: (gif, crop(left, top, right, bottom))
    "hero_run": ("char 1 run .gif", (45, 35, 255, 350)),
    "hero_jump": ("char 1 jump .gif", (35, 10, 260, 350)),
    "hero_slash": ("char 1 slash .gif", (0, 80, 660, 445)),
    "hero_idle": ("char 1 2 idle.gif", (66, 42, 258, 420)),
    "bat": ("bat animation.gif", (0, 0, 96, 96)),
    "slime": ("slime 1 animation 2.gif", (0, 0, 96, 96)),
}


def warm_white(strip):
    px = strip.load()
    for y in range(strip.height):
        for x in range(strip.width):
            r, g, b, a = px[x, y]
            if a > 0 and r > 225 and g > 225 and b > 225:
                px[x, y] = (255, 233, 190, int(a * 0.9))


def make_strip(name, gif_name, crop):
    im = Image.open(SRC / gif_name)
    frames = []
    for frame in ImageSequence.Iterator(im):
        frame = frame.convert("RGBA").crop(crop)
        frames.append(frame)
    fw, fh = frames[0].size
    strip = Image.new("RGBA", (fw * len(frames), fh), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        strip.paste(frame, (i * fw, 0))
    if name == "hero_slash":
        warm_white(strip)
    out = OUT_SPR / f"{name}.png"
    strip.save(out, optimize=True)
    print(f"{out.relative_to(ROOT)}  {len(frames)}f  {fw}x{fh}  total {strip.width}x{strip.height}")


def copy_bg():
    mapping = {
        "background 1 0 .png": "sky.png",
        "background 1 1 .png": "clouds_hi.png",
        "background 1 2 .png": "clouds_lo.png",
        "background 1 3 .png": "mountains.png",
        "background 1 4 .png": "treeline.png",
        "background 1 5 .png": "trees.png",
        "Sprite-0001 forrest.png": "platform.png",
        "tree 1.png": "tree.png",
        "water 1.png": "water.png",
    }
    for src, dst in mapping.items():
        im = Image.open(SRC / src).convert("RGBA")
        if dst in ("platform.png", "tree.png", "water.png"):
            im.save(OUT_SPR / dst, optimize=True)
        else:
            im.save(OUT_BG / dst, optimize=True)
        print(f"{dst}  {im.width}x{im.height}")


def tint_tree():
    im = Image.open(SRC / "tree 1.png").convert("RGBA")
    px = im.load()
    dark = Image.new("RGBA", im.size)
    sil = Image.new("RGBA", im.size)
    dp, sp = dark.load(), sil.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            dp[x, y] = (
                int(r * 0.30 + 12),
                int(g * 0.55 + 28),
                int(b * 0.45 + 24),
                int(a * 0.92),
            )
            sp[x, y] = (7, 22, 20, a)
    dark.save(OUT_SPR / "tree_dark.png", optimize=True)
    sil.save(OUT_SPR / "tree_silhouette.png", optimize=True)
    print("tree_dark.png, tree_silhouette.png")


def main():
    OUT_SPR.mkdir(parents=True, exist_ok=True)
    OUT_BG.mkdir(parents=True, exist_ok=True)
    for name, (gif, crop) in ANIMS.items():
        make_strip(name, gif, crop)
    copy_bg()
    tint_tree()


if __name__ == "__main__":
    main()
