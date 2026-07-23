export class GameReadinessError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface GameReadinessState {
  readonly status: "pending" | "ready" | "failed";
  readonly diagnostic: Readonly<Record<string, unknown>> | null;
  readonly release: Readonly<Record<string, unknown>> | null;
}

export interface GameReadinessRuntime {
  readonly state: GameReadinessState;
  check(): Promise<Readonly<Record<string, unknown>>>;
}

export interface GameReleaseValidationContext {
  gameData: Record<string, unknown>;
  release: Record<string, unknown>;
  snapshot: Record<string, unknown>;
}

export function createGameReleaseValidator(options: {
  gameDefinition: Record<string, unknown>;
  engineVersion: string;
  contentSchemaVersion?: string;
}): (context: GameReleaseValidationContext) => Promise<Readonly<Record<string, unknown>>>;

export function createGameReadinessRuntime(options: {
  gameDefinition: Record<string, unknown>;
  engineVersion: string;
  contentSchemaVersion?: string;
}): GameReadinessRuntime;
