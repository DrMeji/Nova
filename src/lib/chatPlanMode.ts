/** Plan → implement gating for Chat (Step 6). */

const IMPLEMENT_GO_RE =
  /\b(go build|go implement|implement it|build it now|build\s+it|make it happen|do it now|yes build|yes implement|ship it|let'?s\s+build\s+(?:this|that|it)|lets\s+build\s+(?:this|that|it)|let'?s\s+start\s+building|lets\s+start\s+building|start\s+building(?:\s+the)?(?:\s+(?:game|app|project|site|ui|fps))?|build\s+this|build\s+that|create\s+(?:the\s+)?(?:files|project)\s+now|create\s+(?:the\s+)?[A-Za-z][\w.\s-]{0,40}\s+project\s+on\s+disk|go ahead and create|stop\s+planning.{0,40}(?:build|create|implement)|done\s+planning.{0,40}(?:build|create|implement)|lets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build|okay[,.]?\s+lets?\s+go(?:\s+ahead)?\s+and\s+(?:start\s+)?build|ready\s+to\s+build(?:\s+this)?)\b/i;

const GO_AHEAD_BUILD_RE =
  /\bgo ahead(?:\s+and)?\s+(?:start\s+)?(?:building|build|implement|create|scaffold|write|code)\b/i;

/** Soft “not yet” / “don’t build” so bare “build it” is not forced. */
const IMPLEMENT_GO_NEG_RE =
  /\b(?:don'?t|do\s+not|never|not\s+yet|later|just\s+plan|keep\s+planning|don'?t\s+build|do\s+not\s+build)\b/i;

export function isPlanPrefixedMessage(message: string): boolean {
  return /^\[Plan\]\s*/i.test(String(message || '').trim());
}

