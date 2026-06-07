from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "ads" / "brand-direction-sources"
OUTPUT_DIR = ROOT / "assets" / "ads" / "brand-direction-final"

SIZE = 1254
CHARTREUSE = "#E4FF97"
CHARCOAL = "#111111"
WHITE = "#FFFFFF"
STEEL = "#4A4A4A"

SERIF = Path(r"C:\Windows\Fonts\georgia.ttf")
SERIF_BOLD = Path(r"C:\Windows\Fonts\georgiab.ttf")
SANS = Path(r"C:\Windows\Fonts\arial.ttf")
SANS_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")


ADS = [
    {
        "source": "01-foreman.png",
        "output": "01-foreman-is-the-system.png",
        "theme": "light",
        "box": (48, 42, 565, 1212),
        "headline": [("The foreman is", CHARCOAL), ("still the ", CHARCOAL), ("system.", CHARTREUSE)],
        "body": "If the work lives in one person's head, you don't have a system. You have a bottleneck.",
        "cta": "TAKE THE 5-MINUTE AUDIT",
    },
    {
        "source": "02-change-orders.png",
        "output": "02-change-orders-shouldnt-chase-you.png",
        "theme": "light",
        "box": (48, 42, 660, 1198),
        "headline": [("Change orders", CHARCOAL), ("shouldn't chase", CHARCOAL), ("you.", CHARTREUSE)],
        "body": "Turn field decisions, approvals, and follow-up into one operating system.",
        "cta": "FIND THE LEAK",
    },
    {
        "source": "03-dispatch.png",
        "output": "03-dispatcher-is-not-a-system.png",
        "theme": "dark",
        "box": (700, 42, 1210, 1210),
        "headline": [("Your best", WHITE), ("dispatcher is not", WHITE), ("a system.", CHARTREUSE)],
        "body": "Build the process around your best people, so every job moves without constant intervention.",
        "cta": "SEE WHAT'S BOTTLENECKED",
    },
    {
        "source": "04-maintenance.png",
        "output": "04-tools-should-remove-work.png",
        "theme": "dark",
        "box": (48, 42, 630, 1195),
        "headline": [("Your tools should", WHITE), ("remove work.", CHARTREUSE), ("Not add more.", WHITE)],
        "body": "TMI installs digital labor, company memory, and workflows built around how your crew actually works.",
        "cta": "BUILD THE SYSTEM",
    },
    {
        "source": "05-yard.png",
        "output": "05-company-runs-before-you-arrive.png",
        "theme": "light",
        "box": (610, 38, 1210, 1198),
        "headline": [("Build a company", CHARCOAL), ("that runs before", CHARCOAL), ("you arrive.", CHARTREUSE)],
        "body": "The right system keeps the schedule, the crew, and the follow-up moving without you in every decision.",
        "cta": "TAKE THE 5-MINUTE AUDIT",
    },
]


def font(path, size):
    return ImageFont.truetype(str(path), size)


def draw_logo(draw, x, y, size, color):
    """Render the exact primitive geometry from the repository's logo.svg."""
    scale = size / 300

    def rect(coords):
        draw.rectangle(tuple(int(v * scale + (x if i % 2 == 0 else y)) for i, v in enumerate(coords)), fill=color)

    draw.ellipse((x + 15 * scale, y + 15 * scale, x + 285 * scale, y + 285 * scale), outline=color, width=max(2, int(8 * scale)))
    for coords in [
        (40, 108, 59, 226), (28, 218, 71, 231), (28, 108, 71, 121),
        (222, 108, 241, 226), (210, 218, 253, 231), (210, 108, 253, 121),
        (30, 68, 76, 106), (40, 78, 260, 104), (224, 68, 270, 106),
        (132, 78, 168, 238), (112, 228, 188, 242),
    ]:
        rect(coords)
    draw.polygon([(x + p[0] * scale, y + p[1] * scale) for p in [(59, 121), (78, 121), (148, 182), (129, 182)]], fill=color)
    draw.polygon([(x + p[0] * scale, y + p[1] * scale) for p in [(152, 182), (171, 182), (241, 121), (222, 121)]], fill=color)


def fit_headline(draw, lines, max_width, start_size=76):
    size = start_size
    while size > 48:
        f = font(SERIF_BOLD, size)
        if all(draw.textbbox((0, 0), text, font=f)[2] <= max_width for text, _ in lines):
            return f
        size -= 2
    return font(SERIF_BOLD, size)


def wrap(draw, text, f, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=f)[2] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def compose(ad):
    image = Image.open(SOURCE_DIR / ad["source"]).convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    draw = ImageDraw.Draw(image, "RGBA")
    x1, y1, x2, y2 = ad["box"]
    width = x2 - x1
    dark = ad["theme"] == "dark"
    ink = WHITE if dark else CHARCOAL
    sub = (255, 255, 255, 210) if dark else (17, 17, 17, 210)

    # Quiet readability field that still lets the photographic texture show through.
    panel = (10, 10, 10, 118) if dark else (255, 255, 255, 205)
    draw.rounded_rectangle((x1 - 22, y1 - 18, x2 + 8, y2), radius=3, fill=panel)

    logo_size = 88
    draw_logo(draw, x1, y1, logo_size, ink)
    draw.text((x1 + 106, y1 + 21), "TMI", font=font(SERIF_BOLD, 34), fill=ink)
    draw.text((x1 + 107, y1 + 60), "BUILT FOR THE TRADES.", font=font(SANS_BOLD, 13), fill=ink, spacing=2)

    rule_y = y1 + 126
    draw.rectangle((x1, rule_y, x1 + 74, rule_y + 4), fill=CHARTREUSE)

    headline_font = fit_headline(draw, ad["headline"], width, 76)
    hy = rule_y + 35
    line_step = int(headline_font.size * 1.08)
    for text, color in ad["headline"]:
        draw.text((x1, hy), text, font=headline_font, fill=color)
        hy += line_step

    body_font = font(SANS, 27)
    body_y = hy + 28
    for line in wrap(draw, ad["body"], body_font, width - 10):
        draw.text((x1, body_y), line, font=body_font, fill=sub)
        body_y += 38

    cta_font = font(SANS_BOLD, 19)
    cta_text = ad["cta"]
    tw = draw.textbbox((0, 0), cta_text, font=cta_font)[2]
    cta_y = min(y2 - 105, max(body_y + 40, y1 + 730))
    draw.rounded_rectangle((x1, cta_y, x1 + tw + 58, cta_y + 58), radius=3, fill=CHARTREUSE)
    draw.text((x1 + 29, cta_y + 18), cta_text, font=cta_font, fill=CHARCOAL)

    draw.text((x1, y2 - 36), "TMITECHAI.COM", font=font(SANS_BOLD, 15), fill=ink)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT_DIR / ad["output"], quality=95)


for ad in ADS:
    compose(ad)

print(f"Created {len(ADS)} ads in {OUTPUT_DIR}")
