"""Generate ARK mark icon: robot only, no squircle / gray box."""
from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = Path.home() / 'Desktop'


def draw_mark(size: int, fg=(255, 255, 255, 255)) -> Image.Image:
    """Transparent background + robot mark only."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size / 64.0
    stroke = max(2, int(round(3.2 * s)))

    def L(x, y):
        return (x * s, y * s)

    # Antenna
    draw.line([L(32, 8), L(32, 15)], fill=fg, width=stroke)
    draw.line([L(26, 8), L(38, 8)], fill=fg, width=stroke)

    # Head
    hx0, hy0 = L(14, 16)
    hx1, hy1 = L(50, 52)
    head_r = max(2, int(round(11 * s)))
    draw.rounded_rectangle([hx0, hy0, hx1, hy1], radius=head_r, outline=fg, width=stroke)

    # Ears
    ear_w = max(2, int(round(3.2 * s)))
    draw.arc([L(6, 30), L(18, 46)], start=90, end=270, fill=fg, width=ear_w)
    draw.arc([L(46, 30), L(58, 46)], start=270, end=90, fill=fg, width=ear_w)

    # Eyes
    eye_w = max(2, int(round(3.6 * s)))
    draw.line([L(25, 28), L(25, 40)], fill=fg, width=eye_w)
    draw.line([L(39, 28), L(39, 40)], fill=fg, width=eye_w)
    return img


def main():
    icon = draw_mark(1024)
    icon.save(ROOT / 'build' / 'icon.png', 'PNG')
    draw_mark(512).save(ROOT / 'public' / 'ark-icon.png', 'PNG')
    draw_mark(512).save(ROOT / 'website' / 'public' / 'ark-icon.png', 'PNG')

    DESKTOP.mkdir(parents=True, exist_ok=True)
    icon.save(DESKTOP / 'ARK-icon.png', 'PNG')
    draw_mark(1024, fg=(10, 10, 12, 255)).save(DESKTOP / 'ARK-mark-light.png', 'PNG')
    draw_mark(1024, fg=(242, 244, 247, 255)).save(DESKTOP / 'ARK-mark-dark.png', 'PNG')
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <path d="M32 8v7M26 8h12" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
  <rect x="14" y="16" width="36" height="36" rx="11" stroke="currentColor" stroke-width="3.2"/>
  <path d="M14 34c-3.2 0-5 2-5 4.5S10.8 43 14 43M50 34c3.2 0 5 2 5 4.5S53.2 43 50 43" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
  <path d="M25 28v12M39 28v12" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/>
</svg>
'''
    (DESKTOP / 'ARK-mark.svg').write_text(svg, encoding='utf-8')

    sizes = [256, 128, 64, 48, 32, 24, 16]
    variants = [icon.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    variants[0].save(
        ROOT / 'build' / 'icon.ico',
        format='ICO',
        sizes=[(im.width, im.height) for im in variants],
        append_images=variants[1:],
    )
    print('Updated build/icon.png, public/ark-icon.png, website/public/ark-icon.png, build/icon.ico (no box)')
    print('Also saved to Desktop: ARK-icon.png, ARK-mark-light.png, ARK-mark-dark.png, ARK-mark.svg')


if __name__ == '__main__':
    main()
