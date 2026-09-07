/**
 * Tiny deterministic edits that must not depend on the LLM dumping the whole repo.
 */

export function parseAddCommentAsk(message: string): { path: string; comment: string } | null {
  const t = String(message || '').trim();
  if (!t) return null;
  if (!/\b(add|insert|put|write)\b/i.test(t) || !/\bcomments?\b/i.test(t)) return null;

  const pathMatch = t.match(/\b((?:[\w.-]+\/)+[\w.-]+\.[a-z0-9]{1,8})\b/i);
  if (!pathMatch?.[1]) return null;
  const path = pathMatch[1].replace(/\\/g, '/');

  const quoted = t.match(/["“']([^"”']{2,120})["”']/);
  let comment = (quoted?.[1] || '').trim();
  if (!comment) {
    const says = t.match(
      /\bsays?\s+(?:that\s+)?(.+?)(?=\s+near\b|\s+at\s+the\b|\s+to\s+the\b|\s+in\s+(?:the\s+)?(?:top|file|app)|\s*,\s*then\b|\s*$)/i,
    );
    comment = (says?.[1] || 'NOVA Agent was here').trim().replace(/[.,;:]+$/g, '');
  }
  if (!comment) comment = 'NOVA Agent was here';
  return { path, comment };
}

/** When the ask also wants Preview/Localhost to show the marker, include the UI file. */
export function wantsVisiblePreviewMarker(message: string): boolean {
  const t = String(message || '');
  return /\b(preview|localhost|dashboard|topbar|ui|visible|see it|show(?:\s+it)?\s+in)\b/i.test(t)
    || /\bstatic\/index\.html\b/i.test(t);
}

export function applyLineComment(
  source: string,
  commentText: string,
  path: string,
): string {
  const body = String(source || '');
  const marker = commentText.trim();
  if (!marker) return body;
  if (body.includes(marker)) return body;

  const ext = path.split('.').pop()?.toLowerCase() || '';
  let line = `# ${marker}`;
  if (['js', 'jsx', 'ts', 'tsx', 'css', 'scss', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'swift', 'kt'].includes(ext)) {
    line = `// ${marker}`;
  } else if (['html', 'xml', 'vue', 'svelte'].includes(ext)) {
    line = `<!-- ${marker} -->`;
  } else if (['py', 'rb', 'sh', 'bash', 'yml', 'yaml', 'toml'].includes(ext)) {
    line = `# ${marker}`;
  }

  if (!body.trim()) return `${line}\n`;
  // Prefer after a shebang / encoding line.
  const lines = body.split('\n');
  let insertAt = 0;
  if (lines[0]?.startsWith('#!')) insertAt = 1;
  if (/coding[:=]\s*/i.test(lines[insertAt] || '')) insertAt += 1;
  lines.splice(insertAt, 0, line);
  return lines.join('\n');
}

/** Insert a small visible label into AutoTrade-style dashboards so Localhost can prove the edit. */
export function applyVisibleHtmlMarker(html: string, marker: string): string {
  const body = String(html || '');
  const text = String(marker || '').trim();
  if (!text || !body) return body;
  if (body.includes(`data-ark-agent-mark`) && body.includes(text)) return body;

  const badge = `<span data-ark-agent-mark="1" class="NOVA-agent-mark" style="margin-left:10px;font-size:11px;font-weight:600;letter-spacing:.04em;color:#34d399;opacity:.95">${text.replace(/</g, '&lt;')}</span>`;

  if (/class="[^"]*topbar-title[^"]*"/i.test(body)) {
    return body.replace(
      /(<(?:span|div)[^>]*class="[^"]*topbar-title[^"]*"[^>]*>)([\s\S]*?)(<\/(?:span|div)>)/i,
      (_m, open: string, inner: string, close: string) => {
        if (/data-ark-agent-mark/.test(inner)) return `${open}${inner}${close}`;
        return `${open}${inner}${badge}${close}`;
      },
    );
  }

  if (/<\/title>/i.test(body)) {
    return body.replace(/<\/title>/i, `</title>\n<!-- ${text} -->`);
  }
  return applyLineComment(body, text, 'index.html');
}
