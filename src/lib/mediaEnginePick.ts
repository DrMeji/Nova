/** Ranked free media engines. implemented in electron/novaMedia.cjs. */

export const IMAGE_ENGINE_RANK = ['huggingface', 'local-sd'] as const;
export const VIDEO_ENGINE_RANK = ['huggingface-video', 'motion-still'] as const;

export type ImageEngineId = (typeof IMAGE_ENGINE_RANK)[number];
export type VideoEngineId = (typeof VIDEO_ENGINE_RANK)[number];
