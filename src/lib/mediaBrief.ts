/** Quick pre-render brief for vague image prompts. one reply, then generate. */

const SKIP_BRIEF_RE = /\b(go|skip|just generate|no questions|as is|as-is)\b/i;

export function wantsSkipImageBrief(raw: string): boolean {
  return SKIP_BRIEF_RE.test(String(raw || '').trim());
}

export function needsImageBrief(raw: string): boolean {
  const t = String(raw || '').trim();
  if (!t || t.length > 220 || wantsSkipImageBrief(t)) return false;
  // Upload / recreate flows should render immediately. no quiz.
  if (/\b(recreate|improve this|upscale|from this (?:photo|image|picture))\b/i.test(t)) return false;

  const lower = t.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const detailHits = (
    lower.match(
      /,| and | with | style|color|palette|minimal|retro|cinematic|photoreal|abstract|dark|light|sunset|mountain|forest|ocean|city|space|anime|neon|pastel|simple|gradient|moody|vibrant/g,
    ) || []
  ).length;

  if (detailHits >= 3 || words.length >= 16) return false;

  if (/\b(wallpaper|desktop background|background for desktop|lock screen)\b/.test(lower)) {
    if (!/\b(mountain|city|forest|space|abstract|minimal|anime|nature|sunset|ocean|beach|car|gradient|neon|dark|light)\b/.test(lower)) {
      return true;
    }
  }

  if (/\b(logo|banner|thumbnail|cover art|poster)\b/.test(lower) && detailHits < 2) {
    return true;
  }

  if (/^(make|create|generate|draw|design)\s+(me\s+)?(a|an)\s+/i.test(t) && detailHits < 2 && words.length < 12) {
    return true;
  }

  return false;
}

export function mergeImageBrief(original: string, reply: string): string {
  const o = String(original || '').trim();
  const r = String(reply || '').trim();
  if (!r || wantsSkipImageBrief(r)) return o;
  if (/^(yes|yep|ok|okay|sure)$/i.test(r)) return o;
  return `${o}. ${r}`;
}

export function buildImageBriefMessage(raw: string): string {
  const t = String(raw || '').trim();
  const lower = t.toLowerCase();

  if (/\b(wallpaper|desktop background|background for desktop)\b/.test(lower)) {
    return [
      'Before I render. quick brief:',
      '',
      '1. **Subject**. what should be in the wallpaper? (e.g. mountains, city skyline, abstract waves)',
      '2. **Style**. minimal, retro, cinematic, photoreal, or illustrated?',
      '3. **Mood / colors**. dark, light, neon, pastel, or a palette you want',
      '4. **Size**. desktop is usually **16:9** (e.g. 3840×2160). Say if you want portrait instead.',
      '',
      'Reply in one message with your picks, or say **go** to render from your prompt as-is.',
    ].join('\n');
  }

  if (/\b(logo|banner|thumbnail|cover|poster)\b/.test(lower)) {
    return [
      'Before I render. quick brief:',
      '',
      '1. **Subject / name**. what is the logo or art for?',
      '2. **Style**. flat, 3D, retro, minimal, bold, or playful?',
      '3. **Colors**. brand colors or a palette to use',
      '4. **Background**. transparent feel, solid color, or gradient?',
      '',
      'Reply in one message, or say **go** to use your prompt as-is.',
    ].join('\n');
  }

  return [
    'Before I render. quick brief:',
    '',
    '1. **Subject**. what should be the main focus?',
    '2. **Style**. photoreal, illustrated, minimal, retro, or cinematic?',
    '3. **Setting / background**. studio, outdoor, plain backdrop, or environment?',
    '4. **Anything to avoid**. hands, text, clutter, wrong colors, etc.',
    '',
    'Reply in one message with your picks, or say **go** to render from your prompt as-is.',
  ].join('\n');
}

/** Strip ark-media attachments and return clean text + first reference thumb id. */
export function parseImageRequest(content: string): { text: string; referenceId?: string } {
  let text = String(content || '');
  let referenceId: string | undefined;
  text = text.replace(/!\[[^\]]*]\(ark-media:([^)]+)\)/g, (_m, id: string) => {
    if (!referenceId) referenceId = id.trim();
    return '';
  });
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, referenceId };
}
