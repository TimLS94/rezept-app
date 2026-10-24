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

Writes every landscape size App Store Connect accepts. 5244 x 2950 is the one
shape both the header and the search-results tab take, so that file alone
fills both.
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

# Every landscape slot App Store Connect offers, and which tab takes it.
#   search results : 5244x2950, 3840x2560, 1920x1280
#   header         : 5244x2950, 3840x1646
# 5244x2950 is the one shape both accept, so it is rendered first.
SIZES = [
    (5244, 2950, "header-and-search-5244x2950"),
    (3840, 2560, "search-3840x2560"),
    (3840, 1646, "header-3840x1646"),
    (1920, 1280, "search-1920x1280"),
]


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width - 1, img.height - 1],
                                           radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def phone(path, height, canvas_h):
    img = Image.open(path).convert("RGB")
    w = round(img.width * height / img.height)
    return rounded(img.resize((w, height), Image.LANCZOS), int(canvas_h * 0.021))


def compose(W, H):
    """One composition, measured in fractions of the canvas.

    The accepted shapes run from 1.5:1 to 2.33:1, so nothing here may be a
    fixed pixel count — a layout tuned to 3:2 puts the wordmark off the edge
    of the header strip.
    """
    canvas = Image.new("RGB", (W, H), INK)

    # A warm wash behind the phones, so the right side is not a flat void.
    glow = Image.new("RGB", (W, H), INK)
    ImageDraw.Draw(glow).ellipse(
        [W * 0.52, -H * 0.3, W * 1.25, H * 1.3], fill=(44, 30, 20))
    canvas = Image.blend(canvas, glow.filter(
        ImageFilter.GaussianBlur(int(H * 0.09))), 0.85)
    d = ImageDraw.Draw(canvas)

    # ── Right first: the phones set the height everything else answers to ──
    shots = [os.path.join(SHOTS, n) for n in ("05.png", "01.png")]
    if not all(os.path.exists(p) for p in shots):
        raise SystemExit("Run make-screenshots.py first — screenshots/iphone-6.3 is empty.")

    front = phone(shots[1], int(H * 0.86), H)
    back = phone(shots[0], int(H * 0.78), H)

    fx, fy = int(W - front.width - W * 0.045), int((H - front.height) / 2 + H * 0.03)
    bx, by = int(fx - back.width * 0.62), int((H - back.height) / 2 - H * 0.02)

    for img, (px, py), opacity in ((back, (bx, by), 90), (front, (fx, fy), 150)):
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        shadow.paste(Image.new("RGBA", img.size, (0, 0, 0, opacity)),
                     (px, py + int(H * 0.018)), img)
        canvas = Image.alpha_composite(
            canvas.convert("RGBA"),
            shadow.filter(ImageFilter.GaussianBlur(int(H * 0.023)))).convert("RGB")

    canvas.paste(back, (bx, by), back)
    canvas.paste(front, (fx, fy), front)
    d = ImageDraw.Draw(canvas)

    # ── Left: the brand speaking, sized to the room the phones left ────────
    x = int(W * 0.057)
    room = bx - x - int(W * 0.03)

    mark_size = int(H * 0.10)
    mark = ImageFont.truetype(ANTON, mark_size)
    while d.textlength("SPOONDROP", font=mark) > room and mark_size > 20:
        mark_size -= 4
        mark = ImageFont.truetype(ANTON, mark_size)

    head = ImageFont.truetype(POPPINS_B, int(mark_size * 0.47))
    body = ImageFont.truetype(POPPINS, int(mark_size * 0.27))

    heads = ("Cook what you", "already have.")
    bodies = ("Import any recipe from a photo or a link.",
              "Plan the week. The shopping list writes itself.")

    # Centre the block in the space the phones left rather than pinning it to
    # the edge. On the 2.33:1 header strip that space is enormous, and text
    # held hard left there reads as a mistake with a hole next to it.
    widest = max([d.textlength("SPOONDROP", font=mark)]
                 + [d.textlength(t, font=head) for t in heads]
                 + [d.textlength(t, font=body) for t in bodies])
    x = max(x, int((bx - widest) / 2))

    gap_h, gap_b = mark_size * 0.61, mark_size * 0.41
    block = mark_size * 1.2 + len(heads) * gap_h + mark_size * 0.2 + len(bodies) * gap_b
    y = (H - block) / 2

    d.text((x, y), "SPOON", font=mark, fill=BONE)
    d.text((x + d.textlength("SPOON", font=mark), y), "DROP", font=mark, fill=ORANGE)
    y += mark_size * 1.2

    for line in heads:
        d.text((x, y), line, font=head, fill=BONE)
        y += gap_h
    y += mark_size * 0.2
    for line in bodies:
        d.text((x, y), line, font=body, fill=MUTED)
        y += gap_b

    return canvas


def main():
    for w, h, name in SIZES:
        out = os.path.join(OUT, f"{name}.png")
        compose(w, h).save(out)
        print(f"  {w} x {h}  ->  {out}")


if __name__ == "__main__":
    main()
