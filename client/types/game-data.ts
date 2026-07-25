import type { TimelineDocument } from "../../shared/timeline-model";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: unknown };

export type StorageKind = "local" | "github" | string;

export interface ToolStorageStatus {
  kind: StorageKind;
  durable: boolean;
  error: string;
  repo: string;
  branch: string;
  path: string;
}

export interface FlowTiming {
  mode?: string;
  seconds?: number | string;
}

export interface FlowAction extends JsonObject {
  id: string;
  name?: string;
  type: string;
  timing?: FlowTiming;
  actions?: FlowAction[];
  subActions?: FlowAction[];
  branches?: FlowAction[];
}

export interface FlowState extends JsonObject {
  id: string;
  name?: string;
  actions: FlowAction[];
}

export interface FlowRouteNode extends JsonObject {
  id?: string;
}

export interface GameFlow extends JsonObject {
  states: FlowState[];
  routeNodes?: FlowRouteNode[];
}

export interface LayoutElement extends JsonObject {
  id: string;
  name?: string;
  kind?: string;
  selector?: string;
  artCompositionId?: string;
  defaultAnimationState?: string;
  layoutLayer?: "background" | "content" | string;
  tags?: string[];
  hidden?: boolean;
  locked?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  rotation?: number;
  defaultText?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  autoFitText?: boolean;
}

export interface LayoutState extends JsonObject {
  id: string;
  name?: string;
  elements: LayoutElement[];
}

export interface StageLayoutCollection extends JsonObject {
  canvas: {
    width: number;
    height: number;
  };
  global: LayoutState;
  states: LayoutState[];
}

export type ControllerLayoutCollection = StageLayoutCollection;

export interface GameConstants extends JsonObject {
  playerColors?: string[];
  customConstants?: JsonObject[];
}

export interface HostAudioLine extends JsonObject {
  id: string;
  text: string;
  url: string;
  blobPath?: string;
  sha256?: string;
  mimeType?: string;
  sourceName?: string;
}

export interface HostAudioSet extends JsonObject {
  id: string;
  name: string;
  lines: HostAudioLine[];
}

export interface HostAudios extends JsonObject {
  hostAudios: HostAudioSet[];
}

export interface ArtAsset extends JsonObject {
  id: string;
  name: string;
  category?: string;
  currentUrl: string;
  defaultUrl: string;
  hasCustom: boolean;
}

export interface ArtComponent extends JsonObject {
  id: string;
  name?: string;
  instanceLabel?: string;
  kind: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  brightness?: number;
  visible?: boolean;
  editorHidden?: boolean;
  transformOrigin?: string;
  artCompositionId?: string;
  referenceSizeMode?: "intrinsic" | string;
  childDistribution?: "none" | "horizontal" | "vertical" | string;
  locked?: boolean;
  defaultText?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  autoFitText?: boolean;
  imageDataUrl?: string;
  imageAssetId?: string;
  imageName?: string;
  imageMimeType?: string;
  imageObjectFit?: "cover" | "contain" | "fill" | string;
  imageTint?: string;
  spriteRenderMode?: "original" | "tinted" | string;
  timeline?: TimelineDocument | null;
  children?: ArtComponent[];
}

export interface ArtComposition extends JsonObject {
  id: string;
  name: string;
  description?: string;
  surface: "stage" | "controller" | string;
  compositionKind?: "gameObject" | "prefab" | string;
  isCustom?: boolean;
  timelineArchitectureVersion?: number;
  canvas: {
    width: number;
    height: number;
  };
  timeline?: TimelineDocument | null;
  components: ArtComponent[];
}

export interface ArtOrganizationSurface extends JsonObject {
  folders: Array<{ id: string; name: string }>;
  order: string[];
  folderItems: Record<string, string[]>;
}

export interface ArtOrganization extends JsonObject {
  stage: ArtOrganizationSurface;
  controller: ArtOrganizationSurface;
}

export type ArtCompositionDependencyKind = "art" | "stageLayout" | "controllerLayout" | "flow" | "runtime";

export interface ArtCompositionDependencyDetail extends JsonObject {
  kind: ArtCompositionDependencyKind;
  sourceCompositionId?: string;
  sourceId?: string;
  sourceName?: string;
  sourcePath?: string;
}

export interface ArtCompositionDependencySummary extends JsonObject {
  compositionId: string;
  total: number;
  artReferences: number;
  stageLayoutReferences: number;
  controllerLayoutReferences: number;
  flowReferences: number;
  runtimeReferences: number;
  details: ArtCompositionDependencyDetail[];
}

export type ArtCompositionDependencyReport = Record<string, ArtCompositionDependencySummary>;

export interface GameFlowResponse {
  ok: true;
  revision?: string;
  flow: GameFlow;
  savedFlow: GameFlow;
  runtimeFlow: GameFlow;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
  availableActionTypes: JsonObject[];
  availableTransitions: JsonObject[];
}

export interface GameFlowSaveResponse {
  ok: true;
  revision?: string;
  flow: GameFlow;
  runtimeFlow: GameFlow;
  storage: ToolStorageStatus;
}

export interface LayoutResponse<TLayout extends StageLayoutCollection = StageLayoutCollection> {
  ok: true;
  revision?: string;
  layouts: TLayout;
  savedLayouts: TLayout;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface LayoutSaveResponse<TLayout extends StageLayoutCollection = StageLayoutCollection> {
  ok: true;
  revision?: string;
  layouts: TLayout;
  storage: ToolStorageStatus;
}

export interface GameConstantsResponse {
  ok: true;
  revision?: string;
  constants: GameConstants;
  savedConstants: GameConstants;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface GameConstantsSaveResponse {
  ok: true;
  revision?: string;
  constants: GameConstants;
  storage: ToolStorageStatus;
}

export interface HostAudiosResponse {
  ok: true;
  revision?: string;
  hostAudios: HostAudios;
  savedHostAudios: HostAudios;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface HostAudiosSaveResponse {
  ok: true;
  revision?: string;
  hostAudios: HostAudios;
  storage: ToolStorageStatus;
}

export interface ArtAssetsResponse {
  ok: true;
  revision?: string;
  draftRevision?: string;
  groups: JsonObject[];
  assets: ArtAsset[];
  compositions: ArtComposition[];
  organization?: ArtOrganization;
  dependencies?: ArtCompositionDependencyReport;
  compositionRevisions?: Record<string, string>;
}

export interface ArtOrganizationSaveResponse {
  ok: true;
  revision?: string;
  draftRevision?: string;
  organization: ArtOrganization;
}

export interface ArtCompositionSaveResponse {
  ok: true;
  revision?: string;
  draftRevision?: string;
  composition: ArtComposition;
  compositionRevisions?: Record<string, string>;
}

export interface ArtCompositionDeleteResponse {
  ok: true;
  revision?: string;
  draftRevision?: string;
  compositions: ArtComposition[];
}

export interface ArtAssetReplaceResponse {
  ok: true;
  revision?: string;
  draftRevision?: string;
  asset: ArtAsset;
}

export interface ArtCompositionsSaveResponse {
  ok: true;
  revision?: string;
  compositions: ArtComposition[];
  compositionRevisions?: Record<string, string>;
}

export interface ArtCompositionCleanupRequest extends JsonObject {
  deleteCompositionIds: string[];
  expectedCompositionRevisions: Record<string, string>;
}

export interface ArtCompositionCleanupResponse extends ArtCompositionsSaveResponse {
  organization?: ArtOrganization;
  dependencies: ArtCompositionDependencyReport;
  compositionRevisions: Record<string, string>;
}

export interface HealthResponse {
  ok: true;
  rooms: number;
}
