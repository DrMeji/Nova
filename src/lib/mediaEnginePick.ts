/** Ranked free media engines — implemented in electron/arkMedia.cjs. */

export const IMAGE_ENGINE_RANK = ['local-sd', 'huggingface', 'pollinations'] as const;
export const VIDEO_ENGINE_RANK = ['pollinations-mp4', 'huggingface-video', 'motion-still'] as const;

export type ImageEngineId = (typeof IMAGE_ENGINE_RANK)[number];
export type VideoEngineId = (typeof VIDEO_ENGINE_RANK)[number];
