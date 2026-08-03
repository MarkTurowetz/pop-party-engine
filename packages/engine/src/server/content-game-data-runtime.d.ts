export interface BundleGameData {
  readonly acceptedArtTypes: Readonly<Record<string, string>>;
  readonly artAssets: readonly unknown[];
  readonly artGroups: readonly unknown[];
  readonly artOrganization: Readonly<Record<string, unknown>>;
  readonly availableFlowActionTypes: readonly unknown[];
  readonly availableFlowTransitions: readonly unknown[];
  readonly defaultArtCompositions: readonly unknown[];
  readonly defaultControllerLayouts: Readonly<Record<string, unknown>>;
  readonly defaultGameConstants: Readonly<Record<string, unknown>>;
  readonly defaultGameFlow: Readonly<Record<string, unknown>>;
  readonly defaultHostAudios: Readonly<Record<string, unknown>>;
  readonly defaultPlayerColors: readonly string[];
  readonly defaultStageLayouts: Readonly<Record<string, unknown>>;
  readonly multipleChoicePrompts: readonly unknown[];
}

export const ACCEPTED_ART_TYPES: Readonly<Record<string, string>>;
export const REQUIRED_CONSTANT_KEYS: readonly string[];
export function createBundleGameData(snapshot: { readJson(path: string): unknown }): BundleGameData;
