"""Generate ARK voice mark: rounded head + two eye bars. no ears / antenna.

Glyph fills most of the tile so Windows taskbar / tray icons read at size.
"""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = Path.home() / 'Desktop'


def draw_mark(size: int, fg=(255, 255, 255, 255), bg=None) -> Image.Image:
    """Transparent (or solid) background + voice-mark face only."""
    img = Image.new('RGBA', (size, size), bg if bg is not None else (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 64.0
    # Slightly thicker strokes so small tray sizes stay crisp.
    stroke = max(2, int(round(3.8 * s)))
    eye_w = max(2, int(round(4.2 * s)))

    def L(x, y):
        return (x * s, y * s)

    # Larger head (~6..58 in 64-space) so taskbar/tray tiles aren't tiny.
    hx0, hy0 = L(6, 6)
    hx1, hy1 = L(58, 58)
    head_r = max(2, int(round(14 * s)))
    draw.rounded_rectangle([hx0, hy0, hx1, hy1], radius=head_r, outline=fg, width=stroke)

    # Eyes — scaled with the larger head
    draw.line([L(24, 22), L(24, 42)], fill=fg, width=eye_w)
    draw.line([L(40, 22), L(40, 42)], fill=fg, width=eye_w)
    return img


def main():
    icon = draw_mark(1024)
    icon.save(ROOT / 'build' / 'icon.png', 'PNG')
    # Opaque black plate for Windows taskbar / installer (reads cleaner than pure alpha).
    tray = draw_mark(1024, bg=(10, 10, 12, 255))
    tray.save(ROOT / 'build' / 'oauth-app-logo.png', 'PNG')

    ui = draw_mark(512)
    ui.save(ROOT / 'public' / 'ark-icon.png', 'PNG')
    ui.save(ROOT / 'website' / 'public' / 'ark-icon.png', 'PNG')

    DESKTOP.mkdir(parents=True, exist_ok=True)
    icon.save(DESKTOP / 'ARK-icon.png', 'PNG')
    draw_mark(1024, fg=(10, 10, 12, 255)).save(DESKTOP / 'ARK-mark-light.png', 'PNG')
    draw_mark(1024, fg=(242, 244, 247, 255)).save(DESKTOP / 'ARK-mark-dark.png', 'PNG')

    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect x="6" y="6" width="52" height="52" rx="14" stroke="currentColor" stroke-width="3.8"/>
  <path d="M24 22v20M40 22v20" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/>
</svg>
'''
    (DESKTOP / 'ARK-mark.svg').write_text(svg, encoding='utf-8')
    (ROOT / 'public' / 'ark-mark.svg').write_text(svg, encoding='utf-8')
    (ROOT / 'website' / 'public' / 'ark-mark.svg').write_text(svg, encoding='utf-8')

    sizes = [256, 128, 64, 48, 32, 24, 16]
    # ICO uses opaque plate so Explorer / taskbar never show a hollow glyph.
    ico_base = draw_mark(1024, bg=(10, 10, 12, 255))
    variants = [ico_base.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    variants[0].save(
        ROOT / 'build' / 'icon.ico',
        format='ICO',
        sizes=[(im.width, im.height) for im in variants],
        append_images=variants[1:],
    )
    print('Updated build/icon.png, build/icon.ico, build/oauth-app-logo.png')
    print('Updated public/ark-icon.png, website/public/ark-icon.png, public/ark-mark.svg')
    print('Also saved to Desktop: ARK-icon.png, ARK-mark-light.png, ARK-mark-dark.png, ARK-mark.svg')


if __name__ == '__main__':
    main()
