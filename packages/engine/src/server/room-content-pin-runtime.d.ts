export class RoomContentPinError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface RoomContentPinOptions {
  contentStore: {
    getActiveRelease(): unknown | Promise<unknown>;
    loadPublishedRevision(revision: string): unknown | Promise<unknown>;
  };
  gameId?: string;
  materializeGameData?: (snapshot: unknown) => Record<string, unknown>;
  validateRelease?: (context: {
    gameData: Record<string, unknown>;
    release: Record<string, unknown>;
    snapshot: unknown;
  }) => { ok: boolean; diagnostics?: readonly unknown[] } | Promise<{ ok: boolean; diagnostics?: readonly unknown[] }>;
}

export interface RoomContentPinRuntime {
  pinNewRoom(room: Record<string, unknown>): Promise<Readonly<Record<string, string>>>;
  releaseRoomPin(room: Record<string, unknown>): void;
  roomRelease(room: Record<string, unknown>): Readonly<Record<string, string>> | null;
}

export function createRoomContentPinRuntime(options: RoomContentPinOptions): RoomContentPinRuntime;
export function publicReleaseTuple(release: unknown): Readonly<Record<string, string>> | null;
