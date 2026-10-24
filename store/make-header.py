#!/usr/bin/env python3
"""The search-results image: a landscape banner for the App Store.

    python3 store/make-header.py

Optional — without it the store shows the icon and the screenshots, which is
fine. It exists because the slot is a wide shape nothing else in the project
produces, and because it is the one place the brand gets to speak in its own
voice rather than through a phone bezel.

Dark ground, deliberately. Every other card in a search results row is white
or cream, and the logo's own background is #141414 — so the one that is nearly
black is the one the eye lands on, and food photography carries better on it.

Renders at 3840 x 2560 (3:2, the larger of the two accepted 3:2 sizes) and
also writes a 1920 x 1280 copy.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(HERE)
SHOTS = os.path.join(HERE, "screenshots", "iphone-6.3")
OUT = os.path.join(HERE, "screenshots")

INK = (20, 20, 20)
INK_SOFT = (31, 31, 31)
ORANGE = (242, 112, 30)
BONE = (245, 240, 230)
MUTED = (150, 145, 138)

ANTON = f"{APP}/node_modules/@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf"
POPPINS = f"{APP}/node_modules/@expo-google-fonts/poppins/500Medium/Poppins_500Medium.ttf"
POPPINS_B = f"{APP}/node_modules/@expo-google-fonts/poppins/700Bold/Poppins_700Bold.ttf"

S = 2                      # 1x is 1920 x 1280
W, H = 1920 * S, 1280 * S


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def phone(path, height):
    img = Image.open(path).convert("RGB")
    w = round(img.width * height / img.height)
    return rounded(img.resize((w, height), Image.LANCZOS), 26 * S)


def main():
    canvas = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(canvas)

    # A warm wash behind the phones, so the right side is not a flat void.
    glow = Image.new("RGB", (W, H), INK)
    ImageDraw.Draw(glow).ellipse(
        [W * 0.52, -H * 0.3, W * 1.25, H * 1.3], fill=(44, 30, 20))
    canvas = Image.blend(canvas, glow.filter(ImageFilter.GaussianBlur(120 * S)), 0.85)
    d = ImageDraw.Draw(canvas)

    # ── Left: the brand speaking ───────────────────────────────────────────
    x = 110 * S
    mark = ImageFont.truetype(ANTON, 128 * S)
    head = ImageFont.truetype(POPPINS_B, 60 * S)
    body = ImageFont.truetype(POPPINS, 34 * S)

    y = 300 * S
    d.text((x, y), "SPOON", font=mark, fill=BONE)
    spoon_w = d.textlength("SPOON", font=mark)
    d.text((x + spoon_w, y), "DROP", font=mark, fill=ORANGE)

    y += 190 * S
    for line in ("Cook what you", "already have."):
        d.text((x, y), line, font=head, fill=BONE)
        y += 78 * S

    y += 26 * S
    for line in ("Import any recipe from a photo or a link.",
                 "Plan the week. The shopping list writes itself."):
        d.text((x, y), line, font=body, fill=MUTED)
        y += 52 * S

    # ── Right: two screens, overlapping, the near one in front ─────────────
    shots = [os.path.join(SHOTS, n) for n in ("05.png", "01.png")]
    if not all(os.path.exists(p) for p in shots):
        raise SystemExit("Run make-screenshots.py first — screenshots/iphone-6.3 is empty.")

    back = phone(shots[0], 980 * S)
    front = phone(shots[1], 1080 * S)

    bx, by = int(W - back.width - 430 * S), int((H - back.height) / 2 - 30 * S)
    fx, fy = int(W - front.width - 90 * S), int((H - front.height) / 2 + 40 * S)

    for img, (px, py), opacity in ((back, (bx, by), 90), (front, (fx, fy), 150)):
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        shadow.paste(Image.new("RGBA", img.size, (0, 0, 0, opacity)),
                     (px, py + 24 * S), img)
        canvas = Image.alpha_composite(
            canvas.convert("RGBA"), shadow.filter(ImageFilter.GaussianBlur(30 * S))
        ).convert("RGB")

    canvas.paste(back, (bx, by), back)
    canvas.paste(front, (fx, fy), front)

    big = os.path.join(OUT, "search-3840x2560.png")
    small = os.path.join(OUT, "search-1920x1280.png")
    canvas.save(big)
    canvas.resize((1920, 1280), Image.LANCZOS).save(small)
    print(f"  {big}\n  {small}")


if __name__ == "__main__":
    main()
