import type { ContentSnapshot } from "../../index";
import type { ContentBundleManifest } from "../shared/content-bundle-schema";

export function buildManifest(metadata: Record<string, unknown>, files: ReadonlyMap<string, Uint8Array>): Readonly<ContentBundleManifest>;
export function createContentSnapshot(input: Record<string, unknown>): ContentSnapshot;
export function replaceSnapshotFiles(snapshot: ContentSnapshot, replacements: Record<string, unknown>, options?: Record<string, unknown>): ContentSnapshot;
export function sha256(bytes: Uint8Array | string): string;
export function snapshotFingerprint(snapshot: ContentSnapshot): string;