export function looksLikeImplementGo(message: string): boolean {
  const t = String(message || '').trim();
  if (!t) return false;
  if (/\b(delete|remove|trash|wipe|uninstall)\b/i.test(t)) return false;
  if (IMPLEMENT_GO_NEG_RE.test(t) && !/\b(?:still|please|now)\s+build\b/i.test(t) && !/\blets?\s+start\s+building\b/i.test(t)) {
    // "do not rush building" is still a go — only block clear refuse-to-build.
    if (/\b(?:don'?t|do\s+not|never)\s+(?:build|create|implement|scaffold)\b/i.test(t)
      || /\b(?:not\s+yet|just\s+plan|keep\s+planning)\b/i.test(t)) {
      return false;
    }
  }
  // Chip: "Create project <Name>". always execute, never re-plan.
  // (Do not hard-code sample app names — every create stays fresh.)
  if (/^create\s+project\s+[A-Za-z]/i.test(t) && t.length < 80) return true;
  if (IMPLEMENT_GO_RE.test(t)) return true;
  if (/\bbuild\s+it(?:\s+now)?\b/i.test(t)) return true;
  // Human: "build EmberOak on disk" / "create QuietStreak on disk"
  if (/\b(?:build|create|scaffold)\s+[A-Za-z][A-Za-z0-9.]{1,40}\b/i.test(t) && /\bon\s+disk\b/i.test(t)) {
    return true;
  }
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
    'Reply in complete sentences. Never stop mid-phrase. Aim for about 100–180 words each planning turn.',
    'Open by restating their idea in your own words (one full sentence), then give a concrete best-way-to-start take (2–4 sentences).',
    'Name the problem you heard and a practical resolution path before asking anything.',
    'Then ask 1–3 product questions in plain language.',
    'LIST FORMAT RULES: Each new reply starts numbering at 1. Use numbers ONLY for the main outline (1, 2, 3…). Under each main step, use normal dashes (- bullets) for details — never ★ stars, never restart a nested list at 1. Never leave fragments like “3.js.”',
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

/** When the user says keep building / continue — recommend next polish, never rebuild. */
export function keepBuildingConversationHint(projectHint?: string): string {
  const topic = projectHint ? ` Current project context: ${projectHint.slice(0, 220)}` : '';
  return [
    'The user wants to continue improving the open project. Do NOT rebuild from scratch. Do NOT emit @@@FILE blocks, code fences, or full source.',
    'Do NOT say “say keep building” or “create it on disk”.',
    'Give 3–5 concrete recommendations to make the current UI feel more premium / complete (hero, typography, spacing, imagery, motion, sections, copy).',
    'LIST FORMAT: Start this reply at 1. Numbers only for main recommendations. Under each, use - bullets for details. No ★ stars. No nested numbered lists that restart at 1.',
    'End by asking which recommendation they want next, or what else they want to add.',
    topic,
  ].join(' ');
}

/** Remove orphan list numbers left after scrubbing, then renumber 1..n in each run.
 * Nested bullets/blank lines stay attached to the parent item so markdown does not
 * restart every entry at "1."
 */
export function repairBrokenOrderedLists(text: string): string {
  let out = String(text || '');
  if (!out.trim()) return out;
  // Fragments like "3.js." / bare "5." left after stack scrubbing.
  out = out
    .replace(/^\s*\d+\.(?:js|tsx?|jsx|css|html)\.?\s*$/gim, '')
    .replace(/^\s*\d+[.)]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  // "1. Title: - Bullet: … - Bullet: …" → numbered title + real bullet lines.
  out = out.replace(
    /^(\s*)(?:\*\*\s*)?(\d+)[.)]\s+(\*\*[^*]+\*\*|[^:\n]+):\s*((?:[-•]\s+[^\n]+(?:\s+[-•]\s+[^\n]+)*))\s*$/gm,
    (_all, indent, _n, title, rest) => {
      const cleanTitle = String(title || '').replace(/\*\*/g, '').trim();
      const bullets = String(rest || '')
        .split(/\s+(?=[-•]\s+)/)
        .map((b) => b.trim())
        .filter(Boolean)
        .map((b) => `${indent}- ${b.replace(/^[-•]\s+/, '')}`);
      return [`${indent}1. ${cleanTitle}`, ...bullets].join('\n');
    },
  );

  type Item = { indent: string; body: string; kids: string[] };
  const lines = out.split('\n');
  const result: string[] = [];
  let run: Item[] = [];
  const flush = () => {
    if (!run.length) return;
    run.forEach((item, i) => {
      result.push(`${item.indent}${i + 1}. ${item.body}`);
      for (const kid of item.kids) {
        const t = kid.trim();
        if (!t) continue;
        // Indent nested bullets so CommonMark keeps one continuous ordered list.
        if (/^([-*•]|\u2022)\s+/.test(t)) {
          const bullet = t.replace(/^[•\u2022]\s+/, '- ').replace(/^([-*])\s+/, '$1 ');
          result.push(`${item.indent}   ${bullet}`);
        } else {
          result.push(`${item.indent}   ${t}`);
        }
      }
    });
    run = [];
  };
  for (const line of lines) {
    // Accept bold-wrapped numbers: **1. Title:**
    const m = line.match(/^(\s*)(?:\*\*\s*)?(\d+)[.)]\s+(.*)$/);
    if (m) {
      let body = String(m[3] || '').trim();
      if (/^\*\*.+\*\*:?\s*$/.test(body)) {
        body = body.replace(/^\*\*/, '').replace(/\*\*:?\s*$/, (tail) => (tail.includes(':') ? ':' : ''));
      }
      body = body.replace(/\*\*$/, '').trim();
      // Drop emptied / garbage / stub items (models sometimes emit "4. User" with nothing).
      if (!body || /^(?:js|tsx?|jsx|css|html)\.?$/i.test(body)) continue;
      if (/^(?:user|users?|admin|todo|tbd|n\/?a)\.?$/i.test(body)) continue;
      run.push({ indent: m[1], body, kids: [] });
      continue;
    }
    if (run.length) {
      const t = line.trim();
      if (!t) {
        // Blank line inside a numbered run — keep the run open (do not flush).
        continue;
      }
      if (/^[★☆✦]\s+/.test(t)) {
        const raw = t.replace(/^[★☆✦]\s+/, '').replace(/\*\*/g, '').trim();
        const title = raw.replace(/:$/, '').trim();
        // ★ Planning / Next Steps / Must-Haves belong in the main numbered outline.
        if (
          /^(?:Planning(?:\s+the\s+Solution)?|Next Steps?|Implementation(?:\s+Steps?)?|Must-Haves?(?:\s+vs\.?\s+Later)?|Acknowledge(?:\s+the\s+Problem)?)\b/i.test(title)
        ) {
          run.push({ indent: run[run.length - 1]?.indent || '', body: title, kids: [] });
          continue;
        }
        run[run.length - 1].kids.push(`- **${title}:**`);
        continue;
      }
      if (/^([-*•]|\u2022)\s+/.test(t)) {
        run[run.length - 1].kids.push(t.replace(/^[•\u2022]\s+/, '- '));
        continue;
      }
      // Short section titles between numbers stay in the same outline (do not restart at 1).
      if (t.length < 90 && !/[.!?]"?$/.test(t) && !/^(?:got it|sure|here'?s|it sounds|you'?re|we can|i can)\b/i.test(t)) {
        run[run.length - 1].kids.push(`- ${t.replace(/\*\*/g, '')}`);
        continue;
      }
      // Longer prose ends the ordered run.
      flush();
      result.push(line);
      continue;
    }
    result.push(line);
  }
  flush();
  return normalizeReplyListHierarchy(result.join('\n').replace(/\n{3,}/g, '\n\n').trim());
}

