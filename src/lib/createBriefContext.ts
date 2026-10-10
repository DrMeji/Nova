/** Build-context helpers shared by create generation and its final Ready gate. */
export type CreateBriefContext = {
  /** The user's own product brief, retained verbatim (except outer whitespace). */
  originalBrief: string;
  /** Complete generation/verification context, including the original brief. */
  generationBrief: string;
};

export function retainCreateBrief(
  originalBrief: string,
  additions: Array<string | null | undefined> = [],
): CreateBriefContext {
  const original = String(originalBrief || '').trim();
  const cap = 24_000;
  const prefix = [original, ...additions
    .map((part) => String(part || '').trim())
    .filter((part) => part && part !== original)];
  const generationBrief = prefix.filter(Boolean).join('\n\n');
  if (generationBrief.length <= cap) return { originalBrief: original, generationBrief };
  const additional = prefix.slice(1).filter(Boolean).join('\n\n');
  const separator = original && additional ? '\n\n' : '';
  const room = Math.max(0, cap - original.length - separator.length);
  return {
    originalBrief: original,
    generationBrief: `${original}${room && additional ? `${separator}${additional.slice(0, room)}` : ''}`,
  };
}

/** Keep original user requirements in generation prompts after a bounded context trim. */
export function preserveOriginalBriefInPrompt(
  originalBrief: string,
  generatedPrompt: string,
  maxChars = 12_000,
): string {
  const original = String(originalBrief || '').trim();
  const prompt = String(generatedPrompt || '').trim();
  const cap = Math.max(original.length + 64, Math.floor(maxChars));
  if (!original) return prompt.slice(0, cap);
  const prefix = `USER'S ORIGINAL BRIEF (authoritative; preserve every requirement):\n${original}`;
  if (prompt.includes(prefix)) return prompt.slice(0, cap);
  const available = Math.max(0, cap - prefix.length - 2);
  return `${prefix}${available ? `\n\n${prompt.slice(0, available)}` : ''}`.slice(0, cap);
}
