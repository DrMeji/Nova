/** Single product success contract — handlers return these shapes. */

export type CreateSuccess = {
  ok: true;
  kind: 'create';
  folderPath: string;
  entryFile: string;
  chatBound: true;
  npmPending?: boolean;
};

export type EditSuccess = {
  ok: true;
  kind: 'edit';
  changedPaths: string[];
  matchedAsk: boolean;
};

export type EditMiss = {
  ok: false;
  kind: 'edit';
  reason: 'miss' | 'weak_model' | 'write_failed' | 'verify_failed';
  message: string;
};

export type ChatSuccess = {
  ok: true;
  kind: 'chat';
  /** Chat never writes files. */
  wrote: false;
  reply: string;
};

export type ReadyOptional = {
  kind: 'ready_optional';
  jobId?: string;
  previewUrl?: string | null;
  npmPending?: boolean;
};

export type TurnOutcome = CreateSuccess | EditSuccess | EditMiss | ChatSuccess | ReadyOptional;

export function createSuccess(opts: Omit<CreateSuccess, 'ok' | 'kind' | 'chatBound'> & { chatBound?: true }): CreateSuccess {
  return { ok: true, kind: 'create', chatBound: true, ...opts };
}

export function editSuccess(changedPaths: string[], matchedAsk = true): EditSuccess {
  return { ok: true, kind: 'edit', changedPaths, matchedAsk };
}

export function editMiss(reason: EditMiss['reason'], message: string): EditMiss {
  return { ok: false, kind: 'edit', reason, message };
}

export function chatSuccess(reply: string): ChatSuccess {
  return { ok: true, kind: 'chat', wrote: false, reply };
}