const SUBSECTION_LABEL_RE =
  /^(?:Hero(?:\s+Section)?|Featured(?:\s+(?:Members?|Craftsmen|Artisans|Section))?|Testimonial(?:s)?|Call to Action|CTA|Free Tier|Premium(?:\s+Membership)?(?:\s+Tier)?|Exclusive(?:\s+Membership)?(?:\s+Tier)?|VIP(?:\s+Tier)?|Membership Benefits|Cards|Visuals|Copy|Imagery|Animation|Background Image|Headline|Subheadline|Section Title|Interactive(?:\s+Elements)?|Themed(?:\s+Collections)?|Limited[- ]Time(?:\s+Offers?)?|Button|Stall List|Vendor List|Vendor Details|Product List|Stall Layout|Stall Assignment|Search(?:\s+(?:Functionality|and Filter|bar))?|Sorting and Filtering|Add and Edit|Reminders|Updates and Changes|User Interface|Notifications|Contact)\b/i;

const TOPLEVEL_LABEL_RE =
  /^(?:Define|Design|Build|Add|Create|Shape|Plan|Outline|Map|Stage|Structure|Polish|Enhance|Refine|Acknowledge|Homepage Layout|Membership Tiers|Product Experience|Core Value|Information Architecture|Checkout|Examples|Design Elements|Must-Haves?|Next Steps?|Implementation)\b/i;

