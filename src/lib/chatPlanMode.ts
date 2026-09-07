/** Plan → implement gating for Chat (Step 6). */

const IMPLEMENT_GO_RE =
  /\b(go build|go implement|implement it|build it now|make it happen|do it now|yes build|yes implement|ship it|let'?s\s+build\s+(?:this|that|it)|lets\s+build\s+(?:this|that|it)|build\s+this|build\s+that|create\s+(?:the\s+)?(?:files|project)\s+now|create\s+(?:the\s+)?[A-Za-z][\w\s-]{0,40}\s+project\s+on\s+disk|go ahead and create|stop\s+planning.{0,40}(?:build|create|implement)|done\s+planning.{0,40}(?:build|create|implement)|lets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build|okay[,.]?\s+lets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build|ready\s+to\s+build(?:\s+this)?)\b/i;

const GO_AHEAD_BUILD_RE =
  /\bgo ahead(?:\s+and)?\s+(?:start\s+)?(?:building|build|implement|create|scaffold|write|code)\b/i;

export function isPlanPrefixedMessage(message: string): boolean {
  return /^\[Plan\]\s*/i.test(String(message || '').trim());
}

export function looksLikeImplementGo(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/\b(delete|remove|trash|wipe|uninstall)\b/i.test(t)) return false;
  // Chip: "Create project <Name>". always execute, never re-plan.
  // (Do not hard-code sample app names — every create stays fresh.)
  if (/^create\s+project\s+[A-Za-z]/i.test(t) && t.length < 80) return true;
  if (IMPLEMENT_GO_RE.test(t)) return true;
  if (/\bbuild\s+it\s+now\b/i.test(t)) return true;
  return GO_AHEAD_BUILD_RE.test(t);
}

/** Plan turns must not write files until user explicitly says go. */
export function shouldBlockChatFileWrites(message: string, composerMode: string | null): boolean {
  if (composerMode === 'plan') return true;
  if (isPlanPrefixedMessage(message)) return true;
  if (/^\[Plan\]/i.test(message)) return true;
  return false;
}

export function planModeSystemHint(): string {
  return 'The user is in **Plan** mode. Output a step-by-step plan only. no @@@FILE blocks, no file writes. End with: *Say “lets build this” when you want me to create files.*';
}

/** Soft planning chat. thorough unique advice, never scaffold. */
export function planningConversationHint(topicHint?: string): string {
  const topic = topicHint ? ` Focus on: ${topicHint.slice(0, 280)}` : '';
  return [
    'Planning conversation only. Do not create files, folders, or projects.',
    'Write like a sharp human collaborator — warm, clear, specific — not a quiz bot or template.',
    'This is a real back-and-forth. Do NOT rush them to build. Do NOT end by saying “say go and I’ll create files” unless they already asked to build.',
    'Reply in complete sentences. Never stop mid-phrase. Aim for about 80–160 words each planning turn.',
    'Open by restating their idea in your own words (one full sentence), then give a concrete best-way-to-start take (2–4 sentences).',
    'Name the problem you heard and a practical resolution path before asking anything.',
    'Then ask 1–3 product questions in plain language. Prefer flowing prose or light bullets over a stiff numbered exam.',
    'Never end with “Would you like more information on any of these steps?” or “Do you have specific questions?”',
    'Good questions: web vs phone app, who it is for, the one must-have for v1, calm vs playful feel, offline or online.',
    'If they want a phone/mobile app, ask whether it is for overall iOS, overall Android, or a specific device (e.g. iPhone 16, Galaxy S23) — never quiz them on tech stacks.',
    'On follow-up turns, react to what they just said, refine the plan, and keep asking only what is still missing. Stay conversational until they clearly ask to create/build on disk.',
    'HARD BAN — never ask: tech-stack experience, “want recommendations?”, coding skill, frameworks/languages they know, how they will handle auth, login, privacy, encryption, databases, hosting, or compliance. NOVA users are not engineers; NOVA chooses defaults (private by default, sensible auth when needed) without interviewing them.',
    'Never ask them to pick a stack or “how to handle user authentication and data privacy.”',
    'Invite them to add more detail when ready (“Anything else you already know you want?”).',
    'Avoid empty openers like “Great!” / “Let’s clarify a few details” with no substance first.',
    'Stay on their actual topic. Do not invent a random product name or EcoBuddy-style demo.',
    'Never invent UI chips like Create project or Keep planning.',
    'Do not dump a multi-week plan unless they asked for timeline/scope.',
    topic,
  ].filter(Boolean).join(' ');
}

/** Strip banned planning quiz lines the local model still emits. */
export function scrubPlanningReply(text: string): string {
  let out = String(text || '');
  if (!out.trim()) return out;
  const banned = [
    /[^.!?\n]*\b(?:what|which)\s+programming\s+language[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\b(?:what|which)\s+framework[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\btech(?:nology)?\s+stack[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\b(?:React|Vue|Angular|Svelte)\s+or\s+(?:React|Vue|Angular|Svelte|plain)[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\b(?:Netlify|Vercel|GitHub Pages|hosting\s+platform)[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\b(?:Node\.js|Express)\b[^.!?\n]*(?:backend|server)[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\b(?:authentication|data privacy|encryption|compliance)\b[^.!?\n]*[.!?]*/gi,
    /[^.!?\n]*\bwant recommendations\??\b[^.!?\n]*[.!?]*/gi,
  ];
  for (const re of banned) out = out.replace(re, '');
  out = out
    .replace(/(?:\n+|^)\s*Would you like more information on any of these steps[^.!?\n]*[.!?]?\s*/gi, '\n')
    .replace(/(?:\n+|^)\s*Do you have (?:any )?specific questions(?: about[^.!?\n]*)?[.!]?\s*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
  if (out.length < 40 && String(text || '').trim().length > 80) {
    // Scrub wiped too much — fall back to original with a soft note stripped of fences only.
    return String(text || '')
      .replace(/```[\w]*\n[\s\S]*?```/g, '')
      .trim();
  }
  return out;
}
