import type { ContentStore } from "../../index";

export function assertContainedFile(root: string, relativePath: string): string;
export function createLocalContentBundleProvider(options: Record<string, unknown>): ContentStore;
export function sha256(bytes: Uint8Array | string): string;