function cleanListLabel(body: string): string {
  return String(body || '')
    .replace(/\*\*/g, '')
    .replace(/\s*\(continued\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeSubsectionLabel(body: string): boolean {
  const t = cleanListLabel(body);
  if (!t) return false;
  if (TOPLEVEL_LABEL_RE.test(t) && !SUBSECTION_LABEL_RE.test(t)) return false;
  if (SUBSECTION_LABEL_RE.test(t)) return true;
  if (t.length <= 48 && /:\s*$/.test(t)) return true;
  if (/\b(?:Section|Tier|Spotlight|Drops?)\s*:?\s*$/i.test(t) && t.length < 56) return true;
  return false;
}

function looksLikeTopLevelLabel(body: string): boolean {
  const t = cleanListLabel(body);
  if (!t) return false;
  if (looksLikeSubsectionLabel(t)) return false;
  if (TOPLEVEL_LABEL_RE.test(t)) return true;
  // Longer conceptual titles are main steps.
  if (t.length > 42) return true;
  return true;
}

function labelsRoughlyMatch(a: string, b: string): boolean {
  const na = cleanListLabel(a).toLowerCase().replace(/:$/, '');
  const nb = cleanListLabel(b).toLowerCase().replace(/:$/, '');
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/**
 * Main outline = continuous 1, 2, 3…. Subsections and former ★ lines become - bullets.
 * Never emit star bullets — they look unprofessional in chat.
 */
export function normalizeReplyListHierarchy(text: string): string {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  if (!lines.some((l) => /^\s*(?:\*\*\s*)?\d+[.)]\s+/.test(l) || /^\s*[★☆✦]\s+/.test(l))) {
    return String(text || '').trim();
  }

  const result: string[] = [];
  let top = 0;
  let lastTopTitle = '';
  let nestSubs = false;

  for (const line of lines) {
    const star = line.match(/^(\s*)[★☆✦]\s+(.*)$/);
    if (star) {
      const body = cleanListLabel(star[2]);
      const title = body.replace(/:$/, '').trim();
      // Section headers that models mark with ★ belong in the main 1,2,3 outline.
      if (
        /^(?:Planning(?:\s+the\s+Solution)?|Next Steps?|Implementation(?:\s+Steps?)?|Must-Haves?(?:\s+vs\.?\s+Later)?|Acknowledge(?:\s+the\s+Problem)?)\b/i.test(title)
        || (TOPLEVEL_LABEL_RE.test(title) && !looksLikeSubsectionLabel(title))
      ) {
        top += 1;
        lastTopTitle = title;
        result.push(`${star[1]}${top}. ${title}`);
        nestSubs = true;
        continue;
      }
      result.push(`${star[1]}- **${title}:**`);
      nestSubs = true;
      continue;
    }

    const m = line.match(/^(\s*)(?:\*\*\s*)?(\d+)[.)]\s+(.*)$/);
    if (m) {
      const indent = m[1];
      let body = String(m[3] || '').trim();
      if (/^\*\*.+\*\*:?\s*$/.test(body)) {
        body = body.replace(/^\*\*/, '').replace(/\*\*:?\s*$/, (tail) => (tail.includes(':') ? ':' : ''));
      }
      body = cleanListLabel(body);
      if (!body) continue;

      const subLabel = looksLikeSubsectionLabel(body);
      // Only nest as bullets when it clearly looks like a feature subsection.
      const asSub = nestSubs && subLabel && top > 0;

      if (asSub) {
        const cleaned = body.replace(/\*\*/g, '').trim();
        const colon = cleaned.indexOf(':');
        if (colon > 0 && colon < 56) {
          const label = cleaned.slice(0, colon).trim();
          const rest = cleaned.slice(colon + 1).trim().replace(/\.:$/, '.').replace(/:$/, '');
          result.push(rest ? `${indent}- **${label}:** ${rest}` : `${indent}- **${label}:**`);
        } else {
          result.push(`${indent}- **${cleaned.replace(/:$/, '')}:**`);
        }
        continue;
      }

      top += 1;
      lastTopTitle = body.replace(/:$/, '').trim();
      result.push(`${indent}${top}. ${lastTopTitle}`);
      nestSubs = true;
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line);
      continue;
    }

    if (lastTopTitle && labelsRoughlyMatch(trimmed, lastTopTitle)) {
      nestSubs = true;
      continue;
    }

    if (/^(?:Homepage Layout|Membership Tiers|Membership Levels|Design Elements|Examples|Homepage|Layout|Planning the Solution|Next Steps?|Implementation(?:\s+Steps?)?|Must-Haves?\s+vs\.?\s+Later)\s*:?\s*$/i.test(trimmed)) {
      // Promote orphan section titles into the continuous outline or a bullet.
      if (/^(?:Planning the Solution|Next Steps?|Implementation(?:\s+Steps?)?|Must-Haves?\s+vs\.?\s+Later)\s*:?\s*$/i.test(trimmed)) {
        top += 1;
        lastTopTitle = cleanListLabel(trimmed).replace(/:$/, '');
        result.push(`${top}. ${lastTopTitle}`);
        nestSubs = true;
        continue;
      }
      nestSubs = true;
      continue;
    }

    if (/^([-*•]|\u2022)\s+/.test(trimmed)) {
      result.push(line);
      continue;
    }

    nestSubs = false;
    result.push(line);
  }

  return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Full list cleanup for assistant bubbles. */
export function normalizeAssistantLists(text: string): string {
  // repairBrokenOrderedLists already runs normalizeReplyListHierarchy once.
  return repairBrokenOrderedLists(text);
}

/** Strip banned planning quiz lines the local model still emits. */
export function scrubPlanningReply(text: string): string {
  let out = String(text || '');
  if (!out.trim()) return out;
  // Never leave mirrored user openers in planning replies.
  out = out.replace(/^(?:i\s+like\s+your\s+ideas?|thanks?(?:\s+for(?:\s+the)?\s+ideas?)?|sounds?\s+good)[,!.]?\s+/i, '').trim();
  // Remove whole lines that quiz on stacks / hosting (keeps list structure repairable).
  const bannedLine = [
    /\b(?:what|which)\s+programming\s+language\b/i,
    /\b(?:what|which)\s+framework\b/i,
    /\btech(?:nology)?\s+stack\b/i,
    /\b(?:React|Vue|Angular|Svelte)\s+or\s+(?:React|Vue|Angular|Svelte|plain)\b/i,
    /\b(?:Netlify|Vercel|GitHub Pages|hosting\s+platform)\b/i,
    /\b(?:Node\.js|Express)\b.*\b(?:backend|server)\b/i,
    /\b(?:authentication|data privacy|encryption|compliance)\b/i,
    /\bwant recommendations\??\b/i,
  ];
  out = out
    .split('\n')
    .filter((line) => !bannedLine.some((re) => re.test(line)))
    .join('\n');
  out = out
    .replace(/(?:\n+|^)\s*Would you like more information on any of these steps[^.!?\n]*[.!?]?\s*/gi, '\n')
    .replace(/(?:\n+|^)\s*Do you have (?:any )?specific questions(?: about[^.!?\n]*)?[.!]?\s*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
  out = normalizeAssistantLists(out);
  if (out.length < 40 && String(text || '').trim().length > 80) {
    // Scrub wiped too much — fall back to original with list repair only.
    return normalizeAssistantLists(
      String(text || '')
        .replace(/```[\w]*\n[\s\S]*?```/g, '')
        .trim(),
    );
  }
  return out;
}
