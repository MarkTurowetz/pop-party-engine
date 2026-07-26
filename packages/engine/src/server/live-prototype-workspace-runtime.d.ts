import type { ContentSnapshot, ContentStore } from "../../index";

export function buildLivePrototypeSnapshot(
  baseline: ContentSnapshot,
  drafts: Record<string, unknown>,
  options?: Record<string, unknown>
): ContentSnapshot;

export function createLivePrototypeWorkspaceRuntime(options: {
  contentStore: ContentStore;
  localDraftStore: Record<string, unknown>;
  rooms: Map<string, unknown>;
  installRoomSnapshot(room: unknown, snapshot: ContentSnapshot, release: unknown, options: { reset: boolean }): unknown;
  [key: string]: unknown;
}): Readonly<Record<string, unknown>>;
