export interface RoomRuntimeContentRuntime {
  sendRoomRuntimeContent(response: Record<string, unknown>, stageCode: string, kind: string): void;
  serveRoomArtAsset(response: Record<string, unknown>, stageCode: string, assetId: string): void;
  serveRoomHostAudio(response: Record<string, unknown>, stageCode: string, lineId: string): void;
}

export function createRoomRuntimeContentRuntime(options: {
  getExistingRoom(stageCode: string): Record<string, unknown> | null;
  normalizeStageCode(value: unknown): string;
  sendJson(response: Record<string, unknown>, status: number, payload: unknown): void;
}): RoomRuntimeContentRuntime;
