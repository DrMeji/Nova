/**
 * Short tips / jokes for wait surfaces (setup download, boot spinner, chat installing).
 * Keep them light — not a mini-game, not a redesign.
 */

export const ARK_TIPS: string[] = [
  'Tip: NOVA Auto means “try free stuff first, panic later.”',
  'Joke: Your model is downloading. The AI is stretching. Be polite.',
  'Tip: Cloud keys stay on this PC — NOVA isn’t stealing your Groq vibes.',
  'Joke: Local brains don’t need Wi‑Fi. They do need patience. And disk.',
  'Tip: Ask Chat “list MCP tools” after you add a server in Settings.',
  'Joke: 1 GB of weights later, it will still say “Sure!” with confidence.',
  'Tip: Spellcheck is on. Typos are forgiven. Bad prompts… less so.',
  'Joke: Loading… because even silicon needs a coffee break.',
  'Tip: Bind a project folder before asking NOVA to “just rewrite the app.”',
  'Joke: This isn’t buffering Netflix. It’s buffering competence.',
  'Tip: Jump-to-bottom appears when you scroll up — chat won’t strand you.',
  'Joke: The progress bar is honest. Mostly. Emotionally support it.',
  'Tip: Free keys (Groq / Google) make first chat work without a giant download.',
  'Joke: “It works on my machine” — NOVA, installing on your machine.',
  'Tip: Settings → MCP is for tool servers. Settings → Providers is for API keys.',
  'Joke: Please do not pet the GGUF while it is downloading.',
  'Tip: Drop a project folder into Chat when you want NOVA to edit files on disk.',
  'Joke: Waiting builds character. Also builds a 1.5B parameter roommate.',
  'Tip: PIN lock is optional. Losing your laptop is not.',
  'Joke: NOVA is offline-friendly. Your impatience is less so.',
];

export function tipAt(index: number): string {
  if (!ARK_TIPS.length) return '';
  const i = ((index % ARK_TIPS.length) + ARK_TIPS.length) % ARK_TIPS.length;
  return ARK_TIPS[i];
}

/** Stable-ish shuffle seed from time so reloads don’t always start on tip 0. */
export function tipStartIndex(): number {
  return Math.floor(Date.now() / 1000) % Math.max(1, ARK_TIPS.length);
}
