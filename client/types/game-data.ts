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
  kind: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  artCompositionId?: string;
  childDistribution?: "none" | "horizontal" | "vertical" | string;
  locked?: boolean;
  defaultText?: string;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  autoFitText?: boolean;
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

export interface GameFlowResponse {
  ok: true;
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
  flow: GameFlow;
  runtimeFlow: GameFlow;
  storage: ToolStorageStatus;
}

export interface LayoutResponse<TLayout extends StageLayoutCollection = StageLayoutCollection> {
  ok: true;
  layouts: TLayout;
  savedLayouts: TLayout;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface LayoutSaveResponse<TLayout extends StageLayoutCollection = StageLayoutCollection> {
  ok: true;
  layouts: TLayout;
  storage: ToolStorageStatus;
}

export interface GameConstantsResponse {
  ok: true;
  constants: GameConstants;
  savedConstants: GameConstants;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface GameConstantsSaveResponse {
  ok: true;
  constants: GameConstants;
  storage: ToolStorageStatus;
}

export interface HostAudiosResponse {
  ok: true;
  hostAudios: HostAudios;
  savedHostAudios: HostAudios;
  hasLocalDraft: boolean;
  storage: ToolStorageStatus;
}

export interface HostAudiosSaveResponse {
  ok: true;
  hostAudios: HostAudios;
  storage: ToolStorageStatus;
}

export interface ArtAssetsResponse {
  ok: true;
  groups: JsonObject[];
  assets: ArtAsset[];
  compositions: ArtComposition[];
  organization?: ArtOrganization;
}

export interface ArtOrganizationSaveResponse {
  ok: true;
  organization: ArtOrganization;
}

export interface ArtCompositionSaveResponse {
  ok: true;
  composition: ArtComposition;
}

export interface ArtCompositionDeleteResponse {
  ok: true;
  compositions: ArtComposition[];
}

export interface ArtAssetReplaceResponse {
  ok: true;
  asset: ArtAsset;
}

export interface HealthResponse {
  ok: true;
  rooms: number;
}
