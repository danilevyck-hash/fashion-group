from PIL import Image, ImageDraw, ImageFont
import os

out_dir = os.path.join(os.path.dirname(__file__), '..', 'public')

for size in [192, 512]:
    img = Image.new("RGB", (size, size), "#0a0a0a")
    draw = ImageDraw.Draw(img)

    # Border
    border = int(size * 0.04)
    draw.rectangle(
        [border, border, size - border, size - border],
        outline="white",
        width=max(1, int(size * 0.008))
    )

    # "FG" text
    font_size = int(size * 0.42)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Times New Roman.ttf", font_size)
    except Exception:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/Times New Roman.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

    text = "FG"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) / 2 - bbox[0]
    y = (size - text_h) / 2 - bbox[1] - size * 0.03
    draw.text((x, y), text, fill="white", font=font)

    path = os.path.join(out_dir, f"icon-{size}.png")
    img.save(path)
    print(f"Generated {path}")
