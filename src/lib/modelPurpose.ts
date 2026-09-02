export function modelPurposeText(opts: {
  category?: string;
  name?: string;
  detail?: string;
}): string {
  const cat = String(opts.category || '').toLowerCase();
  if (cat === 'coding' || cat === 'code') {
    return 'Writes and edits code, scaffolds projects, and helps with debugging.';
  }
  if (cat === 'vision') {
    return 'Reads images, screenshots, and UI captures for multimodal chat.';
  }
  if (cat === 'image') {
    return 'Generates images from text prompts inside ARK.';
  }
  if (cat === 'video') {
    return 'Creates or extends video clips from prompts.';
  }
  if (cat === 'reasoning') {
    return 'Handles harder planning, math, and multi-step reasoning.';
  }
  if (cat === 'fast') {
    return 'Lightweight model for quick everyday replies on this PC.';
  }
  if (cat === 'chat') {
    return 'General conversation and assistant tasks.';
  }
  const name = String(opts.name || '').toLowerCase();
  if (/coder|code|starcoder|deepseek/.test(name)) {
    return 'Focused on code generation and project edits.';
  }
  if (/vision|llava|multimodal/.test(name)) {
    return 'Understands images alongside text.';
  }
  if (/flux|sdxl|image|dall/.test(name)) {
    return 'Creates images from your prompts.';
  }
  if (opts.detail?.trim()) return opts.detail.trim();
  return 'Runs locally on this PC for private chat and builds.';
}
