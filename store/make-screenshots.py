#!/usr/bin/env python3
"""Turn phone screenshots into the two sets App Store Connect insists on.

    python3 store/make-screenshots.py ~/Desktop/spoondrop-shots

Apple rejects anything that is not exactly one of its sizes, and there is no
simulator on this machine to capture them at the right one. So: shoot on the
phone, AirDrop the files into a folder, and let this match them.

  iPhone, Dynamic Island, medium (6.3")   1206 x 2622
  iPad 13"                                2064 x 2752

The phone size is a crop, because a modern iPhone screenshot is within a
percent of that shape. The iPad size is not — it is a different aspect
entirely, so stretching would distort the UI and cropping would cut it off.
It gets the screenshot placed on a SpoonDrop-cream ground instead, which is
what a designed store screenshot looks like anyway.

Files come out numbered in the order they sort, which is the order App Store
Connect will show them in. Name the inputs 1-discover.png, 2-recipe.png and so
on and the store page tells the story you meant.
"""
import os, sys, glob
from PIL import Image, ImageDraw, ImageFilter

IPHONE = (1206, 2622)
IPAD = (2064, 2752)
CREAM = (255, 249, 242)   # COLORS.cream
INK = (20, 20, 20)        # COLORS.ink

VALID = (".png", ".jpg", ".jpeg", ".heic")


def cover(img, size):
    """Scale to fill, then crop the overflow off the middle."""
    tw, th = size
    scale = max(tw / img.width, th / img.height)
    w, h = round(img.width * scale), round(img.height * scale)
    img = img.resize((w, h), Image.LANCZOS)
    left, top = (w - tw) // 2, (h - th) // 2
    return img.crop((left, top, left + tw, top + th))


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def on_canvas(img, size):
    """Place the shot on a cream ground, with a shadow so it is not floating."""
    tw, th = size
    canvas = Image.new("RGB", size, CREAM)

    target_h = int(th * 0.84)
    scale = target_h / img.height
    shot = img.resize((round(img.width * scale), target_h), Image.LANCZOS)
    if shot.width > tw * 0.8:                       # a wide source, e.g. an iPad shot
        shot = cover(img, (int(tw * 0.8), target_h))
    shot = rounded(shot, 56)

    x, y = (tw - shot.width) // 2, (th - shot.height) // 2

    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", shot.size, INK + (70,)), (x, y + 26), shot)
    canvas.paste(Image.alpha_composite(
        Image.new("RGBA", size, CREAM + (255,)),
        shadow.filter(ImageFilter.GaussianBlur(40))).convert("RGB"), (0, 0))

    canvas.paste(shot, (x, y), shot)
    return canvas


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = os.path.expanduser(sys.argv[1])
    here = os.path.dirname(os.path.abspath(__file__))
    out_phone = os.path.join(here, "screenshots", "iphone-6.3")
    out_pad = os.path.join(here, "screenshots", "ipad-13")
    os.makedirs(out_phone, exist_ok=True)
    os.makedirs(out_pad, exist_ok=True)

    files = sorted(f for f in glob.glob(os.path.join(src, "*"))
                   if f.lower().endswith(VALID))
    if not files:
        sys.exit(f"No images in {src}")

    for i, f in enumerate(files, 1):
        try:
            img = Image.open(f).convert("RGB")
        except Exception as e:
            print(f"  skipped {os.path.basename(f)}: {e}")
            continue
        name = f"{i:02d}.png"
        # No alpha channel in either file: App Store Connect refuses them.
        cover(img, IPHONE).save(os.path.join(out_phone, name))
        on_canvas(img, IPAD).save(os.path.join(out_pad, name))
        print(f"  {os.path.basename(f)}  ->  {name}  ({img.width}x{img.height})")

    n = len(files)
    print(f"\n{n} screenshot(s) in each size:")
    print(f"  {out_phone}")
    print(f"  {out_pad}")
    if n < 3:
        print(f"\nApple wants at least 3 per size. You have {n}.")


if __name__ == "__main__":
    main()
