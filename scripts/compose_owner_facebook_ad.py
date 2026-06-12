from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "imagegen" / "facebook-ads" / "02-built-the-business-source.png"
OUTPUT = ROOT / "output" / "imagegen" / "facebook-ads" / "02-built-the-business.png"
FONT_DIR = ROOT / "assets" / "fonts"

SIZE = 1080
BLACK = "#0A0A0A"
CHARTREUSE = "#E2FC90"
WHITE = "#FFFFFF"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size)


def wrap(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int):
    lines = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=face)[2] <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_logo(draw: ImageDraw.ImageDraw, x: int, y: int, size: int, color: str):
    """Draw the exact primitive geometry from logo.svg."""
    scale = size / 300

    def rect(coords):
        draw.rectangle(
            tuple(int(v * scale + (x if i % 2 == 0 else y)) for i, v in enumerate(coords)),
            fill=color,
        )

    draw.ellipse(
        (x + 15 * scale, y + 15 * scale, x + 285 * scale, y + 285 * scale),
        outline=color,
        width=max(2, int(8 * scale)),
    )
    for coords in [
        (40, 108, 59, 226), (28, 218, 71, 231), (28, 108, 71, 121),
        (222, 108, 241, 226), (210, 218, 253, 231), (210, 108, 253, 121),
        (30, 68, 76, 106), (40, 78, 260, 104), (224, 68, 270, 106),
        (132, 78, 168, 238), (112, 228, 188, 242),
    ]:
        rect(coords)
    draw.polygon(
        [(x + px * scale, y + py * scale) for px, py in [(59, 121), (78, 121), (148, 182), (129, 182)]],
        fill=color,
    )
    draw.polygon(
        [(x + px * scale, y + py * scale) for px, py in [(152, 182), (171, 182), (241, 121), (222, 121)]],
        fill=color,
    )


image = Image.open(SOURCE).convert("RGB")
left = (image.width - image.height) // 2
image = image.crop((left, 0, left + image.height, image.height)).resize((SIZE, SIZE), Image.Resampling.LANCZOS)

# Frost only the area behind the copy panel so the facility remains crisp elsewhere.
panel_box = (52, 52, 640, 1028)
blurred = image.crop(panel_box).filter(ImageFilter.GaussianBlur(20))
image.paste(blurred, panel_box)

overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay, "RGBA")
draw.rounded_rectangle(panel_box, radius=16, fill=(255, 255, 255, 218), outline=(255, 255, 255, 230), width=2)

headline = font("BebasNeue-Regular.ttf", 104)
subline = font("InstrumentSerif-Regular.ttf", 35)
small = font("BebasNeue-Regular.ttf", 23)
cta = font("BebasNeue-Regular.ttf", 29)

x = 98
y = 118
for line in ["YOU BUILT", "THE BUSINESS.", "NOW BUILD", "THE SYSTEM."]:
    draw.text((x, y), line, font=headline, fill=BLACK)
    y += 91

y += 34
support = "TMI turns the decisions, knowledge, and follow-up trapped with you into an operating system your company can run on."
for line in wrap(draw, support, subline, 470):
    draw.text((x, y), line, font=subline, fill=(10, 10, 10, 226))
    y += 43

cta_text = "TAKE THE 5-MINUTE AUDIT"
cta_y = 820
cta_width = draw.textbbox((0, 0), cta_text, font=cta)[2] + 58
draw.rounded_rectangle((x, cta_y, x + cta_width, cta_y + 66), radius=16, fill=CHARTREUSE)
draw.text((x + 29, cta_y + 17), cta_text, font=cta, fill=BLACK)
draw.text((x, 946), "TMITECHAI.COM", font=small, fill=BLACK)

# Keep the exact black monogram isolated on white at the required bottom-right position.
logo_box = (920, 920, 1030, 1030)
draw.rounded_rectangle(logo_box, radius=16, fill=(255, 255, 255, 242), outline=(255, 255, 255, 255), width=2)
draw_logo(draw, 938, 938, 74, BLACK)

Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB").save(OUTPUT, quality=96)
print(OUTPUT)
