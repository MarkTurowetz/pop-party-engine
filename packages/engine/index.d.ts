export interface GamePluginRegistryApi {
  actions(id: string, value: unknown): void;
  stageRenderers(id: string, value: unknown): void;
  controllerRenderers(id: string, value: unknown): void;
  stateSchemas(id: string, value: unknown): void;
  validators(id: string, value: unknown): void;
  migrations(id: string, value: unknown): void;
  toolPanels(id: string, value: unknown): void;
  diagnostics(id: string, value: unknown): void;
}

export interface GamePlugin {
  readonly namespace: string;
  readonly register: (registry: GamePluginRegistryApi) => void;
}

export interface GameDefinitionInput<TGameData extends Record<string, unknown> = Record<string, unknown>> {
  gameId: string;
  displayName: string;
  version: string;
  engineCompatibility: string;
  content: { mode: "bundle" | "legacy-monolith"; schemaVersion: number; store?: ContentStore | null };
  gameData?: TGameData;
  plugin: GamePlugin;
  semanticRoles?: Record<string, import("./src/shared/semantic-role-schema").SemanticRoleTarget>;
}

export type GameDefinition<TGameData extends Record<string, unknown> = Record<string, unknown>> = Readonly<
  Omit<GameDefinitionInput<TGameData>, "gameData"> & {
    gameData: TGameData | null;
    registrations: Readonly<Record<string, readonly unknown[]>>;
  }
>;

export interface ContentSnapshot {
  readonly revision: string;
  readonly manifest: Readonly<Record<string, unknown>>;
  readonly paths: readonly string[];
  readBytes(path: string): Uint8Array;
  readJson(path: string): unknown;
  manifestBytes(): Uint8Array;
}

export interface ContentStore {
  commitWorkspace?(input: {
    snapshot: ContentSnapshot;
    expectedActiveRevision: string;
    idempotencyKey: string;
    release: Readonly<Record<string, unknown>>;
  }): unknown | Promise<unknown>;
  getActiveRelease(): unknown | Promise<unknown>;
  loadPublishedRevision(revision: string): ContentSnapshot | Promise<ContentSnapshot>;
}

export function defineGamePlugin(definition: GamePlugin): GamePlugin;
export function defineGame<TGameData extends Record<string, unknown>>(definition: GameDefinitionInput<TGameData>): GameDefinition<TGameData>;
export const GAME_ID_PATTERN: RegExp;
export const REQUIRED_GAME_DATA_KEYS: readonly string[];
export const REGISTRATION_KINDS: readonly string[];
export function createGamePluginRegistry(): unknown;

export const contentSchema: Readonly<Record<string, unknown>>;
export const semanticRoles: typeof import("./src/shared/semantic-role-schema");
export const contentSnapshots: Readonly<Record<string, unknown>>;
export const contentStores: Readonly<Record<string, unknown>>;
export function createLocalContentBundleProvider(options: Record<string, unknown>): ContentStore;
export function createBundleGameData(snapshot: ContentSnapshot): import("./src/server/content-game-data-runtime").BundleGameData;
export function createGithubContentBundleStore(options: Record<string, unknown>): ContentStore & Record<string, unknown>;
export function createGithubGitDataRuntime(options: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createGithubAppCredentialRuntime(options: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createContentStoreEnvironmentRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createContentAdminHandlersRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createRoomContentPinRuntime(options: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createAdminAuthRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createAdminAuditRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export function createRuntimeCapabilityRuntime(options?: Record<string, unknown>): Readonly<Record<string, unknown>>;
export const svgSafety: Readonly<Record<string, unknown>>;
export const server: typeof import("./src/server");
