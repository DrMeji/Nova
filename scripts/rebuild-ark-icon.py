"""Rebuild ARK app icon: black rounded square + white robot, no gray inset."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'build' / 'icon.png'
BACKUP = ROOT / 'build' / 'icon.source-backup.png'


def rebuild(src_img: Image.Image, size: int) -> Image.Image:
    src = src_img.convert('RGBA').resize((size, size), Image.Resampling.LANCZOS)
    w, h = src.size
    logo = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    spx = src.load()
    lpx = logo.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = spx[x, y]
            if a < 20:
                continue
            luma = (r + g + b) / 3.0
            if luma >= 160:
                lpx[x, y] = (255, 255, 255, 255)

    bg = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bg)
    radius = int(size * 0.22)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=(12, 12, 14, 255))
    composed = Image.alpha_composite(bg, logo)

    mask = Image.new('L', (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    r, g, b, _ = composed.split()
    return Image.merge('RGBA', (r, g, b, mask))


def main():
    if not BACKUP.exists():
        BACKUP.write_bytes(SRC.read_bytes())
    src = Image.open(BACKUP if BACKUP.exists() else SRC)
    icon = rebuild(src, 1024)
    icon.save(ROOT / 'build' / 'icon.png', 'PNG')
    rebuild(src, 512).save(ROOT / 'public' / 'ark-icon.png', 'PNG')

    sizes = [256, 128, 64, 48, 32, 24, 16]
    variants = [icon.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    # Largest first — electron-builder requires at least 256x256 in the ICO.
    variants[0].save(
        ROOT / 'build' / 'icon.ico',
        format='ICO',
        sizes=[(im.width, im.height) for im in variants],
        append_images=variants[1:],
    )
    print('Updated build/icon.png, public/ark-icon.png, build/icon.ico')


if __name__ == '__main__':
    main()
