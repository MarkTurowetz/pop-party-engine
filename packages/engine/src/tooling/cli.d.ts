import type { ContentSnapshot } from "../../index";

export interface PopPartyCliOutput {
  log(message: string): void;
  error(message: string): void;
}

export const HELP_TEXT: string;
export function validateContentBundle(contentRoot: string, output?: PopPartyCliOutput): ContentSnapshot;
export function runCli(argv?: string[], options?: { cwd?: string; output?: PopPartyCliOutput }): number;
