export class RoomContentPinError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export function createRoomContentPinRuntime(options: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function publicReleaseTuple(release: unknown): Readonly<Record<string, string>> | null;
