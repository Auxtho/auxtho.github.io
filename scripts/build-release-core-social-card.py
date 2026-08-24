from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "proof" / "release-core" / "rc02-linkedin.png"
FONT_DIR = Path(r"C:\Windows\Fonts")

WIDTH = 1200
HEIGHT = 630
PAPER = "#F3F5F3"
INK = "#101514"
MUTED = "#65706C"
LINE = "#CDD5D1"
TEAL = "#49D3B6"
CORAL = "#FF6F68"
CORAL_WASH = "#FDE4E0"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / name), size=size)


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str,
                  face: ImageFont.FreeTypeFont, fill: str) -> None:
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), text, font=face)
    text_width = bounds[2] - bounds[0]
    text_height = bounds[3] - bounds[1]
    x = left + ((right - left) - text_width) / 2
    y = top + ((bottom - top) - text_height) / 2 - bounds[1]
    draw.text((x, y), text, font=face, fill=fill)


def rounded_box(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], outline: str,
                fill: str = PAPER, width: int = 2, radius: int = 10) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def build() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)

    bold_20 = font("arialbd.ttf", 20)
    bold_52 = font("arialbd.ttf", 52)
    bold_30 = font("arialbd.ttf", 30)
    regular_18 = font("arial.ttf", 18)
    regular_16 = font("arial.ttf", 16)
    bold_16 = font("arialbd.ttf", 16)

    draw.rectangle((64, 54, 100, 60), fill=TEAL)
    draw.text((116, 43), "AUXTHO RELEASE CORE", font=bold_20, fill=MUTED)

    draw.text((64, 98), "Changed after review?", font=bold_52, fill=INK)
    draw.text((64, 158), "Release blocked.", font=bold_52, fill=INK)

    boxes = [
        (64, 256, 310, 366, "01", "Reviewed", "Artifact version A", TEAL),
        (386, 256, 632, 366, "02", "Changed", "Artifact version B", "#FFBB5C"),
        (708, 256, 1136, 366, "03", "Revalidated", "A does not equal B", CORAL),
    ]
    for left, top, right, bottom, index, title, subtitle, accent in boxes:
        rounded_box(draw, (left, top, right, bottom), LINE)
        draw.text((left + 20, top + 16), index, font=bold_16, fill=accent)
        draw.text((left + 20, top + 45), title, font=bold_20, fill=INK)
        draw.text((left + 20, top + 76), subtitle, font=regular_16, fill=MUTED)

    for x, color in [(332, MUTED), (654, CORAL)]:
        y = 311
        draw.line((x, y, x + 30, y), fill=color, width=4)
        draw.line((x + 22, y - 8, x + 30, y), fill=color, width=4)
        draw.line((x + 22, y + 8, x + 30, y), fill=color, width=4)

    rounded_box(draw, (64, 408, 1136, 514), CORAL, CORAL_WASH, width=3, radius=12)
    draw.text((90, 428), "BLOCKED", font=bold_30, fill=INK)
    draw.text((90, 470), "Observed consequence for one attempted release", font=regular_18, fill=MUTED)
    draw.text((825, 441), "0 downstream actions", font=bold_20, fill=CORAL)

    draw.text((64, 566), "AUXTHO", font=bold_16, fill=INK)
    footer = "Synthetic local scenario  |  No external providers  |  Not customer or production results"
    footer_bounds = draw.textbbox((0, 0), footer, font=regular_16)
    draw.text((1136 - (footer_bounds[2] - footer_bounds[0]), 566), footer, font=regular_16, fill=MUTED)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, format="PNG", optimize=True)


if __name__ == "__main__":
    build()
