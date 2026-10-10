"""Generate NOVA app icons: white circuit-tree on a black rounded square.

Outside the rounded plate is fully transparent so Windows taskbar / Start /
tray show soft corners (not a sharp black tile or a circle).
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE_CANDIDATES = [
    ROOT / 'build' / 'icon-source-nova.png',
    ROOT / 'public' / 'nova-mark-glyph.png',
]


def load_glyph() -> Image.Image:
    for path in SOURCE_CANDIDATES:
        if path.is_file():
            return Image.open(path).convert('RGBA')
    raise SystemExit('Missing glyph source (build/icon-source-nova.png or public/nova-mark-glyph.png)')


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def normalize_glyph(glyph: Image.Image) -> Image.Image:
    """Crop to opaque ink and force white on transparent."""
    bbox = glyph.getbbox()
    if not bbox:
        raise SystemExit('Glyph source has no opaque pixels')
    g = glyph.crop(bbox).convert('RGBA')
    px = g.load()
    for y in range(g.height):
        for x in range(g.width):
            r, gc, b, a = px[x, y]
            if a <= 8:
                px[x, y] = (0, 0, 0, 0)
                continue
            # Keep luminous / near-white ink; drop near-black plate leftovers.
            lum = (r + gc + b) / 3
            if lum < 40:
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (255, 255, 255, 255)
    return g


def scale_glyph(glyph: Image.Image, target: int) -> Image.Image:
    """Upscale or downscale so the longest side == target (thumbnail never grows)."""
    g = glyph.copy()
    w, h = g.size
    long_side = max(w, h)
    if long_side <= 0:
        raise SystemExit('Empty glyph')
    scale = target / float(long_side)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return g.resize((nw, nh), Image.Resampling.LANCZOS)


def draw_app_icon(size: int, glyph: Image.Image) -> Image.Image:
    """Black rounded plate + large centered white tree; transparent outside corners."""
    radius = max(2, int(round(size * 0.22)))
    plate = Image.new('RGBA', (size, size), (0, 0, 0, 255))
    plate.putalpha(rounded_mask(size, radius))

    # Leave breathing room inside the squircle — 0.78 looked edge-to-edge / zoomed-in
    # on the Windows taskbar. ~0.64 keeps the tree clearly centered with even padding.
    target = max(16, int(round(size * 0.64)))
    g = scale_glyph(normalize_glyph(glyph), target)

    ox = (size - g.width) // 2
    oy = (size - g.height) // 2
    plate.alpha_composite(g, (ox, oy))
    return plate


def write_ico(path: Path, base: Image.Image) -> None:
    sizes = [256, 128, 64, 48, 32, 24, 16]
    variants = [base.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    variants[0].save(
        path,
        format='ICO',
        sizes=[(im.width, im.height) for im in variants],
        append_images=variants[1:],
    )
    check = Image.open(path).convert('RGBA')
    corner = check.getpixel((0, 0))
    if corner[3] != 0:
        raise SystemExit(f'ICO corner not transparent: {corner}')


def embed_png_svg(png: Image.Image, out: Path) -> None:
    import base64
    import io

    buf = io.BytesIO()
    png.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n'
        f'  <image href="data:image/png;base64,{b64}" width="512" height="512" '
        'preserveAspectRatio="xMidYMid meet"/>\n'
        '</svg>\n'
    )
    out.write_text(svg, encoding='utf-8')


def main() -> None:
    glyph = load_glyph()
    icon_1024 = draw_app_icon(1024, glyph)
    icon_512 = draw_app_icon(512, glyph)

    targets = [
        (ROOT / 'build' / 'icon.png', icon_1024),
        (ROOT / 'build' / 'oauth-app-logo.png', icon_512),
        (ROOT / 'public' / 'nova-icon.png', icon_512),
        (ROOT / 'website' / 'public' / 'nova-icon.png', icon_512),
    ]
    for path, img in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path, 'PNG')

    write_ico(ROOT / 'build' / 'icon.ico', icon_1024)
    embed_png_svg(icon_512, ROOT / 'public' / 'nova-mark.svg')
    embed_png_svg(icon_512, ROOT / 'website' / 'public' / 'nova-mark.svg')

    sample = Image.open(ROOT / 'build' / 'icon.png').convert('RGBA')
    w, h = sample.size
    corner_a = sample.getpixel((0, 0))[3]
    if corner_a != 0:
        raise SystemExit(f'PNG corner not transparent: alpha={corner_a}')

    # White ink must fill a useful fraction of the plate (not a 112px speck).
    px = sample.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 200 and (r + g + b) > 600:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise SystemExit('No white tree pixels in icon.png')
    bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    if bw < int(w * 0.45) or bh < int(h * 0.45):
        raise SystemExit(f'Tree too small in plate: {bw}x{bh} on {w}x{h}')

    # Tray sizes must keep visible ink.
    for s in (16, 24, 32):
        small = icon_1024.resize((s, s), Image.Resampling.LANCZOS)
        sp = small.load()
        bright = sum(
            1
            for y in range(s)
            for x in range(s)
            if sp[x, y][3] > 128 and sum(sp[x, y][:3]) > 300
        )
        if bright < max(3, s // 4):
            raise SystemExit(f'{s}px icon too empty: bright={bright}')

    print('Updated build/icon.png, build/icon.ico, build/oauth-app-logo.png')
    print('Updated public/nova-icon.png, website/public/nova-icon.png, nova-mark.svg')
    print(f'Tree bbox {bw}x{bh} on {w}x{h}; corner alpha={corner_a}')


if __name__ == '__main__':
    main()
