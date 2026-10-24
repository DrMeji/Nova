/**
 * Polished, single-paragraph hand-backs for create / edit / fix / redesign.
 * Telemetry (Files Changed, timing, checkpoints) stays in the card/trace — not here.
 */

export type HandbackOutcome =
  | 'ready'
  | 'live-soft'
  | 'disk-only'
  | 'npm-pending'
  | 'npm-fail'
  | 'static'
  | 'python'
  | 'coding-ready'
  | 'coding-miss'
  | 'blank'
  | 'edit-ok'
  | 'edit-partial'
  | 'edit-blocked'
  | 'error';

function brand(name: string): string {
  const n = String(name || '').trim();
  return n ? `**${n}**` : 'your project';
}

function oneParagraph(...parts: Array<string | false | null | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p && String(p).trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}

/**
 * Create-flow hand-back — always one cohesive paragraph (no bullet dumps).
 */
export function formatCreateHandback(opts: {
  productName: string;
  outcome: HandbackOutcome;
  blankHint?: string;
  note?: string;
  grantHint?: string;
}): string {
  const name = brand(opts.productName);
  const note = String(opts.note || '').trim();
  let body: string;

  switch (opts.outcome) {
    case 'ready':
      body = oneParagraph(
        `I've finished building ${name} — the project is on disk, setup completed, and Live is ready for you to review.`,
        'Open **Live** under the chat to see it in action, or tell me what you want to polish next.',
      );
      break;
    case 'live-soft':
      body = oneParagraph(
        `I've got ${name} on disk and Live mounted so you can look at it, but quality still doesn't fully match your brief yet.`,
        'Open **Live** to see what shipped, then tell me what to fix — I will not call this done until it clears.',
      );
      break;
    case 'npm-pending':
      body = oneParagraph(
        `I've created ${name} and I'm finishing setup by installing packages now.`,
        'Live unlocks when Ready; if install stalls, say **install npm dependencies** and I will retry.',
      );
      break;
    case 'npm-fail':
      body = oneParagraph(
        `I've written ${name} on disk, but package install did not finish, so Live stays locked for now.`,
        note || 'Say **install npm dependencies** and I will retry the install.',
      );
      break;
    case 'disk-only':
      body = oneParagraph(
        `I've put ${name} on disk, but Live did not verify yet — files are written, and Live stays locked until mount, console, and smoke checks pass.`,
        note,
        'Click **Live** under the chat to retry, or tell me what to fix and I will keep going.',
      );
      break;
    case 'static':
      body = oneParagraph(
        `I've created ${name} on disk with the project files ready.`,
        note || 'Click **Live** when it appears under the chat, or tell me what you want to change next.',
      );
      break;
    case 'python':
      body = oneParagraph(
        `I've created ${name} on disk.`,
        'We can dig into `app/main.py` next, or you can tell me what to build from here.',
      );
      break;
    case 'coding-ready':
      body = oneParagraph(
        `I've finished ${name} as a coding project on disk — there is no Live website preview for this kind of ask.`,
        note || 'Open the **Folder** / **Code** pills under chat to inspect and run it, or tell me what to add next.',
      );
      break;
    case 'coding-miss':
      body = oneParagraph(
        `I scaffolded ${name} but it did not clear coding evidence yet.`,
        note || 'Tell me which entry file or route to fix and I will keep going.',
      );
      break;
    case 'blank':
      body = oneParagraph(
        `I've built a **${opts.blankHint || 'plain blank page'}** for ${name} — nothing else on it yet.`,
        'Open **Live** under the chat to see it, or tell me what to add next.',
      );
      break;
    case 'error':
      body = oneParagraph(note || `I could not finish ${name}.`, 'Tell me how you want to proceed and I will retry.');
      break;
    default:
      body = oneParagraph(
        `I've updated ${name}.`,
        'Open **Live** to review, or tell me what to do next.',
      );
  }

  if (opts.grantHint) {
    body = oneParagraph(body, `_${String(opts.grantHint).trim()}_`);
  }
  return body;
}

/**
 * Edit / fix / redesign hand-back — one paragraph, honest about partial work.
 */
export function formatEditHandback(opts: {
  ask?: string;
  outcome: Extract<HandbackOutcome, 'edit-ok' | 'edit-partial' | 'edit-blocked' | 'error'>;
  summary?: string;
  missing?: string;
  productName?: string;
  surface?: 'chat' | 'code';
}): string {
  const ask = String(opts.ask || '').replace(/^\[(?:Plan|Ask|Debug|Tasks)\]\s*/i, '').trim();
  const summary = String(opts.summary || '').trim();
  const missing = String(opts.missing || '').trim();
  const name = opts.productName ? brand(opts.productName) : '';
  const next = opts.surface === 'code'
    ? 'Press **Start** to review the preview, or tell me what to adjust next.'
    : 'Open **Live** under the chat to review it, or tell me what to adjust next.';

  if (opts.outcome === 'edit-blocked') {
    return oneParagraph(
      summary || 'I updated files, but the app still will not compile for Live, so I am not marking this done.',
      'Tell me what to fix and I will keep going.',
    );
  }
  if (opts.outcome === 'error') {
    return oneParagraph(
      summary || 'I could not save that change.',
      'Try one clearer ask and I will apply it to the open project.',
    );
  }
  if (opts.outcome === 'edit-partial') {
    return oneParagraph(
      summary || (name ? `I've started the edit on ${name}.` : `I've started that edit.`),
      missing ? `Still missing: ${missing}.` : 'Some of the ask still needs work.',
      'Tell me what to finish next and I will continue.',
    );
  }

  // edit-ok — vary naturally from the ask when we have a short summary
  if (summary) {
    return oneParagraph(summary, next);
  }
  if (/\bsticky\b/i.test(ask) && /\bnav\b/i.test(ask)) {
    return oneParagraph(`I've finished the sticky nav update${name ? ` on ${name}` : ''}.`, next);
  }
  if (/\b(?:redesign|new layout|rewrite)\b/i.test(ask)) {
    return oneParagraph(
      `I've finished the redesign${name ? ` for ${name}` : ''} and written the new layout on disk.`,
      next,
    );
  }
  if (/\b(?:fix|repair|heal|bug)\b/i.test(ask)) {
    return oneParagraph(`I've applied the fix${name ? ` on ${name}` : ''} and saved it on disk.`, next);
  }
  if (/\b(?:color|background|font|spacing|padding|margin)\b/i.test(ask)) {
    return oneParagraph(`I've applied your visual update${name ? ` to ${name}` : ''}.`, next);
  }
  return oneParagraph(
    `I've completed that change${name ? ` on ${name}` : ''} and saved it on disk.`,
    next,
  );
}

/** Collapse multi-line / bullet hand-backs into one paragraph when we must sanitize model prose. */
export function coerceHandbackParagraph(text: string): string {
  const t = String(text || '').trim();
  if (!t) return t;
  if (!/^[-*•]\s/m.test(t) && !/\n-\s/.test(t) && t.split(/\n+/).length <= 2) {
    return t.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return t
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•]\s+/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
