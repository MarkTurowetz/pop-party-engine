export interface DraftPreviewRoomRuntime {
  pinPreviewRoom(room: Record<string, unknown>): Promise<Readonly<Record<string, string>>>;
}

export function createDraftPreviewRoomRuntime(options: {
  contentStore: Record<string, unknown>;
  scope?: string;
  gameId: string;
  gameBuild: string;
  engineVersion: string;
  pluginVersion: string;
  validateRelease?: (input: Record<string, unknown>) => unknown;
}): DraftPreviewRoomRuntime;
