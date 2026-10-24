"""Draw placeholder art for every character into app/pets/characters/<id>/.

Each character gets: normal/warning/critical.png (body + face), front.png (arms + blank
sign, drawn above the ledge), sleep.gif (dozing body with Zzz) and sleep_front.png (arms only).
Canvas is 360x440; the ledge crosses at y=300. Real art replaces these files one by one.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H, SS = 360, 440, 3          # canvas and supersampling factor
INK = (58, 53, 80, 255)
SKIN = (255, 230, 214, 255)
BLUSH = (255, 179, 189, 200)
SIGN = (255, 248, 236, 255)
TEAR = (143, 208, 255, 255)
FONT = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

FAMILIES = {
    "claude": {"hair": (224, 138, 95, 255), "ribbon": (255, 255, 255, 255), "label": "Claude 佔位"},
    "codex":  {"hair": (201, 209, 217, 255), "ribbon": (58, 167, 160, 255), "label": "Codex 佔位"},
    "grok":   {"hair": (45, 47, 58, 255), "ribbon": (232, 232, 232, 255), "label": "Grok 佔位"},
    "qwen":   {"hair": (138, 108, 240, 255), "ribbon": (255, 214, 102, 255), "label": "Qwen 佔位"},
}


def canvas():
    im = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def s(*v):
    return [x * SS for x in v]


def finish(im):
    return im.resize((W, H), Image.LANCZOS)


def body(fam, mood, dy=0):
    im, d = canvas()
    hair = fam["hair"]
    # torso, mostly hidden behind the ledge
    d.rounded_rectangle(s(110, 250 + dy, 250, 400 + dy), radius=40 * SS, fill=(255, 255, 255, 255), outline=INK, width=4 * SS)
    # ahoge
    d.arc(s(170, 18 + dy, 230, 78 + dy), 180, 300, fill=hair, width=9 * SS)
    # back hair + head
    d.ellipse(s(50, 40 + dy, 310, 290 + dy), fill=hair, outline=INK, width=4 * SS)
    d.ellipse(s(82, 92 + dy, 278, 270 + dy), fill=SKIN)
    # bangs
    d.pieslice(s(70, 50 + dy, 290, 220 + dy), 180, 360, fill=hair)
    for x in (110, 160, 210):
        d.polygon(s(x, 130 + dy, x + 40, 130 + dy, x + 20, 170 + dy), fill=hair)
    # ribbon
    d.polygon(s(250, 70 + dy, 290, 50 + dy, 290, 100 + dy), fill=fam["ribbon"], outline=INK)
    d.polygon(s(250, 70 + dy, 215, 52 + dy, 220, 98 + dy), fill=fam["ribbon"], outline=INK)
    # blush
    for cx in (118, 242):
        d.ellipse(s(cx - 16, 212 + dy, cx + 16, 228 + dy), fill=BLUSH)
    face(d, mood, dy)
    return finish(im)


def face(d, mood, dy):
    w = 5 * SS
    if mood == "normal":
        d.arc(s(118, 180 + dy, 148, 206 + dy), 200, 340, fill=INK, width=w)
        d.arc(s(212, 180 + dy, 242, 206 + dy), 200, 340, fill=INK, width=w)
        d.arc(s(166, 222 + dy, 194, 242 + dy), 20, 160, fill=INK, width=4 * SS)
    elif mood == "warning":
        d.ellipse(s(124, 180 + dy, 140, 204 + dy), fill=INK)
        d.ellipse(s(220, 180 + dy, 236, 204 + dy), fill=INK)
        d.line(s(168, 236 + dy, 192, 236 + dy), fill=INK, width=4 * SS)
        d.polygon(s(268, 130 + dy, 258, 152 + dy, 278, 152 + dy), fill=TEAR)
        d.ellipse(s(258, 144 + dy, 278, 164 + dy), fill=TEAR)
    elif mood == "critical":
        d.line(s(120, 184 + dy, 146, 194 + dy, 120, 204 + dy), fill=INK, width=w, joint="curve")
        d.line(s(240, 184 + dy, 214, 194 + dy, 240, 204 + dy), fill=INK, width=w, joint="curve")
        d.line(s(132, 208 + dy, 132, 238 + dy), fill=TEAR, width=7 * SS)
        d.line(s(228, 208 + dy, 228, 238 + dy), fill=TEAR, width=7 * SS)
        d.arc(s(166, 232 + dy, 194, 252 + dy), 200, 340, fill=INK, width=4 * SS)
    elif mood == "sleep":
        d.arc(s(118, 186 + dy, 148, 206 + dy), 20, 160, fill=INK, width=w)
        d.arc(s(212, 186 + dy, 242, 206 + dy), 20, 160, fill=INK, width=w)
        d.ellipse(s(174, 228 + dy, 186, 240 + dy), outline=INK, width=3 * SS)


def hands(d):
    for cx in (92, 268):
        d.ellipse(s(cx - 24, 284, cx + 24, 326), fill=SKIN, outline=INK, width=4 * SS)


def front(label):
    im, d = canvas()
    # sign hangs over the front of the ledge, held at the two top corners
    d.rounded_rectangle(s(58, 314, 302, 434), radius=18 * SS, fill=INK)
    d.rounded_rectangle(s(58, 308, 302, 428), radius=18 * SS, fill=SIGN, outline=INK, width=5 * SS)
    hands(d)
    return finish(im)


def sleep_front():
    im, d = canvas()
    for cx in (130, 230):
        d.rounded_rectangle(s(cx - 60, 290, cx + 60, 330), radius=20 * SS, fill=(255, 255, 255, 255), outline=INK, width=4 * SS)
    return finish(im)


def sleep_gif(fam, path):
    base = body(fam, "sleep", dy=26)
    base.paste((0, 0, 0, 0), (0, 330, W, H))      # nothing below the ledge while dozing
    f = ImageFont.truetype(FONT, 26 * SS)
    frames = []
    for i in range(8):
        im, d = canvas()
        for k in range(3):
            t = (i + k * 3) % 8
            x, y = 270 + t * 6, 80 - t * 9
            a = max(0, 255 - t * 30)
            d.text(s(x, y), "z", font=f, fill=(INK[0], INK[1], INK[2], a), anchor="mm")
        layer = Image.alpha_composite(base, finish(im))
        # GIF has 1-bit alpha: palette-quantize with a transparent index
        frames.append(layer)
    pal = []
    for fr in frames:
        alpha = fr.getchannel("A").point(lambda a: 255 if a > 128 else 0)
        p = fr.convert("RGB").quantize(255)
        p.paste(255, mask=Image.eval(alpha, lambda a: 255 - a))
        pal.append(p)
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=180, loop=0, transparency=255, disposal=2)


def main(root):
    for cid, fam in FAMILIES.items():
        out = Path(root) / cid
        out.mkdir(parents=True, exist_ok=True)
        for mood in ("normal", "warning", "critical"):
            body(fam, mood).save(out / f"{mood}.png")
        front(fam["label"]).save(out / "front.png")
        sleep_front().save(out / "sleep_front.png")
        sleep_gif(fam, out / "sleep.gif")
        print("drew", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "app/pets/characters")
