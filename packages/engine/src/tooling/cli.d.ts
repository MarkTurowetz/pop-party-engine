import type { ContentSnapshot } from "../../index";
import type { GameServiceRuntime } from "../server/game-service-runtime";
import type { WebServiceStartup } from "../server/web-service-runtime";

export interface PopPartyCliOutput {
  log(message: string): void;
  error(message: string): void;
}

export const HELP_TEXT: string;
export function serviceArguments(argv: string[], env?: Record<string, string | undefined>): Readonly<{
  configPath: string;
  host: string;
  port: number;
}>;
export function startGameApplication(options: Record<string, unknown>): Promise<Readonly<{
  runtime: GameServiceRuntime;
  startup: WebServiceStartup;
} & Record<string, unknown>>>;
export function installShutdownHandlers(runtime: GameServiceRuntime, options?: Record<string, unknown>): void;
export function validateContentBundle(contentRoot: string, output?: PopPartyCliOutput): ContentSnapshot;
export function runCli(argv?: string[], options?: {
  cwd?: string;
  output?: PopPartyCliOutput;
  engineVersion?: string;
  outputDirectory?: string;
  env?: Record<string, string | undefined>;
  installSignalHandlers?: boolean;
  processRuntime?: Record<string, unknown>;
  startGameApplication?: (options: Record<string, unknown>) => Promise<Record<string, unknown>>;
}): Promise<number>;
